/**
 * Patches @capacitor-community/stripe-terminal iOS plugin:
 * 1) Tap to Pay connect — force TapToPay config + safe locationId (v1)
 * 2) Firmware finish — nil update must not force-unwrap (crash after/during charge) (v2)
 * 3) collectPaymentMethod — reject missing client secret instead of force-unwrap (v2)
 * 4) Bluetooth connect — resolve locationId from call safely (v2)
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
let applied = 0;

const markerV1 = "// velbok: ios tap-to-pay connect fix v1";
const markerV2 = "// velbok: ios finish-update nil crash fix v2";

if (!source.includes(markerV1)) {
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
        ${markerV1}
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
        ${markerV1}
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
            // velbok: ios nil-update connect v6
            // A nil configuration update can finish with "No reader connected" while the
            // reader is already attached. That must not abort connect before How to Tap.
            if connectedReader != nil {
                NSLog("[VELBOK-TTP] native.connect.resolved")
                self.plugin?.notifyListeners(TerminalEvents.ConnectedReader.rawValue, data: [:])
                call.resolve()
                return
            }
            if let error = error {
                let message = error.localizedDescription
                let notConnected = message.range(of: "no reader connected", options: .caseInsensitive) != nil
                    || message.range(of: "not connected to", options: .caseInsensitive) != nil
                if notConnected && Terminal.shared.connectedReader != nil {
                    NSLog("[VELBOK-TTP] native.connect.recovered error=\\(message)")
                    self.plugin?.notifyListeners(TerminalEvents.ConnectedReader.rawValue, data: [:])
                    call.resolve()
                    return
                }
                NSLog("[VELBOK-TTP] native.connect.rejected error=\\(message)")
                call.reject(message)
                return
            }
            NSLog("[VELBOK-TTP] native.connect.rejected error=no-details")
            call.reject("Tap to Pay connect failed with no error details.")
        }
    }`;

  if (!source.includes(oldConnect) || !source.includes(oldLocal)) {
    console.warn("[patch-stripe-terminal-ios] connectReader patterns not found — plugin may have changed.");
  } else {
    source = source.replace(oldConnect, newConnect).replace(oldLocal, newLocal);
    applied += 1;
    console.log("[patch-stripe-terminal-ios] Applied Tap to Pay connect fix (v1).");
  }
} else {
  console.log("[patch-stripe-terminal-ios] Tap to Pay connect fix (v1) already present.");
}

if (!source.includes(markerV2)) {
  const finishPatterns = [
    {
      label: "bluetooth FinishInstallingUpdate",
      old: `    public func reader(_: Reader, didFinishInstallingUpdate update: ReaderSoftwareUpdate?, error: Error?) {
        if (error) != nil {
            self.plugin?.notifyListeners(TerminalEvents.FinishInstallingUpdate.rawValue, data: [
                "error": error!.localizedDescription
            ])
            return
        }
        self.plugin?.notifyListeners(TerminalEvents.FinishInstallingUpdate.rawValue, data: [
            "update": self.convertReaderSoftwareUpdate(update: update!)
        ])
    }`,
      next: `    public func reader(_: Reader, didFinishInstallingUpdate update: ReaderSoftwareUpdate?, error: Error?) {
        ${markerV2}
        // velbok: ios nil-update connect v6
        let updateNil = update == nil
        if let error {
            let message = error.localizedDescription
            NSLog("[VELBOK-TTP] native.readerUpdate.failed reader=bluetooth updateNil=\\(updateNil) error=\\(message)")
            self.plugin?.notifyListeners(TerminalEvents.FinishInstallingUpdate.rawValue, data: [
                "error": message,
                "updateNil": updateNil
            ])
            return
        }
        // Stripe may finish with a nil update (nothing pending, or Tap to Pay configuration).
        // Force-unwrapping here crashes connect. A nil update with no error is success.
        NSLog("[VELBOK-TTP] native.readerUpdate.finished reader=bluetooth updateNil=\\(updateNil)")
        if let update {
            self.plugin?.notifyListeners(TerminalEvents.FinishInstallingUpdate.rawValue, data: [
                "update": self.convertReaderSoftwareUpdate(update: update),
                "updateNil": false
            ])
        } else {
            self.plugin?.notifyListeners(TerminalEvents.FinishInstallingUpdate.rawValue, data: [
                "updateNil": true
            ])
        }
    }`,
    },
    {
      label: "tapToPay FinishInstallingUpdate",
      old: `    public func tapToPayReader(_ reader: Reader, didFinishInstallingUpdate update: ReaderSoftwareUpdate?, error: Error?) {
        if (error) != nil {
            self.plugin?.notifyListeners(TerminalEvents.FinishInstallingUpdate.rawValue, data: [
                "error": error!.localizedDescription
            ])
            return
        }
        self.plugin?.notifyListeners(TerminalEvents.FinishInstallingUpdate.rawValue, data: [
            "update": self.convertReaderSoftwareUpdate(update: update!)
        ])
    }`,
      next: `    public func tapToPayReader(_ reader: Reader, didFinishInstallingUpdate update: ReaderSoftwareUpdate?, error: Error?) {
        ${markerV2}
        // velbok: ios nil-update connect v6
        let updateNil = update == nil
        if let error {
            let message = error.localizedDescription
            NSLog("[VELBOK-TTP] native.readerUpdate.failed reader=tapToPay updateNil=\\(updateNil) error=\\(message)")
            self.plugin?.notifyListeners(TerminalEvents.FinishInstallingUpdate.rawValue, data: [
                "error": message,
                "updateNil": updateNil
            ])
            return
        }
        // Nil update + nil error is a successful configuration step, not a failed install.
        NSLog("[VELBOK-TTP] native.readerUpdate.finished reader=tapToPay updateNil=\\(updateNil)")
        if let update {
            self.plugin?.notifyListeners(TerminalEvents.FinishInstallingUpdate.rawValue, data: [
                "update": self.convertReaderSoftwareUpdate(update: update),
                "updateNil": false
            ])
        } else {
            self.plugin?.notifyListeners(TerminalEvents.FinishInstallingUpdate.rawValue, data: [
                "updateNil": true
            ])
        }
    }`,
    },
  ];

  for (const { label, old, next } of finishPatterns) {
    if (!source.includes(old)) {
      console.warn(`[patch-stripe-terminal-ios] ${label} pattern not found — plugin may have changed.`);
      continue;
    }
    source = source.replace(old, next);
    applied += 1;
    console.log(`[patch-stripe-terminal-ios] Applied ${label} nil-safe fix.`);
  }

  const oldCollect = `    public func collectPaymentMethod(_ call: CAPPluginCall) {
        Terminal.shared.retrievePaymentIntent(clientSecret: call.getString("paymentIntent")!) { retrieveResult, retrieveError in
            if let error = retrieveError {
                print("retrievePaymentIntent failed: \\(error)")
                var errorDetails: [String: Any] = ["message": error.localizedDescription]
                call.reject(error.localizedDescription, nil, nil, errorDetails)
            } else if let paymentIntent = retrieveResult {
                self.collectCancelable = Terminal.shared.collectPaymentMethod(paymentIntent) { collectResult, collectError in
                    if let error = collectError {
                        var errorDetails: [String: Any] = ["message": error.localizedDescription]
                        self.plugin?.notifyListeners(TerminalEvents.Failed.rawValue, data: errorDetails)
                        call.reject(error.localizedDescription, nil, nil, errorDetails)
                    } else if let paymentIntent = collectResult {
                        self.plugin?.notifyListeners(TerminalEvents.CollectedPaymentIntent.rawValue, data: [:])
                        self.paymentIntent = paymentIntent
                        call.resolve()
                    }
                }
            }
        }
    }`;

  const newCollect = `    public func collectPaymentMethod(_ call: CAPPluginCall) {
        ${markerV2}
        guard let clientSecret = call.getString("paymentIntent"), !clientSecret.isEmpty else {
            call.reject("Missing paymentIntent client secret for collectPaymentMethod.")
            return
        }
        Terminal.shared.retrievePaymentIntent(clientSecret: clientSecret) { retrieveResult, retrieveError in
            if let error = retrieveError {
                print("retrievePaymentIntent failed: \\(error)")
                var errorDetails: [String: Any] = ["message": error.localizedDescription]
                call.reject(error.localizedDescription, nil, nil, errorDetails)
            } else if let paymentIntent = retrieveResult {
                self.collectCancelable = Terminal.shared.collectPaymentMethod(paymentIntent) { collectResult, collectError in
                    if let error = collectError {
                        var errorDetails: [String: Any] = ["message": error.localizedDescription]
                        self.plugin?.notifyListeners(TerminalEvents.Failed.rawValue, data: errorDetails)
                        call.reject(error.localizedDescription, nil, nil, errorDetails)
                    } else if let paymentIntent = collectResult {
                        self.plugin?.notifyListeners(TerminalEvents.CollectedPaymentIntent.rawValue, data: [:])
                        self.paymentIntent = paymentIntent
                        call.resolve()
                    } else {
                        call.reject("collectPaymentMethod returned no payment intent.")
                    }
                }
            } else {
                call.reject("retrievePaymentIntent returned no payment intent.")
            }
        }
    }`;

  if (!source.includes(oldCollect)) {
    console.warn("[patch-stripe-terminal-ios] collectPaymentMethod pattern not found — plugin may have changed.");
  } else {
    source = source.replace(oldCollect, newCollect);
    applied += 1;
    console.log("[patch-stripe-terminal-ios] Applied collectPaymentMethod safety fix.");
  }

  const oldBluetooth = `    private func connectBluetoothReader(_ call: CAPPluginCall) {
        let reader: JSObject = call.getObject("reader")!
        let serialNumber: String = reader["serialNumber"] as! String

        guard let foundReader = self.discoveredReadersList?.first(where: { $0.serialNumber == serialNumber }) else {
            call.reject("reader is not match from descovered readers.")
            return
        }

        let autoReconnectOnUnexpectedDisconnect = call.getBool("autoReconnectOnUnexpectedDisconnect", false)
        let merchantDisplayName: String? = call.getString("merchantDisplayName")
        let onBehalfOf: String? = call.getString("onBehalfOf")

        let config = try! BluetoothConnectionConfigurationBuilder(delegate: self, locationId: self.locationId!)
            .setAutoReconnectOnUnexpectedDisconnect(autoReconnectOnUnexpectedDisconnect)
            .build()

        Terminal.shared.connectReader(foundReader, connectionConfig: config) { reader, error in
            if let reader = reader {
                self.plugin?.notifyListeners(TerminalEvents.ConnectedReader.rawValue, data: [:])
                call.resolve()
            } else if let error = error {
                call.reject(error.localizedDescription)
            }
        }
    }`;

  const newBluetooth = `    private func connectBluetoothReader(_ call: CAPPluginCall) {
        ${markerV2}
        guard let reader = call.getObject("reader") else {
            call.reject("Missing reader for Bluetooth connect.")
            return
        }
        guard let serialNumber = reader["serialNumber"] as? String, !serialNumber.isEmpty else {
            call.reject("Missing reader serialNumber for Bluetooth connect.")
            return
        }

        guard let foundReader = self.discoveredReadersList?.first(where: { $0.serialNumber == serialNumber }) else {
            call.reject("reader is not match from descovered readers.")
            return
        }

        let autoReconnectOnUnexpectedDisconnect = call.getBool("autoReconnectOnUnexpectedDisconnect", false)

        let locationFromCall = call.getString("locationId")?.trimmingCharacters(in: .whitespacesAndNewlines)
        let locationFromDiscover = self.locationId?.trimmingCharacters(in: .whitespacesAndNewlines)
        let resolvedLocation = (locationFromCall?.isEmpty == false ? locationFromCall : nil)
            ?? (locationFromDiscover?.isEmpty == false ? locationFromDiscover : nil)
        guard let locationId = resolvedLocation else {
            call.reject("Bluetooth reader connect requires a Terminal locationId. Create one in Admin → POS checkout.")
            return
        }
        self.locationId = locationId

        let config: BluetoothConnectionConfiguration
        do {
            config = try BluetoothConnectionConfigurationBuilder(delegate: self, locationId: locationId)
                .setAutoReconnectOnUnexpectedDisconnect(autoReconnectOnUnexpectedDisconnect)
                .build()
        } catch {
            call.reject("Invalid Bluetooth connection configuration: \\(error.localizedDescription)")
            return
        }

        Terminal.shared.connectReader(foundReader, connectionConfig: config) { connectedReader, error in
            if connectedReader != nil {
                self.plugin?.notifyListeners(TerminalEvents.ConnectedReader.rawValue, data: [:])
                call.resolve()
            } else if let error = error {
                call.reject(error.localizedDescription)
            } else {
                call.reject("Bluetooth reader connect failed with no error details.")
            }
        }
    }`;

  if (!source.includes(oldBluetooth)) {
    console.warn("[patch-stripe-terminal-ios] connectBluetoothReader pattern not found — plugin may have changed.");
  } else {
    source = source.replace(oldBluetooth, newBluetooth);
    applied += 1;
    console.log("[patch-stripe-terminal-ios] Applied Bluetooth connect safety fix.");
  }
} else {
  console.log("[patch-stripe-terminal-ios] Finish-update crash fix (v2) already present.");
}

const markerV3 = "// velbok: ios listener payload json-safe v3";
if (!source.includes(markerV3)) {
  // Capacitor can crash when notifyListeners receives OptionSet/enum rawValues (UInt).
  let replacedInput = 0;
  const oldInput = `self.plugin?.notifyListeners(TerminalEvents.RequestReaderInput.rawValue, data: ["options": TerminalMappers.mapFromReaderInputOptions(inputOptions), "message": inputOptions.rawValue])`;
  const newInput = `${markerV3}
        self.plugin?.notifyListeners(TerminalEvents.RequestReaderInput.rawValue, data: ["options": TerminalMappers.mapFromReaderInputOptions(inputOptions), "message": String(describing: inputOptions)])`;
  while (source.includes(oldInput)) {
    source = source.replace(oldInput, newInput);
    replacedInput += 1;
  }
  if (replacedInput > 0) {
    applied += replacedInput;
    console.log(`[patch-stripe-terminal-ios] Applied RequestReaderInput JSON-safe fix (${replacedInput}).`);
  }

  let replacedDisplay = 0;
  const oldDisplay = `"message": displayMessage.rawValue`;
  const newDisplay = `"message": result /* ${markerV3} */`;
  while (source.includes(oldDisplay)) {
    source = source.replace(oldDisplay, newDisplay);
    replacedDisplay += 1;
  }
  if (replacedDisplay > 0) {
    applied += replacedDisplay;
    console.log(`[patch-stripe-terminal-ios] Applied RequestDisplayMessage JSON-safe fix (${replacedDisplay}).`);
  }

  const oldReconnect = `self.plugin?.notifyListeners(TerminalEvents.ReaderReconnectStarted.rawValue, data: ["reader": self.convertReaderInterface(reader: reader), "reason": disconnectReason.rawValue])`;
  const newReconnect = `${markerV3}
        self.plugin?.notifyListeners(TerminalEvents.ReaderReconnectStarted.rawValue, data: ["reader": self.convertReaderInterface(reader: reader), "reason": TerminalMappers.mapFromReaderDisconnectReason(disconnectReason)])`;
  if (source.includes(oldReconnect)) {
    source = source.replace(oldReconnect, newReconnect);
    applied += 1;
    console.log("[patch-stripe-terminal-ios] Applied ReaderReconnectStarted JSON-safe fix.");
  }

  // Soften UnexpectedReaderDisconnect — convertReaderInterface during disconnect can fault.
  const oldUnexpected = `        self.plugin?.notifyListeners(TerminalEvents.UnexpectedReaderDisconnect.rawValue, data: ["reader": self.convertReaderInterface(reader: reader)])`;
  const newUnexpected = `        ${markerV3}
        self.plugin?.notifyListeners(TerminalEvents.UnexpectedReaderDisconnect.rawValue, data: [:])`;
  if (source.includes(oldUnexpected)) {
    source = source.replace(oldUnexpected, newUnexpected);
    applied += 1;
    console.log("[patch-stripe-terminal-ios] Applied UnexpectedReaderDisconnect safety fix.");
  }
} else {
  console.log("[patch-stripe-terminal-ios] Listener payload JSON-safe fix (v3) already present.");
}

const markerV4 = "// velbok: ios tap-to-pay never simulated v4";
if (!source.includes(markerV4)) {
  // Capacitor plugin maps isTest → setSimulated(true) for Tap to Pay, which Stripe iOS
  // rejects ("simulated is not support"). Simulated discovery type is also unimplemented.
  const oldDiscover = `    func discoverReaders(_ call: CAPPluginCall) throws {
        let connectType = call.getString("type")
        let config: DiscoveryConfiguration
        self.locationId = call.getString("locationId")

        if TerminalConnectTypes.TapToPay.rawValue == connectType {
            self.type = .tapToPay
            config = try TapToPayDiscoveryConfigurationBuilder().setSimulated(self.isTest!).build()
        } else if TerminalConnectTypes.Internet.rawValue == connectType {
            self.type = .internet
            config = try InternetDiscoveryConfigurationBuilder()
                .setLocationId(self.locationId)
                .setSimulated(self.isTest!)
                .build()
        } else if TerminalConnectTypes.Bluetooth.rawValue == connectType {
            self.type = DiscoveryMethod.bluetoothScan
            config = try BluetoothScanDiscoveryConfigurationBuilder().setSimulated(self.isTest!).build()
        } else {
            call.unimplemented(connectType! + " is not support now")
            return
        }`;

  const newDiscover = `    func discoverReaders(_ call: CAPPluginCall) throws {
        ${markerV4}
        let connectType = call.getString("type")
        let config: DiscoveryConfiguration
        self.locationId = call.getString("locationId")

        if TerminalConnectTypes.TapToPay.rawValue == connectType {
            // Tap to Pay on iPhone does not support simulated discovery — even in Stripe test mode.
            // Test payments use the real phone reader + Stripe test cards (sk_test).
            self.type = .tapToPay
            config = try TapToPayDiscoveryConfigurationBuilder().setSimulated(false).build()
        } else if TerminalConnectTypes.Internet.rawValue == connectType {
            self.type = .internet
            config = try InternetDiscoveryConfigurationBuilder()
                .setLocationId(self.locationId)
                .setSimulated(self.isTest!)
                .build()
        } else if TerminalConnectTypes.Bluetooth.rawValue == connectType {
            self.type = DiscoveryMethod.bluetoothScan
            // Do NOT tie simulated to isTest — test-mode keys must still find a real WisePad.
            let simulated = call.getBool("simulated", false) ?? false
            config = try BluetoothScanDiscoveryConfigurationBuilder().setSimulated(simulated).build()
        } else if TerminalConnectTypes.Simulated.rawValue == connectType {
            // Plugin has no dedicated Simulated discovery method — use Bluetooth + simulated.
            self.type = DiscoveryMethod.bluetoothScan
            config = try BluetoothScanDiscoveryConfigurationBuilder().setSimulated(true).build()
        } else {
            call.unimplemented((connectType ?? "unknown") + " is not support now")
            return
        }`;

  if (!source.includes(oldDiscover)) {
    console.warn("[patch-stripe-terminal-ios] discoverReaders pattern not found — plugin may have changed.");
  } else {
    source = source.replace(oldDiscover, newDiscover);
    applied += 1;
    console.log("[patch-stripe-terminal-ios] Applied Tap to Pay never-simulated + Simulated discovery fix (v4).");
  }
} else {
  console.log("[patch-stripe-terminal-ios] Tap to Pay never-simulated fix (v4) already present.");
}

const markerV5 = "// velbok: ios bluetooth simulated flag v5";
if (!source.includes(markerV5)) {
  // Older v4 still tied Bluetooth simulated to isTest — break real WisePad in Stripe test mode.
  const oldBt = `        } else if TerminalConnectTypes.Bluetooth.rawValue == connectType {
            self.type = DiscoveryMethod.bluetoothScan
            config = try BluetoothScanDiscoveryConfigurationBuilder().setSimulated(self.isTest!).build()
        } else if TerminalConnectTypes.Simulated.rawValue == connectType {`;
  const newBt = `        } else if TerminalConnectTypes.Bluetooth.rawValue == connectType {
            ${markerV5}
            self.type = DiscoveryMethod.bluetoothScan
            // Do NOT tie simulated to isTest — test-mode keys must still find a real WisePad.
            let simulated = call.getBool("simulated", false) ?? false
            config = try BluetoothScanDiscoveryConfigurationBuilder().setSimulated(simulated).build()
        } else if TerminalConnectTypes.Simulated.rawValue == connectType {`;
  if (!source.includes(oldBt)) {
    if (source.includes('let simulated = call.getBool("simulated", false)')) {
      console.log("[patch-stripe-terminal-ios] Bluetooth simulated flag (v5) already present.");
    } else {
      console.warn("[patch-stripe-terminal-ios] Bluetooth simulated v5 pattern not found — plugin may have changed.");
    }
  } else {
    source = source.replace(oldBt, newBt);
    applied += 1;
    console.log("[patch-stripe-terminal-ios] Applied Bluetooth explicit simulated flag (v5).");
  }
} else {
  console.log("[patch-stripe-terminal-ios] Bluetooth simulated flag (v5) already present.");
}

const markerV6 = "// velbok: ios nil-update connect v6";

if (!source.includes("native.connect.resolved")) {
  const oldConnectDone = `        Terminal.shared.connectReader(foundReader, connectionConfig: connectionConfig) { connectedReader, error in
            if connectedReader != nil {
                self.plugin?.notifyListeners(TerminalEvents.ConnectedReader.rawValue, data: [:])
                call.resolve()
            } else if let error = error {
                call.reject(error.localizedDescription)
            } else {
                call.reject("Tap to Pay connect failed with no error details.")
            }
        }`;
  const newConnectDone = `        Terminal.shared.connectReader(foundReader, connectionConfig: connectionConfig) { connectedReader, error in
            ${markerV6}
            if connectedReader != nil {
                NSLog("[VELBOK-TTP] native.connect.resolved")
                self.plugin?.notifyListeners(TerminalEvents.ConnectedReader.rawValue, data: [:])
                call.resolve()
                return
            }
            if let error = error {
                let message = error.localizedDescription
                let notConnected = message.range(of: "no reader connected", options: .caseInsensitive) != nil
                    || message.range(of: "not connected to", options: .caseInsensitive) != nil
                if notConnected && Terminal.shared.connectedReader != nil {
                    NSLog("[VELBOK-TTP] native.connect.recovered error=\\(message)")
                    self.plugin?.notifyListeners(TerminalEvents.ConnectedReader.rawValue, data: [:])
                    call.resolve()
                    return
                }
                NSLog("[VELBOK-TTP] native.connect.rejected error=\\(message)")
                call.reject(message)
                return
            }
            NSLog("[VELBOK-TTP] native.connect.rejected error=no-details")
            call.reject("Tap to Pay connect failed with no error details.")
        }`;
  if (!source.includes(oldConnectDone)) {
    console.warn("[patch-stripe-terminal-ios] Tap to Pay connect completion v6 pattern not found.");
  } else {
    source = source.replace(oldConnectDone, newConnectDone);
    applied += 1;
    console.log("[patch-stripe-terminal-ios] Applied Tap to Pay nil-update connect recovery (v6).");
  }
}

if (!source.includes("native.readerUpdate.finished reader=tapToPay")) {
  const oldTapFinish = `    public func tapToPayReader(_ reader: Reader, didFinishInstallingUpdate update: ReaderSoftwareUpdate?, error: Error?) {
        ${markerV2}
        if let error {
            self.plugin?.notifyListeners(TerminalEvents.FinishInstallingUpdate.rawValue, data: [
                "error": error.localizedDescription
            ])
            return
        }
        if let update {
            self.plugin?.notifyListeners(TerminalEvents.FinishInstallingUpdate.rawValue, data: [
                "update": self.convertReaderSoftwareUpdate(update: update)
            ])
        } else {
            self.plugin?.notifyListeners(TerminalEvents.FinishInstallingUpdate.rawValue, data: [:])
        }
    }`;
  const newTapFinish = `    public func tapToPayReader(_ reader: Reader, didFinishInstallingUpdate update: ReaderSoftwareUpdate?, error: Error?) {
        ${markerV2}
        ${markerV6}
        let updateNil = update == nil
        if let error {
            let message = error.localizedDescription
            NSLog("[VELBOK-TTP] native.readerUpdate.failed reader=tapToPay updateNil=\\(updateNil) error=\\(message)")
            self.plugin?.notifyListeners(TerminalEvents.FinishInstallingUpdate.rawValue, data: [
                "error": message,
                "updateNil": updateNil
            ])
            return
        }
        NSLog("[VELBOK-TTP] native.readerUpdate.finished reader=tapToPay updateNil=\\(updateNil)")
        if let update {
            self.plugin?.notifyListeners(TerminalEvents.FinishInstallingUpdate.rawValue, data: [
                "update": self.convertReaderSoftwareUpdate(update: update),
                "updateNil": false
            ])
        } else {
            self.plugin?.notifyListeners(TerminalEvents.FinishInstallingUpdate.rawValue, data: [
                "updateNil": true
            ])
        }
    }`;
  if (source.includes(oldTapFinish)) {
    source = source.replace(oldTapFinish, newTapFinish);
    applied += 1;
    console.log("[patch-stripe-terminal-ios] Upgraded tapToPay FinishInstallingUpdate nil-update handling (v6).");
  }
}

if (!source.includes("native.readerUpdate.started reader=tapToPay")) {
  const oldStart = `    public func tapToPayReader(_ reader: Reader, didStartInstallingUpdate update: ReaderSoftwareUpdate, cancelable: Cancelable?) {
        self.installUpdateCancelable = cancelable
        self.plugin?.notifyListeners(TerminalEvents.StartInstallingUpdate.rawValue, data: [
            "update": self.convertReaderSoftwareUpdate(update: update)
        ])
    }`;
  const newStart = `    public func tapToPayReader(_ reader: Reader, didStartInstallingUpdate update: ReaderSoftwareUpdate, cancelable: Cancelable?) {
        ${markerV6}
        self.installUpdateCancelable = cancelable
        NSLog("[VELBOK-TTP] native.readerUpdate.started reader=tapToPay")
        self.plugin?.notifyListeners(TerminalEvents.StartInstallingUpdate.rawValue, data: [
            "update": self.convertReaderSoftwareUpdate(update: update)
        ])
    }`;
  if (!source.includes(oldStart)) {
    console.warn("[patch-stripe-terminal-ios] tapToPay didStartInstallingUpdate pattern not found.");
  } else {
    source = source.replace(oldStart, newStart);
    applied += 1;
    console.log("[patch-stripe-terminal-ios] Applied Tap to Pay reader-update start log (v6).");
  }
}

if (!source.includes("native.terms.accepted")) {
  const termsAnchor = `    public func tapToPayReader(_ reader: Reader, didRequestReaderInput inputOptions: ReaderInputOptions = []) {`;
  const termsMethod = `    public func tapToPayReaderDidAcceptTermsOfService(_ reader: Reader) {
        ${markerV6}
        NSLog("[VELBOK-TTP] native.terms.accepted")
        self.plugin?.notifyListeners("terminalTapToPayTermsAccepted", data: [:])
    }

    public func tapToPayReader(_ reader: Reader, didRequestReaderInput inputOptions: ReaderInputOptions = []) {`;
  if (!source.includes(termsAnchor)) {
    console.warn("[patch-stripe-terminal-ios] terms-accepted anchor not found.");
  } else {
    source = source.replace(termsAnchor, termsMethod);
    applied += 1;
    console.log("[patch-stripe-terminal-ios] Applied Tap to Pay terms-accepted callback (v6).");
  }
}

const markerV7 = "// velbok: ios nil-update connect v7";

if (!source.includes("velbokTapToPayNilUpdateDuringConnect")) {
  const oldFields = `    var discoveredReadersList: [Reader]?`;
  const newFields = `    var discoveredReadersList: [Reader]?
    /// Nil Tap to Pay configuration update seen during this connect. Not a failed install.
    var velbokTapToPayNilUpdateDuringConnect = false`;
  if (!source.includes(oldFields)) {
    console.warn("[patch-stripe-terminal-ios] Tap to Pay nil-update field anchor not found.");
  } else {
    source = source.replace(oldFields, newFields);
    applied += 1;
    console.log("[patch-stripe-terminal-ios] Added nil-update connect flag (v7).");
  }
}

if (!source.includes("func velbokIsNotConnectedReaderError")) {
  const oldHelperAnchor = `    private func connectLocalMobileReader(_ call: CAPPluginCall) {`;
  const newHelperAnchor = `    private func velbokIsNotConnectedReaderError(_ error: Error) -> Bool {
        let message = error.localizedDescription
        if message.range(of: "no reader connected", options: .caseInsensitive) != nil { return true }
        if message.range(of: "not connected to", options: .caseInsensitive) != nil { return true }
        if message.range(of: "reader is not connected", options: .caseInsensitive) != nil { return true }
        return String(describing: error).lowercased().contains("notconnectedtoreader")
    }

    private func velbokResolveTapToPayConnect(_ call: CAPPluginCall) {
        self.velbokTapToPayNilUpdateDuringConnect = false
        NSLog("[VELBOK-TTP] native.connect.resolved")
        self.plugin?.notifyListeners(TerminalEvents.ConnectedReader.rawValue, data: [:])
        call.resolve()
    }

    /// A nil FinishInstallingUpdate is a finished configuration step. If Stripe then
    /// completes connectReader with "No reader connected", connect once more — Terms
    /// are already accepted — instead of aborting before How to Tap.
    private func velbokFinishTapToPayConnect(
        _ call: CAPPluginCall,
        foundReader: Reader,
        connectionConfig: TapToPayConnectionConfiguration,
        connectedReader: Reader?,
        error: Error?,
        allowNilUpdateRetry: Bool
    ) {
        if connectedReader != nil || Terminal.shared.connectedReader != nil {
            if error != nil && connectedReader == nil {
                NSLog("[VELBOK-TTP] native.connect.recovered error=\\(error!.localizedDescription)")
            }
            self.velbokResolveTapToPayConnect(call)
            return
        }
        if let error = error {
            let message = error.localizedDescription
            if allowNilUpdateRetry && self.velbokTapToPayNilUpdateDuringConnect && self.velbokIsNotConnectedReaderError(error) {
                NSLog("[VELBOK-TTP] native.connect.retry reason=nil-update-not-connected error=\\(message)")
                self.velbokTapToPayNilUpdateDuringConnect = false
                DispatchQueue.main.asyncAfter(deadline: .now() + 0.8) {
                    Terminal.shared.connectReader(foundReader, connectionConfig: connectionConfig) { retriedReader, retryError in
                        self.velbokFinishTapToPayConnect(
                            call,
                            foundReader: foundReader,
                            connectionConfig: connectionConfig,
                            connectedReader: retriedReader,
                            error: retryError,
                            allowNilUpdateRetry: false
                        )
                    }
                }
                return
            }
            NSLog("[VELBOK-TTP] native.connect.rejected error=\\(message)")
            self.velbokTapToPayNilUpdateDuringConnect = false
            call.reject(message)
            return
        }
        NSLog("[VELBOK-TTP] native.connect.rejected error=no-details")
        self.velbokTapToPayNilUpdateDuringConnect = false
        call.reject("Tap to Pay connect failed with no error details.")
    }

    private func connectLocalMobileReader(_ call: CAPPluginCall) {`;
  if (!source.includes(oldHelperAnchor)) {
    console.warn("[patch-stripe-terminal-ios] Tap to Pay helper anchor not found.");
  } else {
    source = source.replace(oldHelperAnchor, newHelperAnchor);
    applied += 1;
    console.log("[patch-stripe-terminal-ios] Added nil-update connect retry helpers (v7).");
  }
}

const connectStartV7 = `    private func connectLocalMobileReader(_ call: CAPPluginCall) {
        // velbok: ios tap-to-pay connect fix v1
`;
const connectStartResetV7 = `    private func connectLocalMobileReader(_ call: CAPPluginCall) {
        // velbok: ios tap-to-pay connect fix v1
        self.velbokTapToPayNilUpdateDuringConnect = false
`;
if (source.includes("velbokTapToPayNilUpdateDuringConnect") && source.includes(connectStartV7) && !source.includes(connectStartResetV7)) {
  source = source.replace(connectStartV7, connectStartResetV7);
  applied += 1;
  console.log("[patch-stripe-terminal-ios] Reset nil-update flag at Tap to Pay connect start (v7).");
}

if (!source.includes("allowNilUpdateRetry: true")) {
  const oldConnectDoneV7 = `        Terminal.shared.connectReader(foundReader, connectionConfig: connectionConfig) { connectedReader, error in
            ${markerV6}
            // A nil configuration update can finish with "No reader connected" while the
            // reader is already attached. That must not abort connect before How to Tap.
            if connectedReader != nil {
                NSLog("[VELBOK-TTP] native.connect.resolved")
                self.plugin?.notifyListeners(TerminalEvents.ConnectedReader.rawValue, data: [:])
                call.resolve()
                return
            }
            if let error = error {
                let message = error.localizedDescription
                let notConnected = message.range(of: "no reader connected", options: .caseInsensitive) != nil
                    || message.range(of: "not connected to", options: .caseInsensitive) != nil
                if notConnected && Terminal.shared.connectedReader != nil {
                    NSLog("[VELBOK-TTP] native.connect.recovered error=\\(message)")
                    self.plugin?.notifyListeners(TerminalEvents.ConnectedReader.rawValue, data: [:])
                    call.resolve()
                    return
                }
                NSLog("[VELBOK-TTP] native.connect.rejected error=\\(message)")
                call.reject(message)
                return
            }
            NSLog("[VELBOK-TTP] native.connect.rejected error=no-details")
            call.reject("Tap to Pay connect failed with no error details.")
        }`;
  const newConnectDoneV7 = `        Terminal.shared.connectReader(foundReader, connectionConfig: connectionConfig) { connectedReader, error in
            ${markerV7}
            self.velbokFinishTapToPayConnect(
                call,
                foundReader: foundReader,
                connectionConfig: connectionConfig,
                connectedReader: connectedReader,
                error: error,
                allowNilUpdateRetry: true
            )
        }`;
  if (!source.includes(oldConnectDoneV7)) {
    console.warn("[patch-stripe-terminal-ios] Tap to Pay connect completion v7 pattern not found.");
  } else {
    source = source.replace(oldConnectDoneV7, newConnectDoneV7);
    applied += 1;
    console.log("[patch-stripe-terminal-ios] Applied Tap to Pay nil-update connect retry (v7).");
  }
}

if (!source.includes("native.readerUpdate.nilIgnored")) {
  const oldTapFinishV7 = `    public func tapToPayReader(_ reader: Reader, didFinishInstallingUpdate update: ReaderSoftwareUpdate?, error: Error?) {
        ${markerV2}
        ${markerV6}
        let updateNil = update == nil
        if let error {
            let message = error.localizedDescription
            NSLog("[VELBOK-TTP] native.readerUpdate.failed reader=tapToPay updateNil=\\(updateNil) error=\\(message)")
            self.plugin?.notifyListeners(TerminalEvents.FinishInstallingUpdate.rawValue, data: [
                "error": message,
                "updateNil": updateNil
            ])
            return
        }
        // Nil update + nil error is a successful configuration step, not a failed install.
        NSLog("[VELBOK-TTP] native.readerUpdate.finished reader=tapToPay updateNil=\\(updateNil)")
        if let update {
            self.plugin?.notifyListeners(TerminalEvents.FinishInstallingUpdate.rawValue, data: [
                "update": self.convertReaderSoftwareUpdate(update: update),
                "updateNil": false
            ])
        } else {
            self.plugin?.notifyListeners(TerminalEvents.FinishInstallingUpdate.rawValue, data: [
                "updateNil": true
            ])
        }
    }`;
  const newTapFinishV7 = `    public func tapToPayReader(_ reader: Reader, didFinishInstallingUpdate update: ReaderSoftwareUpdate?, error: Error?) {
        ${markerV2}
        ${markerV7}
        let updateNil = update == nil
        if updateNil {
            let falseFailure = error == nil || self.velbokIsNotConnectedReaderError(error!)
            if falseFailure {
                self.velbokTapToPayNilUpdateDuringConnect = true
                let detail = error?.localizedDescription ?? "nil"
                NSLog("[VELBOK-TTP] native.readerUpdate.nilIgnored reader=tapToPay error=\\(detail)")
                self.plugin?.notifyListeners(TerminalEvents.FinishInstallingUpdate.rawValue, data: [
                    "updateNil": true
                ])
                return
            }
        }
        if let error {
            let message = error.localizedDescription
            NSLog("[VELBOK-TTP] native.readerUpdate.failed reader=tapToPay updateNil=\\(updateNil) error=\\(message)")
            self.plugin?.notifyListeners(TerminalEvents.FinishInstallingUpdate.rawValue, data: [
                "error": message,
                "updateNil": updateNil
            ])
            return
        }
        NSLog("[VELBOK-TTP] native.readerUpdate.finished reader=tapToPay updateNil=\\(updateNil)")
        if let update {
            self.plugin?.notifyListeners(TerminalEvents.FinishInstallingUpdate.rawValue, data: [
                "update": self.convertReaderSoftwareUpdate(update: update),
                "updateNil": false
            ])
        } else {
            self.plugin?.notifyListeners(TerminalEvents.FinishInstallingUpdate.rawValue, data: [
                "updateNil": true
            ])
        }
    }`;
  if (!source.includes(oldTapFinishV7)) {
    console.warn("[patch-stripe-terminal-ios] tapToPay FinishInstallingUpdate v7 pattern not found.");
  } else {
    source = source.replace(oldTapFinishV7, newTapFinishV7);
    applied += 1;
    console.log("[patch-stripe-terminal-ios] Applied tapToPay nil FinishInstallingUpdate success path (v7).");
  }
}

const markerV8 = "// velbok: ios education-before-update v8";
if (!source.includes(markerV8)) {
  const v8Replacements = [
    {
      label: "Tap to Pay connect in-flight flag",
      old: `    var velbokTapToPayNilUpdateDuringConnect = false`,
      next: `    var velbokTapToPayNilUpdateDuringConnect = false
    /// True only while Tap to Pay connectReader is in flight.
    var velbokTapToPayConnectInFlight = false
    /// A WisePad install was cancelled because Tap to Pay connect is in flight. Swallow its finish event.
    var velbokRefusedWisePadUpdateDuringTapToPay = false`,
    },
    {
      label: "clear Tap to Pay connect flag on resolve",
      old: `    private func velbokResolveTapToPayConnect(_ call: CAPPluginCall) {
        self.velbokTapToPayNilUpdateDuringConnect = false
        NSLog("[VELBOK-TTP] native.connect.resolved")`,
      next: `    private func velbokResolveTapToPayConnect(_ call: CAPPluginCall) {
        self.velbokTapToPayNilUpdateDuringConnect = false
        self.velbokTapToPayConnectInFlight = false
        NSLog("[VELBOK-TTP] native.connect.resolved")`,
    },
    {
      label: "clear Tap to Pay connect flag on reject",
      old: `            self.velbokTapToPayNilUpdateDuringConnect = false
            call.reject(message)`,
      next: `            self.velbokTapToPayNilUpdateDuringConnect = false
            self.velbokTapToPayConnectInFlight = false
            call.reject(message)`,
    },
    {
      label: "clear Tap to Pay connect flag on empty reject",
      old: `        self.velbokTapToPayNilUpdateDuringConnect = false
        call.reject("Tap to Pay connect failed with no error details.")`,
      next: `        self.velbokTapToPayNilUpdateDuringConnect = false
        self.velbokTapToPayConnectInFlight = false
        call.reject("Tap to Pay connect failed with no error details.")`,
    },
    {
      label: "set Tap to Pay connect flag",
      old: `        Terminal.shared.connectReader(foundReader, connectionConfig: connectionConfig) { connectedReader, error in
            ${markerV7}`,
      next: `        self.velbokTapToPayConnectInFlight = true
        Terminal.shared.connectReader(foundReader, connectionConfig: connectionConfig) { connectedReader, error in
            ${markerV7}`,
    },
    {
      label: "tag Tap to Pay reader software update events",
      old: `        self.installUpdateCancelable = cancelable
        NSLog("[VELBOK-TTP] native.readerUpdate.started reader=tapToPay")
        self.plugin?.notifyListeners(TerminalEvents.StartInstallingUpdate.rawValue, data: [
            "update": self.convertReaderSoftwareUpdate(update: update)
        ])
    }

    public func tapToPayReader(_ reader: Reader, didReportReaderSoftwareUpdateProgress progress: Float) {
        self.plugin?.notifyListeners(TerminalEvents.ReaderSoftwareUpdateProgress.rawValue, data: ["progress": progress])
    }`,
      next: `        ${markerV8}
        self.installUpdateCancelable = cancelable
        NSLog("[VELBOK-TTP] native.readerUpdate.started reader=tapToPay")
        self.plugin?.notifyListeners(TerminalEvents.StartInstallingUpdate.rawValue, data: [
            "update": self.convertReaderSoftwareUpdate(update: update),
            "readerKind": "tapToPay"
        ])
    }

    public func tapToPayReader(_ reader: Reader, didReportReaderSoftwareUpdateProgress progress: Float) {
        ${markerV8}
        self.plugin?.notifyListeners(TerminalEvents.ReaderSoftwareUpdateProgress.rawValue, data: [
            "progress": progress,
            "readerKind": "tapToPay"
        ])
    }`,
    },
    {
      label: "tag Tap to Pay finish nil-ignored",
      old: `                self.plugin?.notifyListeners(TerminalEvents.FinishInstallingUpdate.rawValue, data: [
                    "updateNil": true
                ])
                return
            }
        }
        if let error {
            let message = error.localizedDescription
            NSLog("[VELBOK-TTP] native.readerUpdate.failed reader=tapToPay updateNil=\\(updateNil) error=\\(message)")
            self.plugin?.notifyListeners(TerminalEvents.FinishInstallingUpdate.rawValue, data: [
                "error": message,
                "updateNil": updateNil
            ])`,
      next: `                self.plugin?.notifyListeners(TerminalEvents.FinishInstallingUpdate.rawValue, data: [
                    "updateNil": true,
                    "readerKind": "tapToPay"
                ])
                return
            }
        }
        if let error {
            let message = error.localizedDescription
            NSLog("[VELBOK-TTP] native.readerUpdate.failed reader=tapToPay updateNil=\\(updateNil) error=\\(message)")
            self.plugin?.notifyListeners(TerminalEvents.FinishInstallingUpdate.rawValue, data: [
                "error": message,
                "updateNil": updateNil,
                "readerKind": "tapToPay"
            ])`,
    },
    {
      label: "tag Tap to Pay finish success",
      old: `        if let update {
            self.plugin?.notifyListeners(TerminalEvents.FinishInstallingUpdate.rawValue, data: [
                "update": self.convertReaderSoftwareUpdate(update: update),
                "updateNil": false
            ])
        } else {
            self.plugin?.notifyListeners(TerminalEvents.FinishInstallingUpdate.rawValue, data: [
                "updateNil": true
            ])
        }
    }

    public func tapToPayReaderDidAcceptTermsOfService(_ reader: Reader) {`,
      next: `        if let update {
            self.plugin?.notifyListeners(TerminalEvents.FinishInstallingUpdate.rawValue, data: [
                "update": self.convertReaderSoftwareUpdate(update: update),
                "updateNil": false,
                "readerKind": "tapToPay"
            ])
        } else {
            self.plugin?.notifyListeners(TerminalEvents.FinishInstallingUpdate.rawValue, data: [
                "updateNil": true,
                "readerKind": "tapToPay"
            ])
        }
    }

    public func tapToPayReaderDidAcceptTermsOfService(_ reader: Reader) {`,
    },
    {
      label: "refuse WisePad firmware during Tap to Pay connect",
      old: `    public func reader(_: Reader, didStartInstallingUpdate update: ReaderSoftwareUpdate, cancelable: Cancelable?) {
        self.installUpdateCancelable = cancelable
        self.plugin?.notifyListeners(TerminalEvents.StartInstallingUpdate.rawValue, data: [
            "update": self.convertReaderSoftwareUpdate(update: update)
        ])
    }

    public func reader(_: Reader, didReportReaderSoftwareUpdateProgress progress: Float) {
        self.plugin?.notifyListeners(TerminalEvents.ReaderSoftwareUpdateProgress.rawValue, data: ["progress": progress])
    }`,
      next: `    public func reader(_: Reader, didStartInstallingUpdate update: ReaderSoftwareUpdate, cancelable: Cancelable?) {
        ${markerV8}
        if self.velbokTapToPayConnectInFlight {
            self.velbokRefusedWisePadUpdateDuringTapToPay = true
            NSLog("[VELBOK-TTP] native.readerUpdate.refused reader=bluetooth reason=during-tap-to-pay-connect")
            cancelable?.cancel { _ in }
            return
        }
        self.installUpdateCancelable = cancelable
        self.plugin?.notifyListeners(TerminalEvents.StartInstallingUpdate.rawValue, data: [
            "update": self.convertReaderSoftwareUpdate(update: update),
            "readerKind": "bluetooth"
        ])
    }

    public func reader(_: Reader, didReportReaderSoftwareUpdateProgress progress: Float) {
        if self.velbokTapToPayConnectInFlight || self.velbokRefusedWisePadUpdateDuringTapToPay {
            return
        }
        self.plugin?.notifyListeners(TerminalEvents.ReaderSoftwareUpdateProgress.rawValue, data: [
            "progress": progress,
            "readerKind": "bluetooth"
        ])
    }`,
    },
    {
      label: "swallow refused WisePad finish and tag bluetooth updates",
      old: `    public func reader(_: Reader, didFinishInstallingUpdate update: ReaderSoftwareUpdate?, error: Error?) {
        ${markerV2}
        ${markerV6}
        let updateNil = update == nil
        if let error {
            let message = error.localizedDescription
            NSLog("[VELBOK-TTP] native.readerUpdate.failed reader=bluetooth updateNil=\\(updateNil) error=\\(message)")
            self.plugin?.notifyListeners(TerminalEvents.FinishInstallingUpdate.rawValue, data: [
                "error": message,
                "updateNil": updateNil
            ])
            return
        }
        // Stripe may finish with a nil update (nothing pending, or Tap to Pay configuration).
        // Force-unwrapping here crashes connect. A nil update with no error is success.
        NSLog("[VELBOK-TTP] native.readerUpdate.finished reader=bluetooth updateNil=\\(updateNil)")
        if let update {
            self.plugin?.notifyListeners(TerminalEvents.FinishInstallingUpdate.rawValue, data: [
                "update": self.convertReaderSoftwareUpdate(update: update),
                "updateNil": false
            ])
        } else {
            self.plugin?.notifyListeners(TerminalEvents.FinishInstallingUpdate.rawValue, data: [
                "updateNil": true
            ])
        }
    }`,
      next: `    public func reader(_: Reader, didFinishInstallingUpdate update: ReaderSoftwareUpdate?, error: Error?) {
        ${markerV2}
        ${markerV6}
        ${markerV8}
        if self.velbokRefusedWisePadUpdateDuringTapToPay {
            self.velbokRefusedWisePadUpdateDuringTapToPay = false
            NSLog("[VELBOK-TTP] native.readerUpdate.refusedFinished reader=bluetooth")
            return
        }
        let updateNil = update == nil
        if let error {
            let message = error.localizedDescription
            NSLog("[VELBOK-TTP] native.readerUpdate.failed reader=bluetooth updateNil=\\(updateNil) error=\\(message)")
            self.plugin?.notifyListeners(TerminalEvents.FinishInstallingUpdate.rawValue, data: [
                "error": message,
                "updateNil": updateNil,
                "readerKind": "bluetooth"
            ])
            return
        }
        // Stripe may finish with a nil update (nothing pending, or Tap to Pay configuration).
        // Force-unwrapping here crashes connect. A nil update with no error is success.
        NSLog("[VELBOK-TTP] native.readerUpdate.finished reader=bluetooth updateNil=\\(updateNil)")
        if let update {
            self.plugin?.notifyListeners(TerminalEvents.FinishInstallingUpdate.rawValue, data: [
                "update": self.convertReaderSoftwareUpdate(update: update),
                "updateNil": false,
                "readerKind": "bluetooth"
            ])
        } else {
            self.plugin?.notifyListeners(TerminalEvents.FinishInstallingUpdate.rawValue, data: [
                "updateNil": true,
                "readerKind": "bluetooth"
            ])
        }
    }`,
    },
  ];

  for (const { label, old, next } of v8Replacements) {
    if (!source.includes(old)) {
      console.warn(`[patch-stripe-terminal-ios] ${label} pattern not found — plugin may have changed.`);
      continue;
    }
    source = source.replace(old, next);
    applied += 1;
    console.log(`[patch-stripe-terminal-ios] Applied ${label} (v8).`);
  }
} else {
  console.log("[patch-stripe-terminal-ios] Education-before-update (v8) already present.");
}

if (applied > 0) {
  fs.writeFileSync(target, source);
  console.log(`[patch-stripe-terminal-ios] Wrote ${applied} patch(es).`);
} else {
  console.log("[patch-stripe-terminal-ios] No new patches written.");
}
