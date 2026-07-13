import Foundation
import Capacitor
import UIKit

#if canImport(ProximityReader)
import ProximityReader
#endif

/// Presents Apple's required "How to Tap" merchant education overlay (iOS 18+).
@objc(TapToPayEducationPlugin)
public class TapToPayEducationPlugin: CAPPlugin, CAPBridgedPlugin {
    public let identifier = "TapToPayEducationPlugin"
    public let jsName = "TapToPayEducation"
    public let pluginMethods: [CAPPluginMethod] = [
        CAPPluginMethod(name: "showHowToTap", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "isAvailable", returnType: CAPPluginReturnPromise),
    ]

    /// SecTask entitlement APIs are macOS-only; on iOS scan the embedded profile when present.
    private func hasTapToPayEntitlement() -> Bool {
        if UIDevice.current.userInterfaceIdiom == .pad { return false }
        #if targetEnvironment(simulator)
        return false
        #else
        if let url = Bundle.main.url(forResource: "embedded", withExtension: "mobileprovision"),
           let data = try? Data(contentsOf: url),
           let text = String(data: data, encoding: .ascii) ?? String(data: data, encoding: .utf8) {
            return text.contains("com.apple.developer.proximity-reader.payment.acceptance")
        }
        // Signed device builds may omit a readable provision; App.entitlements carries the key.
        return true
        #endif
    }

    @objc func isAvailable(_ call: CAPPluginCall) {
        if UIDevice.current.userInterfaceIdiom == .pad {
            call.resolve(["available": false])
            return
        }
        guard hasTapToPayEntitlement() else {
            call.resolve(["available": false])
            return
        }
        if #available(iOS 18.0, *) {
            #if canImport(ProximityReader)
            call.resolve(["available": true])
            return
            #endif
        }
        call.resolve(["available": false])
    }

    @objc func showHowToTap(_ call: CAPPluginCall) {
        guard hasTapToPayEntitlement() else {
            call.reject(
                "Tap to Pay on iPhone requires Apple's com.apple.developer.proximity-reader.payment.acceptance entitlement on com.velbok.app. Enable Tap to Pay on iPhone under Additional Capabilities, use a Development profile that includes it, then rebuild."
            )
            return
        }

        guard #available(iOS 18.0, *) else {
            call.reject("How to Tap education requires iOS 18 or later")
            return
        }

        #if canImport(ProximityReader)
        Task { @MainActor in
            do {
                guard let rootViewController = self.bridge?.viewController else {
                    call.reject("Could not find root view controller")
                    return
                }

                let discovery = ProximityReaderDiscovery()
                let content = try await discovery.content(for: .payment(.howToTap))

                var topViewController = rootViewController
                while let presented = topViewController.presentedViewController {
                    topViewController = presented
                }

                try await discovery.presentContent(content, from: topViewController)
                call.resolve()
            } catch {
                call.reject("Could not present How to Tap education", nil, error)
            }
        }
        #else
        call.reject("ProximityReader framework is not available in this build")
        #endif
    }
}
