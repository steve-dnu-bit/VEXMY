import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { AlertCircle, CheckCircle2, Loader2 } from "lucide-react";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { nativePlatform } from "@/lib/platform";
import {
  checkIosBluetoothPermission,
  checkIosLocationPermission,
  ensureIosReaderPermissions,
  warmIosLocationForPos,
} from "@/lib/terminal/iosTerminalPermissions";
import {
  checkTapToPayEnvironment,
  describeTapToPayBlockers,
  describeTapToPayWarnings,
  hasTapToPayHardBlockers,
  type TapToPayEnvironment,
} from "@/lib/terminal/tapToPayReadiness";

function IosTerminalPermissionsAlert({ readerMode = "tap_to_pay" }: { readerMode?: "tap_to_pay" | "bluetooth" }) {
  const { t } = useTranslation();
  const [loading, setLoading] = useState(true);
  const [requesting, setRequesting] = useState(false);
  const [locationState, setLocationState] = useState<string>("prompt");
  const [bluetoothState, setBluetoothState] = useState<string>("prompt");
  const [error, setError] = useState<string | null>(null);

  const refresh = () => {
    setLoading(true);
    void Promise.all([checkIosLocationPermission(), checkIosBluetoothPermission()])
      .then(([location, bluetooth]) => {
        setLocationState(location);
        setBluetoothState(bluetooth);
        setError(null);
      })
      .catch(() => {
        setLocationState("disabled");
        setBluetoothState("prompt");
      })
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    void warmIosLocationForPos()
      .then(() => refresh())
      .catch(() => refresh());
  }, []);

  const requestPermissions = () => {
    setRequesting(true);
    setError(null);
    void ensureIosReaderPermissions(readerMode)
      .then(() => refresh())
      .catch((err: unknown) => {
        const message =
          err instanceof Error
            ? err.message
            : typeof err === "object" && err && "message" in err && typeof (err as { message: unknown }).message === "string"
              ? (err as { message: string }).message
              : "Could not enable permissions.";
        setError(message);
        refresh();
      })
      .finally(() => setRequesting(false));
  };

  const needsBluetooth = readerMode === "bluetooth";
  const locationGranted = locationState === "granted";
  const bluetoothGranted = !needsBluetooth || bluetoothState === "granted";
  const ready = locationGranted && bluetoothGranted;
  const locationServicesOff = locationState === "disabled";
  const locationDenied = locationState === "denied";
  const locationPrompt = locationState === "prompt";

  return (
    <div className="space-y-3">
      <Alert className={ready ? "border-emerald-500/40 bg-emerald-500/5" : "border-amber-500/40 bg-amber-500/5"}>
        {ready ? (
          <CheckCircle2 className="h-4 w-4 text-emerald-600" />
        ) : (
          <AlertCircle className="h-4 w-4 text-amber-600" />
        )}
        <AlertTitle>
          {ready
            ? readerMode === "tap_to_pay"
              ? "Location ready for Tap to Pay"
              : "Reader permissions enabled"
            : locationServicesOff
              ? "Turn on Location Services"
              : locationDenied
                ? "Location was denied earlier"
                : readerMode === "tap_to_pay"
                  ? "Enable Location for Tap to Pay"
                  : "Enable Location & Bluetooth"}
        </AlertTitle>
        <AlertDescription className="text-sm space-y-2">
          {locationServicesOff ? (
            <p>
              iPhone Location Services are OFF globally. Open Settings → Privacy &amp; Security → Location Services,
              turn them ON, then return here.
            </p>
          ) : locationDenied ? (
            <p>
              iPhone will not show the Allow dialog again after a previous denial. Open Settings → Velbok → Location →
              While Using the App, turn Precise Location ON, force-close Velbok, then reopen POS.
            </p>
          ) : locationGranted && needsBluetooth && !bluetoothGranted ? (
            <p>
              Location is already allowed (iPhone will not ask again — that is normal). Tap the button below to allow
              Bluetooth for your WisePad reader.
            </p>
          ) : locationPrompt ? (
            <p>
              Tap the button below — iPhone should show Allow Location. If nothing appears, Location may already be set
              in Settings, or Location Services may be off.
            </p>
          ) : readerMode === "tap_to_pay" ? (
            <p>Velbok needs Location for Stripe Tap to Pay on this iPhone.</p>
          ) : (
            <p>
              Velbok needs Location and Bluetooth for Stripe WisePad payments. If Location is already On in Settings,
              iPhone will not show an Allow popup again — that is normal.
            </p>
          )}
          {!loading ? (
            <p className="text-xs text-muted-foreground">
              Location: {locationState}
              {needsBluetooth ? ` · Bluetooth: ${bluetoothState}` : ""}
            </p>
          ) : null}
          {loading ? (
            <p className="text-xs text-muted-foreground flex items-center gap-2">
              <Loader2 className="h-3 w-3 animate-spin" />
              Checking permissions…
            </p>
          ) : null}
          {!loading && !ready ? (
            <Button type="button" size="sm" onClick={requestPermissions} disabled={requesting}>
              {requesting ? (
                <>
                  <Loader2 className="h-3 w-3 animate-spin mr-2" />
                  Waiting for permission…
                </>
              ) : locationServicesOff ? (
                "Recheck Location Services"
              ) : locationDenied ? (
                "I fixed Settings — Recheck"
              ) : locationGranted && needsBluetooth ? (
                "Allow Bluetooth"
              ) : readerMode === "tap_to_pay" ? (
                "Allow Location"
              ) : (
                "Allow Location & Bluetooth"
              )}
            </Button>
          ) : null}
          {error ? <p className="text-xs text-destructive whitespace-pre-wrap">{error}</p> : null}
        </AlertDescription>
      </Alert>
    </div>
  );
}

function IosTapToPayEnvironmentAlert() {
  const { t } = useTranslation();
  const [env, setEnv] = useState<TapToPayEnvironment | null>(null);
  const [loading, setLoading] = useState(true);

  const refresh = () => {
    setLoading(true);
    void checkTapToPayEnvironment()
      .then(setEnv)
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    refresh();
  }, []);

  if (loading) {
    return (
      <p className="text-xs text-muted-foreground flex items-center gap-2">
        <Loader2 className="h-3 w-3 animate-spin" />
        {t("pos.tapToPayCheckingPhone")}
      </p>
    );
  }

  if (!env) return null;

  const hardBlockers = describeTapToPayBlockers(env);
  const ready = !hasTapToPayHardBlockers(env);

  if (!ready) {
    return (
      <Alert variant="destructive">
        <AlertCircle className="h-4 w-4" />
        <AlertTitle>{t("pos.tapToPayPhoneBlocked")}</AlertTitle>
        <AlertDescription className="text-sm space-y-2">
          <ul className="list-disc pl-5 space-y-1">
            {hardBlockers.map((line) => (
              <li key={line}>{line}</li>
            ))}
          </ul>
          <p className="text-xs opacity-90">{t("pos.tapToPayPhoneBlockedHint")}</p>
        </AlertDescription>
      </Alert>
    );
  }

  return (
    <Alert className="border-emerald-500/40 bg-emerald-500/5">
      <CheckCircle2 className="h-4 w-4 text-emerald-600" />
      <AlertTitle className="text-emerald-800 dark:text-emerald-300">{t("pos.tapToPayPhoneReady")}</AlertTitle>
      <AlertDescription className="text-xs space-y-2">
        <p className="text-muted-foreground">
          {t("pos.tapToPayPhoneReadyHint", { version: env.versionName || "?" })}
          {env.deviceModel ? ` · ${env.deviceManufacturer ?? ""} ${env.deviceModel}`.trim() : ""}
        </p>
      </AlertDescription>
    </Alert>
  );
}

export function TapToPayReadinessAlert({ readerMode = "tap_to_pay" }: { readerMode?: "tap_to_pay" | "bluetooth" } = {}) {
  const { t } = useTranslation();
  const [env, setEnv] = useState<TapToPayEnvironment | null>(null);
  const [loading, setLoading] = useState(true);

  const refresh = () => {
    setLoading(true);
    void checkTapToPayEnvironment()
      .then(setEnv)
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    if (nativePlatform() === "ios" || nativePlatform() === "android") {
      refresh();
      return;
    }
    setLoading(false);
  }, []);

  if (nativePlatform() === "ios") {
    if (readerMode === "bluetooth") {
      return <IosTerminalPermissionsAlert readerMode={readerMode} />;
    }
    return (
      <div className="space-y-3">
        <IosTerminalPermissionsAlert readerMode={readerMode} />
        <IosTapToPayEnvironmentAlert />
      </div>
    );
  }

  if (nativePlatform() !== "android") return null;

  if (loading) {
    return (
      <p className="text-xs text-muted-foreground flex items-center gap-2">
        <Loader2 className="h-3 w-3 animate-spin" />
        {t("pos.tapToPayCheckingPhone")}
      </p>
    );
  }

  if (!env) return null;

  const hardBlockers = describeTapToPayBlockers(env).filter((line) => !line.includes("published Tap to Pay device list"));
  const deviceWarnings = describeTapToPayBlockers(env).filter((line) => line.includes("published Tap to Pay device list"));
  const envWarnings = describeTapToPayWarnings(env);
  const ready = !hasTapToPayHardBlockers(env);

  if (!ready) {
    return (
      <Alert variant="destructive">
        <AlertCircle className="h-4 w-4" />
        <AlertTitle>{t("pos.tapToPayPhoneBlocked")}</AlertTitle>
        <AlertDescription className="text-sm space-y-2">
          <ul className="list-disc pl-5 space-y-1">
            {hardBlockers.map((line) => (
              <li key={line}>{line}</li>
            ))}
          </ul>
          <p className="text-[10px] font-mono opacity-80">
            Velbok {env.versionName || "?"} · debugBuild={String(env.debugBuild)} · devOptionsSensor=
            {String(env.developerOptionsEnabled)}
          </p>
          <p className="text-xs opacity-90">{t("pos.tapToPayPhoneBlockedHint")}</p>
        </AlertDescription>
      </Alert>
    );
  }

  return (
    <Alert className={deviceWarnings.length || envWarnings.length ? "border-amber-500/40 bg-amber-500/5" : "border-emerald-500/40 bg-emerald-500/5"}>
      {deviceWarnings.length || envWarnings.length ? (
        <AlertCircle className="h-4 w-4 text-amber-600" />
      ) : (
        <CheckCircle2 className="h-4 w-4 text-emerald-600" />
      )}
      <AlertTitle className={deviceWarnings.length || envWarnings.length ? "text-amber-800 dark:text-amber-300" : "text-emerald-800 dark:text-emerald-300"}>
        {t("pos.tapToPayPhoneReady")}
      </AlertTitle>
      <AlertDescription className="text-xs space-y-2">
        <p className="text-muted-foreground">
          {t("pos.tapToPayPhoneReadyHint", { version: env.versionName || "?" })}
          {env.deviceModel ? ` · ${env.deviceManufacturer ?? ""} ${env.deviceModel}`.trim() : ""}
        </p>
        {[...deviceWarnings, ...envWarnings].map((line) => (
          <p key={line}>{line}</p>
        ))}
        <p className="text-[10px] font-mono opacity-70">
          debugBuild={String(env.debugBuild)} · devOptionsSensor={String(env.developerOptionsEnabled)} · usbDebug=
          {String(env.usbDebuggingEnabled)}
        </p>
      </AlertDescription>
    </Alert>
  );
}

export function useTapToPayReady(): { ready: boolean; loading: boolean; refresh: () => void } {
  const [env, setEnv] = useState<TapToPayEnvironment | null>(null);
  const [loading, setLoading] = useState(nativePlatform() === "android" || nativePlatform() === "ios");

  const refresh = () => {
    if (nativePlatform() !== "android" && nativePlatform() !== "ios") {
      setEnv(null);
      setLoading(false);
      return;
    }
    setLoading(true);
    void checkTapToPayEnvironment()
      .then(setEnv)
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    refresh();
  }, []);

  const ready =
    nativePlatform() === "android" || nativePlatform() === "ios"
      ? !loading && env !== null && !hasTapToPayHardBlockers(env)
      : true;
  return { ready, loading, refresh };
}
