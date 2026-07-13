import Foundation
import Capacitor
import CoreLocation
import UIKit

@objc(TapToPayReadinessPlugin)
public class TapToPayReadinessPlugin: CAPPlugin, CAPBridgedPlugin {
    public let identifier = "TapToPayReadinessPlugin"
    public let jsName = "TapToPayReadiness"
    public let pluginMethods: [CAPPluginMethod] = [
        CAPPluginMethod(name: "checkEnvironment", returnType: CAPPluginReturnPromise),
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
        return true
        #endif
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
