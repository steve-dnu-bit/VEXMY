/**
 * Patches @capacitor-community/stripe-terminal iOS connectReader for Tap to Pay.
 * Fixes InvalidConnectionConfiguration when locationId is missing on connect,
 * or when discovery type was lost and Bluetooth config was used by mistake.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const target = path.join(
  __dirname,
  "../node_modules/@capacitor-community/stripe-terminal/ios/Sources/StripeTerminalPlugin/StripeTerminal.swift",
);

if (!fs.existsSync(target)) {
  console.warn("[patch-stripe-terminal-ios] Plugin not installed, skipping.");
  process.exit(0);
}

let source = fs.readFileSync(target, "utf8");
const marker = "// velbok: ios tap-to-pay connect fix v1";
if (source.includes(marker)) {
  console.log("[patch-stripe-terminal-ios] Already applied.");
  process.exit(0);
}

const oldConnect = `    public func connectReader(_ call: CAPPluginCall) {
        DispatchQueue.main.async {
            if self.type == .tapToPay {
                self.connectLocalMobileReader(call)
            } else if self.type == .internet {
                self.connectInternetReader(call)
            } else {
                // if self.type === DiscoveryMethod.bluetoothScan
                self.connectBluetoothReader(call)
            }
        }
    }`;

const newConnect = `    public func connectReader(_ call: CAPPluginCall) {
        ${marker}
        DispatchQueue.main.async {
            // Prefer Tap to Pay config when discovery was Tap to Pay, or when JS says so.
            let forceTapToPay = call.getString("discoveryMethod") == "tap-to-pay"
                || call.getBool("tapToPay", false) == true
            if self.type == .tapToPay || forceTapToPay {
                self.type = .tapToPay
                self.connectLocalMobileReader(call)
            } else if self.type == .internet {
                self.connectInternetReader(call)
            } else {
                self.connectBluetoothReader(call)
            }
        }
    }`;

const oldLocal = `    private func connectLocalMobileReader(_ call: CAPPluginCall) {
        let autoReconnectOnUnexpectedDisconnect = call.getBool("autoReconnectOnUnexpectedDisconnect", false)
        let merchantDisplayName: String? = call.getString("merchantDisplayName")
        let onBehalfOf: String? = call.getString("onBehalfOf")
        let reader: JSObject = call.getObject("reader")!
        let serialNumber: String = reader["serialNumber"] as! String

        let connectionConfig = try! TapToPayConnectionConfigurationBuilder.init(delegate: self, locationId: self.locationId!)
            .setMerchantDisplayName(merchantDisplayName ?? nil)
            .setOnBehalfOf(onBehalfOf ?? nil)
            .setAutoReconnectOnUnexpectedDisconnect(autoReconnectOnUnexpectedDisconnect)
            .build()

        guard let foundReader = self.discoveredReadersList?.first(where: { $0.serialNumber == serialNumber }) else {
            call.reject("reader is not match from descovered readers.")
            return
        }

        Terminal.shared.connectReader(foundReader, connectionConfig: connectionConfig) { reader, error in
            if let reader = reader {
                self.plugin?.notifyListeners(TerminalEvents.ConnectedReader.rawValue, data: [:])
                call.resolve()
            } else if let error = error {
                call.reject(error.localizedDescription)
            }
        }
    }`;

const newLocal = `    private func connectLocalMobileReader(_ call: CAPPluginCall) {
        ${marker}
        let autoReconnectOnUnexpectedDisconnect = call.getBool("autoReconnectOnUnexpectedDisconnect", false)
        let merchantDisplayName: String? = call.getString("merchantDisplayName")
        let onBehalfOf: String? = call.getString("onBehalfOf")
        guard let reader = call.getObject("reader") else {
            call.reject("Missing reader for Tap to Pay connect.")
            return
        }
        guard let serialNumber = reader["serialNumber"] as? String, !serialNumber.isEmpty else {
            call.reject("Missing reader serialNumber for Tap to Pay connect.")
            return
        }

        // Prefer locationId from JS connect call; fall back to value stored during discoverReaders.
        let locationFromCall = call.getString("locationId")?.trimmingCharacters(in: .whitespacesAndNewlines)
        let locationFromDiscover = self.locationId?.trimmingCharacters(in: .whitespacesAndNewlines)
        let resolvedLocation = (locationFromCall?.isEmpty == false ? locationFromCall : nil)
            ?? (locationFromDiscover?.isEmpty == false ? locationFromDiscover : nil)
        guard let locationId = resolvedLocation else {
            call.reject("Tap to Pay requires a Terminal locationId. Create one in Admin → POS checkout, then try again.")
            return
        }
        self.locationId = locationId
        self.type = .tapToPay

        let connectionConfig: TapToPayConnectionConfiguration
        do {
            connectionConfig = try TapToPayConnectionConfigurationBuilder.init(delegate: self, locationId: locationId)
                .setMerchantDisplayName(merchantDisplayName)
                .setOnBehalfOf(onBehalfOf)
                .setAutoReconnectOnUnexpectedDisconnect(autoReconnectOnUnexpectedDisconnect)
                .build()
        } catch {
            call.reject("Invalid Tap to Pay connection configuration: \\(error.localizedDescription)")
            return
        }

        guard let foundReader = self.discoveredReadersList?.first(where: { $0.serialNumber == serialNumber }) else {
            call.reject("Tap to Pay reader was not found in the discovery list. Discover again, then connect.")
            return
        }

        Terminal.shared.connectReader(foundReader, connectionConfig: connectionConfig) { connectedReader, error in
            if connectedReader != nil {
                self.plugin?.notifyListeners(TerminalEvents.ConnectedReader.rawValue, data: [:])
                call.resolve()
            } else if let error = error {
                call.reject(error.localizedDescription)
            } else {
                call.reject("Tap to Pay connect failed with no error details.")
            }
        }
    }`;

if (!source.includes(oldConnect)) {
  console.warn("[patch-stripe-terminal-ios] connectReader pattern not found — plugin may have changed.");
  process.exit(0);
}
if (!source.includes(oldLocal)) {
  console.warn("[patch-stripe-terminal-ios] connectLocalMobileReader pattern not found — plugin may have changed.");
  process.exit(0);
}

source = source.replace(oldConnect, newConnect).replace(oldLocal, newLocal);
fs.writeFileSync(target, source);
console.log("[patch-stripe-terminal-ios] Applied Tap to Pay connect fix.");
