import Foundation
import Capacitor
import CoreLocation
import Security
import UIKit

@objc(TapToPayReadinessPlugin)
public class TapToPayReadinessPlugin: CAPPlugin, CAPBridgedPlugin {
    public let identifier = "TapToPayReadinessPlugin"
    public let jsName = "TapToPayReadiness"
    public let pluginMethods: [CAPPluginMethod] = [
        CAPPluginMethod(name: "checkEnvironment", returnType: CAPPluginReturnPromise),
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
