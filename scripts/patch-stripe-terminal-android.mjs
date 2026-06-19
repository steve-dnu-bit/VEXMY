/**
 * Patches @capacitor-community/stripe-terminal Android for Tap to Pay stability.
 * Re-run safe: applies only missing patches (v1 then v2).
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const target = path.join(
  __dirname,
  "../node_modules/@capacitor-community/stripe-terminal/android/src/main/java/com/getcapacitor/community/stripe/terminal/StripeTerminal.kt",
);

if (!fs.existsSync(target)) {
  console.warn("[patch-stripe-terminal-android] Plugin not installed, skipping.");
  process.exit(0);
}

let source = fs.readFileSync(target, "utf8");
let changed = false;

const markerV1 = "// velbok: stripe-terminal android patch";
const markerV2 = "// velbok: patch v2";
const markerV3 = "// velbok: patch v3";
const markerV4 = "// velbok: patch v4";
const markerV5 = "// velbok: patch v5";
const markerV6 = "// velbok: patch v6";

function apply(label, from, to) {
  if (source.includes(to.trim().slice(0, 40))) return;
  if (!source.includes(from)) {
    console.warn(`[patch-stripe-terminal-android] Skip ${label} — pattern not found.`);
    return;
  }
  source = source.replace(from, to);
  changed = true;
  console.log(`[patch-stripe-terminal-android] Applied ${label}`);
}

if (!source.includes(markerV1)) {
  apply(
    "v1 initialize main-thread",
    `    @Throws(TerminalException::class)
    fun initialize(call: PluginCall) {
        this.isTest = call.getBoolean("isTest", true)

        val bluetooth = BluetoothAdapter.getDefaultAdapter()
        if (!bluetooth.isEnabled) {
            if (ActivityCompat.checkSelfPermission(
                    contextSupplier.get(),
                    Manifest.permission.BLUETOOTH_CONNECT
                ) ==
                PackageManager.PERMISSION_GRANTED
            ) {
                bluetooth.enable()
            }
        }

        activitySupplier.get()
            .runOnUiThread {
                onCreate((contextSupplier.get().applicationContext as Application))
                notifyListeners(TerminalEnumEvent.Loaded.webEventName, emptyObject)
                call.resolve()
            }
        val listener: TerminalListener = object : TerminalListener {
            override fun onConnectionStatusChange(status: ConnectionStatus) {
                notifyListeners(
                    TerminalEnumEvent.ConnectionStatusChange.webEventName,
                    JSObject().put("status", status.toString())
                )
            }

            override fun onPaymentStatusChange(status: PaymentStatus) {
                notifyListeners(
                    TerminalEnumEvent.PaymentStatusChange.webEventName,
                    JSObject().put("status", status.toString())
                )
            }
        }
        val logLevel = LogLevel.VERBOSE
        this.tokenProvider = TokenProvider(
            this.contextSupplier,
            call.getString("tokenProviderEndpoint", "")!!,
            this.notifyListenersFunction
        )
        if (!isInitialized()) {
            init(
                contextSupplier.get().applicationContext,
                logLevel,
                this.tokenProvider!!,
                listener,
                null // OfflineListener - not used in this implementation
            )
        }
        Terminal.getInstance()
    }`,
    `    @Throws(TerminalException::class)
    fun initialize(call: PluginCall) {
        ${markerV1}
        this.isTest = call.getBoolean("isTest", true)

        val bluetooth = BluetoothAdapter.getDefaultAdapter()
        if (bluetooth != null && !bluetooth.isEnabled) {
            if (ActivityCompat.checkSelfPermission(
                    contextSupplier.get(),
                    Manifest.permission.BLUETOOTH_CONNECT
                ) ==
                PackageManager.PERMISSION_GRANTED
            ) {
                bluetooth.enable()
            }
        }

        activitySupplier.get()
            .runOnUiThread {
                try {
                    onCreate((contextSupplier.get().applicationContext as Application))
                    val listener: TerminalListener = object : TerminalListener {
                        override fun onConnectionStatusChange(status: ConnectionStatus) {
                            notifyListeners(
                                TerminalEnumEvent.ConnectionStatusChange.webEventName,
                                JSObject().put("status", status.toString())
                            )
                        }

                        override fun onPaymentStatusChange(status: PaymentStatus) {
                            notifyListeners(
                                TerminalEnumEvent.PaymentStatusChange.webEventName,
                                JSObject().put("status", status.toString())
                            )
                        }
                    }
                    val logLevel = LogLevel.VERBOSE
                    this.tokenProvider = TokenProvider(
                        this.contextSupplier,
                        call.getString("tokenProviderEndpoint", "")!!,
                        this.notifyListenersFunction
                    )
                    if (!isInitialized()) {
                        init(
                            contextSupplier.get().applicationContext,
                            logLevel,
                            this.tokenProvider!!,
                            listener,
                            null // OfflineListener - not used in this implementation
                        )
                    }
                    Terminal.getInstance()
                    notifyListeners(TerminalEnumEvent.Loaded.webEventName, emptyObject)
                    call.resolve()
                } catch (e: Exception) {
                    Log.e(logTag, "Terminal initialize failed", e)
                    call.reject(e.message ?: "Terminal initialize failed")
                }
            }
    }`,
  );

  apply(
    "v1 getConnectedReader guard",
    `    fun getConnectedReader(call: PluginCall) {
        val reader: Reader? = Terminal.getInstance().connectedReader`,
    `    fun getConnectedReader(call: PluginCall) {
        if (!isInitialized()) {
            call.resolve(JSObject().put("reader", JSObject.NULL))
            return
        }
        val reader: Reader? = Terminal.getInstance().connectedReader`,
  );

  apply(
    "v1 disconnectReader guard",
    `    fun disconnectReader(call: PluginCall) {
        if (Terminal.getInstance().connectedReader == null) {`,
    `    fun disconnectReader(call: PluginCall) {
        if (!isInitialized()) {
            call.resolve()
            return
        }
        if (Terminal.getInstance().connectedReader == null) {`,
  );

  apply(
    "v1 empty discovered readers",
    `                    override fun onUpdateDiscoveredReaders(readers: List<Reader>) {
                        Log.d(logTag, readers[0].serialNumber.toString())
                        discoveredReadersList = readers`,
    `                    override fun onUpdateDiscoveredReaders(readers: List<Reader>) {
                        if (readers.isEmpty()) {
                            return
                        }
                        Log.d(logTag, readers[0].serialNumber.toString())
                        discoveredReadersList = readers`,
  );
}

if (!source.includes(markerV2)) {
  apply(
    "v2 remove duplicate ApplicationDelegate from initialize",
    `                    onCreate((contextSupplier.get().applicationContext as Application))
                    val listener: TerminalListener = object : TerminalListener {`,
    `                    ${markerV2} — delegate lives in VelbokApplication.onCreate
                    val listener: TerminalListener = object : TerminalListener {`,
  );

  apply(
    "v2 discoverReaders initialized guard",
    `        this.locationId = call.getString("locationId")
        val config: DiscoveryConfiguration
        if (call.getString("type") == TerminalConnectTypes.TapToPay.webEventName) {`,
    `        if (!isInitialized()) {
            call.reject("Stripe Terminal is not initialized. Call initialize() first.")
            return
        }
        if (this.isTest == null) {
            call.reject("Stripe Terminal mode is unknown. Call initialize() first.")
            return
        }

        this.locationId = call.getString("locationId")
        val config: DiscoveryConfiguration
        if (call.getString("type") == TerminalConnectTypes.TapToPay.webEventName) {`,
  );

  apply(
    "v2 discoverReaders failure surfaces to JS",
    `                    override fun onFailure(e: TerminalException) {
                        Log.d(logTag, e.localizedMessage)
                    }`,
    `                    override fun onFailure(e: TerminalException) {
                        Log.e(logTag, e.errorMessage ?: e.localizedMessage ?: "discoverReaders failed", e)
                        call.reject(e.errorMessage ?: e.localizedMessage ?: "discoverReaders failed", e)
                    }`,
  );

  apply(
    "v2 connectReader guard",
    `    fun connectReader(call: PluginCall) {
        if (this.terminalConnectType == TerminalConnectTypes.TapToPay) {`,
    `    fun connectReader(call: PluginCall) {
        if (!isInitialized()) {
            call.reject("Stripe Terminal is not initialized.")
            return
        }
        if (this.terminalConnectType == null) {
            call.reject("Run discoverReaders before connectReader.")
            return
        }
        if (this.terminalConnectType == TerminalConnectTypes.TapToPay) {`,
  );
}

if (!source.includes(markerV3)) {
  apply(
    "v3 tap to pay empty discovery reject",
    `                    override fun onSuccess() {
                        Log.d(logTag, "Finished discovering readers")
                        if (!discoveryCallResolved) {
                            discoveryCallResolved = true
                            call.resolve(JSObject().put("readers", JSArray()))
                        }
                    }`,
    `                    override fun onSuccess() {
                        ${markerV3}
                        Log.d(logTag, "Finished discovering readers")
                        if (!discoveryCallResolved) {
                            discoveryCallResolved = true
                            if (this@StripeTerminal.terminalConnectType == TerminalConnectTypes.TapToPay) {
                                call.reject(
                                    "Tap to Pay is not available on this phone (device or Stripe security check). Try a supported phone or WisePad Bluetooth reader."
                                )
                            } else {
                                call.resolve(JSObject().put("readers", JSArray()))
                            }
                        }
                    }`,
  );
}

if (!source.includes(markerV4)) {
  apply(
    "v4 initialize isTest defaults false",
    `        // velbok: stripe-terminal android patch
        this.isTest = call.getBoolean("isTest", true)`,
    `        // velbok: stripe-terminal android patch
        ${markerV4} production default
        this.isTest = call.getBoolean("isTest", false)`,
  );

  apply(
    "v4 tap to pay simulated override",
    `        if (call.getString("type") == TerminalConnectTypes.TapToPay.webEventName) {
            config = DiscoveryConfiguration.TapToPayDiscoveryConfiguration(this.isTest!!)
            this.terminalConnectType = TerminalConnectTypes.TapToPay`,
    `        if (call.getString("type") == TerminalConnectTypes.TapToPay.webEventName) {
            val tapToPaySimulated = if (call.getData().has("simulated")) call.getBoolean("simulated", false) else (this.isTest == true)
            config = DiscoveryConfiguration.TapToPayDiscoveryConfiguration(tapToPaySimulated)
            this.terminalConnectType = TerminalConnectTypes.TapToPay`,
  );
}

if (!source.includes(markerV5)) {
  apply(
    "v5 surface stripe error codes on discovery failure",
    `                    override fun onFailure(e: TerminalException) {
                        Log.e(logTag, e.errorMessage ?: e.localizedMessage ?: "discoverReaders failed", e)
                        if (!discoveryCallResolved) {
                            discoveryCallResolved = true
                            call.reject(e.errorMessage ?: e.localizedMessage ?: "discoverReaders failed", e)
                        }
                    }`,
    `                    override fun onFailure(e: TerminalException) {
                        ${markerV5}
                        val code = e.errorCode?.name ?: "TERMINAL_ERROR"
                        val detail = e.errorMessage ?: e.localizedMessage ?: "discoverReaders failed"
                        Log.e(logTag, "$code: $detail", e)
                        if (!discoveryCallResolved) {
                            discoveryCallResolved = true
                            call.reject("$code: $detail", e)
                        }
                    }`,
  );
}

if (!source.includes(markerV6)) {
  apply(
    "v6 delay tap to pay empty reject after onSuccess",
    `                    override fun onSuccess() {
                        // velbok: patch v3
                        Log.d(logTag, "Finished discovering readers")
                        if (!discoveryCallResolved) {
                            discoveryCallResolved = true
                            if (this@StripeTerminal.terminalConnectType == TerminalConnectTypes.TapToPay) {
                                call.reject(
                                    "Tap to Pay is not available on this phone (device or Stripe security check). Try a supported phone or WisePad Bluetooth reader."
                                )
                            } else {
                                call.resolve(JSObject().put("readers", JSArray()))
                            }
                        }
                    }`,
    `                    override fun onSuccess() {
                        // velbok: patch v3
                        ${markerV6} delayed empty check
                        Log.d(logTag, "Finished discovering readers")
                        if (discoveryCallResolved) return
                        if (this@StripeTerminal.terminalConnectType == TerminalConnectTypes.TapToPay) {
                            android.os.Handler(android.os.Looper.getMainLooper()).postDelayed({
                                if (discoveryCallResolved) return@postDelayed
                                discoveryCallResolved = true
                                call.reject(
                                    "Tap to Pay is not available on this phone (device or Stripe security check). Try a supported phone or WisePad Bluetooth reader."
                                )
                            }, 8000)
                        } else {
                            discoveryCallResolved = true
                            call.resolve(JSObject().put("readers", JSArray()))
                        }
                    }`,
  );

  if (!source.includes("import android.os.Handler")) {
    source = source.replace(
      "import android.os.Build\nimport android.util.Log",
      "import android.os.Build\nimport android.os.Handler\nimport android.os.Looper\nimport android.util.Log",
    );
    changed = true;
    console.log("[patch-stripe-terminal-android] Applied v6 Handler imports");
  }
}

if (changed) {
  fs.writeFileSync(target, source, "utf8");
  console.log("[patch-stripe-terminal-android] Done.");
} else {
  console.log("[patch-stripe-terminal-android] Already up to date.");
}
