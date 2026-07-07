import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { AlertCircle, CheckCircle2, Loader2 } from "lucide-react";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { nativePlatform } from "@/lib/platform";
import {
  checkTapToPayEnvironment,
  describeTapToPayBlockers,
  describeTapToPayWarnings,
  hasTapToPayHardBlockers,
  type TapToPayEnvironment,
} from "@/lib/terminal/tapToPayReadiness";
import { TapToPayEducation } from "@/lib/terminal/tapToPayEducation";

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
    return (
      <Alert className="border-amber-500/40 bg-amber-500/5">
        <AlertCircle className="h-4 w-4 text-amber-600" />
        <AlertTitle>{t("pos.tapToPayPhoneBlocked")}</AlertTitle>
        <AlertDescription className="text-sm space-y-2">
          <p>
            Tap to Pay on iPhone is not enabled in this TestFlight build yet. Use WisePad (Bluetooth reader)
            mode above, or wait until Apple approves Tap to Pay for com.velbok.app.
          </p>
        </AlertDescription>
      </Alert>
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
      ? !loading && iosAvailable === true
      : nativePlatform() !== "android" || (!loading && env !== null && !hasTapToPayHardBlockers(env));
  return { ready, loading, refresh };
}
