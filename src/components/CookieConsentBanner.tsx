import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { getStoredCookieConsent, saveCookieConsent } from "@/lib/cookieConsent";
import { logCookieConsentAudit } from "@/lib/consentAudit";

const CookieConsentBanner = () => {
  const { t } = useTranslation();
  const [visible, setVisible] = useState(false);
  const [manageOpen, setManageOpen] = useState(false);
  const [preferences, setPreferences] = useState(false);
  const [analytics, setAnalytics] = useState(false);
  const [marketing, setMarketing] = useState(false);

  useEffect(() => {
    const consent = getStoredCookieConsent();
    if (!consent) {
      setVisible(true);
      return;
    }
    setPreferences(consent.preferences);
    setAnalytics(consent.analytics);
    setMarketing(consent.marketing);
  }, []);

  useEffect(() => {
    const handleOpen = () => {
      const consent = getStoredCookieConsent();
      if (consent) {
        setPreferences(consent.preferences);
        setAnalytics(consent.analytics);
        setMarketing(consent.marketing);
      }
      setManageOpen(true);
    };
    window.addEventListener("cookie-consent:open", handleOpen);
    return () => window.removeEventListener("cookie-consent:open", handleOpen);
  }, []);

  const handleAcceptAll = () => {
    const consent = saveCookieConsent({
      method: "accept_all",
      preferences: true,
      analytics: true,
      marketing: true,
    });
    void logCookieConsentAudit(consent);
    setVisible(false);
  };

  const handleRejectNonEssential = () => {
    const consent = saveCookieConsent({
      method: "reject_non_essential",
      preferences: false,
      analytics: false,
      marketing: false,
    });
    void logCookieConsentAudit(consent);
    setManageOpen(false);
    setVisible(false);
  };

  const handleSavePreferences = () => {
    const consent = saveCookieConsent({
      method: "customize",
      preferences,
      analytics,
      marketing,
    });
    void logCookieConsentAudit(consent);
    setManageOpen(false);
    setVisible(false);
  };

  return (
    <>
      {visible ? (
        <div className="fixed inset-x-0 bottom-0 z-[80] border-t border-border bg-card/95 backdrop-blur supports-[backdrop-filter]:bg-card/85">
          <div className="mx-auto max-w-5xl px-4 py-3">
            <p className="text-sm text-foreground">{t("cookies.bannerText")}</p>
            <p className="mt-1 text-xs text-muted-foreground">
              {t("cookies.readOur")}{" "}
              <Link to="/privacy" className="underline underline-offset-2">{t("auth.privacyNotice")}</Link>,{" "}
              <Link to="/cookies" className="underline underline-offset-2">{t("auth.cookiePolicy")}</Link>, {t("common.and")}{" "}
              <Link to="/terms" className="underline underline-offset-2">{t("common.terms")}</Link>.
            </p>
            <div className="mt-3 flex flex-wrap gap-2">
              <Button size="sm" variant="gold" onClick={handleAcceptAll}>{t("cookies.acceptAll")}</Button>
              <Button size="sm" variant="outline" onClick={handleRejectNonEssential}>{t("cookies.rejectNonEssential")}</Button>
              <Button size="sm" variant="secondary" onClick={() => setManageOpen(true)}>{t("cookies.manageChoices")}</Button>
            </div>
          </div>
        </div>
      ) : null}

      <Dialog open={manageOpen} onOpenChange={setManageOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t("cookies.preferencesTitle")}</DialogTitle>
            <DialogDescription>{t("cookies.preferencesDesc")}</DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="flex items-center justify-between rounded-md border border-border p-3">
              <div>
                <Label className="text-sm">{t("cookies.strictlyNecessary")}</Label>
                <p className="text-xs text-muted-foreground">{t("cookies.strictlyNecessaryDesc")}</p>
              </div>
              <Switch checked disabled aria-label={t("cookies.strictlyNecessary")} />
            </div>
            <div className="flex items-center justify-between rounded-md border border-border p-3">
              <div>
                <Label htmlFor="cookie-pref" className="text-sm">{t("cookies.preferences")}</Label>
                <p className="text-xs text-muted-foreground">{t("cookies.preferencesDesc")}</p>
              </div>
              <Switch id="cookie-pref" checked={preferences} onCheckedChange={setPreferences} />
            </div>
            <div className="flex items-center justify-between rounded-md border border-border p-3">
              <div>
                <Label htmlFor="cookie-analytics" className="text-sm">{t("cookies.analytics")}</Label>
                <p className="text-xs text-muted-foreground">{t("cookies.analyticsDesc")}</p>
              </div>
              <Switch id="cookie-analytics" checked={analytics} onCheckedChange={setAnalytics} />
            </div>
            <div className="flex items-center justify-between rounded-md border border-border p-3">
              <div>
                <Label htmlFor="cookie-marketing" className="text-sm">{t("cookies.marketing")}</Label>
                <p className="text-xs text-muted-foreground">{t("cookies.marketingDesc")}</p>
              </div>
              <Switch id="cookie-marketing" checked={marketing} onCheckedChange={setMarketing} />
            </div>
            <div className="flex gap-2">
              <Button className="flex-1" onClick={handleSavePreferences}>{t("cookies.savePreferences")}</Button>
              <Button variant="outline" onClick={handleRejectNonEssential}>{t("cookies.rejectNonEssential")}</Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
};

export default CookieConsentBanner;
