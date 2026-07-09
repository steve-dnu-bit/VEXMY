import Foundation
import Capacitor

/// Placeholder until Apple approves Tap to Pay on iPhone for com.velbok.app.
/// Keeps the Capacitor bridge stable without ProximityReader compile requirements.
@objc(TapToPayEducationPlugin)
public class TapToPayEducationPlugin: CAPPlugin, CAPBridgedPlugin {
    public let identifier = "TapToPayEducationPlugin"
    public let jsName = "TapToPayEducation"
    public let pluginMethods: [CAPPluginMethod] = [
        CAPPluginMethod(name: "showHowToTap", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "isAvailable", returnType: CAPPluginReturnPromise),
    ]

    @objc func isAvailable(_ call: CAPPluginCall) {
        call.resolve(["available": false])
    }

    @objc func showHowToTap(_ call: CAPPluginCall) {
        call.reject(
            "Tap to Pay education is unavailable until Apple approves Tap to Pay on iPhone for com.velbok.app"
        )
    }
}
