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
            "capabilities": ["pause": false, "next": false, "previous": false, "seek": false],
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

private struct SystemNowPlaying: Decodable {
    let supported: Bool
    let displayName: String?
    let bundleIdentifier: String?
    let title: String?
    let artist: String?
    let album: String?
    let duration: Double?
    let elapsedTime: Double?
    let timestamp: Double?
    let playbackRate: Double?
    let uniqueIdentifier: String?
    let artworkMimeType: String?
    let artworkData: String?
    let error: String?
}

final class MediaRemoteReader {
    static let shared = MediaRemoteReader()

    private let lock = NSLock()
    private let neteaseMarkers = ["网易云", "netease", "163music", "cloudmusic", "orpheus"]
    private var cachedAt = Date.distantPast
    private var cachedStatus = MediaRemoteStatus(supported: true, isNetease: false, appName: "", snapshot: nil)

    private init() {}

    private func isNetease(name: String, bundleIdentifier: String) -> Bool {
        let identity = "\(name) \(bundleIdentifier)".lowercased()
        return neteaseMarkers.contains { identity.contains($0) }
    }

    private func stableID(title: String, artist: String, album: String, uniqueIdentifier: String) -> String {
        if !uniqueIdentifier.isEmpty { return uniqueIdentifier }
        return "netease-macos:\(title)|\(artist)|\(album)"
    }

    private func readSystemNowPlaying() -> SystemNowPlaying? {
        guard let scriptURL = Bundle.main.url(forResource: "now-playing", withExtension: "js") else {
            CompanionLog.write("Now Playing reader resource is missing")
            return nil
        }

        let output = Pipe()
        let errors = Pipe()
        let process = Process()
        process.executableURL = URL(fileURLWithPath: "/usr/bin/osascript")
        process.arguments = ["-l", "JavaScript", scriptURL.path]
        process.standardOutput = output
        process.standardError = errors

        do {
            try process.run()
            let data = output.fileHandleForReading.readDataToEndOfFile()
            let errorData = errors.fileHandleForReading.readDataToEndOfFile()
            process.waitUntilExit()
            guard process.terminationStatus == 0 else {
                let message = String(data: errorData, encoding: .utf8)?.trimmingCharacters(in: .whitespacesAndNewlines)
                CompanionLog.write("Now Playing reader exited with \(process.terminationStatus): \(message ?? "unknown error")")
                return nil
            }
            return try JSONDecoder().decode(SystemNowPlaying.self, from: data)
        } catch {
            CompanionLog.write("Now Playing reader failed: \(error.localizedDescription)")
            return nil
        }
    }

    private func freshStatus() -> MediaRemoteStatus {
        guard let system = readSystemNowPlaying() else {
            return MediaRemoteStatus(supported: false, isNetease: false, appName: "", snapshot: nil)
        }
        if let error = system.error, !error.isEmpty {
            CompanionLog.write("Now Playing script reported: \(error)")
        }

        let appName = system.displayName ?? ""
        let bundleIdentifier = system.bundleIdentifier ?? ""
        let netease = isNetease(name: appName, bundleIdentifier: bundleIdentifier)
        guard netease else {
            return MediaRemoteStatus(supported: system.supported, isNetease: false, appName: appName, snapshot: nil)
        }

        let title = system.title ?? ""
        guard !title.isEmpty else {
            return MediaRemoteStatus(supported: system.supported, isNetease: true, appName: appName, snapshot: nil)
        }

        let artist = (system.artist?.isEmpty == false ? system.artist : nil) ?? "网易云音乐"
        let album = (system.album?.isEmpty == false ? system.album : nil) ?? "网易云音乐"
        let duration = max(0, system.duration ?? 0)
        let playbackRate = system.playbackRate ?? 0
        var elapsed = max(0, system.elapsedTime ?? 0)
        if playbackRate > 0, let timestamp = system.timestamp, timestamp > 0 {
            elapsed += max(0, Date().timeIntervalSince1970 - timestamp) * playbackRate
        }
        if duration > 0 { elapsed = min(duration, elapsed) }

        var artworkDataURL: String?
        if let artwork = system.artworkData, !artwork.isEmpty {
            let mime = (system.artworkMimeType?.isEmpty == false ? system.artworkMimeType : nil) ?? "image/jpeg"
            artworkDataURL = "data:\(mime);base64,\(artwork)"
        }

        let snapshot = NowPlayingSnapshot(
            id: stableID(
                title: title,
                artist: artist,
                album: album,
                uniqueIdentifier: system.uniqueIdentifier ?? ""
            ),
            title: title,
            artist: artist,
            album: album,
            durationMs: Int(duration * 1_000),
            progressMs: Int(elapsed * 1_000),
            isPlaying: playbackRate > 0,
            artworkDataURL: artworkDataURL
        )
        return MediaRemoteStatus(supported: system.supported, isNetease: true, appName: appName, snapshot: snapshot)
    }

    func read() -> MediaRemoteStatus {
        lock.lock()
        defer { lock.unlock() }
        if Date().timeIntervalSince(cachedAt) < 0.75 { return cachedStatus }
        cachedStatus = freshStatus()
        cachedAt = Date()
        return cachedStatus
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
            "mode": "system-script-readonly",
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
