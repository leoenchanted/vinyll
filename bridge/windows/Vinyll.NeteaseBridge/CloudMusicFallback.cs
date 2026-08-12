using NAudio.CoreAudioApi;
using NAudio.CoreAudioApi.Interfaces;
using System.Diagnostics;
using System.Text.Json;

namespace Vinyll.NeteaseBridge;

/// <summary>
/// NetEase Cloud Music 3.x currently launches Chromium with MediaSessionService disabled,
/// so no SMTC session exists on affected versions. This local-only fallback reads the title
/// exposed by cloudmusic.exe and enriches that one title from its own playingList JSON file.
/// It never returns the rest of the queue or any account data.
/// </summary>
internal sealed class CloudMusicFallback
{
    private static readonly string PlayingListPath = Path.Combine(
        Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData),
        "NetEase", "CloudMusic", "webdata", "file", "playingList");

    private string _lastTrackId = string.Empty;
    private long _estimatedPositionMs;
    private DateTimeOffset _lastObservedAt;
    private DateTimeOffset _lastAudibleAt;
    private bool _lastWasPlaying;

    internal PlaybackState GetState(string[] smtcSources)
    {
        try
        {
            var processes = Process.GetProcessesByName("cloudmusic");
            var running = processes.Length > 0;
            var processIds = processes.Select(process => process.Id).ToHashSet();
            var mainWindowTitle = processes.FirstOrDefault(process => process.MainWindowHandle != IntPtr.Zero
                && !string.IsNullOrWhiteSpace(process.MainWindowTitle))?.MainWindowTitle;
            foreach (var process in processes) process.Dispose();
            if (mainWindowTitle is null || !TrySplitWindowTitle(mainWindowTitle, out var title, out var titleArtist))
                return PlaybackState.Empty(AppendCloudMusicSource(smtcSources, running));

            var track = FindTrack(title, titleArtist);
            if (track is null) return PlaybackState.Empty(AppendCloudMusicSource(smtcSources, true));

            var now = DateTimeOffset.UtcNow;
            var wasPlaying = _lastWasPlaying;
            var audio = ObserveCloudMusicAudio(processIds);
            if (audio.Audible)
            {
                _lastAudibleAt = now;
                _lastWasPlaying = true;
            }
            else if (!audio.SessionActive || (_lastAudibleAt != default && now - _lastAudibleAt > TimeSpan.FromSeconds(1.5)))
            {
                _lastWasPlaying = false;
            }
            else if (_lastAudibleAt == default)
            {
                _lastWasPlaying = audio.SessionActive;
            }
            var isPlaying = _lastWasPlaying;
            if (!string.Equals(_lastTrackId, track.Id, StringComparison.Ordinal))
            {
                _lastTrackId = track.Id;
                _estimatedPositionMs = 0;
            }
            else if (wasPlaying && _lastObservedAt != default)
            {
                _estimatedPositionMs += (long)(now - _lastObservedAt).TotalMilliseconds;
            }
            _estimatedPositionMs = Math.Clamp(_estimatedPositionMs, 0, Math.Max(0, track.DurationMs));
            _lastObservedAt = now;

            return new PlaybackState
            {
                IsPlaying = isPlaying,
                ProgressMs = _estimatedPositionMs,
                Device = new PlaybackDevice { Id = "netease-cloudmusic-hotkeys", Name = "网易云音乐桌面客户端" },
                Capabilities = PlaybackCapabilities.ReadOnly,
                Item = new PlaybackItem
                {
                    Id = track.Id,
                    Name = track.Title,
                    DurationMs = track.DurationMs,
                    Artists = track.Artists.Select(name => new NamedItem { Name = name }).ToArray(),
                    Album = new PlaybackAlbum
                    {
                        Name = track.Album,
                        Artists = track.Artists.Select(name => new NamedItem { Name = name }).ToArray(),
                        Images = string.IsNullOrWhiteSpace(track.CoverUrl) ? [] : [new ImageItem { Url = SecureUrl(track.CoverUrl) }],
                    },
                },
                SourceAppId = "cloudmusic.exe:window-title",
                AvailableSources = AppendCloudMusicSource(smtcSources, true),
            };
        }
        catch (Exception error)
        {
            Log.Write($"CloudMusic compatibility mode unavailable: {error.Message}");
            return PlaybackState.Empty(smtcSources);
        }
    }

    private static CloudMusicTrack? FindTrack(string title, string titleArtist)
    {
        if (!File.Exists(PlayingListPath)) return null;
        using var file = new FileStream(PlayingListPath, FileMode.Open, FileAccess.Read,
            FileShare.ReadWrite | FileShare.Delete);
        using var document = JsonDocument.Parse(file);
        if (!document.RootElement.TryGetProperty("list", out var list) || list.ValueKind != JsonValueKind.Array)
            return null;

        CloudMusicTrack? titleOnlyMatch = null;
        foreach (var entry in list.EnumerateArray())
        {
            if (!entry.TryGetProperty("track", out var track)) continue;
            var name = StringValue(track, "name");
            if (!string.Equals(name, title, StringComparison.OrdinalIgnoreCase)) continue;

            var artists = track.TryGetProperty("artists", out var artistNodes) && artistNodes.ValueKind == JsonValueKind.Array
                ? artistNodes.EnumerateArray().Select(artist => StringValue(artist, "name"))
                    .Where(value => !string.IsNullOrWhiteSpace(value)).ToArray()
                : [];
            var albumNode = track.TryGetProperty("album", out var parsedAlbum) ? parsedAlbum : default;
            var match = new CloudMusicTrack(
                StringValue(entry, "id", StringValue(track, "id", $"{title}-{titleArtist}")),
                name,
                artists.Length > 0 ? artists : [titleArtist],
                albumNode.ValueKind == JsonValueKind.Object ? StringValue(albumNode, "name", "网易云音乐") : "网易云音乐",
                albumNode.ValueKind == JsonValueKind.Object
                    ? StringValue(albumNode, "picUrl", StringValue(albumNode, "cover", string.Empty))
                    : string.Empty,
                NumberValue(track, "duration"));
            titleOnlyMatch ??= match;
            if (artists.Any(artist => titleArtist.Contains(artist, StringComparison.OrdinalIgnoreCase)
                || artist.Contains(titleArtist, StringComparison.OrdinalIgnoreCase))) return match;
        }
        return titleOnlyMatch;
    }

    private static bool TrySplitWindowTitle(string windowTitle, out string title, out string artist)
    {
        title = string.Empty;
        artist = string.Empty;
        if (string.Equals(windowTitle.Trim(), "网易云音乐", StringComparison.OrdinalIgnoreCase)) return false;
        var separator = windowTitle.LastIndexOf(" - ", StringComparison.Ordinal);
        if (separator <= 0 || separator >= windowTitle.Length - 3) return false;
        title = windowTitle[..separator].Trim();
        artist = windowTitle[(separator + 3)..].Trim();
        return title.Length > 0 && artist.Length > 0;
    }

    private static AudioObservation ObserveCloudMusicAudio(HashSet<int> processIds)
    {
        try
        {
            using var deviceEnumerator = new MMDeviceEnumerator();
            var devices = deviceEnumerator.EnumerateAudioEndPoints(DataFlow.Render, DeviceState.Active);
            foreach (var device in devices)
            {
                using (device)
                {
                    var sessions = device.AudioSessionManager.Sessions;
                    for (var index = 0; index < sessions.Count; index++)
                    {
                        using var session = sessions[index];
                        if (processIds.Contains((int)session.GetProcessID)
                            && session.State == AudioSessionState.AudioSessionStateActive)
                        {
                            var maximumPeak = 0f;
                            for (var sample = 0; sample < 4; sample++)
                            {
                                maximumPeak = Math.Max(maximumPeak, session.AudioMeterInformation.MasterPeakValue);
                                if (maximumPeak > 0.0001f) break;
                                Thread.Sleep(35);
                            }
                            return new AudioObservation(true, maximumPeak > 0.0001f);
                        }
                    }
                }
            }
        }
        catch (Exception error)
        {
            Log.Write($"CloudMusic audio session state unavailable: {error.Message}");
        }
        return new AudioObservation(false, false);
    }

    private static string[] AppendCloudMusicSource(string[] sources, bool running) => running
        ? sources.Append("cloudmusic.exe").Distinct(StringComparer.OrdinalIgnoreCase).ToArray()
        : sources;

    private static string SecureUrl(string value) => value.StartsWith("http://", StringComparison.OrdinalIgnoreCase)
        ? $"https://{value[7..]}"
        : value;

    private static string StringValue(JsonElement node, string property, string fallback = "")
    {
        if (node.ValueKind != JsonValueKind.Object || !node.TryGetProperty(property, out var value)) return fallback;
        return value.ValueKind switch
        {
            JsonValueKind.String => value.GetString() ?? fallback,
            JsonValueKind.Number => value.GetRawText(),
            _ => fallback,
        };
    }

    private static long NumberValue(JsonElement node, string property)
    {
        return node.ValueKind == JsonValueKind.Object && node.TryGetProperty(property, out var value)
            && value.TryGetInt64(out var parsed) ? parsed : 0;
    }

    private sealed record CloudMusicTrack(string Id, string Title, string[] Artists,
        string Album, string CoverUrl, long DurationMs);
    private readonly record struct AudioObservation(bool SessionActive, bool Audible);
}
