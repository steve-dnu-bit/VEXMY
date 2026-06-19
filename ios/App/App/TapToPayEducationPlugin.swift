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

    @objc func isAvailable(_ call: CAPPluginCall) {
        if #available(iOS 18.0, *) {
            #if canImport(ProximityReader)
            call.resolve(["available": true])
            return
            #endif
        }
        call.resolve(["available": false])
    }

    @objc func showHowToTap(_ call: CAPPluginCall) {
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

                discovery.presentContent(content, from: topViewController)
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
