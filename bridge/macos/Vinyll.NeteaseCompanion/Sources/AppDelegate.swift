import AppKit
import Foundation
import ServiceManagement

enum CompanionInfo {
    static let version = Bundle.main.object(forInfoDictionaryKey: "CFBundleShortVersionString") as? String ?? "1.1.1"
    static let website = URL(string: "https://vinyll.leoenchanted.top")!
}

enum CompanionLog {
    private static let queue = DispatchQueue(label: "top.leoenchanted.vinyll.netease-log")
    static let fileURL: URL = {
        let base = FileManager.default.urls(for: .libraryDirectory, in: .userDomainMask)[0]
            .appendingPathComponent("Logs/Vinyll", isDirectory: true)
        try? FileManager.default.createDirectory(at: base, withIntermediateDirectories: true)
        return base.appendingPathComponent("netease-companion.log")
    }()

    static func write(_ message: String) {
        queue.async {
            let line = "\(ISO8601DateFormatter().string(from: Date())) \(message)\n"
            guard let data = line.data(using: .utf8) else { return }
            if FileManager.default.fileExists(atPath: fileURL.path), let handle = try? FileHandle(forWritingTo: fileURL) {
                defer { try? handle.close() }
                _ = try? handle.seekToEnd()
                try? handle.write(contentsOf: data)
            } else {
                try? data.write(to: fileURL, options: .atomic)
            }
        }
    }
}

@MainActor
final class AppDelegate: NSObject, NSApplicationDelegate, NSMenuDelegate {
    private let server = LocalHTTPServer()
    private let statusItem = NSStatusBar.system.statusItem(withLength: NSStatusItem.squareLength)
    private let statusLine = NSMenuItem(title: "正在启动…", action: nil, keyEquivalent: "")
    private let loginItem = NSMenuItem(title: "登录时自动启动", action: #selector(toggleLoginItem), keyEquivalent: "")
    private var timer: Timer?

    func applicationDidFinishLaunching(_ notification: Notification) {
        NSApp.setActivationPolicy(.accessory)
        setupMenu()
        do {
            try server.start()
            CompanionLog.write("macOS companion \(CompanionInfo.version) started")
        } catch {
            statusLine.title = "启动失败：端口 17863 被占用"
            CompanionLog.write("Server start failed: \(error)")
            showAlert(title: "无法启动 Vinyll 网易云助手", message: "本地端口 17863 已被占用。请退出旧助手后重试。")
        }
        registerAtLoginOnFirstLaunch()
        refreshStatus()
        timer = Timer.scheduledTimer(withTimeInterval: 3, repeats: true) { [weak self] _ in
            Task { @MainActor in self?.refreshStatus() }
        }
    }

    func applicationWillTerminate(_ notification: Notification) {
        timer?.invalidate()
        server.stop()
        CompanionLog.write("Stopped")
    }

    private func setupMenu() {
        if let button = statusItem.button {
            button.image = NSImage(systemSymbolName: "record.circle", accessibilityDescription: "Vinyll 网易云助手")
            button.toolTip = "Vinyll 网易云助手"
        }
        statusLine.isEnabled = false
        loginItem.target = self

        let menu = NSMenu()
        menu.delegate = self
        menu.addItem(statusLine)
        menu.addItem(.separator())
        menu.addItem(withTitle: "打开 Vinyll", action: #selector(openWebsite), keyEquivalent: "")
        menu.addItem(loginItem)
        menu.addItem(withTitle: "查看运行日志", action: #selector(openLog), keyEquivalent: "")
        menu.addItem(.separator())
        menu.addItem(withTitle: "退出助手", action: #selector(quit), keyEquivalent: "q")
        menu.items.forEach { if $0.action != nil { $0.target = self } }
        statusItem.menu = menu
    }

    func menuWillOpen(_ menu: NSMenu) {
        refreshLoginItem()
        refreshStatus()
    }

    private func refreshStatus() {
        let status = MediaRemoteReader.shared.read()
        if !status.supported {
            statusLine.title = "当前 macOS 版本不受支持"
        } else if !status.isNetease {
            statusLine.title = "等待网易云音乐播放"
        } else if status.snapshot == nil {
            statusLine.title = "已连接网易云音乐 · 等待播放"
        } else {
            statusLine.title = "网易云音乐 · 正在同步"
        }
    }

    private func registerAtLoginOnFirstLaunch() {
        let key = "didAttemptLoginRegistration"
        guard !UserDefaults.standard.bool(forKey: key) else { return }
        UserDefaults.standard.set(true, forKey: key)
        guard Bundle.main.bundleURL.path.contains("/Applications/") else { return }
        try? SMAppService.mainApp.register()
        refreshLoginItem()
    }

    private func refreshLoginItem() {
        loginItem.state = SMAppService.mainApp.status == .enabled ? .on : .off
    }

    @objc private func toggleLoginItem() {
        do {
            if SMAppService.mainApp.status == .enabled {
                try SMAppService.mainApp.unregister()
            } else {
                try SMAppService.mainApp.register()
            }
        } catch {
            showAlert(title: "无法修改自动启动", message: "请在系统设置 → 通用 → 登录项中允许 Vinyll 网易云助手。")
        }
        refreshLoginItem()
    }

    @objc private func openWebsite() {
        NSWorkspace.shared.open(CompanionInfo.website)
    }

    @objc private func openLog() {
        NSWorkspace.shared.activateFileViewerSelecting([CompanionLog.fileURL])
    }

    @objc private func quit() {
        NSApp.terminate(nil)
    }

    private func showAlert(title: String, message: String) {
        let alert = NSAlert()
        alert.messageText = title
        alert.informativeText = message
        alert.alertStyle = .warning
        alert.addButton(withTitle: "好")
        alert.runModal()
    }
}
