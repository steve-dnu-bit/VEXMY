import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { useTranslation } from "react-i18next";
import MarketingLayout from "@/components/marketing/MarketingLayout";
import { Button } from "@/components/ui/button";
import { Download, Smartphone, AlertCircle } from "lucide-react";
import { StoreInstallButtons } from "@/components/marketing/StoreInstallButtons";

type AndroidVersionInfo = {
  versionName?: string;
  versionCode?: number;
  downloadUrl?: string;
  sizeBytes?: number;
  updatedAt?: string;
};

const APK_URL = "/downloads/velbok-android.apk";
const VERSION_URL = "/downloads/android-version.json";

const DownloadPage = () => {
  const { t } = useTranslation();
  const [info, setInfo] = useState<AndroidVersionInfo | null>(null);
  const [missing, setMissing] = useState(false);

  useEffect(() => {
    void fetch(`${VERSION_URL}?v=${Date.now()}`, { cache: "no-store" })
      .then((res) => (res.ok ? res.json() : Promise.reject(new Error("not found"))))
      .then((data: AndroidVersionInfo) => setInfo(data))
      .catch(() => setMissing(true));
  }, []);

  const sizeMb =
    info?.sizeBytes != null ? `${(info.sizeBytes / (1024 * 1024)).toFixed(1)} MB` : null;

  return (
    <MarketingLayout>
      <div className="mx-auto max-w-2xl px-4 py-14 sm:px-6">
        <div className="flex items-center gap-3 text-gold">
          <Smartphone className="h-8 w-8" />
          <h1 className="font-display text-3xl font-bold text-foreground">{t("download.title")}</h1>
        </div>
        <p className="mt-4 text-muted-foreground">{t("download.subtitle")}</p>

        <div className="mt-10 rounded-xl border border-gold/25 bg-[#101216]/50 p-6 space-y-4">
          <h2 className="font-semibold text-lg">{t("download.playBetaTitle")}</h2>
          <p className="text-sm text-muted-foreground">{t("download.playBetaDesc")}</p>
          <StoreInstallButtons />
          <p className="text-sm text-muted-foreground">{t("download.playBetaHint")}</p>
        </div>

        <div className="mt-6 rounded-xl border border-border/70 bg-card/55 p-6 space-y-4">
          <h2 className="font-semibold text-lg">{t("download.apkTitle")}</h2>
          <p className="text-sm text-muted-foreground">{t("download.androidDesc")}</p>

          {missing ? (
            <div className="flex gap-2 rounded-lg border border-amber-500/30 bg-amber-500/5 p-4 text-sm text-muted-foreground">
              <AlertCircle className="h-5 w-5 shrink-0 text-amber-600" />
              <p>{t("download.apkUnavailable")}</p>
            </div>
          ) : (
            <>
              {info?.versionName ? (
                <p className="text-sm">
                  <span className="text-muted-foreground">{t("download.latestVersion")}: </span>
                  <span className="font-mono font-medium">{info.versionName}</span>
                  {sizeMb ? <span className="text-muted-foreground"> · {sizeMb}</span> : null}
                  {info.updatedAt ? (
                    <span className="text-muted-foreground"> · {info.updatedAt}</span>
                  ) : null}
                </p>
              ) : null}
              <Button asChild size="lg" className="w-full sm:w-auto">
                <a
                  href={`${info?.downloadUrl ?? APK_URL}?v=${info?.versionCode ?? Date.now()}`}
                  download
                >
                  <Download className="mr-2 h-4 w-4" />
                  {t("download.androidButton", { version: info?.versionName ?? "" })}
                </a>
              </Button>
            </>
          )}

          <ul className="list-disc space-y-2 pl-5 text-sm text-muted-foreground">
            <li>{t("download.installHint1")}</li>
            <li>{t("download.installHint2")}</li>
            <li>{t("download.installHint3")}</li>
          </ul>
        </div>

        <p className="mt-8 text-sm text-muted-foreground">
          {t("download.tapToPayDocs")}{" "}
          <Link to="/docs/pos-checkout" className="text-gold hover:underline">
            {t("download.tapToPayDocsLink")}
          </Link>
        </p>

        <p className="mt-4 text-sm text-muted-foreground">{t("download.iphoneNote")}</p>
      </div>
    </MarketingLayout>
  );
};

export default DownloadPage;
