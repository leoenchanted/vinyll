using System.Security.Cryptography;
using System.Text;
using Windows.Media.Control;
using Windows.Storage.Streams;

namespace Vinyll.NeteaseBridge;

internal sealed class SmtcService
{
    private static readonly string[] NetEaseMarkers =
        ["cloudmusic", "netease", "music163", "music.163", "网易云"];

    private readonly SemaphoreSlim _gate = new(1, 1);
    private readonly CloudMusicFallback _cloudMusic = new();
    private string _cachedArtworkKey = string.Empty;
    private string? _cachedArtwork;

    internal async Task<PlaybackState> GetStateAsync()
    {
        await _gate.WaitAsync();
        try
        {
            var (session, sources) = await FindSessionAsync();
            if (session is null)
                return _cloudMusic.GetState(sources);

            var properties = await session.TryGetMediaPropertiesAsync();
            if (string.IsNullOrWhiteSpace(properties.Title))
                return PlaybackState.Empty(sources);

            var playback = session.GetPlaybackInfo();
            var timeline = session.GetTimelineProperties();
            var artist = FirstNonEmpty(properties.Artist, properties.AlbumArtist, properties.Subtitle, "网易云音乐");
            var album = FirstNonEmpty(properties.AlbumTitle, "网易云音乐");
            var duration = Math.Max(0, (timeline.EndTime - timeline.StartTime).TotalMilliseconds);
            if (duration <= 0) duration = Math.Max(0, timeline.EndTime.TotalMilliseconds);
            var position = Math.Max(0, (timeline.Position - timeline.StartTime).TotalMilliseconds);
            var artwork = await ReadArtworkAsync(properties, $"{properties.Title}\n{artist}\n{album}");
            var itemId = Convert.ToHexString(SHA256.HashData(Encoding.UTF8.GetBytes(
                $"{session.SourceAppUserModelId}\n{properties.Title}\n{artist}\n{album}"))).ToLowerInvariant()[..24];

            return new PlaybackState
            {
                IsPlaying = playback.PlaybackStatus == GlobalSystemMediaTransportControlsSessionPlaybackStatus.Playing,
                ProgressMs = (long)position,
                Device = new PlaybackDevice { Id = "netease-smtc", Name = "网易云音乐桌面客户端" },
                Capabilities = PlaybackCapabilities.ReadOnly,
                Item = new PlaybackItem
                {
                    Id = itemId,
                    Name = properties.Title,
                    DurationMs = (long)duration,
                    Artists = [new NamedItem { Name = artist }],
                    Album = new PlaybackAlbum
                    {
                        Name = album,
                        Artists = [new NamedItem { Name = artist }],
                        Images = artwork is null ? [] : [new ImageItem { Url = artwork }],
                        AlbumType = "album",
                    },
                },
                SourceAppId = session.SourceAppUserModelId,
                AvailableSources = sources,
            };
        }
        finally
        {
            _gate.Release();
        }
    }

    internal async Task<(bool Found, string Message)> ProbeAsync()
    {
        try
        {
            var (session, _) = await FindSessionAsync();
            if (session is not null) return (true, "已通过 Windows SMTC 连接网易云音乐桌面客户端");
            var fallback = _cloudMusic.GetState([]);
            return fallback.Item is null
                ? (false, "助手已就绪；请打开网易云音乐桌面客户端并播放一首歌")
                : (true, "已连接 cloudmusic.exe（此版本未提供 SMTC，使用本机播放信息兼容模式）");
        }
        catch (UnauthorizedAccessException)
        {
            return (false, "Windows 拒绝访问系统媒体会话，请重新启动助手");
        }
    }

    private static async Task<(GlobalSystemMediaTransportControlsSession? Session, string[] Sources)> FindSessionAsync()
    {
        var manager = await GlobalSystemMediaTransportControlsSessionManager.RequestAsync();
        var sessions = manager.GetSessions().ToArray();
        var sources = sessions.Select(session => session.SourceAppUserModelId)
            .Where(source => !string.IsNullOrWhiteSpace(source))
            .Distinct(StringComparer.OrdinalIgnoreCase)
            .ToArray();

        var neteaseSessions = sessions
            .Where(session => IsNetEase(session.SourceAppUserModelId))
            .OrderByDescending(session => PlaybackPriority(session.GetPlaybackInfo().PlaybackStatus))
            .ToArray();

        return (neteaseSessions.FirstOrDefault(), sources);
    }

    private static bool IsNetEase(string? sourceAppId) =>
        !string.IsNullOrWhiteSpace(sourceAppId)
        && NetEaseMarkers.Any(marker => sourceAppId.Contains(marker, StringComparison.OrdinalIgnoreCase));

    private static int PlaybackPriority(GlobalSystemMediaTransportControlsSessionPlaybackStatus status) => status switch
    {
        GlobalSystemMediaTransportControlsSessionPlaybackStatus.Playing => 3,
        GlobalSystemMediaTransportControlsSessionPlaybackStatus.Paused => 2,
        _ => 1,
    };

    private async Task<string?> ReadArtworkAsync(GlobalSystemMediaTransportControlsSessionMediaProperties properties, string key)
    {
        if (_cachedArtworkKey == key) return _cachedArtwork;

        _cachedArtworkKey = key;
        _cachedArtwork = null;
        if (properties.Thumbnail is null) return null;

        try
        {
            using var stream = await properties.Thumbnail.OpenReadAsync();
            var length = (uint)Math.Min(stream.Size, 3_000_000);
            if (length == 0) return null;

            using var reader = new DataReader(stream.GetInputStreamAt(0));
            var loaded = await reader.LoadAsync(length);
            var bytes = new byte[loaded];
            reader.ReadBytes(bytes);
            var contentType = string.IsNullOrWhiteSpace(stream.ContentType) ? "image/jpeg" : stream.ContentType;
            _cachedArtwork = $"data:{contentType};base64,{Convert.ToBase64String(bytes)}";
            return _cachedArtwork;
        }
        catch (Exception error)
        {
            Log.Write($"Artwork unavailable: {error.Message}");
            return null;
        }
    }

    private static string FirstNonEmpty(params string?[] values) =>
        values.First(value => !string.IsNullOrWhiteSpace(value))!;
}

internal sealed class PlaybackState
{
    [System.Text.Json.Serialization.JsonPropertyName("is_playing")]
    public bool IsPlaying { get; init; }

    [System.Text.Json.Serialization.JsonPropertyName("progress_ms")]
    public long ProgressMs { get; init; }

    public PlaybackDevice? Device { get; init; }
    public PlaybackItem? Item { get; init; }
    public PlaybackCapabilities? Capabilities { get; init; }

    [System.Text.Json.Serialization.JsonPropertyName("source_app_id")]
    public string? SourceAppId { get; init; }

    [System.Text.Json.Serialization.JsonPropertyName("available_sources")]
    public string[] AvailableSources { get; init; } = [];

    internal static PlaybackState Empty(string[] sources) => new() { AvailableSources = sources };
}

internal sealed class PlaybackDevice { public required string Id { get; init; } public required string Name { get; init; } }
internal sealed class PlaybackCapabilities
{
    public bool Pause { get; init; }
    public bool Next { get; init; }
    public bool Previous { get; init; }
    public bool Seek { get; init; }

    internal static PlaybackCapabilities ReadOnly { get; } = new();
}
internal sealed class NamedItem { public required string Name { get; init; } }
internal sealed class ImageItem { public required string Url { get; init; } }
internal sealed class PlaybackAlbum
{
    public required string Name { get; init; }
    public NamedItem[] Artists { get; init; } = [];
    public ImageItem[] Images { get; init; } = [];

    [System.Text.Json.Serialization.JsonPropertyName("album_type")]
    public string AlbumType { get; init; } = "album";
}
internal sealed class PlaybackItem
{
    public required string Id { get; init; }
    public required string Name { get; init; }

    [System.Text.Json.Serialization.JsonPropertyName("duration_ms")]
    public long DurationMs { get; init; }

    public NamedItem[] Artists { get; init; } = [];
    public required PlaybackAlbum Album { get; init; }
}
