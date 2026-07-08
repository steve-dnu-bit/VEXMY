import Foundation
import Capacitor
import CoreLocation
import CoreBluetooth

@objc(TerminalPermissionsPlugin)
public class TerminalPermissionsPlugin: CAPPlugin, CAPBridgedPlugin, CLLocationManagerDelegate, CBCentralManagerDelegate {
    public let identifier = "TerminalPermissionsPlugin"
    public let jsName = "TerminalPermissions"
    public let pluginMethods: [CAPPluginMethod] = [
        CAPPluginMethod(name: "requestReaderPermissions", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "checkReaderPermissions", returnType: CAPPluginReturnPromise),
    ]

    private var locationManager: CLLocationManager?
    private var bluetoothManager: CBCentralManager?
    private var pendingCall: CAPPluginCall?
    private var resolveTimer: Timer?

    @objc func checkReaderPermissions(_ call: CAPPluginCall) {
        call.resolve([
            "location": Self.locationAuthString(),
            "bluetooth": Self.bluetoothAuthString(),
        ])
    }

    @objc func requestReaderPermissions(_ call: CAPPluginCall) {
        pendingCall?.reject("Cancelled by a new permission request")
        pendingCall = call

        if locationManager == nil {
            let manager = CLLocationManager()
            manager.delegate = self
            locationManager = manager
        }

        if bluetoothManager == nil {
            bluetoothManager = CBCentralManager(delegate: self, queue: nil)
        }

        resolveTimer?.invalidate()
        resolveTimer = Timer.scheduledTimer(withTimeInterval: 30, repeats: false) { [weak self] _ in
            self?.finishPendingCall(rejectMessage: "Permission request timed out. Try again from Settings if needed.")
        }

        let locationStatus = Self.locationAuthString()
        if locationStatus == "prompt" {
            locationManager?.requestWhenInUseAuthorization()
        } else {
            tryFinishPendingCall()
        }
    }

    private static func locationAuthString() -> String {
        switch CLLocationManager.authorizationStatus() {
        case .authorizedAlways, .authorizedWhenInUse:
            return "granted"
        case .denied, .restricted:
            return "denied"
        default:
            return "prompt"
        }
    }

    private static func bluetoothAuthString() -> String {
        if #available(iOS 13.0, *) {
            switch CBManager.authorization {
            case .allowedAlways:
                return "granted"
            case .denied, .restricted:
                return "denied"
            default:
                return "prompt"
            }
        }
        return "granted"
    }

    private func tryFinishPendingCall() {
        guard pendingCall != nil else { return }

        let location = Self.locationAuthString()
        let bluetooth = Self.bluetoothAuthString()

        if location == "prompt" {
            return
        }

        if bluetooth == "prompt", bluetoothManager?.state == .unknown {
            return
        }

        finishPendingCall()
    }

    private func finishPendingCall(rejectMessage: String? = nil) {
        resolveTimer?.invalidate()
        resolveTimer = nil

        guard let call = pendingCall else { return }
        pendingCall = nil

        if let rejectMessage {
            call.reject(rejectMessage, nil, [
                "location": Self.locationAuthString(),
                "bluetooth": Self.bluetoothAuthString(),
            ])
            return
        }

        call.resolve([
            "location": Self.locationAuthString(),
            "bluetooth": Self.bluetoothAuthString(),
        ])
    }

    public func locationManagerDidChangeAuthorization(_ manager: CLLocationManager) {
        tryFinishPendingCall()
    }

    public func locationManager(_ manager: CLLocationManager, didChangeAuthorization status: CLAuthorizationStatus) {
        tryFinishPendingCall()
    }

    public func centralManagerDidUpdateState(_ central: CBCentralManager) {
        tryFinishPendingCall()
    }
}
