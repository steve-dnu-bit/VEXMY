import Foundation
import Capacitor
import CoreLocation
import CoreBluetooth

/**
 Stripe Terminal on iOS requires:
 1) Location Services ON globally
 2) When-In-Use authorization for the app
 3) A usable device location (Precise Location preferred)
 4) Bluetooth authorization for WisePad

 Capacitor Geolocation alone is unreliable here (throws on services-off and
 maps failures to "denied"). This plugin uses CLLocationManager on the main
 thread and returns distinct statuses so JS can show the right fix.
 */
@objc(TerminalPermissionsPlugin)
public class TerminalPermissionsPlugin: CAPPlugin, CAPBridgedPlugin, CLLocationManagerDelegate, CBCentralManagerDelegate {
    public let identifier = "TerminalPermissionsPlugin"
    public let jsName = "TerminalPermissions"
    public let pluginMethods: [CAPPluginMethod] = [
        CAPPluginMethod(name: "requestLocationPermission", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "checkLocationPermission", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "requestBluetoothPermission", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "checkBluetoothPermission", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "requestReaderPermissions", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "checkReaderPermissions", returnType: CAPPluginReturnPromise),
    ]

    private var locationManager: CLLocationManager?
    private var bluetoothManager: CBCentralManager?

    private var pendingLocationCall: CAPPluginCall?
    private var pendingBluetoothCall: CAPPluginCall?
    private var locationResolveTimer: Timer?
    private var bluetoothResolveTimer: Timer?
    private var waitingForLocationFix = false
    private var waitingForFullAccuracy = false

    // MARK: - JS entry points

    @objc func checkLocationPermission(_ call: CAPPluginCall) {
        DispatchQueue.main.async { [weak self] in
            self?.ensureLocationManager()
            self?.resolveLocationStatus(call, rejectOnFailure: false, requireFix: false)
        }
    }

    @objc func requestLocationPermission(_ call: CAPPluginCall) {
        DispatchQueue.main.async { [weak self] in
            self?.requestLocationPermissionOnMain(call)
        }
    }

    @objc func checkBluetoothPermission(_ call: CAPPluginCall) {
        DispatchQueue.main.async { [weak self] in
            self?.resolveBluetoothStatus(call, rejectOnFailure: false)
        }
    }

    @objc func requestBluetoothPermission(_ call: CAPPluginCall) {
        DispatchQueue.main.async { [weak self] in
            self?.requestBluetoothPermissionOnMain(call)
        }
    }

    @objc func checkReaderPermissions(_ call: CAPPluginCall) {
        DispatchQueue.main.async { [weak self] in
            guard let self else { return }
            self.ensureLocationManager()
            let location = self.locationAuthString()
            let bluetooth = self.bluetoothAuthString()
            call.resolve([
                "location": location,
                "bluetooth": bluetooth,
                "servicesEnabled": CLLocationManager.locationServicesEnabled(),
                "accuracy": self.accuracyString(),
            ])
        }
    }

    @objc func requestReaderPermissions(_ call: CAPPluginCall) {
        // Sequential: location first (Stripe), then bluetooth.
        DispatchQueue.main.async { [weak self] in
            guard let self else { return }
            self.requestLocationPermissionOnMain(call)
        }
    }

    // MARK: - Location

    private func ensureLocationManager() {
        if locationManager == nil {
            let manager = CLLocationManager()
            manager.delegate = self
            manager.desiredAccuracy = kCLLocationAccuracyBest
            locationManager = manager
        }
    }

    private func requestLocationPermissionOnMain(_ call: CAPPluginCall) {
        pendingLocationCall?.reject("Cancelled by a new location permission request")
        pendingLocationCall = call
        waitingForLocationFix = false
        waitingForFullAccuracy = false

        ensureLocationManager()

        guard CLLocationManager.locationServicesEnabled() else {
            finishLocationCall(rejectMessage:
                "Location Services are turned OFF on this iPhone. Open Settings → Privacy & Security → Location Services and turn them ON, then open Velbok again."
            )
            return
        }

        let status = locationManager?.authorizationStatus ?? CLLocationManager().authorizationStatus
        switch status {
        case .notDetermined:
            startLocationResolveTimer()
            locationManager?.requestWhenInUseAuthorization()
        case .authorizedWhenInUse, .authorizedAlways:
            continueAfterLocationAuthorized()
        case .denied:
            finishLocationCall(rejectMessage:
                "Location permission for Velbok is Off. Open Settings → Velbok → Location → While Using the App, then try again."
            )
        case .restricted:
            finishLocationCall(rejectMessage:
                "Location access is restricted on this iPhone (Screen Time or device policy). Allow Location for Velbok, then try again."
            )
        @unknown default:
            startLocationResolveTimer()
            locationManager?.requestWhenInUseAuthorization()
        }
    }

    private func continueAfterLocationAuthorized() {
        guard pendingLocationCall != nil else { return }

        // iOS 14+: Stripe needs a usable GPS fix. Ask for temporary Precise Location if reduced.
        if #available(iOS 14.0, *) {
            if let manager = locationManager, manager.accuracyAuthorization == .reducedAccuracy {
                waitingForFullAccuracy = true
                startLocationResolveTimer()
                manager.requestTemporaryFullAccuracyAuthorization(withPurposeKey: "TerminalPayment")
                // Also start updates — if the purpose key is missing from Info.plist,
                // the temporary request is a no-op and we still try to get a fix.
                waitingForLocationFix = true
                manager.requestLocation()
                return
            }
        }

        waitingForLocationFix = true
        startLocationResolveTimer()
        locationManager?.requestLocation()
    }

    private func locationAuthString() -> String {
        if !CLLocationManager.locationServicesEnabled() {
            return "disabled"
        }
        let status = locationManager?.authorizationStatus ?? CLLocationManager().authorizationStatus
        switch status {
        case .authorizedAlways, .authorizedWhenInUse:
            return "granted"
        case .denied:
            return "denied"
        case .restricted:
            return "restricted"
        case .notDetermined:
            return "prompt"
        @unknown default:
            return "prompt"
        }
    }

    private func accuracyString() -> String {
        if #available(iOS 14.0, *) {
            guard let manager = locationManager else { return "unknown" }
            switch manager.accuracyAuthorization {
            case .fullAccuracy:
                return "full"
            case .reducedAccuracy:
                return "reduced"
            @unknown default:
                return "unknown"
            }
        }
        return "full"
    }

    private func resolveLocationStatus(_ call: CAPPluginCall, rejectOnFailure: Bool, requireFix: Bool) {
        let location = locationAuthString()
        let accuracy = accuracyString()
        let servicesEnabled = CLLocationManager.locationServicesEnabled()

        if rejectOnFailure {
            if location == "disabled" {
                call.reject(
                    "Location Services are turned OFF on this iPhone. Open Settings → Privacy & Security → Location Services and turn them ON, then open Velbok again."
                )
                return
            }
            if location == "denied" {
                call.reject(
                    "Location permission for Velbok is Off. Open Settings → Velbok → Location → While Using the App, then try again."
                )
                return
            }
            if location == "restricted" {
                call.reject(
                    "Location access is restricted on this iPhone (Screen Time or device policy). Allow Location for Velbok, then try again."
                )
                return
            }
            if location != "granted" {
                call.reject(
                    "Location permission is required for card reader payments. Tap Allow when iPhone asks for Location, then try Connect again."
                )
                return
            }
        }

        call.resolve([
            "location": location,
            "servicesEnabled": servicesEnabled,
            "accuracy": accuracy,
            "fixReady": location == "granted" && servicesEnabled,
        ])
    }

    private func startLocationResolveTimer() {
        locationResolveTimer?.invalidate()
        locationResolveTimer = Timer.scheduledTimer(withTimeInterval: 45, repeats: false) { [weak self] _ in
            guard let self, self.pendingLocationCall != nil else { return }
            // If auth was granted but GPS fix timed out, still allow Stripe to try —
            // permission is what Stripe primarily checks; a warm fix is best-effort.
            let location = self.locationAuthString()
            if location == "granted" {
                self.waitingForLocationFix = false
                self.waitingForFullAccuracy = false
                self.finishLocationCall(rejectMessage: nil)
                return
            }
            self.finishLocationCall(rejectMessage:
                "Location permission timed out. Tap Allow when iPhone asks for Location access, keep Location Services ON, then try Connect again."
            )
        }
    }

    private func finishLocationCall(rejectMessage: String?) {
        locationResolveTimer?.invalidate()
        locationResolveTimer = nil
        waitingForLocationFix = false
        waitingForFullAccuracy = false

        guard let call = pendingLocationCall else { return }
        pendingLocationCall = nil

        if let rejectMessage {
            call.reject(rejectMessage)
            return
        }

        resolveLocationStatus(call, rejectOnFailure: true, requireFix: false)
    }

    // MARK: - Bluetooth

    private func requestBluetoothPermissionOnMain(_ call: CAPPluginCall) {
        pendingBluetoothCall?.reject("Cancelled by a new Bluetooth permission request")
        pendingBluetoothCall = call

        if bluetoothManager == nil {
            bluetoothManager = CBCentralManager(
                delegate: self,
                queue: nil,
                options: [CBCentralManagerOptionShowPowerAlertKey: true]
            )
        }

        startBluetoothResolveTimer()
        tryFinishBluetoothCall()
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

    private func tryFinishBluetoothCall() {
        guard pendingBluetoothCall != nil else { return }

        let bluetooth = bluetoothAuthString()
        if bluetooth == "prompt", bluetoothManager?.state == .unknown {
            return
        }

        finishBluetoothCall(rejectMessage: nil)
    }

    private func startBluetoothResolveTimer() {
        bluetoothResolveTimer?.invalidate()
        bluetoothResolveTimer = Timer.scheduledTimer(withTimeInterval: 120, repeats: false) { [weak self] _ in
            guard let self, self.pendingBluetoothCall != nil else { return }
            self.finishBluetoothCall(rejectMessage:
                "Bluetooth permission timed out. Tap Allow when the iPhone Bluetooth dialog appears, then try Connect again."
            )
        }
    }

    private func finishBluetoothCall(rejectMessage: String?) {
        bluetoothResolveTimer?.invalidate()
        bluetoothResolveTimer = nil

        guard let call = pendingBluetoothCall else { return }
        pendingBluetoothCall = nil

        if let rejectMessage {
            call.reject(rejectMessage)
            return
        }

        resolveBluetoothStatus(call, rejectOnFailure: true)
    }

    private func resolveBluetoothStatus(_ call: CAPPluginCall, rejectOnFailure: Bool) {
        let bluetooth = bluetoothAuthString()

        if rejectOnFailure {
            if bluetooth == "denied" || bluetooth == "restricted" {
                call.reject(
                    "Bluetooth permission is required to connect your WisePad reader. Open Settings → Velbok → Bluetooth → Allow, then try again."
                )
                return
            }
        }

        call.resolve([
            "bluetooth": bluetooth,
        ])
    }

    // MARK: - CLLocationManagerDelegate

    public func locationManagerDidChangeAuthorization(_ manager: CLLocationManager) {
        guard pendingLocationCall != nil else { return }

        if !CLLocationManager.locationServicesEnabled() {
            finishLocationCall(rejectMessage:
                "Location Services are turned OFF on this iPhone. Open Settings → Privacy & Security → Location Services and turn them ON, then open Velbok again."
            )
            return
        }

        switch manager.authorizationStatus {
        case .authorizedWhenInUse, .authorizedAlways:
            if !waitingForLocationFix && !waitingForFullAccuracy {
                continueAfterLocationAuthorized()
            }
        case .denied:
            finishLocationCall(rejectMessage:
                "Location permission for Velbok is Off. Open Settings → Velbok → Location → While Using the App, then try again."
            )
        case .restricted:
            finishLocationCall(rejectMessage:
                "Location access is restricted on this iPhone (Screen Time or device policy). Allow Location for Velbok, then try again."
            )
        case .notDetermined:
            break
        @unknown default:
            break
        }
    }

    public func locationManager(_ manager: CLLocationManager, didChangeAuthorization status: CLAuthorizationStatus) {
        // iOS 13 and earlier
        locationManagerDidChangeAuthorization(manager)
    }

    public func locationManager(_ manager: CLLocationManager, didUpdateLocations locations: [CLLocation]) {
        guard pendingLocationCall != nil else { return }
        waitingForLocationFix = false
        waitingForFullAccuracy = false
        finishLocationCall(rejectMessage: nil)
    }

    public func locationManager(_ manager: CLLocationManager, didFailWithError error: Error) {
        guard pendingLocationCall != nil else { return }

        // Auth is granted — GPS fix failed (indoors / airplane / timeout).
        // Stripe mainly needs authorization; proceed so payments can still work.
        let location = locationAuthString()
        if location == "granted" {
            waitingForLocationFix = false
            waitingForFullAccuracy = false
            finishLocationCall(rejectMessage: nil)
            return
        }

        let nsError = error as NSError
        if nsError.domain == kCLErrorDomain, nsError.code == CLError.denied.rawValue {
            finishLocationCall(rejectMessage:
                "Location permission for Velbok is Off. Open Settings → Velbok → Location → While Using the App, then try again."
            )
            return
        }

        finishLocationCall(rejectMessage:
            "Could not read this iPhone’s location (\(error.localizedDescription)). Turn off Airplane Mode, keep Location Services ON, go outdoors or near a window, then try Connect again."
        )
    }

    public func locationManagerDidChangeAccuracyAuthorization(_ manager: CLLocationManager) {
        guard pendingLocationCall != nil, waitingForFullAccuracy else { return }
        waitingForFullAccuracy = false
        if !waitingForLocationFix {
            waitingForLocationFix = true
            manager.requestLocation()
        }
    }

    // MARK: - CBCentralManagerDelegate

    public func centralManagerDidUpdateState(_ central: CBCentralManager) {
        tryFinishBluetoothCall()
    }
}
