import AppKit
import Darwin
import Foundation

if CommandLine.arguments.contains("--probe") {
    let payload = MediaRemoteReader.shared.diagnosticPayload()
    let data = try JSONSerialization.data(withJSONObject: payload, options: [.sortedKeys])
    print(String(data: data, encoding: .utf8) ?? "{}")
    exit(0)
}

MainActor.assumeIsolated {
    let application = NSApplication.shared
    let delegate = AppDelegate()
    application.delegate = delegate
    application.run()
}
