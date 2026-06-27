import { useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { App } from "@capacitor/app";
import { Browser } from "@capacitor/browser";
import { useToast } from "@/hooks/use-toast";
import { isNativeApp } from "@/lib/platform";
import { handleOAuthCallbackUrl, isOAuthCallbackUrl } from "@/lib/oauth";

/** Native: complete Supabase OAuth from com.velbok.app://auth/callback deep links. */
const OAuthNativeHandler = () => {
  const { toast } = useToast();
  const { t } = useTranslation();
  const navigate = useNavigate();

  useEffect(() => {
    if (!isNativeApp()) return;

    const processUrl = (url: string) => {
      if (!isOAuthCallbackUrl(url)) return;
      void handleOAuthCallbackUrl(url).catch(() => undefined);
    };

    const onSuccess = () => {
      navigate("/", { replace: true });
    };

    const onError = (event: Event) => {
      const detail = (event as CustomEvent<string>).detail;
      if (/cancelled by user|canceled by user/i.test(detail || "")) return;
      toast({
        title: t("common.error"),
        description: detail || t("auth.googleSignInFailed"),
        variant: "destructive",
      });
    };

    window.addEventListener("velbok:oauth-success", onSuccess);
    window.addEventListener("velbok:oauth-error", onError);

    const urlOpen = App.addListener("appUrlOpen", (event) => {
      processUrl(event.url);
    });

    const resume = App.addListener("resume", () => {
      void App.getLaunchUrl().then((launch) => {
        if (launch?.url) processUrl(launch.url);
      });
    });

    const browserFinished = Browser.addListener("browserFinished", () => {
      void App.getLaunchUrl().then((launch) => {
        if (launch?.url) processUrl(launch.url);
      });
    });

    void App.getLaunchUrl().then((launch) => {
      if (launch?.url) processUrl(launch.url);
    });

    return () => {
      window.removeEventListener("velbok:oauth-success", onSuccess);
      window.removeEventListener("velbok:oauth-error", onError);
      void urlOpen.then((h) => h.remove());
      void resume.then((h) => h.remove());
      void browserFinished.then((h) => h.remove());
    };
  }, [navigate, toast, t]);

  return null;
};

export default OAuthNativeHandler;
