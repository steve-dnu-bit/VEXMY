import { useCallback, useEffect, useState } from "react";
import { Capacitor } from "@capacitor/core";
import { AlertCircle } from "lucide-react";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { isIpadDevice } from "@/lib/platform";
import { TerminalPermissions } from "@/lib/terminal/terminalNativePermissions";
import { checkIosBluetoothPermission, checkIosLocationPermission } from "@/lib/terminal/iosTerminalPermissions";
import { openIosAppSettings } from "@/lib/terminal/iosOpenSettings";
import {
  clearVelbokDebugLog,
  isIosNativeShell,
  readVelbokDebugLog,
  velbokDebugLog,
} from "@/lib/terminal/iosTerminalDebug";
import { tapToPaySupportedOnThisDevice } from "@/lib/terminal/terminalReaderModeStorage";

type DiagnosticsPayload = Record<string, unknown>;

export function IosPosDiagnosticsPanel({
  stripeLocationId,
  readerMode,
  connectReady,
}: {
  stripeLocationId: string | null;
  readerMode: string;
  connectReady: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [snapshot, setSnapshot] = useState<DiagnosticsPayload | null>(null);
  const [logs, setLogs] = useState(readVelbokDebugLog());

  const refresh = useCallback(async () => {
    if (!isIosNativeShell()) return;

    const terminalPermissionsAvailable = Capacitor.isPluginAvailable("TerminalPermissions");
    const stripeTerminalAvailable = Capacitor.isPluginAvailable("StripeTerminal");
    const [locationState, bluetoothState] = await Promise.all([
      checkIosLocationPermission(),
      checkIosBluetoothPermission(),
    ]);

    let native: DiagnosticsPayload = {};
    if (terminalPermissionsAvailable) {
      try {
        const plugin = TerminalPermissions as unknown as {
          getDiagnostics?: () => Promise<DiagnosticsPayload>;
        };
        if (typeof plugin.getDiagnostics === "function") {
          native = await plugin.getDiagnostics();
        }
      } catch (error) {
        native = { nativeError: error instanceof Error ? error.message : String(error) };
      }
    }

    const payload: DiagnosticsPayload = {
      terminalPermissionsAvailable,
      stripeTerminalAvailable,
      jsLocationState: locationState,
      jsBluetoothState: bluetoothState,
      stripeTerminalLocationId: stripeLocationId ?? null,
      readerMode,
      connectReady,
      isIpadUa: isIpadDevice(),
      native,
      capturedAt: new Date().toISOString(),
    };

    setSnapshot(payload);
    setLogs(readVelbokDebugLog());
    velbokDebugLog("IosPosDiagnosticsPanel.tsx:refresh", "diagnostics snapshot", payload, "ALL");
  }, [connectReady, readerMode, stripeLocationId]);

  useEffect(() => {
    void refresh();
    const onVisible = () => {
      if (document.visibilityState === "visible") void refresh();
    };
    document.addEventListener("visibilitychange", onVisible);
    return () => document.removeEventListener("visibilitychange", onVisible);
  }, [refresh]);

  if (!isIosNativeShell()) return null;

  const native = (snapshot?.native ?? {}) as DiagnosticsPayload;
  const isPad = native.isPad === true || isIpadDevice();
  const servicesOn = native.locationServicesEnabled !== false;
  const authStatus = String(native.authorizationStatus ?? snapshot?.jsLocationState ?? "?");
  const locationBlocked = !servicesOn || authStatus === "denied" || authStatus === "disabled" || authStatus === "restricted";
  const wrongReaderMode = readerMode === "tap_to_pay" && isPad;
  const canPay = !locationBlocked && !wrongReaderMode && stripeLocationId;

  return (
    <div className="space-y-2">
      {!canPay ? (
        <Alert variant="destructive" className="border-red-500/60">
          <AlertCircle className="h-4 w-4" />
          <AlertTitle className="text-sm">
            {!servicesOn
              ? "Turn ON Location Services on this iPad"
              : authStatus === "denied"
                ? "Location denied for Velbok"
                : wrongReaderMode
                  ? "Tap to Pay is not available on iPad"
                  : "Payments blocked"}
          </AlertTitle>
          <AlertDescription className="text-sm space-y-3">
            {!servicesOn ? (
              <ol className="list-decimal list-inside space-y-1 font-sans">
                <li>Open <strong>Settings → Privacy &amp; Security → Location Services</strong></li>
                <li>Turn the <strong>Location Services</strong> master switch <strong>ON</strong></li>
                <li>Return to Velbok and tap Open Velbok Settings below</li>
                <li>Set Velbok → Location → <strong>While Using the App</strong> and turn <strong>Precise Location ON</strong></li>
              </ol>
            ) : authStatus === "denied" ? (
              <ol className="list-decimal list-inside space-y-1 font-sans">
                <li>iPad will <strong>not</strong> show an Allow popup — you must fix this in Settings</li>
                <li>Tap <strong>Open Velbok Settings</strong> below</li>
                <li>Set Location → <strong>While Using the App</strong></li>
                <li>Turn <strong>Precise Location ON</strong> for Velbok</li>
                <li>Force-close Velbok (swipe up) and reopen POS</li>
              </ol>
            ) : wrongReaderMode ? (
              <p className="font-sans">
                iPad cannot use Tap to Pay. This build will switch you to <strong>WisePad (Bluetooth)</strong> automatically
                in 1.0.64 — use a Stripe WisePad reader.
              </p>
            ) : null}
            <div className="flex flex-wrap gap-2">
              <Button type="button" size="sm" variant="secondary" onClick={() => void openIosAppSettings()}>
                Open Velbok Settings
              </Button>
              <Button type="button" size="sm" variant="outline" onClick={() => void refresh()}>
                Recheck after fixing
              </Button>
            </div>
          </AlertDescription>
        </Alert>
      ) : (
        <Alert className="border-emerald-500/40 bg-emerald-500/5">
          <AlertTitle className="text-sm">Location ready for Stripe</AlertTitle>
          <AlertDescription className="text-xs font-mono">
            {isPad ? "iPad" : "iPhone"} · auth={authStatus} · fix={native.hasFix ? "yes" : "pending"} · mode={readerMode}
            {!tapToPaySupportedOnThisDevice() ? " · WisePad only on iPad" : ""}
          </AlertDescription>
        </Alert>
      )}

      <Alert className="border-blue-500/40 bg-blue-500/5">
        <AlertTitle className="text-sm">Diagnostics (debug)</AlertTitle>
        <AlertDescription className="text-xs space-y-2 font-mono">
          <p>
            Services: <strong>{servicesOn ? "ON" : "OFF"}</strong> · Auth: <strong>{authStatus}</strong> · GPS fix:{" "}
            <strong>{native.hasFix ? "yes" : "no"}</strong> · Mode: <strong>{readerMode}</strong>
          </p>
          <div className="flex flex-wrap gap-2">
            <Button type="button" size="sm" variant="ghost" onClick={() => setOpen((v) => !v)}>
              {open ? "Hide JSON" : "Show JSON"}
            </Button>
            <Button
              type="button"
              size="sm"
              variant="ghost"
              onClick={() => {
                clearVelbokDebugLog();
                setLogs([]);
              }}
            >
              Clear log
            </Button>
          </div>
          {open && snapshot ? (
            <pre className="max-h-40 overflow-auto whitespace-pre-wrap break-all rounded bg-muted/50 p-2 text-[10px]">
              {JSON.stringify(snapshot, null, 2)}
            </pre>
          ) : null}
          {open && logs.length > 0 ? (
            <pre className="max-h-24 overflow-auto whitespace-pre-wrap break-all rounded bg-muted/50 p-2 text-[10px]">
              {JSON.stringify(logs.slice(-4), null, 2)}
            </pre>
          ) : null}
        </AlertDescription>
      </Alert>
    </div>
  );
}
