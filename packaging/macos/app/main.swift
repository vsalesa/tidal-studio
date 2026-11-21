// Tidal Studio for macOS: a small native window around the studio.
//
// Double-click the app and it
//   1. starts the studio server (Python + SuperCollider/SuperDirt + Tidal) in the background,
//      with no Terminal window, logging to ~/Library/Logs/Tidal Studio/studio.log,
//   2. shows the studio in its own window (WKWebView, the engine behind Safari),
//   3. on quit (⌘Q or closing the window) stops the server and everything it started.
//
// Built by packaging/macos/build.sh with `swiftc` (no Xcode project). Needs macOS 12+.
// `TidalStudio --self-test` starts, loads the studio, quits and exits 0 (used by CI).

import Cocoa
import WebKit

let runtimeRoot = ProcessInfo.processInfo.environment["TIDAL_STUDIO_ROOT"] ?? "/Users/Shared/TidalStudio"
let selfTest = CommandLine.arguments.contains("--self-test")
let spanish = (Locale.preferredLanguages.first ?? "en").hasPrefix("es")
func T(_ en: String, _ es: String) -> String { spanish ? es : en }

func say(_ s: String) {
    FileHandle.standardError.write(("[Tidal Studio] " + s + "\n").data(using: .utf8)!)
}

final class AppDelegate: NSObject, NSApplicationDelegate, NSWindowDelegate,
                         WKNavigationDelegate, WKUIDelegate, WKDownloadDelegate {
    var window: NSWindow!
    var webView: WKWebView!
    var server: Process?
    var studioURL: URL?
    var pollTimer: Timer?
    var quitting = false
    var startedAt = Date()
    var selfTestDone = false

    let supportDir = FileManager.default.homeDirectoryForCurrentUser
        .appendingPathComponent("Library/Application Support/Tidal Studio")
    let logDir = FileManager.default.homeDirectoryForCurrentUser
        .appendingPathComponent("Library/Logs/Tidal Studio")
    var logURL: URL { logDir.appendingPathComponent("studio.log") }
    var portFile: URL { supportDir.appendingPathComponent(".port") }

    // MARK: - App lifecycle

    func applicationDidFinishLaunching(_ note: Notification) {
        buildMenu()
        buildWindow()
        showStatus(T("Starting the studio…", "Arrancando el estudio…"),
                   T("Waking up SuperCollider and Tidal. This takes a few seconds.",
                     "Despertando a SuperCollider y Tidal. Tarda unos segundos."), spinner: true)
        NSApp.activate(ignoringOtherApps: true)
        startServer()
        say("launched; window ready")
    }

    func applicationShouldTerminateAfterLastWindowClosed(_ app: NSApplication) -> Bool { true }

    func applicationShouldTerminate(_ sender: NSApplication) -> NSApplication.TerminateReply {
        guard let p = server, p.isRunning else { return .terminateNow }
        quitting = true
        pollTimer?.invalidate()
        showStatus(T("Closing the studio…", "Cerrando el estudio…"),
                   T("Stopping SuperCollider and Tidal.", "Parando SuperCollider y Tidal."), spinner: true)
        say("quitting: stopping the server")
        DispatchQueue.global().async {
            AppDelegate.stop(p)
            say("server stopped; quitting")
            if selfTest {
                if let s = try? String(contentsOf: FileManager.default.homeDirectoryForCurrentUser
                    .appendingPathComponent("Library/Logs/Tidal Studio/studio.log"), encoding: .utf8) {
                    print(s.suffix(3000))
                }
                exit(0)
            }
            DispatchQueue.main.async { sender.reply(toApplicationShouldTerminate: true) }
        }
        return .terminateLater
    }

    func applicationWillTerminate(_ note: Notification) {
        if let p = server, p.isRunning { AppDelegate.stop(p) }
    }

    // MARK: - Server

    func startServer() {
        let script = runtimeRoot + "/bin/run-studio.sh"
        guard FileManager.default.fileExists(atPath: script) else {
            showError(T("The studio files are missing", "Faltan los archivos del estudio"),
                      T("Tidal Studio could not find \(runtimeRoot). Please run the installer again.",
                        "Tidal Studio no encuentra \(runtimeRoot). Vuelve a ejecutar el instalador."))
            return
        }
        try? FileManager.default.createDirectory(at: supportDir, withIntermediateDirectories: true)
        try? FileManager.default.createDirectory(at: logDir, withIntermediateDirectories: true)
        try? FileManager.default.removeItem(at: portFile)
        // keep the previous log for troubleshooting
        let old = logDir.appendingPathComponent("studio.previous.log")
        try? FileManager.default.removeItem(at: old)
        try? FileManager.default.moveItem(at: logURL, to: old)
        FileManager.default.createFile(atPath: logURL.path, contents: nil)
        let log = FileHandle(forWritingAtPath: logURL.path)

        let p = Process()
        p.executableURL = URL(fileURLWithPath: "/bin/bash")
        // --noprofile --norc: never read the user's shell configuration
        p.arguments = ["--noprofile", "--norc", script, "--no-browser", "--port-file", portFile.path]
        var env = ProcessInfo.processInfo.environment
        env["TIDAL_STUDIO_WATCH_PARENT"] = "1"
        env["PYTHONUNBUFFERED"] = "1"
        if env["TIDAL_STUDIO_LANG"] == nil { env["TIDAL_STUDIO_LANG"] = spanish ? "es" : "en" }
        p.environment = env
        p.standardInput = FileHandle.nullDevice
        p.standardOutput = log ?? FileHandle.nullDevice
        p.standardError = log ?? FileHandle.nullDevice
        p.terminationHandler = { proc in
            DispatchQueue.main.async { self.serverExited(proc) }
        }
        do {
            try p.run()
        } catch {
            showError(T("The studio could not start", "El estudio no ha podido arrancar"), "\(error)")
            return
        }
        server = p
        startedAt = Date()
        say("server started (pid \(p.processIdentifier)), log: \(logURL.path)")
        pollTimer = Timer.scheduledTimer(withTimeInterval: 0.4, repeats: true) { [weak self] _ in self?.poll() }
    }

    /// Waits for the server to write its port and answer /api/status, then shows the studio.
    func poll() {
        guard studioURL == nil, !quitting else { return }
        guard let txt = try? String(contentsOf: portFile, encoding: .utf8),
              let port = Int(txt.trimmingCharacters(in: .whitespacesAndNewlines)) else {
            if Date().timeIntervalSince(startedAt) > 90 {
                pollTimer?.invalidate()
                showError(T("The studio is taking too long to start", "El estudio tarda demasiado en arrancar"),
                          T("Here is the end of the log:", "Este es el final del registro:"), log: true)
            }
            return
        }
        let url = URL(string: "http://localhost:\(port)/")!
        var req = URLRequest(url: url.appendingPathComponent("api/status"))
        req.timeoutInterval = 2
        URLSession.shared.dataTask(with: req) { _, resp, _ in
            guard (resp as? HTTPURLResponse)?.statusCode == 200 else { return }
            DispatchQueue.main.async {
                guard self.studioURL == nil, !self.quitting else { return }
                self.studioURL = url
                self.pollTimer?.invalidate()
                say("studio ready at \(url)")
                self.webView.load(URLRequest(url: url))
            }
        }.resume()
    }

    func serverExited(_ proc: Process) {
        say("server exited with status \(proc.terminationStatus)")
        guard proc === server, !quitting else { return }  // an old server we stopped on purpose
        // status 0 with a port file: another Tidal Studio was already running and we just use it
        if proc.terminationStatus == 0, FileManager.default.fileExists(atPath: portFile.path) {
            server = nil
            return
        }
        pollTimer?.invalidate()
        AppDelegate.killGroup(proc.processIdentifier)
        server = nil
        showError(T("The studio stopped", "El estudio se ha parado"),
                  T("Here is the end of the log:", "Este es el final del registro:"), log: true, restart: true)
    }

    /// Asks the server to shut down (it stops Tidal and SuperCollider), then makes sure nothing is left.
    /// Blocking: call it off the main thread when possible.
    func stopServer() {
        guard let p = server else { return }
        server = nil
        AppDelegate.stop(p)
    }

    static func stop(_ p: Process) {
        let pid = p.processIdentifier
        if p.isRunning {
            say("sending SIGINT to \(pid)")
            p.interrupt()  // SIGINT: the server stops ghci and sclang and exits
            let deadline = Date().addingTimeInterval(10)
            while p.isRunning && Date() < deadline { usleep(100_000) }
            if p.isRunning { say("still running: SIGTERM"); p.terminate(); usleep(1_500_000) }
            if p.isRunning { say("still running: SIGKILL"); kill(pid, SIGKILL) }
        }
        killGroup(pid)
    }

    /// The server puts itself and everything it starts (sclang, scsynth, ghci) in its own process group.
    static func killGroup(_ pid: pid_t) {
        guard pid > 0 else { return }
        if kill(-pid, SIGTERM) == 0 {
            usleep(800_000)
            kill(-pid, SIGKILL)
        }
    }

    func logTail(_ lines: Int = 40) -> String {
        guard let s = try? String(contentsOf: logURL, encoding: .utf8) else { return "" }
        return s.split(separator: "\n", omittingEmptySubsequences: false).suffix(lines).joined(separator: "\n")
    }

    // MARK: - Window

    func buildWindow() {
        let config = WKWebViewConfiguration()
        config.mediaTypesRequiringUserActionForPlayback = []
        config.websiteDataStore = .default()  // keeps "My projects" (localStorage) between launches
        config.preferences.javaScriptCanOpenWindowsAutomatically = true
        webView = WKWebView(frame: .zero, configuration: config)
        webView.navigationDelegate = self
        webView.uiDelegate = self
        webView.allowsMagnification = true
        webView.allowsBackForwardNavigationGestures = false
        if #available(macOS 13.3, *) { webView.isInspectable = true }

        let screen = NSScreen.main?.visibleFrame ?? NSRect(x: 0, y: 0, width: 1440, height: 900)
        let size = NSSize(width: min(1480, screen.width * 0.92), height: min(940, screen.height * 0.92))
        window = NSWindow(contentRect: NSRect(origin: .zero, size: size),
                          styleMask: [.titled, .closable, .miniaturizable, .resizable],
                          backing: .buffered, defer: false)
        window.title = "Tidal Studio"
        window.minSize = NSSize(width: 960, height: 640)
        window.backgroundColor = NSColor(calibratedRed: 0.98, green: 0.97, blue: 0.95, alpha: 1)
        window.contentView = webView
        window.delegate = self
        window.isReleasedWhenClosed = false
        window.center()
        window.setFrameAutosaveName("TidalStudioMainWindow")
        window.tabbingMode = .disallowed
        window.makeKeyAndOrderFront(nil)
    }

    func page(_ body: String) -> String {
        """
        <!doctype html><html><head><meta charset="utf-8"><style>
        :root { color-scheme: light; }
        body { margin:0; height:100vh; display:flex; align-items:center; justify-content:center;
               background:#faf7f2; color:#2b2a28; font:15px -apple-system, BlinkMacSystemFont, sans-serif; }
        .box { max-width:640px; padding:32px; text-align:center; }
        h1 { font-size:22px; font-weight:600; margin:18px 0 8px; }
        p { color:#6b665e; line-height:1.5; margin:6px 0; }
        pre { text-align:left; background:#fff; border:1px solid #e6e0d6; border-radius:8px; padding:12px;
              font:12px ui-monospace, Menlo, monospace; max-height:46vh; overflow:auto; white-space:pre-wrap; }
        .spin { width:34px; height:34px; margin:auto; border:3px solid #e6e0d6; border-top-color:#c2562f;
                border-radius:50%; animation:s 0.9s linear infinite; }
        @keyframes s { to { transform:rotate(360deg); } }
        a.btn { display:inline-block; margin:14px 6px 0; padding:8px 16px; border-radius:8px; background:#c2562f;
                color:#fff; text-decoration:none; font-weight:600; }
        a.btn.alt { background:#fff; color:#2b2a28; border:1px solid #d9d2c6; }
        .wave { font-size:34px; color:#c2562f; letter-spacing:2px; }
        </style></head><body><div class="box">\(body)</div></body></html>
        """
    }

    func esc(_ s: String) -> String {
        s.replacingOccurrences(of: "&", with: "&amp;").replacingOccurrences(of: "<", with: "&lt;")
            .replacingOccurrences(of: ">", with: "&gt;")
    }

    func showStatus(_ title: String, _ text: String, spinner: Bool) {
        let top = spinner ? "<div class=\"spin\"></div>" : "<div class=\"wave\">∿∿∿</div>"
        webView.loadHTMLString(page("\(top)<h1>\(esc(title))</h1><p>\(esc(text))</p>"), baseURL: nil)
    }

    func showError(_ title: String, _ text: String, log: Bool = false, restart: Bool = false) {
        var body = "<div class=\"wave\">∿∿∿</div><h1>\(esc(title))</h1><p>\(esc(text))</p>"
        if log { body += "<pre>\(esc(logTail()))</pre>" }
        if restart { body += "<a class=\"btn\" href=\"tidalstudio:restart\">\(T("Start again", "Volver a arrancar"))</a>" }
        body += "<a class=\"btn alt\" href=\"tidalstudio:logs\">\(T("Show the log", "Ver el registro"))</a>"
        webView.loadHTMLString(page(body), baseURL: nil)
        if selfTest {
            say("self-test: FAILED: \(title)")
            print(logTail(80))
            stopServer()
            exit(1)
        }
    }

    @objc func restartStudio(_ sender: Any?) {
        guard !quitting else { return }
        pollTimer?.invalidate()
        studioURL = nil
        showStatus(T("Starting the studio…", "Arrancando el estudio…"),
                   T("Waking up SuperCollider and Tidal. This takes a few seconds.",
                     "Despertando a SuperCollider y Tidal. Tarda unos segundos."), spinner: true)
        let old = server
        server = nil  // so its exit is not reported as a crash
        DispatchQueue.global().async {
            if let old = old { AppDelegate.stop(old) }
            DispatchQueue.main.async { self.startServer() }
        }
    }

    @objc func showLogs(_ sender: Any?) {
        NSWorkspace.shared.activateFileViewerSelecting([logURL])
    }

    @objc func openInBrowser(_ sender: Any?) {
        if let u = studioURL { NSWorkspace.shared.open(u) }
    }

    @objc func reloadPage(_ sender: Any?) {
        if studioURL != nil { webView.reload() }
    }

    @objc func zoomIn(_ sender: Any?) { webView.pageZoom = min(webView.pageZoom + 0.1, 3) }
    @objc func zoomOut(_ sender: Any?) { webView.pageZoom = max(webView.pageZoom - 0.1, 0.5) }
    @objc func zoomReset(_ sender: Any?) { webView.pageZoom = 1 }

    @objc func openWebsite(_ sender: Any?) {
        NSWorkspace.shared.open(URL(string: "https://vsalesa.github.io/tidal-studio/")!)
    }

    // MARK: - Navigation

    func isStudio(_ url: URL?) -> Bool {
        guard let u = url else { return false }
        if ["about", "blob", "data"].contains(u.scheme ?? "") { return true }
        return (u.host == "localhost" || u.host == "127.0.0.1") && u.port == studioURL?.port
    }

    func webView(_ webView: WKWebView, decidePolicyFor action: WKNavigationAction,
                 decisionHandler: @escaping (WKNavigationActionPolicy) -> Void) {
        let url = action.request.url
        if url?.scheme == "tidalstudio" {
            if url?.absoluteString == "tidalstudio:restart" { restartStudio(nil) } else { showLogs(nil) }
            return decisionHandler(.cancel)
        }
        if action.shouldPerformDownload { return decisionHandler(.download) }
        // links to the web (docs, Freesound, GitHub…) open in the default browser
        if action.targetFrame?.isMainFrame != false, !isStudio(url), let u = url,
           ["http", "https", "mailto"].contains(u.scheme ?? "") {
            NSWorkspace.shared.open(u)
            return decisionHandler(.cancel)
        }
        decisionHandler(.allow)
    }

    func webView(_ webView: WKWebView, decidePolicyFor response: WKNavigationResponse,
                 decisionHandler: @escaping (WKNavigationResponsePolicy) -> Void) {
        if !response.canShowMIMEType { return decisionHandler(.download) }
        if let http = response.response as? HTTPURLResponse,
           let cd = http.value(forHTTPHeaderField: "Content-Disposition"), cd.lowercased().hasPrefix("attachment") {
            return decisionHandler(.download)
        }
        decisionHandler(.allow)
    }

    func webView(_ webView: WKWebView, navigationAction: WKNavigationAction, didBecome download: WKDownload) {
        download.delegate = self
    }

    func webView(_ webView: WKWebView, navigationResponse: WKNavigationResponse, didBecome download: WKDownload) {
        download.delegate = self
    }

    func webView(_ webView: WKWebView, didFinish navigation: WKNavigation!) {
        guard selfTest, studioURL != nil, isStudio(webView.url), webView.url?.scheme == "http" else { return }
        webView.evaluateJavaScript("document.title + ' | ' + document.querySelectorAll('button').length + ' buttons'") { res, err in
            say("self-test: page loaded: \(String(describing: res)) \(String(describing: err))")
            guard res != nil else { return }
            self.selfTestDone = true
            DispatchQueue.main.asyncAfter(deadline: .now() + 3) { say("self-test: quitting"); NSApp.terminate(nil) }
        }
    }

    func webViewWebContentProcessDidTerminate(_ webView: WKWebView) {
        if studioURL != nil { webView.reload() }
    }

    // MARK: - Downloads (e.g. "Download .tidal file")

    func download(_ download: WKDownload, decideDestinationUsing response: URLResponse,
                  suggestedFilename: String, completionHandler: @escaping (URL?) -> Void) {
        let panel = NSSavePanel()
        panel.nameFieldStringValue = suggestedFilename
        panel.directoryURL = FileManager.default.urls(for: .downloadsDirectory, in: .userDomainMask).first
        panel.beginSheetModal(for: window) { r in
            guard r == .OK, let u = panel.url else { return completionHandler(nil) }
            try? FileManager.default.removeItem(at: u)
            completionHandler(u)
        }
    }

    func download(_ download: WKDownload, didFailWithError error: Error, resumeData: Data?) {
        say("download failed: \(error)")
    }

    // MARK: - JavaScript dialogs, new windows and file pickers

    func webView(_ webView: WKWebView, createWebViewWith configuration: WKWebViewConfiguration,
                 for action: WKNavigationAction, windowFeatures: WKWindowFeatures) -> WKWebView? {
        // target="_blank" and window.open(): open in the default browser
        if let u = action.request.url {
            if isStudio(u) && u.scheme == "http" { webView.load(action.request) } else { NSWorkspace.shared.open(u) }
        }
        return nil
    }

    func webView(_ webView: WKWebView, runJavaScriptAlertPanelWithMessage message: String,
                 initiatedByFrame frame: WKFrameInfo, completionHandler: @escaping () -> Void) {
        let a = NSAlert()
        a.messageText = "Tidal Studio"
        a.informativeText = message
        a.addButton(withTitle: "OK")
        a.beginSheetModal(for: window) { _ in completionHandler() }
    }

    func webView(_ webView: WKWebView, runJavaScriptConfirmPanelWithMessage message: String,
                 initiatedByFrame frame: WKFrameInfo, completionHandler: @escaping (Bool) -> Void) {
        let a = NSAlert()
        a.messageText = "Tidal Studio"
        a.informativeText = message
        a.addButton(withTitle: "OK")
        a.addButton(withTitle: T("Cancel", "Cancelar"))
        a.beginSheetModal(for: window) { r in completionHandler(r == .alertFirstButtonReturn) }
    }

    func webView(_ webView: WKWebView, runJavaScriptTextInputPanelWithPrompt prompt: String,
                 defaultText: String?, initiatedByFrame frame: WKFrameInfo,
                 completionHandler: @escaping (String?) -> Void) {
        let a = NSAlert()
        a.messageText = "Tidal Studio"
        a.informativeText = prompt
        let field = NSTextField(frame: NSRect(x: 0, y: 0, width: 320, height: 24))
        field.stringValue = defaultText ?? ""
        a.accessoryView = field
        a.addButton(withTitle: "OK")
        a.addButton(withTitle: T("Cancel", "Cancelar"))
        a.window.initialFirstResponder = field
        a.beginSheetModal(for: window) { r in completionHandler(r == .alertFirstButtonReturn ? field.stringValue : nil) }
    }

    func webView(_ webView: WKWebView, runOpenPanelWith parameters: WKOpenPanelParameters,
                 initiatedByFrame frame: WKFrameInfo, completionHandler: @escaping ([URL]?) -> Void) {
        let panel = NSOpenPanel()
        panel.allowsMultipleSelection = parameters.allowsMultipleSelection
        panel.canChooseDirectories = parameters.allowsDirectories
        panel.canChooseFiles = true
        panel.beginSheetModal(for: window) { r in completionHandler(r == .OK ? panel.urls : nil) }
    }

    // MARK: - Menu bar

    func buildMenu() {
        let main = NSMenu()
        func add(_ title: String, _ build: (NSMenu) -> Void) -> NSMenu {
            let item = NSMenuItem()
            let m = NSMenu(title: title)
            build(m)
            item.submenu = m
            main.addItem(item)
            return m
        }
        func item(_ m: NSMenu, _ title: String, _ sel: Selector?, _ key: String = "",
                  _ mods: NSEvent.ModifierFlags = .command, target: AnyObject? = nil) {
            let i = NSMenuItem(title: title, action: sel, keyEquivalent: key)
            i.keyEquivalentModifierMask = mods
            if let t = target { i.target = t }
            m.addItem(i)
        }
        _ = add("Tidal Studio") { m in
            item(m, T("About Tidal Studio", "Acerca de Tidal Studio"),
                 #selector(NSApplication.orderFrontStandardAboutPanel(_:)))
            m.addItem(.separator())
            item(m, T("Restart the studio", "Reiniciar el estudio"), #selector(restartStudio(_:)), "", [], target: self)
            m.addItem(.separator())
            item(m, T("Hide Tidal Studio", "Ocultar Tidal Studio"), #selector(NSApplication.hide(_:)), "h")
            item(m, T("Hide Others", "Ocultar otros"), #selector(NSApplication.hideOtherApplications(_:)), "h", [.command, .option])
            item(m, T("Show All", "Mostrar todo"), #selector(NSApplication.unhideAllApplications(_:)), "", [])
            m.addItem(.separator())
            item(m, T("Quit Tidal Studio", "Salir de Tidal Studio"), #selector(NSApplication.terminate(_:)), "q")
        }
        _ = add(T("Edit", "Edición")) { m in
            item(m, T("Undo", "Deshacer"), Selector(("undo:")), "z")
            item(m, T("Redo", "Rehacer"), Selector(("redo:")), "z", [.command, .shift])
            m.addItem(.separator())
            item(m, T("Cut", "Cortar"), #selector(NSText.cut(_:)), "x")
            item(m, T("Copy", "Copiar"), #selector(NSText.copy(_:)), "c")
            item(m, T("Paste", "Pegar"), #selector(NSText.paste(_:)), "v")
            item(m, T("Select All", "Seleccionar todo"), #selector(NSText.selectAll(_:)), "a")
        }
        _ = add(T("View", "Visualización")) { m in
            item(m, T("Reload", "Recargar"), #selector(reloadPage(_:)), "r", target: self)
            m.addItem(.separator())
            item(m, T("Actual Size", "Tamaño real"), #selector(zoomReset(_:)), "0", target: self)
            item(m, T("Zoom In", "Ampliar"), #selector(zoomIn(_:)), "+", target: self)
            item(m, T("Zoom Out", "Reducir"), #selector(zoomOut(_:)), "-", target: self)
            m.addItem(.separator())
            item(m, T("Open in Web Browser", "Abrir en el navegador"), #selector(openInBrowser(_:)), "b", [.command, .shift], target: self)
            item(m, T("Enter Full Screen", "Pantalla completa"), #selector(NSWindow.toggleFullScreen(_:)), "f", [.command, .control])
        }
        let win = add(T("Window", "Ventana")) { m in
            item(m, T("Minimize", "Minimizar"), #selector(NSWindow.performMiniaturize(_:)), "m")
            item(m, T("Zoom", "Zoom"), #selector(NSWindow.performZoom(_:)), "", [])
        }
        let help = add(T("Help", "Ayuda")) { m in
            item(m, T("Tidal Studio Website", "Web de Tidal Studio"), #selector(openWebsite(_:)), "", [], target: self)
            item(m, T("Show the Studio Log", "Ver el registro del estudio"), #selector(showLogs(_:)), "", [], target: self)
        }
        NSApp.mainMenu = main
        NSApp.windowsMenu = win
        NSApp.helpMenu = help
    }
}

if selfTest {
    // watchdog on its own thread, so it fires even if the main thread is stuck
    DispatchQueue.global().asyncAfter(deadline: .now() + 180) {
        say("self-test: TIMEOUT")
        if let s = try? String(contentsOf: FileManager.default.homeDirectoryForCurrentUser
            .appendingPathComponent("Library/Logs/Tidal Studio/studio.log"), encoding: .utf8) { print(s.suffix(6000)) }
        exit(1)
    }
}
say("starting (self-test: \(selfTest))")
let app = NSApplication.shared
let delegate = AppDelegate()
app.delegate = delegate
app.setActivationPolicy(.regular)
app.run()
