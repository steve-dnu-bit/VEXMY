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
} from "@/lib/terminal/iosTerminalPermissions";
import {
  checkTapToPayEnvironment,
  describeTapToPayBlockers,
  describeTapToPayWarnings,
  hasTapToPayHardBlockers,
  type TapToPayEnvironment,
} from "@/lib/terminal/tapToPayReadiness";
import { TapToPayEducation } from "@/lib/terminal/tapToPayEducation";

function IosTerminalPermissionsAlert() {
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
    refresh();
  }, []);

  const requestPermissions = () => {
    setRequesting(true);
    setError(null);
    void ensureIosReaderPermissions("bluetooth")
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

  const locationGranted = locationState === "granted";
  const bluetoothGranted = bluetoothState === "granted";
  const ready = locationGranted && bluetoothGranted;
  const locationServicesOff = locationState === "disabled";

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
            ? "Reader permissions enabled"
            : locationServicesOff
              ? "Turn on Location Services"
              : "Enable Location & Bluetooth"}
        </AlertTitle>
        <AlertDescription className="text-sm space-y-2">
          {locationServicesOff ? (
            <p>
              iPhone Location Services are OFF globally. Open Settings → Privacy &amp; Security → Location Services,
              turn them ON, then return here. Velbok’s own Location toggle cannot work while this is off.
            </p>
          ) : (
            <p>
              Velbok needs Location and Bluetooth to discover and connect your Stripe WisePad reader. Location is
              required by payment regulations — it is not used for advertising. Also turn on Precise Location for
              Velbok if you see that option.
            </p>
          )}
          {!loading ? (
            <p className="text-xs text-muted-foreground">
              Location: {locationState} · Bluetooth: {bluetoothState}
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
              ) : (
                "Allow Location & Bluetooth"
              )}
            </Button>
          ) : null}
          {error ? <p className="text-xs text-destructive whitespace-pre-wrap">{error}</p> : null}
        </AlertDescription>
      </Alert>

      <Alert className="border-amber-500/40 bg-amber-500/5">
        <AlertCircle className="h-4 w-4 text-amber-600" />
        <AlertTitle>{t("pos.tapToPayPhoneBlocked")}</AlertTitle>
        <AlertDescription className="text-sm space-y-2">
          <p>
            Tap to Pay on iPhone is not enabled in this build yet. Use WisePad (Bluetooth reader) mode above, or wait
            until Apple approves Tap to Pay for com.velbok.app.
          </p>
        </AlertDescription>
      </Alert>
    </div>
  );
}

export function TapToPayReadinessAlert() {
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
    if (nativePlatform() === "ios") {
      setLoading(false);
      return;
    }
    if (nativePlatform() !== "android") {
      setLoading(false);
      return;
    }
    refresh();
  }, []);

  if (nativePlatform() === "ios") {
    return <IosTerminalPermissionsAlert />;
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
  const [iosAvailable, setIosAvailable] = useState<boolean | null>(null);
  const [loading, setLoading] = useState(nativePlatform() === "android" || nativePlatform() === "ios");

  const refresh = () => {
    if (nativePlatform() === "ios") {
      setLoading(true);
      void TapToPayEducation.isAvailable()
        .then(({ available }) => setIosAvailable(available))
        .catch(() => setIosAvailable(false))
        .finally(() => setLoading(false));
      return;
    }
    if (nativePlatform() !== "android") {
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
    nativePlatform() === "ios"
      ? false
      : nativePlatform() !== "android" || (!loading && env !== null && !hasTapToPayHardBlockers(env));
  return { ready, loading, refresh };
}
