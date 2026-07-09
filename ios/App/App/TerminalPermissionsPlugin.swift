import Foundation
import Capacitor
import CoreBluetooth

@objc(TerminalPermissionsPlugin)
public class TerminalPermissionsPlugin: CAPPlugin, CAPBridgedPlugin, CBCentralManagerDelegate {
    public let identifier = "TerminalPermissionsPlugin"
    public let jsName = "TerminalPermissions"
    public let pluginMethods: [CAPPluginMethod] = [
        CAPPluginMethod(name: "requestBluetoothPermission", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "checkBluetoothPermission", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "requestReaderPermissions", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "checkReaderPermissions", returnType: CAPPluginReturnPromise),
    ]

    private var bluetoothManager: CBCentralManager?
    private var pendingCall: CAPPluginCall?
    private var resolveTimer: Timer?

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
        checkBluetoothPermission(call)
    }

    @objc func requestReaderPermissions(_ call: CAPPluginCall) {
        requestBluetoothPermission(call)
    }

    private func requestBluetoothPermissionOnMain(_ call: CAPPluginCall) {
        pendingCall?.reject("Cancelled by a new permission request")
        pendingCall = call

        if bluetoothManager == nil {
            bluetoothManager = CBCentralManager(
                delegate: self,
                queue: nil,
                options: [CBCentralManagerOptionShowPowerAlertKey: true]
            )
        }

        startResolveTimer()
        tryFinishPendingCall()
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

    private func tryFinishPendingCall() {
        guard pendingCall != nil else { return }

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
            call.reject(
                "Bluetooth permission is required for WisePad. Tap Allow when the iPhone Bluetooth dialog appears, then try Connect again."
            )
        }
    }

    private func finishPendingCall() {
        resolveTimer?.invalidate()
        resolveTimer = nil

        guard let call = pendingCall else { return }
        pendingCall = nil

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
            "location": "granted",
        ])
    }

    public func centralManagerDidUpdateState(_ central: CBCentralManager) {
        tryFinishPendingCall()
    }
}
