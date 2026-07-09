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
    private var requestedLocationAuth = false

    @objc func checkReaderPermissions(_ call: CAPPluginCall) {
        DispatchQueue.main.async { [weak self] in
            self?.resolvePermissionStatus(call, rejectOnFailure: false)
        }
    }

    @objc func requestReaderPermissions(_ call: CAPPluginCall) {
        DispatchQueue.main.async { [weak self] in
            self?.requestReaderPermissionsOnMain(call)
        }
    }

    private func requestReaderPermissionsOnMain(_ call: CAPPluginCall) {
        pendingCall?.reject("Cancelled by a new permission request")
        pendingCall = call
        requestedLocationAuth = false

        if !CLLocationManager.locationServicesEnabled() {
            pendingCall = nil
            call.reject(
                "Location Services are turned off on this iPhone. Open Settings → Privacy & Security → Location Services, turn them on, then try again."
            )
            return
        }

        if bluetoothManager == nil {
            bluetoothManager = CBCentralManager(
                delegate: self,
                queue: nil,
                options: [CBCentralManagerOptionShowPowerAlertKey: true]
            )
        }

        startResolveTimer()

        let locationStatus = locationAuthString()
        if locationStatus == "prompt" {
            requestedLocationAuth = true
            ensureLocationManager().requestWhenInUseAuthorization()
            return
        }

        if locationStatus != "granted" {
            rejectPendingCall(forLocationStatus: locationStatus)
            return
        }

        primeLocationForStripe()
        tryFinishPendingCall()
    }

    private func ensureLocationManager() -> CLLocationManager {
        if let locationManager {
            return locationManager
        }
        let manager = CLLocationManager()
        manager.delegate = self
        locationManager = manager
        return manager
    }

    private func locationAuthString() -> String {
        if !CLLocationManager.locationServicesEnabled() {
            return "disabled"
        }
        switch ensureLocationManager().authorizationStatus {
        case .authorizedAlways, .authorizedWhenInUse:
            return "granted"
        case .denied:
            return "denied"
        case .restricted:
            return "restricted"
        default:
            return "prompt"
        }
    }

    private func bluetoothAuthString() -> String {
        if #available(iOS 13.0, *) {
            switch CBManager.authorization {
            case .allowedAlways:
                return "granted"
            case .denied:
                return "denied"
            case .restricted:
                return "restricted"
            default:
                return "prompt"
            }
        }
        return "granted"
    }

    private func primeLocationForStripe() {
        // Stripe Terminal requires a location fix; requestWhenInUse alone is not enough.
        ensureLocationManager().requestLocation()
    }

    private func tryFinishPendingCall() {
        guard pendingCall != nil else { return }

        let location = locationAuthString()
        if location == "prompt" {
            return
        }

        if location != "granted" {
            rejectPendingCall(forLocationStatus: location)
            return
        }

        let bluetooth = bluetoothAuthString()
        if bluetooth == "prompt", bluetoothManager?.state == .unknown {
            return
        }

        finishPendingCall()
    }

    private func startResolveTimer() {
        resolveTimer?.invalidate()
        resolveTimer = Timer.scheduledTimer(withTimeInterval: 120, repeats: false) { [weak self] _ in
            guard let self, let call = self.pendingCall else { return }
            self.pendingCall = nil
            self.resolveTimer = nil
            if self.requestedLocationAuth {
                call.reject(
                    "Location permission is required for card reader payments. Tap Allow when the iPhone location dialog appears, then try Connect again."
                )
            } else {
                call.reject(
                    "Bluetooth permission is required for WisePad. Tap Allow when the iPhone Bluetooth dialog appears, then try Connect again."
                )
            }
        }
    }

    private func finishPendingCall() {
        resolveTimer?.invalidate()
        resolveTimer = nil

        guard let call = pendingCall else { return }
        pendingCall = nil

        resolvePermissionStatus(call, rejectOnFailure: true)
    }

    private func rejectCall(_ call: CAPPluginCall, forLocationStatus status: String) {
        switch status {
        case "disabled":
            call.reject(
                "Location Services are turned off on this iPhone. Open Settings → Privacy & Security → Location Services, turn them on, then try again."
            )
        case "restricted":
            call.reject(
                "Location access is restricted on this iPhone (Screen Time or device policy). Allow Location for Velbok or use a different device."
            )
        case "denied":
            call.reject(
                "Location permission is required for card reader payments. Open Settings → Velbok → Location → While Using the App, then try again."
            )
        default:
            call.reject(
                "Location permission is required for card reader payments. Tap Connect again and choose Allow on the iPhone dialog."
            )
        }
    }

    private func rejectPendingCall(forLocationStatus status: String) {
        resolveTimer?.invalidate()
        resolveTimer = nil

        guard let call = pendingCall else { return }
        pendingCall = nil
        rejectCall(call, forLocationStatus: status)
    }

    private func resolvePermissionStatus(_ call: CAPPluginCall, rejectOnFailure: Bool) {
        let location = locationAuthString()
        let bluetooth = bluetoothAuthString()

        if rejectOnFailure {
            if location != "granted" {
                rejectCall(call, forLocationStatus: location)
                return
            }
            if bluetooth == "denied" || bluetooth == "restricted" {
                call.reject(
                    "Bluetooth permission is required to connect your WisePad reader. Open Settings → Velbok → Bluetooth → Allow, then try again."
                )
                return
            }
        }

        call.resolve([
            "location": location,
            "bluetooth": bluetooth,
            "locationServicesEnabled": CLLocationManager.locationServicesEnabled(),
        ])
    }

    public func locationManagerDidChangeAuthorization(_ manager: CLLocationManager) {
        handleLocationAuthorizationChange()
    }

    public func locationManager(_ manager: CLLocationManager, didChangeAuthorization status: CLAuthorizationStatus) {
        handleLocationAuthorizationChange()
    }

    private func handleLocationAuthorizationChange() {
        let status = locationAuthString()
        if status == "granted" {
            primeLocationForStripe()
        }
        tryFinishPendingCall()
    }

    public func locationManager(_ manager: CLLocationManager, didUpdateLocations locations: [CLLocation]) {
        tryFinishPendingCall()
    }

    public func locationManager(_ manager: CLLocationManager, didFailWithError error: Error) {
        // Permission may still be granted even if a single fix failed.
        tryFinishPendingCall()
    }

    public func centralManagerDidUpdateState(_ central: CBCentralManager) {
        tryFinishPendingCall()
    }
}
