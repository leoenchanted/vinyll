import AppKit
import Foundation

struct MediaRemoteStatus {
    let supported: Bool
    let isNetease: Bool
    let appName: String
    let snapshot: NowPlayingSnapshot?
}

struct NowPlayingSnapshot {
    let id: String
    let title: String
    let artist: String
    let album: String
    let durationMs: Int
    let progressMs: Int
    let isPlaying: Bool
    let artworkDataURL: String?

    var payload: [String: Any] {
        let artists = [["name": artist]]
        var albumPayload: [String: Any] = [
            "name": album,
            "artists": artists,
            "images": [],
            "album_type": "album",
        ]
        if let artworkDataURL {
            albumPayload["images"] = [["url": artworkDataURL]]
        }
        return [
            "is_playing": isPlaying,
            "progress_ms": progressMs,
            "device": ["id": "netease-macos", "name": "网易云音乐 · Mac"],
            "item": [
                "id": id,
                "uri": NSNull(),
                "name": title,
                "duration_ms": durationMs,
                "artists": artists,
                "album": albumPayload,
            ],
        ]
    }
}
final class MediaRemoteReader {
    static let shared = MediaRemoteReader()

    private let requestClass: NSObject.Type?
    private let neteaseMarkers = ["网易云", "netease", "163music", "cloudmusic", "orpheus"]

    private init() {
        let framework = Bundle(path: "/System/Library/PrivateFrameworks/MediaRemote.framework/")
        _ = framework?.load()
        requestClass = NSClassFromString("MRNowPlayingRequest") as? NSObject.Type
    }

    private func classObject(_ selectorName: String) -> NSObject? {
        guard let requestClass else { return nil }
        let selector = NSSelectorFromString(selectorName)
        guard requestClass.responds(to: selector) else { return nil }
        return requestClass.perform(selector)?.takeUnretainedValue() as? NSObject
    }

    private func object(_ receiver: NSObject?, _ selectorName: String) -> NSObject? {
        guard let receiver else { return nil }
        let selector = NSSelectorFromString(selectorName)
        guard receiver.responds(to: selector) else { return nil }
        return receiver.perform(selector)?.takeUnretainedValue() as? NSObject
    }

    private func string(_ dictionary: NSDictionary, _ key: String) -> String {
        if let value = dictionary.object(forKey: key) as? String { return value }
        if let value = dictionary.object(forKey: key) as? NSString { return value as String }
        return ""
    }

    private func number(_ dictionary: NSDictionary, _ key: String) -> Double {
        (dictionary.object(forKey: key) as? NSNumber)?.doubleValue ?? 0
    }

    private func clientIdentity() -> (name: String, bundleIdentifier: String) {
        let playerPath = classObject("localNowPlayingPlayerPath")
        let client = object(playerPath, "client")
        let name = object(client, "displayName") as? String ?? ""
        let bundleIdentifier = object(client, "bundleIdentifier") as? String ?? ""
        return (name, bundleIdentifier)
    }

    private func isNeteaseIdentity(_ identity: (name: String, bundleIdentifier: String)) -> Bool {
        let value = "\(identity.name) \(identity.bundleIdentifier)".lowercased()
        return neteaseMarkers.contains { value.contains($0) }
    }

    private func stableID(title: String, artist: String, album: String, uniqueIdentifier: String) -> String {
        if !uniqueIdentifier.isEmpty { return uniqueIdentifier }
        return "netease-macos:\(title)|\(artist)|\(album)"
    }

    func read() -> MediaRemoteStatus {
        guard requestClass != nil else {
            return MediaRemoteStatus(supported: false, isNetease: false, appName: "", snapshot: nil)
        }

        let identity = clientIdentity()
        let isNetease = isNeteaseIdentity(identity)
        guard isNetease else {
            return MediaRemoteStatus(supported: true, isNetease: false, appName: identity.name, snapshot: nil)
        }

        guard
            let item = classObject("localNowPlayingItem"),
            let info = object(item, "nowPlayingInfo") as? NSDictionary
        else {
            return MediaRemoteStatus(supported: true, isNetease: true, appName: identity.name, snapshot: nil)
        }

        let title = string(info, "kMRMediaRemoteNowPlayingInfoTitle")
        guard !title.isEmpty else {
            return MediaRemoteStatus(supported: true, isNetease: true, appName: identity.name, snapshot: nil)
        }

        let artist = string(info, "kMRMediaRemoteNowPlayingInfoArtist").isEmpty
            ? "网易云音乐"
            : string(info, "kMRMediaRemoteNowPlayingInfoArtist")
        let album = string(info, "kMRMediaRemoteNowPlayingInfoAlbum").isEmpty
            ? "网易云音乐"
            : string(info, "kMRMediaRemoteNowPlayingInfoAlbum")
        let duration = max(0, number(info, "kMRMediaRemoteNowPlayingInfoDuration"))
        let playbackRate = number(info, "kMRMediaRemoteNowPlayingInfoPlaybackRate")
        var elapsed = max(0, number(info, "kMRMediaRemoteNowPlayingInfoElapsedTime"))
        if playbackRate > 0, let timestamp = info.object(forKey: "kMRMediaRemoteNowPlayingInfoTimestamp") as? Date {
            elapsed += max(0, Date().timeIntervalSince(timestamp)) * playbackRate
        }
        if duration > 0 { elapsed = min(duration, elapsed) }

        var artworkDataURL: String?
        if let artwork = info.object(forKey: "kMRMediaRemoteNowPlayingInfoArtworkData") as? Data,
           !artwork.isEmpty,
           artwork.count <= 8_000_000 {
            let mime = string(info, "kMRMediaRemoteNowPlayingInfoArtworkMIMEType")
            artworkDataURL = "data:\(mime.isEmpty ? "image/jpeg" : mime);base64,\(artwork.base64EncodedString())"
        }

        let uniqueIdentifier = string(info, "kMRMediaRemoteNowPlayingInfoUniqueIdentifier")
        let snapshot = NowPlayingSnapshot(
            id: stableID(title: title, artist: artist, album: album, uniqueIdentifier: uniqueIdentifier),
            title: title,
            artist: artist,
            album: album,
            durationMs: Int(duration * 1_000),
            progressMs: Int(elapsed * 1_000),
            isPlaying: playbackRate > 0,
            artworkDataURL: artworkDataURL
        )
        return MediaRemoteStatus(supported: true, isNetease: true, appName: identity.name, snapshot: snapshot)
    }

    func healthPayload() -> [String: Any] {
        let status = read()
        let message: String
        if !status.supported {
            message = "当前 macOS 版本不支持系统播放信息读取"
        } else if !status.isNetease {
            message = "请打开网易云音乐 Mac 客户端并开始播放"
        } else if status.snapshot == nil {
            message = "已连接网易云音乐，等待歌曲播放"
        } else {
            message = "已通过 macOS 系统媒体中心读取网易云音乐"
        }
        return [
            "ok": true,
            "ready": status.supported,
            "mode": "mediaremote-readonly",
            "platform": "darwin",
            "version": CompanionInfo.version,
            "sessionFound": status.isNetease,
            "message": message,
        ]
    }

    func playbackPayload() -> [String: Any] {
        let status = read()
        guard status.isNetease, let snapshot = status.snapshot else {
            return ["item": NSNull(), "is_playing": false, "progress_ms": 0]
        }
        return snapshot.payload
    }

    func diagnosticPayload() -> [String: Any] {
        let status = read()
        return [
            "supported": status.supported,
            "neteaseActive": status.isNetease,
            "hasTrack": status.snapshot != nil,
            "platform": "darwin",
        ]
    }
}
