import AppKit
import Darwin
import Dispatch

final class Launcher: NSObject, NSApplicationDelegate {
    private let child = Process()
    private let stream = Pipe()
    private var term: DispatchSourceSignal?
    private var window: NSWindow?
    private var address: URL?
    private var output = Data()
    private var exiting = false
    private let arguments = Array(CommandLine.arguments.dropFirst())
    private let status = NSTextField(wrappingLabelWithString: "")
    private lazy var openButton = NSButton(title: strings.open, target: self, action: #selector(openDeskLedger))

    private struct Labels {
        let open: String
        let starting: String
        let ready: String
        let failed: String
        let browserFailed: String
        let quit: String
    }

    private let strings: Labels = {
        switch Locale.preferredLanguages.first?.split(separator: "-").first {
        case "fa":
            return Labels(open: "باز کردن دسک‌لجر", starting: "در حال راه‌اندازی…",
                          ready: "دسک‌لجر آماده است. هنگام کار این پنجره را باز نگه دارید.",
                          failed: "راه‌اندازی دسک‌لجر انجام نشد.", browserFailed: "مرورگر باز نشد. دوباره تلاش کنید.", quit: "خروج از دسک‌لجر")
        case "ar":
            return Labels(open: "افتح ديسك ليدجر", starting: "جارٍ التشغيل…",
                          ready: "ديسك ليدجر جاهز. اترك هذه النافذة مفتوحة أثناء العمل.",
                          failed: "تعذّر تشغيل ديسك ليدجر.", browserFailed: "تعذّر فتح المتصفح. حاول مرة أخرى.", quit: "إنهاء ديسك ليدجر")
        default:
            return Labels(open: "Open DeskLedger", starting: "Starting…",
                          ready: "DeskLedger is ready. Keep this window open while you work.",
                          failed: "DeskLedger could not start.", browserFailed: "The browser did not open. Try again.", quit: "Quit DeskLedger")
        }
    }()

    func applicationDidFinishLaunching(_ event: Notification) {
        let fileMenu = NSMenu()
        fileMenu.addItem(withTitle: strings.quit, action: #selector(NSApplication.terminate(_:)), keyEquivalent: "q")
        let root = NSMenuItem()
        root.submenu = fileMenu
        let mainMenu = NSMenu()
        mainMenu.addItem(root)
        NSApp.mainMenu = mainMenu

        openButton.isEnabled = false
        let quit = NSButton(title: strings.quit, target: NSApp, action: #selector(NSApplication.terminate(_:)))
        status.stringValue = strings.starting
        status.alignment = .natural
        let buttons = NSStackView(views: [openButton, quit])
        buttons.orientation = .horizontal
        buttons.spacing = 8
        let panel = NSStackView(views: [status, buttons])
        panel.orientation = .vertical
        panel.alignment = .leading
        panel.spacing = 14
        panel.edgeInsets = NSEdgeInsets(top: 24, left: 24, bottom: 24, right: 24)

        let window = NSWindow(contentRect: NSRect(x: 0, y: 0, width: 480, height: 150),
                              styleMask: [.titled, .closable, .miniaturizable],
                              backing: .buffered, defer: false)
        window.title = "DeskLedger"
        window.contentView = panel
        window.center()
        window.makeKeyAndOrderFront(nil)
        self.window = window
        NSApp.activate(ignoringOtherApps: true)
        startCore()
    }

    private func startCore() {
        let executable = Bundle.main.bundleURL.appendingPathComponent(
            "Contents/MacOS/deskledger-core")
        child.executableURL = executable
        child.arguments = ["--no-browser"] + arguments.filter { $0 != "--no-open-browser" }
        child.standardOutput = stream
        child.standardError = FileHandle.standardError
        child.terminationHandler = { [weak self] _ in
            DispatchQueue.main.async { [weak self] in
                guard let self, !self.exiting else { return }
                self.status.stringValue = self.strings.failed
                self.openButton.isEnabled = false
                if self.arguments.contains("--no-open-browser") { exit(1) }
            }
        }
        stream.fileHandleForReading.readabilityHandler = { [weak self] handle in
            let chunk = handle.availableData
            if chunk.isEmpty { handle.readabilityHandler = nil; return }
            DispatchQueue.main.async { [weak self] in self?.receive(chunk) }
        }
        do {
            try child.run()
        } catch {
            stream.fileHandleForReading.readabilityHandler = nil
            status.stringValue = strings.failed
            if arguments.contains("--no-open-browser") { exit(1) }
            return
        }

        // The child is spawned with normal SIGTERM behavior before the GUI starts intercepting it.
        signal(SIGTERM, SIG_IGN)
        let source = DispatchSource.makeSignalSource(signal: SIGTERM, queue: .main)
        source.setEventHandler { NSApp.terminate(nil) }
        source.resume()
        term = source
    }

    private func receive(_ chunk: Data) {
        guard address == nil else { return }
        output.append(chunk)
        guard let end = output.firstIndex(of: 10) else { return }
        let line = String(decoding: output[..<end], as: UTF8.self)
        let prefix = "DeskLedger: "
        guard line.hasPrefix(prefix),
              let link = URL(string: String(line.dropFirst(prefix.count))),
              link.scheme == "http", link.host == "127.0.0.1", link.port != nil,
              let token = link.fragment, token.range(of: "^[a-f0-9]{64}$", options: .regularExpression) != nil
        else {
            status.stringValue = strings.failed
            if arguments.contains("--no-open-browser") { exit(1) }
            return
        }
        address = link
        openButton.isEnabled = true
        status.stringValue = strings.ready
        if arguments.contains("--no-open-browser") {
            // The smoke test reads the authenticated loopback link through its private pipe.
            FileHandle.standardOutput.write(Data((line + "\n").utf8))
        } else {
            openDeskLedger()
        }
    }

    @objc private func openDeskLedger() {
        guard let address else { return }
        status.stringValue = NSWorkspace.shared.open(address) ? strings.ready : strings.browserFailed
    }

    func applicationShouldTerminateAfterLastWindowClosed(_ sender: NSApplication) -> Bool { true }

    func applicationWillTerminate(_ event: Notification) {
        exiting = true
        stream.fileHandleForReading.readabilityHandler = nil
        term?.cancel()
        if child.isRunning {
            child.terminate()
            child.waitUntilExit()
        }
    }
}

let app = NSApplication.shared
let launcher = Launcher()
app.setActivationPolicy(.regular)
app.delegate = launcher
app.run()
