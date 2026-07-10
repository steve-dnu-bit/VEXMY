import Foundation
import Capacitor
import UIKit
import Security

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

    private func hasTapToPayEntitlement() -> Bool {
        guard let task = SecTaskCreateFromSelf(nil) else { return false }
        guard let value = SecTaskCopyValueForEntitlement(
            task,
            "com.apple.developer.proximity-reader.payment.acceptance" as CFString,
            nil
        ) else {
            return false
        }
        if let boolValue = value as? Bool { return boolValue }
        if let number = value as? NSNumber { return number.boolValue }
        return false
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
                "Tap to Pay on iPhone requires Apple's com.apple.developer.proximity-reader.payment.acceptance entitlement on com.velbok.app. Request it from Apple Developer, regenerate your provisioning profile, then rebuild."
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
