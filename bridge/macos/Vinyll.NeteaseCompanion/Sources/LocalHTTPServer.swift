import Darwin
import Foundation

enum LocalHTTPServerError: Error {
    case socketCreation
    case bind
    case listen
}

final class LocalHTTPServer {
    private let host = "127.0.0.1"
    private let port: UInt16 = 17_863
    private let queue = DispatchQueue(label: "top.leoenchanted.vinyll.netease-http", qos: .userInitiated)
    private var socketFD: Int32 = -1
    private var running = false

    func start() throws {
        guard socketFD < 0 else { return }
        socketFD = Darwin.socket(AF_INET, SOCK_STREAM, 0)
        guard socketFD >= 0 else { throw LocalHTTPServerError.socketCreation }

        var reuse: Int32 = 1
        setsockopt(socketFD, SOL_SOCKET, SO_REUSEADDR, &reuse, socklen_t(MemoryLayout.size(ofValue: reuse)))

        var address = sockaddr_in()
        address.sin_len = UInt8(MemoryLayout<sockaddr_in>.size)
        address.sin_family = sa_family_t(AF_INET)
        address.sin_port = port.bigEndian
        address.sin_addr = in_addr(s_addr: inet_addr(host))

        let bindResult = withUnsafePointer(to: &address) { pointer in
            pointer.withMemoryRebound(to: sockaddr.self, capacity: 1) {
                Darwin.bind(socketFD, $0, socklen_t(MemoryLayout<sockaddr_in>.size))
            }
        }
        guard bindResult == 0 else {
            Darwin.close(socketFD)
            socketFD = -1
            throw LocalHTTPServerError.bind
        }
        guard Darwin.listen(socketFD, 16) == 0 else {
            Darwin.close(socketFD)
            socketFD = -1
            throw LocalHTTPServerError.listen
        }

        running = true
        queue.async { [weak self] in self?.acceptLoop() }
        CompanionLog.write("Listening on http://127.0.0.1:\(self.port)")
    }

    func stop() {
        running = false
        if socketFD >= 0 {
            Darwin.shutdown(socketFD, SHUT_RDWR)
            Darwin.close(socketFD)
            socketFD = -1
        }
    }

    private func acceptLoop() {
        while running, socketFD >= 0 {
            let client = Darwin.accept(socketFD, nil, nil)
            if client < 0 {
                if running { CompanionLog.write("Local server accept failed: \(errno)") }
                continue
            }
            handle(client)
        }
    }

    private func handle(_ client: Int32) {
        defer {
            Darwin.shutdown(client, SHUT_RDWR)
            Darwin.close(client)
        }
        var timeout = timeval(tv_sec: 5, tv_usec: 0)
        setsockopt(client, SOL_SOCKET, SO_RCVTIMEO, &timeout, socklen_t(MemoryLayout.size(ofValue: timeout)))

        var bytes = [UInt8](repeating: 0, count: 16_384)
        let count = Darwin.recv(client, &bytes, bytes.count, 0)
        guard count > 0, let request = String(bytes: bytes.prefix(count), encoding: .utf8) else { return }

        let lines = request.components(separatedBy: "\r\n")
        let requestParts = (lines.first ?? "").split(separator: " ")
        guard requestParts.count >= 2 else {
            sendJSON(client, status: 400, payload: ["error": "Bad request"], origin: "")
            return
        }
        let method = String(requestParts[0])
        let path = String(requestParts[1]).split(separator: "?", maxSplits: 1).first.map(String.init) ?? "/"
        let origin = lines.first { $0.lowercased().hasPrefix("origin:") }
            .flatMap { $0.split(separator: ":", maxSplits: 1).last }
            .map { String($0).trimmingCharacters(in: .whitespaces) }
            ?? ""

        guard originAllowed(origin) else {
            sendJSON(client, status: 403, payload: ["error": "Origin not allowed"], origin: "")
            return
        }
        if method == "OPTIONS" {
            sendResponse(client, status: 204, body: Data(), origin: origin)
            return
        }
        guard method == "GET" else {
            sendJSON(client, status: 405, payload: ["error": "Method not allowed"], origin: origin)
            return
        }
        switch path {
        case "/health":
            sendJSON(client, status: 200, payload: MediaRemoteReader.shared.healthPayload(), origin: origin)
        case "/state":
            sendJSON(client, status: 200, payload: MediaRemoteReader.shared.playbackPayload(), origin: origin)
        default:
            sendJSON(client, status: 404, payload: ["error": "Not found"], origin: origin)
        }
    }

    private func originAllowed(_ origin: String) -> Bool {
        if origin.isEmpty || origin == "https://vinyll.leoenchanted.top" { return true }
        guard let url = URL(string: origin), url.scheme == "http" else { return false }
        guard url.host == "127.0.0.1" || url.host == "localhost" else { return false }
        return true
    }

    private func sendJSON(_ client: Int32, status: Int, payload: [String: Any], origin: String) {
        let body = (try? JSONSerialization.data(withJSONObject: payload, options: [])) ?? Data("{}".utf8)
        sendResponse(client, status: status, body: body, origin: origin)
    }

    private func sendResponse(_ client: Int32, status: Int, body: Data, origin: String) {
        let statusText: String
        switch status {
        case 200: statusText = "OK"
        case 204: statusText = "No Content"
        case 400: statusText = "Bad Request"
        case 403: statusText = "Forbidden"
        case 404: statusText = "Not Found"
        case 405: statusText = "Method Not Allowed"
        default: statusText = "Error"
        }
        var headers = "HTTP/1.1 \(status) \(statusText)\r\n"
        headers += "Content-Type: application/json; charset=utf-8\r\n"
        headers += "Content-Length: \(body.count)\r\n"
        headers += "Cache-Control: no-store\r\n"
        headers += "Connection: close\r\n"
        headers += "Vary: Origin\r\n"
        headers += "Access-Control-Allow-Methods: GET, OPTIONS\r\n"
        headers += "Access-Control-Allow-Headers: Content-Type\r\n"
        headers += "Access-Control-Allow-Private-Network: true\r\n"
        if !origin.isEmpty { headers += "Access-Control-Allow-Origin: \(origin)\r\n" }
        headers += "\r\n"
        var response = Data(headers.utf8)
        response.append(body)
        response.withUnsafeBytes { buffer in
            guard let base = buffer.baseAddress else { return }
            var offset = 0
            while offset < response.count {
                let sent = Darwin.send(client, base.advanced(by: offset), response.count - offset, 0)
                if sent <= 0 { break }
                offset += sent
            }
        }
    }

    deinit { stop() }
}
