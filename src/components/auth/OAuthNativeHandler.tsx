import { useEffect, useRef } from "react";
import { useNavigate } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { App } from "@capacitor/app";
import { Browser } from "@capacitor/browser";
import { useToast } from "@/hooks/use-toast";
import { isNativeApp } from "@/lib/platform";
import { handleOAuthCallbackUrl, isOAuthCallbackUrl } from "@/lib/oauth";

/** Native: complete OAuth / email-confirm / magic-link from com.velbok.app://auth/callback deep links. */
const OAuthNativeHandler = () => {
  const { toast } = useToast();
  const { t } = useTranslation();
  const navigate = useNavigate();
  const processedRef = useRef(new Set<string>());

  useEffect(() => {
    if (!isNativeApp()) return;

    const processUrl = (url: string) => {
      if (!isOAuthCallbackUrl(url)) return;
      // Dedupe — getLaunchUrl + resume used to re-fire the same failed callback and stack error toasts.
      const key = url.replace(/#.*$/, "");
      if (processedRef.current.has(key)) return;
      processedRef.current.add(key);
      void handleOAuthCallbackUrl(url).catch(() => {
        window.setTimeout(() => processedRef.current.delete(key), 45_000);
      });
    };

    const onSuccess = () => {
      processedRef.current.clear();
      navigate("/", { replace: true });
    };

    const onError = (event: Event) => {
      const detail = (event as CustomEvent<string>).detail;
      if (/cancelled by user|canceled by user/i.test(detail || "")) return;
      const friendly = /pkce|code verifier|access.?token/i.test(detail || "")
        ? t("auth.emailConfirmOpenInApp", {
            defaultValue:
              "Open the confirmation link with “Open in Velbok” (or tap Open Velbok app). Don’t finish signup in Safari alone.",
          })
        : detail || t("auth.googleSignInFailed");
      toast({
        title: t("common.error"),
        description: friendly,
        variant: "destructive",
        duration: 8_000,
      });
    };

    window.addEventListener("velbok:oauth-success", onSuccess);
    window.addEventListener("velbok:oauth-error", onError);

    const urlOpen = App.addListener("appUrlOpen", (event) => {
      processUrl(event.url);
    });

    // Only process launch URL once on cold start — not on every resume (that re-showed sticky errors).
    void App.getLaunchUrl().then((launch) => {
      if (launch?.url) processUrl(launch.url);
    });

    const browserFinished = Browser.addListener("browserFinished", () => {
      void App.getLaunchUrl().then((launch) => {
        if (launch?.url) processUrl(launch.url);
      });
    });

    return () => {
      window.removeEventListener("velbok:oauth-success", onSuccess);
      window.removeEventListener("velbok:oauth-error", onError);
      void urlOpen.then((h) => h.remove());
      void browserFinished.then((h) => h.remove());
    };
  }, [navigate, toast, t]);

  return null;
};

export default OAuthNativeHandler;
