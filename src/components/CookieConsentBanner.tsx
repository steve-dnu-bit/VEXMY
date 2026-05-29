import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { getStoredCookieConsent, saveCookieConsent } from "@/lib/cookieConsent";
import { logCookieConsentAudit } from "@/lib/consentAudit";

const CookieConsentBanner = () => {
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
            <p className="text-sm text-foreground">
              We use cookies and similar technologies for core functionality and, with your consent, to improve performance and marketing.
              You can change your choice at any time in Cookie Settings.
            </p>
            <p className="mt-1 text-xs text-muted-foreground">
              Read our <Link to="/privacy" className="underline underline-offset-2">Privacy Notice</Link>,{" "}
              <Link to="/cookies" className="underline underline-offset-2">Cookie Policy</Link>, and{" "}
              <Link to="/terms" className="underline underline-offset-2">Terms</Link>.
            </p>
            <div className="mt-3 flex flex-wrap gap-2">
              <Button size="sm" variant="gold" onClick={handleAcceptAll}>Accept all</Button>
              <Button size="sm" variant="outline" onClick={handleRejectNonEssential}>Reject non-essential</Button>
              <Button size="sm" variant="secondary" onClick={() => setManageOpen(true)}>Manage choices</Button>
            </div>
          </div>
        </div>
      ) : null}

      <Dialog open={manageOpen} onOpenChange={setManageOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Cookie preferences</DialogTitle>
            <DialogDescription>
              Necessary cookies are always active. You can choose whether optional categories are enabled.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="flex items-center justify-between rounded-md border border-border p-3">
              <div>
                <Label className="text-sm">Strictly necessary</Label>
                <p className="text-xs text-muted-foreground">Required for login, security, and core app features.</p>
              </div>
              <Switch checked disabled aria-label="Strictly necessary cookies enabled" />
            </div>
            <div className="flex items-center justify-between rounded-md border border-border p-3">
              <div>
                <Label htmlFor="cookie-pref" className="text-sm">Preferences</Label>
                <p className="text-xs text-muted-foreground">Remember settings and improve your experience.</p>
              </div>
              <Switch id="cookie-pref" checked={preferences} onCheckedChange={setPreferences} />
            </div>
            <div className="flex items-center justify-between rounded-md border border-border p-3">
              <div>
                <Label htmlFor="cookie-analytics" className="text-sm">Analytics</Label>
                <p className="text-xs text-muted-foreground">Help us understand app usage and performance.</p>
              </div>
              <Switch id="cookie-analytics" checked={analytics} onCheckedChange={setAnalytics} />
            </div>
            <div className="flex items-center justify-between rounded-md border border-border p-3">
              <div>
                <Label htmlFor="cookie-marketing" className="text-sm">Marketing</Label>
                <p className="text-xs text-muted-foreground">Personalized promotions and campaign measurement.</p>
              </div>
              <Switch id="cookie-marketing" checked={marketing} onCheckedChange={setMarketing} />
            </div>
            <div className="flex gap-2">
              <Button className="flex-1" onClick={handleSavePreferences}>Save preferences</Button>
              <Button variant="outline" onClick={handleRejectNonEssential}>Reject non-essential</Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
};

export default CookieConsentBanner;
