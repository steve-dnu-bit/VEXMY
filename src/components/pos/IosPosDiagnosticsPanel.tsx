import { useCallback, useEffect, useState } from "react";
import { Capacitor } from "@capacitor/core";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { TerminalPermissions } from "@/lib/terminal/terminalNativePermissions";
import { checkIosBluetoothPermission, checkIosLocationPermission } from "@/lib/terminal/iosTerminalPermissions";
import {
  clearVelbokDebugLog,
  isIosNativeShell,
  readVelbokDebugLog,
  velbokDebugLog,
} from "@/lib/terminal/iosTerminalDebug";

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
  const [open, setOpen] = useState(true);
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

    const ua = typeof navigator !== "undefined" ? navigator.userAgent : "";
    const isIpadUa = /iPad/i.test(ua) || (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);

    const payload: DiagnosticsPayload = {
      appVersion: import.meta.env.VITE_APP_VERSION ?? "unknown",
      terminalPermissionsAvailable,
      stripeTerminalAvailable,
      jsLocationState: locationState,
      jsBluetoothState: bluetoothState,
      stripeTerminalLocationId: stripeLocationId ?? null,
      readerMode,
      connectReady,
      isIpadUa,
      native,
      capturedAt: new Date().toISOString(),
    };

    setSnapshot(payload);
    setLogs(readVelbokDebugLog());
    velbokDebugLog("IosPosDiagnosticsPanel.tsx:refresh", "diagnostics snapshot", payload, "ALL");
  }, [connectReady, readerMode, stripeLocationId]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  if (!isIosNativeShell()) return null;

  const native = (snapshot?.native ?? {}) as DiagnosticsPayload;
  const isPad = native.isPad === true || snapshot?.isIpadUa === true;
  const hasFix = native.hasFix === true;
  const authStatus = String(native.authorizationStatus ?? snapshot?.jsLocationState ?? "?");
  const servicesOn = native.locationServicesEnabled !== false;

  return (
    <Alert className="border-blue-500/40 bg-blue-500/5">
      <AlertTitle className="text-sm">iPad / iOS payment diagnostics (debug)</AlertTitle>
      <AlertDescription className="text-xs space-y-2 font-mono">
        <p className="font-sans text-sm text-muted-foreground">
          If Location is already On in Settings, iPhone/iPad will <strong>not</strong> show an Allow popup — that is
          normal. This panel shows what Velbok and Stripe actually see.
        </p>
        <p>
          Device: {isPad ? "iPad" : "iPhone"} · Auth: <strong>{authStatus}</strong> · Services:{" "}
          <strong>{servicesOn ? "ON" : "OFF"}</strong> · GPS fix: <strong>{hasFix ? "yes" : "no"}</strong>
        </p>
        <p>
          Plugins: TerminalPermissions={String(snapshot?.terminalPermissionsAvailable)} · StripeTerminal=
          {String(snapshot?.stripeTerminalAvailable)}
        </p>
        <p>
          Stripe terminal location ID: {stripeLocationId ? "set" : "MISSING (Admin → POS)"} · Reader mode: {readerMode}
        </p>
        {isPad && !hasFix ? (
          <p className="font-sans text-amber-700 dark:text-amber-400">
            Wi‑Fi‑only iPads have no GPS chip. Stripe needs a network location fix — connect to Wi‑Fi with internet, wait
            30s on this screen, then tap Recheck. Cellular iPads work better outdoors.
          </p>
        ) : null}
        {authStatus === "notDetermined" || authStatus === "prompt" ? (
          <p className="font-sans text-amber-700 dark:text-amber-400">
            Status is still &quot;never asked&quot; — the Allow dialog should appear when you tap Connect. If it does not,
            the native plugin may be missing from this build.
          </p>
        ) : null}
        <div className="flex flex-wrap gap-2">
          <Button type="button" size="sm" variant="secondary" onClick={() => void refresh()}>
            Recheck
          </Button>
          <Button
            type="button"
            size="sm"
            variant="outline"
            onClick={() => {
              clearVelbokDebugLog();
              setLogs([]);
            }}
          >
            Clear log
          </Button>
          <Button type="button" size="sm" variant="ghost" onClick={() => setOpen((v) => !v)}>
            {open ? "Hide raw JSON" : "Show raw JSON"}
          </Button>
        </div>
        {open && snapshot ? (
          <pre className="max-h-48 overflow-auto whitespace-pre-wrap break-all rounded bg-muted/50 p-2 text-[10px]">
            {JSON.stringify(snapshot, null, 2)}
          </pre>
        ) : null}
        {open && logs.length > 0 ? (
          <pre className="max-h-32 overflow-auto whitespace-pre-wrap break-all rounded bg-muted/50 p-2 text-[10px]">
            {JSON.stringify(logs.slice(-8), null, 2)}
          </pre>
        ) : null}
      </AlertDescription>
    </Alert>
  );
}
