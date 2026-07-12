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
        if let error {
            self.plugin?.notifyListeners(TerminalEvents.FinishInstallingUpdate.rawValue, data: [
                "error": error.localizedDescription
            ])
            return
        }
        // Stripe may finish with a nil update (e.g. installAvailableUpdate with nothing pending).
        // Force-unwrapping here crashes the app during/after charge.
        if let update {
            self.plugin?.notifyListeners(TerminalEvents.FinishInstallingUpdate.rawValue, data: [
                "update": self.convertReaderSoftwareUpdate(update: update)
            ])
        } else {
            self.plugin?.notifyListeners(TerminalEvents.FinishInstallingUpdate.rawValue, data: [:])
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

if (applied > 0) {
  fs.writeFileSync(target, source);
  console.log(`[patch-stripe-terminal-ios] Wrote ${applied} patch(es).`);
} else {
  console.log("[patch-stripe-terminal-ios] No new patches written.");
}
