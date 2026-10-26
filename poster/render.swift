#!/usr/bin/env swift
// HTML/CSS -> PNG renderer for macOS. Usage:
//   swift render.swift <input.html|url> <out.png> [scale=2] [mode=ghost|onscreen|offscreen|hidden] [afterUpdates=1|0]
// scale: output pixel width = 1080 * scale (2 -> 2160x2160). mode=ghost is the recommended default.
import AppKit
import WebKit
import Foundation
import CoreGraphics

@MainActor
final class Renderer: NSObject, WKNavigationDelegate {
    let webView: WKWebView
    let window: NSWindow
    let outPath: String
    let scale: Double
    let afterUpdates: Bool?
    var polls = 0

    init(url: URL, outPath: String, scale: Double, mode: String, afterUpdates: Bool?) {
        self.outPath = outPath; self.scale = scale; self.afterUpdates = afterUpdates
        self.webView = WKWebView(frame: NSRect(x: 0, y: 0, width: 1080, height: 1080),
                                 configuration: WKWebViewConfiguration())
        self.window = NSWindow(contentRect: NSRect(x: 0, y: 0, width: 1080, height: 1080),
                                styleMask: [.borderless], backing: .buffered, defer: false)
        super.init()
        window.contentView = webView
        window.ignoresMouseEvents = true          // never swallow clicks
        switch mode {
        case "hidden":   window.setIsVisible(false)                       // never ordered front -> ~21s snapshot
        case "onscreen": window.center(); window.orderFront(nil)          // visible flash
        case "offscreen":window.setFrameOrigin(NSPoint(x: -10000, y: -10000)); window.orderFront(nil)
        default:         window.setFrameOrigin(NSPoint(x: 0, y: 0))       // "ghost"
                        window.alphaValue = 0.0                          // invisible, but composited -> fast
                        window.orderFront(nil)
        }
    }

    func webView(_ w: WKWebView, didFinish n: WKNavigation!) { start() }
    func webView(_ w: WKWebView, didFail n: WKNavigation!, withError e: Error) { die("load failed: \(e)", 1) }
    func webView(_ w: WKWebView, didFailProvisionalNavigation n: WKNavigation!, withError e: Error) { die("load failed: \(e)", 1) }

    func start() {
        // Wait for webfonts + layout to settle, then flag it for the Swift-side poll.
        webView.evaluateJavaScript("""
        (function(){
          window.__ready = false;
          var settle = function(){
            requestAnimationFrame(function(){ requestAnimationFrame(function(){
              setTimeout(function(){ window.__ready = true; }, 150);
            });});
          };
          if (document.fonts && document.fonts.ready) { document.fonts.ready.then(settle); } else { settle(); }
          return 1;
        })()
        """) { _, _ in self.poll() }
    }

    func poll() {
        polls += 1
        webView.evaluateJavaScript("window.__ready === true ? 1 : 0") { v, _ in
            if (v as? Int) == 1 || self.polls > 400 { self.report(); return }   // 20s cap
            DispatchQueue.main.asyncAfter(deadline: .now() + .milliseconds(50)) { self.poll() }
        }
    }

    func report() {
        webView.evaluateJavaScript(
            "JSON.stringify({dpr:devicePixelRatio,vp:innerWidth+'x'+innerHeight,fonts:document.fonts.status})"
        ) { v, _ in print("state: \(v ?? "nil")") }
        DispatchQueue.main.asyncAfter(deadline: .now() + .milliseconds(120)) { self.snapshot() }
    }

    func snapshot() {
        let cfg = WKSnapshotConfiguration()
        cfg.rect = webView.bounds
        cfg.snapshotWidth = NSNumber(value: 1080.0)  // width in POINTS == layout width; PNG px = 1080 * DPR
        if let a = afterUpdates { cfg.afterScreenUpdates = a }   // SDK default = true
        webView.takeSnapshot(with: cfg) { image, err in
            if let e = err { self.die("snapshot error: \(e)", 4) }
            guard let image, let tiff = image.tiffRepresentation,
                  let rep = NSBitmapImageRep(data: tiff), let cg = rep.cgImage else { self.die("no image", 5) }
            let target = Int((1080.0 * self.scale).rounded())
            let final = (cg.width == target) ? cg : (self.resize(cg, target) ?? cg)
            self.writePNG(final)
            print("WROTE \(self.outPath) \(final.width)x\(final.height)")
            exit(0)
        }
    }

    func resize(_ img: CGImage, _ w: Int) -> CGImage? {
        guard let ctx = CGContext(data: nil, width: w, height: w, bitsPerComponent: 8, bytesPerRow: 0,
            space: CGColorSpace(name: CGColorSpace.sRGB)!,
            bitmapInfo: CGImageAlphaInfo.premultipliedLast.rawValue) else { return nil }
        ctx.interpolationQuality = .high
        ctx.draw(img, in: CGRect(x: 0, y: 0, width: w, height: w))
        return ctx.makeImage()
    }

    func writePNG(_ image: CGImage) {
        let d = CGImageDestinationCreateWithURL(URL(fileURLWithPath: outPath) as CFURL, "public.png" as CFString, 1, nil)!
        CGImageDestinationAddImage(d, image, nil)
        CGImageDestinationFinalize(d)
    }

    func die(_ m: String, _ c: Int32) -> Never { FileHandle.standardError.write((m + "\n").data(using: .utf8)!); exit(c) }
}

let argv = CommandLine.arguments
guard argv.count >= 3 else {
    FileHandle.standardError.write("usage: render.swift <html|url> <out.png> [scale] [mode] [afterUpdates]\n".data(using: .utf8)!); exit(2)
}
let input = argv[1]
let outPath = argv[2]
let scale = argv.count > 3 ? (Double(argv[3]) ?? 2.0) : 2.0
let mode  = argv.count > 4 ? argv[4] : "ghost"
let afterUpdates: Bool? = argv.count > 5 ? (argv[5] == "1") : nil
let url: URL = input.hasPrefix("http") ? URL(string: input)!
    : URL(fileURLWithPath: (input as NSString).expandingTildeInPath).standardizedFileURL

MainActor.assumeIsolated {
    let app = NSApplication.shared
    app.setActivationPolicy(.accessory)   // no Dock icon, no focus stealing
    let r = Renderer(url: url, outPath: outPath, scale: scale, mode: mode, afterUpdates: afterUpdates)
    r.webView.navigationDelegate = r
    r.webView.load(URLRequest(url: url))
    app.run()
}
