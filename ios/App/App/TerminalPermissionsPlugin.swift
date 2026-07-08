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

    private var bluetoothManager: CBCentralManager?
    private var pendingCall: CAPPluginCall?
    private var resolveTimer: Timer?

    @objc func checkReaderPermissions(_ call: CAPPluginCall) {
        DispatchQueue.main.async { [weak self] in
            self?.resolvePermissionStatus(call)
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

        if bluetoothManager == nil {
            bluetoothManager = CBCentralManager(delegate: self, queue: nil)
        }

        resolveTimer?.invalidate()
        resolveTimer = Timer.scheduledTimer(withTimeInterval: 30, repeats: false) { [weak self] _ in
            self?.finishPendingCall()
        }

        tryFinishPendingCall()
    }

    private func bluetoothAuthString() -> String {
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

        let bluetooth = bluetoothAuthString()
        if bluetooth == "prompt", bluetoothManager?.state == .unknown {
            return
        }

        finishPendingCall()
    }

    private func finishPendingCall() {
        resolveTimer?.invalidate()
        resolveTimer = nil

        guard let call = pendingCall else { return }
        pendingCall = nil

        resolvePermissionStatus(call)
    }

    private func resolvePermissionStatus(_ call: CAPPluginCall) {
        call.resolve([
            "location": "granted",
            "bluetooth": bluetoothAuthString(),
        ])
    }

    public func centralManagerDidUpdateState(_ central: CBCentralManager) {
        tryFinishPendingCall()
    }
}
