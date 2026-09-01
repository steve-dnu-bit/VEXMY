import Foundation
import Capacitor
import CoreLocation
import UIKit
import os

@objc(TapToPayReadinessPlugin)
public class TapToPayReadinessPlugin: CAPPlugin, CAPBridgedPlugin {
    public let identifier = "TapToPayReadinessPlugin"
    public let jsName = "TapToPayReadiness"
    public let pluginMethods: [CAPPluginMethod] = [
        CAPPluginMethod(name: "checkEnvironment", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "log", returnType: CAPPluginReturnPromise),
    ]

    static let logger = Logger(subsystem: "com.velbok.app", category: "TapToPay")

    /// SecTask entitlement APIs are macOS-only; on iOS scan the embedded profile when present.
    static func hasTapToPayEntitlement() -> Bool {
        if UIDevice.current.userInterfaceIdiom == .pad { return false }
        #if targetEnvironment(simulator)
        return false
        #else
        guard let url = Bundle.main.url(forResource: "embedded", withExtension: "mobileprovision"),
              let data = try? Data(contentsOf: url) else {
            // Signed device builds may omit a readable provision; App.entitlements carries the key.
            return true
        }
        // A .mobileprovision is a CMS blob, so decoding the whole file as ASCII/UTF-8 fails and
        // would silently report "no entitlement". Search the raw bytes for the key instead.
        guard let needle = "com.apple.developer.proximity-reader.payment.acceptance".data(using: .utf8) else {
            return true
        }
        return data.range(of: needle) != nil
        #endif
    }

    private func hasTapToPayEntitlement() -> Bool {
        Self.hasTapToPayEntitlement()
    }

    /// Mirror the WebView's Tap to Pay trace into the Xcode device console / Console.app.
    @objc func log(_ call: CAPPluginCall) {
        let line = call.getString("line") ?? ""
        if !line.isEmpty {
            Self.logger.notice("\(line, privacy: .public)")
            NSLog("%@", line)
        }
        call.resolve()
    }

    private func locationGranted() -> Bool {
        guard CLLocationManager.locationServicesEnabled() else { return false }
        let manager = CLLocationManager()
        switch manager.authorizationStatus {
        case .authorizedAlways, .authorizedWhenInUse:
            return true
        default:
            return false
        }
    }

    @objc func checkEnvironment(_ call: CAPPluginCall) {
        DispatchQueue.main.async {
            let isPad = UIDevice.current.userInterfaceIdiom == .pad
            #if DEBUG
            let debugBuild = true
            #else
            let debugBuild = false
            #endif

            let entitlement = self.hasTapToPayEntitlement()
            let locationGranted = self.locationGranted()
            let versionName = Bundle.main.infoDictionary?["CFBundleShortVersionString"] as? String ?? ""
            let versionCode = Int(Bundle.main.infoDictionary?["CFBundleVersion"] as? String ?? "0") ?? 0
            let ready = !isPad && !debugBuild && entitlement && locationGranted

            call.resolve([
                "ready": ready,
                "debugBuild": debugBuild,
                "developerOptionsEnabled": false,
                "usbDebuggingEnabled": false,
                "locationGranted": locationGranted,
                "tapToPayEntitlementGranted": entitlement,
                "isPad": isPad,
                "deviceManufacturer": "Apple",
                "deviceModel": UIDevice.current.model,
                "versionName": versionName,
                "versionCode": versionCode,
            ])
        }
    }
}
