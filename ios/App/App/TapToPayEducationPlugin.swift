import Foundation
import Capacitor
import UIKit
import os

#if canImport(ProximityReader)
import ProximityReader
#endif

/// Presents Apple's required "How to Tap" merchant education overlay (iOS 18+)
/// and renders official SF Symbols for Tap to Pay HIG (wave.3.right.circle).
@objc(TapToPayEducationPlugin)
public class TapToPayEducationPlugin: CAPPlugin, CAPBridgedPlugin {
    public let identifier = "TapToPayEducationPlugin"
    public let jsName = "TapToPayEducation"
    public let pluginMethods: [CAPPluginMethod] = [
        CAPPluginMethod(name: "showHowToTap", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "isAvailable", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "sfSymbolPng", returnType: CAPPluginReturnPromise),
    ]

    private func hasTapToPayEntitlement() -> Bool {
        TapToPayReadinessPlugin.hasTapToPayEntitlement()
    }

    private func trace(_ line: String) {
        let message = "[VELBOK-TTP] \(line)"
        TapToPayReadinessPlugin.logger.notice("\(message, privacy: .public)")
        NSLog("%@", message)
    }

    @objc func isAvailable(_ call: CAPPluginCall) {
        let isPad = UIDevice.current.userInterfaceIdiom == .pad
        let entitlement = hasTapToPayEntitlement()
        var iOS18 = false
        if #available(iOS 18.0, *) {
            #if canImport(ProximityReader)
            iOS18 = true
            #endif
        }
        let available = !isPad && entitlement && iOS18
        trace("native.education.isAvailable available=\(available) isPad=\(isPad) entitlement=\(entitlement) iOS18AndProximityReader=\(iOS18)")
        call.resolve(["available": available])
    }

    /// Renders an official SF Symbol as PNG for WebView HIG compliance (req 5.5).
    @objc func sfSymbolPng(_ call: CAPPluginCall) {
        let name = call.getString("name") ?? "wave.3.right.circle.fill"
        let pointSize = CGFloat(call.getDouble("pointSize") ?? 22)
        DispatchQueue.main.async {
            let config = UIImage.SymbolConfiguration(pointSize: pointSize, weight: .semibold)
            guard let base = UIImage(systemName: name, withConfiguration: config) else {
                call.reject("SF Symbol not available: \(name)")
                return
            }
            // Black glyph → WebView masks with currentColor (Apple HIG SF Symbol).
            let image = base.withTintColor(.black, renderingMode: .alwaysOriginal)
            let format = UIGraphicsImageRendererFormat()
            format.scale = UIScreen.main.scale
            format.opaque = false
            let size = image.size
            let renderer = UIGraphicsImageRenderer(size: size, format: format)
            let png = renderer.pngData { _ in
                image.draw(in: CGRect(origin: .zero, size: size))
            }
            call.resolve([
                "name": name,
                "pngBase64": png.base64EncodedString(),
                "width": size.width * format.scale,
                "height": size.height * format.scale,
            ])
        }
    }

    @objc func showHowToTap(_ call: CAPPluginCall) {
        trace("native.education.showHowToTap.start")
        guard hasTapToPayEntitlement() else {
            trace("native.education.showHowToTap.rejected reason=missing-entitlement")
            call.reject(
                "Tap to Pay on iPhone requires Apple's com.apple.developer.proximity-reader.payment.acceptance entitlement on com.velbok.app. Enable Tap to Pay on iPhone under Additional Capabilities, use a Development profile that includes it, then rebuild."
            )
            return
        }

        guard #available(iOS 18.0, *) else {
            trace("native.education.showHowToTap.rejected reason=ios-below-18")
            call.reject("How to Tap education requires iOS 18 or later")
            return
        }

        #if canImport(ProximityReader)
        Task { @MainActor in
            do {
                guard let rootViewController = self.bridge?.viewController else {
                    self.trace("native.education.showHowToTap.rejected reason=no-root-view-controller")
                    call.reject("Could not find root view controller")
                    return
                }

                // Apple 4.1: this runs right after Apple's Terms and Conditions sheet was
                // accepted, and that sheet is still animating away. Presenting from a view
                // controller mid-dismissal silently drops the education overlay.
                let host = await Self.settledPresentationHost(from: rootViewController)

                let discovery = ProximityReaderDiscovery()
                let content = try await discovery.content(for: .payment(.howToTap))
                self.trace("native.education.showHowToTap.presenting host=\(type(of: host))")
                do {
                    try await discovery.presentContent(content, from: host)
                } catch {
                    // One retry covers a sheet that finished dismissing a beat late.
                    self.trace("native.education.showHowToTap.retry error=\(error.localizedDescription)")
                    try? await Task.sleep(nanoseconds: 700_000_000)
                    let retryHost = await Self.settledPresentationHost(from: rootViewController)
                    try await discovery.presentContent(content, from: retryHost)
                }
                self.trace("native.education.showHowToTap.presented")
                call.resolve()
            } catch {
                self.trace("native.education.showHowToTap.failed error=\(error.localizedDescription)")
                call.reject("Could not present How to Tap education", nil, error)
            }
        }
        #else
        trace("native.education.showHowToTap.rejected reason=proximityreader-missing")
        call.reject("ProximityReader framework is not available in this build")
        #endif
    }

    /// Waits for Apple's Terms sheet (or any other sheet) to finish dismissing, then
    /// returns the view controller that can safely present the education overlay.
    @MainActor
    private static func settledPresentationHost(
        from root: UIViewController,
        timeout: TimeInterval = 6
    ) async -> UIViewController {
        let deadline = Date().addingTimeInterval(timeout)
        while Date() < deadline {
            guard let presented = root.presentedViewController else { return root }
            if !presented.isBeingDismissed { break }
            try? await Task.sleep(nanoseconds: 150_000_000)
        }

        var top = root
        while let presented = top.presentedViewController, !presented.isBeingDismissed {
            top = presented
        }
        return top
    }
}
