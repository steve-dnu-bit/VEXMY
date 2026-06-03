import { useEffect, useState } from "react";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { toast } from "@/hooks/use-toast";
import { Bell, Clock, Mail, MessageSquare } from "lucide-react";
import { useTranslation } from "react-i18next";
import {
  defaultShopReminderSettings,
  loadShopReminderSettings,
  saveShopReminderSettings,
  type ShopReminderSettings,
} from "@/lib/shopReminderSettings";

const AdminEmailSettingsPanel = () => {
  const { user } = useAuth();
  const { t } = useTranslation();
  const [settings, setSettings] = useState<ShopReminderSettings>(defaultShopReminderSettings);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [testingEmail, setTestingEmail] = useState(false);

  useEffect(() => {
    let cancelled = false;
    void loadShopReminderSettings().then((loaded) => {
      if (!cancelled) {
        setSettings(loaded);
        setLoading(false);
      }
    });
    return () => {
      cancelled = true;
    };
  }, []);

  const update = <K extends keyof ShopReminderSettings>(key: K, value: ShopReminderSettings[K]) => {
    setSettings((prev) => ({ ...prev, [key]: value }));
  };

  const saveSettings = async () => {
    setSaving(true);
    const { error } = await saveShopReminderSettings(settings);
    setSaving(false);
    if (error) {
      toast({ title: t("settings.saveFailed"), description: error, variant: "destructive" });
      return;
    }
    toast({ title: t("settings.settingsSaved"), description: t("admin.emailSettingsSavedDesc") });
  };

  const sendTestEmail = async () => {
    if (!user?.email) {
      toast({ title: t("settings.noEmail"), description: t("settings.noEmailDesc"), variant: "destructive" });
      return;
    }
    setTestingEmail(true);
    try {
      const {
        data: { session },
        error: sessionError,
      } = await supabase.auth.getSession();
      const token = session?.access_token;
      if (sessionError || !token) {
        toast({ title: t("settings.sessionExpired"), description: t("settings.sessionExpiredDesc"), variant: "destructive" });
        return;
      }
      const { data, error } = await supabase.functions.invoke("send-test-email", {
        body: { to: user.email },
        headers: { Authorization: `Bearer ${token}` },
      });
      if (error) {
        toast({ title: t("settings.emailTestFailed"), description: error.message, variant: "destructive" });
        return;
      }
      const result = data as {
        ok?: boolean;
        error?: string;
        hint?: string;
        provider?: string;
        message?: string;
      };
      if (!result?.ok) {
        toast({
          title: "Email not configured",
          description: [result?.error, result?.hint].filter(Boolean).join(" — ") || "Set RESEND_API_KEY in Supabase secrets.",
          variant: "destructive",
        });
        return;
      }
      toast({
        title: "Test email sent",
        description: result.message || `Sent via ${result.provider || "email"}. Check inbox and junk.`,
      });
    } finally {
      setTestingEmail(false);
    }
  };

  if (loading) {
    return <p className="text-sm text-muted-foreground">{t("common.loading")}</p>;
  }

  return (
    <div className="space-y-4">
      <p className="text-sm text-muted-foreground">{t("admin.emailSettingsIntro")}</p>

      <Card className="bg-card border-border">
        <CardHeader className="pb-3">
          <div className="flex items-center gap-2">
            <Mail className="h-5 w-5 text-primary" />
            <CardTitle className="text-base">{t("settings.bookingConfirmations")}</CardTitle>
          </div>
          <CardDescription>{t("settings.bookingConfirmationsDesc")}</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-center justify-between">
            <Label htmlFor="admin-booking-confirm">{t("settings.enableBookingConfirmations")}</Label>
            <Switch
              id="admin-booking-confirm"
              checked={settings.bookingConfirmation}
              onCheckedChange={(v) => update("bookingConfirmation", v)}
            />
          </div>
          <div className="rounded-lg border border-border p-3 space-y-2">
            <p className="text-xs text-muted-foreground">
              {t("settings.testEmailHint", { email: user?.email || t("common.email") })}
            </p>
            <Button type="button" variant="outline" size="sm" onClick={sendTestEmail} disabled={testingEmail}>
              {testingEmail ? t("settings.saving") : t("settings.sendTestEmail")}
            </Button>
          </div>
        </CardContent>
      </Card>

      <Card className="bg-card border-border">
        <CardHeader className="pb-3">
          <div className="flex items-center gap-2">
            <Bell className="h-5 w-5 text-primary" />
            <CardTitle className="text-base">{t("settings.depositReminders")}</CardTitle>
          </div>
          <CardDescription>{t("settings.depositRemindersDesc")}</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <p className="text-xs text-muted-foreground">{t("settings.depositRemindersNote")}</p>
          <div className="flex items-center justify-between">
            <Label htmlFor="admin-deposit-reminder">{t("settings.enableDepositReminders")}</Label>
            <Switch
              id="admin-deposit-reminder"
              checked={settings.depositReminder}
              onCheckedChange={(v) => update("depositReminder", v)}
            />
          </div>
          {settings.depositReminder && (
            <div className="flex items-center justify-between">
              <Label>{t("settings.sendReminder")}</Label>
              <Select value={settings.depositReminderTiming} onValueChange={(v) => update("depositReminderTiming", v)}>
                <SelectTrigger className="w-48 bg-secondary border-border">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="12h">{t("settings.timing12h")}</SelectItem>
                  <SelectItem value="24h">{t("settings.timing24h")}</SelectItem>
                  <SelectItem value="48h">{t("settings.timing48h")}</SelectItem>
                  <SelectItem value="72h">{t("settings.timing72h")}</SelectItem>
                  <SelectItem value="1w">{t("settings.timing1w")}</SelectItem>
                </SelectContent>
              </Select>
            </div>
          )}
        </CardContent>
      </Card>

      <Card className="bg-card border-border">
        <CardHeader className="pb-3">
          <div className="flex items-center gap-2">
            <Clock className="h-5 w-5 text-primary" />
            <CardTitle className="text-base">{t("settings.appointmentReminders")}</CardTitle>
          </div>
          <CardDescription>{t("settings.appointmentRemindersDesc")}</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-center justify-between">
            <Label htmlFor="admin-appt-reminder">{t("settings.enableAppointmentReminders")}</Label>
            <Switch
              id="admin-appt-reminder"
              checked={settings.appointmentReminder}
              onCheckedChange={(v) => update("appointmentReminder", v)}
            />
          </div>
          {settings.appointmentReminder && (
            <div className="flex items-center justify-between">
              <Label>{t("settings.sendReminder")}</Label>
              <Select
                value={settings.appointmentReminderTiming}
                onValueChange={(v) => update("appointmentReminderTiming", v)}
              >
                <SelectTrigger className="w-48 bg-secondary border-border">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="1h">{t("settings.timing1h")}</SelectItem>
                  <SelectItem value="3h">{t("settings.timing3h")}</SelectItem>
                  <SelectItem value="12h">{t("settings.timing12h")}</SelectItem>
                  <SelectItem value="24h">{t("settings.timing24h")}</SelectItem>
                  <SelectItem value="48h">{t("settings.timing48h")}</SelectItem>
                </SelectContent>
              </Select>
            </div>
          )}
        </CardContent>
      </Card>

      <Card className="bg-card border-border">
        <CardHeader className="pb-3">
          <div className="flex items-center gap-2">
            <MessageSquare className="h-5 w-5 text-primary" />
            <CardTitle className="text-base">{t("settings.notificationChannel")}</CardTitle>
          </div>
          <CardDescription>{t("settings.notificationChannelDesc")}</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex items-center justify-between">
            <Label>{t("settings.sendVia")}</Label>
            <Select value={settings.reminderChannel} onValueChange={(v) => update("reminderChannel", v)}>
              <SelectTrigger className="w-48 bg-secondary border-border">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="email">{t("settings.emailOnly")}</SelectItem>
                <SelectItem value="sms">{t("settings.smsOnly")}</SelectItem>
                <SelectItem value="both">{t("settings.emailAndSms")}</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </CardContent>
      </Card>

      <Button onClick={saveSettings} disabled={saving} className="w-full max-w-md">
        {saving ? t("settings.saving") : t("settings.saveSettings")}
      </Button>
    </div>
  );
};

export default AdminEmailSettingsPanel;
