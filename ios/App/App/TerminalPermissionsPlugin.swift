import Foundation
import Capacitor
import CoreLocation
import CoreBluetooth

/**
 Stripe Terminal on iOS needs an *active* device location, not just the Settings toggle.

 Important iOS behavior:
 - The system "Allow Location?" dialog appears ONLY when status is `.notDetermined`.
 - If Settings → Velbok → Location is already On, Apple will NEVER show that dialog again.
 - Stripe still fails unless Core Location is delivering coordinates (startUpdatingLocation).

 This plugin:
 1) Requests When-In-Use if notDetermined (shows the dialog)
 2) Keeps a long-lived CLLocationManager and starts continuous updates once authorized
 3) Distinguishes services-off / denied / restricted with clear messages
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
        CAPPluginMethod(name: "getDiagnostics", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "openAppSettings", returnType: CAPPluginReturnPromise),
    ]

    /// Must stay alive for the whole app session so Stripe can read location.
    private var locationManager: CLLocationManager?
    private var bluetoothManager: CBCentralManager?

    private var pendingLocationCall: CAPPluginCall?
    private var pendingBluetoothCall: CAPPluginCall?
    private var locationResolveTimer: Timer?
    private var bluetoothResolveTimer: Timer?
    private var waitingForLocationFix = false
    private var lastKnownLocation: CLLocation?
    private var updatesStarted = false

    override public func load() {
        super.load()
        DispatchQueue.main.async { [weak self] in
            self?.ensureLocationManager()
            self?.warmLocationIfAlreadyAuthorized()
        }
    }

    // MARK: - JS entry points

    @objc func checkLocationPermission(_ call: CAPPluginCall) {
        DispatchQueue.main.async { [weak self] in
            self?.ensureLocationManager()
            self?.resolveLocationStatus(call, rejectOnFailure: false)
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
            call.resolve([
                "location": self.locationAuthString(),
                "bluetooth": self.bluetoothAuthString(),
                "servicesEnabled": CLLocationManager.locationServicesEnabled(),
                "accuracy": self.accuracyString(),
                "hasFix": self.lastKnownLocation != nil,
            ])
        }
    }

    @objc func requestReaderPermissions(_ call: CAPPluginCall) {
        DispatchQueue.main.async { [weak self] in
            self?.requestLocationPermissionOnMain(call)
        }
    }

    @objc func getDiagnostics(_ call: CAPPluginCall) {
        DispatchQueue.main.async { [weak self] in
            guard let self else { return }
            self.ensureLocationManager()
            self.startLocationUpdates()

            let auth = self.currentAuthStatus()
            let authLabel: String = {
                switch auth {
                case .notDetermined: return "notDetermined"
                case .restricted: return "restricted"
                case .denied: return "denied"
                case .authorizedAlways: return "authorizedAlways"
                case .authorizedWhenInUse: return "authorizedWhenInUse"
                @unknown default: return "unknown"
                }
            }()

            var btState = -1
            if let manager = self.bluetoothManager {
                btState = manager.state.rawValue
            }

            call.resolve([
                "isPad": UIDevice.current.userInterfaceIdiom == .pad,
                "model": UIDevice.current.model,
                "systemVersion": UIDevice.current.systemVersion,
                "buildVersion": Bundle.main.infoDictionary?["CFBundleShortVersionString"] as? String ?? "",
                "buildNumber": Bundle.main.infoDictionary?["CFBundleVersion"] as? String ?? "",
                "locationServicesEnabled": CLLocationManager.locationServicesEnabled(),
                "authorizationStatus": authLabel,
                "location": self.locationAuthString(),
                "accuracy": self.accuracyString(),
                "hasFix": self.lastKnownLocation != nil,
                "horizontalAccuracyMeters": self.lastKnownLocation?.horizontalAccuracy ?? -1,
                "updatesStarted": self.updatesStarted,
                "bluetooth": self.bluetoothAuthString(),
                "bluetoothManagerState": btState,
            ])
        }
    }

    @objc func openAppSettings(_ call: CAPPluginCall) {
        DispatchQueue.main.async {
            guard let url = URL(string: UIApplication.openSettingsURLString) else {
                call.reject("Settings URL unavailable")
                return
            }
            UIApplication.shared.open(url, options: [:]) { success in
                if success {
                    call.resolve()
                } else {
                    call.reject("Could not open Settings")
                }
            }
        }
    }

    // MARK: - Location

    private func ensureLocationManager() {
        if locationManager == nil {
            let manager = CLLocationManager()
            manager.delegate = self
            manager.desiredAccuracy = kCLLocationAccuracyNearestTenMeters
            manager.distanceFilter = 10
            manager.pausesLocationUpdatesAutomatically = false
            if #available(iOS 14.0, *) {
                manager.activityType = .other
            }
            locationManager = manager
        }
    }

    private func warmLocationIfAlreadyAuthorized() {
        ensureLocationManager()
        guard CLLocationManager.locationServicesEnabled() else { return }
        let status = currentAuthStatus()
        if status == .authorizedWhenInUse || status == .authorizedAlways {
            startLocationUpdates()
        }
    }

    private func currentAuthStatus() -> CLAuthorizationStatus {
        ensureLocationManager()
        return locationManager?.authorizationStatus ?? .notDetermined
    }

    private func requestLocationPermissionOnMain(_ call: CAPPluginCall) {
        pendingLocationCall?.reject("Cancelled by a new location permission request")
        pendingLocationCall = call
        waitingForLocationFix = false

        ensureLocationManager()

        guard CLLocationManager.locationServicesEnabled() else {
            finishLocationCall(rejectMessage:
                "Location Services are turned OFF on this iPhone. Open Settings → Privacy & Security → Location Services and turn them ON, then open Velbok again."
            )
            return
        }

        switch currentAuthStatus() {
        case .notDetermined:
            // This is the ONLY state where iOS shows the Allow Location dialog.
            startLocationResolveTimer(seconds: 120)
            locationManager?.requestWhenInUseAuthorization()
        case .authorizedWhenInUse, .authorizedAlways:
            // Dialog will NOT appear — already allowed in Settings. Feed GPS to Stripe.
            continueAfterLocationAuthorized()
        case .denied:
            finishLocationCall(rejectMessage:
                "Location was previously denied for Velbok, so iPhone will not ask again. Open Settings → Velbok → Location → While Using the App (and turn Precise Location ON), then force-close Velbok and try again."
            )
        case .restricted:
            finishLocationCall(rejectMessage:
                "Location access is restricted on this iPhone (Screen Time or device policy). Allow Location for Velbok, then try again."
            )
        @unknown default:
            startLocationResolveTimer(seconds: 120)
            locationManager?.requestWhenInUseAuthorization()
        }
    }

    private func continueAfterLocationAuthorized() {
        guard pendingLocationCall != nil else {
            startLocationUpdates()
            return
        }

        if #available(iOS 14.0, *) {
            if let manager = locationManager, manager.accuracyAuthorization == .reducedAccuracy {
                manager.requestTemporaryFullAccuracyAuthorization(withPurposeKey: "TerminalPayment")
            }
        }

        waitingForLocationFix = true
        startLocationResolveTimer(seconds: 20)
        startLocationUpdates()

        // If we already have a recent fix, finish immediately.
        if let last = lastKnownLocation, Date().timeIntervalSince(last.timestamp) < 120 {
            waitingForLocationFix = false
            finishLocationCall(rejectMessage: nil)
        }
    }

    private func startLocationUpdates() {
        ensureLocationManager()
        guard let manager = locationManager else { return }
        let status = currentAuthStatus()
        guard status == .authorizedWhenInUse || status == .authorizedAlways else { return }
        if !updatesStarted {
            updatesStarted = true
            manager.startUpdatingLocation()
        }
        // Also request a one-shot in case updates are slow to deliver.
        manager.requestLocation()
    }

    private func locationAuthString() -> String {
        if !CLLocationManager.locationServicesEnabled() {
            return "disabled"
        }
        switch currentAuthStatus() {
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

    private func resolveLocationStatus(_ call: CAPPluginCall, rejectOnFailure: Bool) {
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
                    "Location was previously denied for Velbok, so iPhone will not ask again. Open Settings → Velbok → Location → While Using the App (and turn Precise Location ON), then force-close Velbok and try again."
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
            "hasFix": lastKnownLocation != nil,
            "fixReady": location == "granted" && servicesEnabled,
        ])
    }

    private func startLocationResolveTimer(seconds: TimeInterval) {
        locationResolveTimer?.invalidate()
        locationResolveTimer = Timer.scheduledTimer(withTimeInterval: seconds, repeats: false) { [weak self] _ in
            guard let self, self.pendingLocationCall != nil else { return }
            let location = self.locationAuthString()
            if location == "granted" {
                // Auth OK even without a fix yet — keep updates running for Stripe.
                self.waitingForLocationFix = false
                self.finishLocationCall(rejectMessage: nil)
                return
            }
            if location == "prompt" {
                self.finishLocationCall(rejectMessage:
                    "iPhone did not show the Location dialog in time. Force-close Velbok, reopen, open POS, and tap Allow Location & Bluetooth. If Settings already shows Location On, iPhone will not ask again — that is normal."
                )
                return
            }
            self.finishLocationCall(rejectMessage:
                "Location permission timed out. Keep Location Services ON, then try Connect again."
            )
        }
    }

    private func finishLocationCall(rejectMessage: String?) {
        locationResolveTimer?.invalidate()
        locationResolveTimer = nil
        waitingForLocationFix = false

        guard let call = pendingLocationCall else { return }
        pendingLocationCall = nil

        if let rejectMessage {
            call.reject(rejectMessage)
            return
        }

        resolveLocationStatus(call, rejectOnFailure: true)
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
        if !CLLocationManager.locationServicesEnabled() {
            if pendingLocationCall != nil {
                finishLocationCall(rejectMessage:
                    "Location Services are turned OFF on this iPhone. Open Settings → Privacy & Security → Location Services and turn them ON, then open Velbok again."
                )
            }
            return
        }

        switch manager.authorizationStatus {
        case .authorizedWhenInUse, .authorizedAlways:
            startLocationUpdates()
            if pendingLocationCall != nil, !waitingForLocationFix {
                continueAfterLocationAuthorized()
            }
        case .denied:
            if pendingLocationCall != nil {
                finishLocationCall(rejectMessage:
                    "Location was previously denied for Velbok, so iPhone will not ask again. Open Settings → Velbok → Location → While Using the App (and turn Precise Location ON), then force-close Velbok and try again."
                )
            }
        case .restricted:
            if pendingLocationCall != nil {
                finishLocationCall(rejectMessage:
                    "Location access is restricted on this iPhone (Screen Time or device policy). Allow Location for Velbok, then try again."
                )
            }
        case .notDetermined:
            break
        @unknown default:
            break
        }
    }

    public func locationManager(_ manager: CLLocationManager, didChangeAuthorization status: CLAuthorizationStatus) {
        locationManagerDidChangeAuthorization(manager)
    }

    public func locationManager(_ manager: CLLocationManager, didUpdateLocations locations: [CLLocation]) {
        if let newest = locations.last {
            lastKnownLocation = newest
        }
        guard pendingLocationCall != nil, waitingForLocationFix else { return }
        waitingForLocationFix = false
        finishLocationCall(rejectMessage: nil)
    }

    public func locationManager(_ manager: CLLocationManager, didFailWithError error: Error) {
        // Keep updates running. If auth is granted, do not block Stripe on a temporary GPS miss.
        guard pendingLocationCall != nil else { return }

        let location = locationAuthString()
        if location == "granted" {
            waitingForLocationFix = false
            finishLocationCall(rejectMessage: nil)
            return
        }

        let nsError = error as NSError
        if nsError.domain == kCLErrorDomain, nsError.code == CLError.denied.rawValue {
            finishLocationCall(rejectMessage:
                "Location was previously denied for Velbok, so iPhone will not ask again. Open Settings → Velbok → Location → While Using the App, then force-close Velbok and try again."
            )
            return
        }

        finishLocationCall(rejectMessage:
            "Could not read this iPhone’s location (\(error.localizedDescription)). Turn off Airplane Mode, keep Location Services ON, then try Connect again."
        )
    }

    public func locationManagerDidChangeAccuracyAuthorization(_ manager: CLLocationManager) {
        if manager.accuracyAuthorization == .fullAccuracy {
            startLocationUpdates()
        }
    }

    // MARK: - CBCentralManagerDelegate

    public func centralManagerDidUpdateState(_ central: CBCentralManager) {
        tryFinishBluetoothCall()
    }
}
