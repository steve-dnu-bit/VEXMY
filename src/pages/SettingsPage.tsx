import React, { useState, useEffect, useRef } from "react";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";
import AppLayout from "@/components/AppLayout";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { toast } from "@/hooks/use-toast";
import { Bell, Clock, Mail, MessageSquare, Camera, FileSignature, Copy, ExternalLink, Palette, Moon, Sun } from "lucide-react";
import { Link } from "react-router-dom";
import { format } from "date-fns";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import MFAEnrollment from "@/components/auth/MFAEnrollment";
import SubscriptionSettingsCard from "@/components/subscription/SubscriptionSettingsCard";
import LanguageSelector from "@/components/i18n/LanguageSelector";
import { useThemePreference } from "@/components/theme/ThemeProvider";
import { useTranslation } from "react-i18next";

interface ReminderSettings {
  bookingConfirmation: boolean;
  depositReminder: boolean;
  appointmentReminder: boolean;
  depositReminderTiming: string;
  appointmentReminderTiming: string;
  reminderChannel: string;
}

const defaultSettings: ReminderSettings = {
  bookingConfirmation: true,
  depositReminder: false,
  appointmentReminder: false,
  depositReminderTiming: "24h",
  appointmentReminderTiming: "24h",
  reminderChannel: "email",
};

class SectionErrorBoundary extends React.Component<
  { title: string; children: React.ReactNode },
  { hasError: boolean }
> {
  constructor(props: { title: string; children: React.ReactNode }) {
    super(props);
    this.state = { hasError: false };
  }
  static getDerivedStateFromError() {
    return { hasError: true };
  }
  render() {
    if (this.state.hasError) {
      return (
        <Card className="bg-card border-border">
          <CardHeader className="pb-3">
            <CardTitle className="text-base">{this.props.title}</CardTitle>
            <CardDescription>This section could not load right now.</CardDescription>
          </CardHeader>
        </Card>
      );
    }
    return this.props.children;
  }
}

const SettingsPage = () => {
  const { user } = useAuth();
  const { t } = useTranslation();
  const { theme, setTheme } = useThemePreference();
  const [settings, setSettings] = useState<ReminderSettings>(defaultSettings);
  const [saving, setSaving] = useState(false);
  const [testingEmail, setTestingEmail] = useState(false);
  const [avatarUrl, setAvatarUrl] = useState<string | null>(null);
  const [uploadingAvatar, setUploadingAvatar] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [consentRows, setConsentRows] = useState<Array<{ id: string; full_name: string; email: string | null; created_at: string; consent_pdf_url: string | null }>>([]);

  useEffect(() => {
    if (user) {
      supabase
        .from("reminder_settings" as any)
        .select(
          "booking_confirmation, deposit_reminder, appointment_reminder, deposit_reminder_timing, appointment_reminder_timing, reminder_channel",
        )
        .eq("user_id", user.id)
        .maybeSingle()
        .then(({ data, error }) => {
          if (error || !data) return;
          setSettings({
            bookingConfirmation: !!data.booking_confirmation,
            depositReminder: !!data.deposit_reminder,
            appointmentReminder: !!data.appointment_reminder,
            depositReminderTiming: data.deposit_reminder_timing || "24h",
            appointmentReminderTiming: data.appointment_reminder_timing || "24h",
            reminderChannel: data.reminder_channel || "email",
          });
        });
    }
    // Load avatar
    if (user) {
      supabase.from("profiles").select("avatar_url").eq("user_id", user.id).single().then(({ data }) => {
        if (data?.avatar_url) setAvatarUrl(data.avatar_url);
      });
      (async () => {
        const { data: roleRows } = await supabase.from("user_roles").select("role").eq("user_id", user.id);
        const isAdmin = (roleRows || []).some((r) => r.role === "admin");
        const query = supabase
          .from("consent_signatures")
          .select("id, full_name, email, created_at, consent_pdf_url")
          .order("created_at", { ascending: false })
          .limit(200);
        const { data } = isAdmin ? await query : await query.eq("artist_id", user.id);
        if (data) setConsentRows(data as any);
      })();
    }
  }, [user]);

  const consentUrl = typeof window !== "undefined" ? `${window.location.origin}/consent` : "/consent";
  const copyConsentLink = () => {
    void navigator.clipboard.writeText(consentUrl);
    toast({ title: "Link copied", description: "Share this URL with clients before their appointment." });
  };

  const saveSettings = async () => {
    if (!user) return;
    setSaving(true);
    const { error } = await supabase.from("reminder_settings" as any).upsert(
      {
        user_id: user.id,
        booking_confirmation: settings.bookingConfirmation,
        deposit_reminder: settings.depositReminder,
        appointment_reminder: settings.appointmentReminder,
        deposit_reminder_timing: settings.depositReminderTiming,
        appointment_reminder_timing: settings.appointmentReminderTiming,
        reminder_channel: settings.reminderChannel,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "user_id" },
    );
    setSaving(false);
    if (error) {
      toast({ title: "Save failed", description: error.message, variant: "destructive" });
      return;
    }
    toast({ title: "Settings saved", description: "Reminder preferences are now stored server-side." });
  };

  const sendTestEmail = async () => {
    if (!user?.email) {
      toast({ title: "No email on account", description: "Sign in with an email address to run the test.", variant: "destructive" });
      return;
    }
    setTestingEmail(true);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const token = session?.access_token;
      if (!token) {
        toast({ title: "Session expired", description: "Sign in again and retry.", variant: "destructive" });
        return;
      }
      const { data, error } = await supabase.functions.invoke("send-test-email", {
        body: { to: user.email },
        headers: { Authorization: `Bearer ${token}` },
      });
      if (error) {
        toast({ title: "Email test failed", description: error.message, variant: "destructive" });
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

  const update = <K extends keyof ReminderSettings>(key: K, value: ReminderSettings[K]) => {
    setSettings((prev) => ({ ...prev, [key]: value }));
  };

  const handleAvatarUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !user) return;
    setUploadingAvatar(true);
    try {
      const ext = file.name.split(".").pop();
      const path = `avatars/${user.id}-${Date.now()}.${ext}`;
      const { error: uploadError } = await supabase.storage.from("uploads").upload(path, file);
      if (uploadError) throw uploadError;
      const { data: urlData } = supabase.storage.from("uploads").getPublicUrl(path);
      const publicUrl = `${urlData.publicUrl}?t=${Date.now()}`;
      const { error: updateError } = await supabase.from("profiles").update({ avatar_url: publicUrl }).eq("user_id", user.id);
      if (updateError) throw updateError;
      setAvatarUrl(publicUrl);
      toast({ title: "Profile picture updated" });
    } catch (err: any) {
      toast({ title: "Upload failed", description: err.message, variant: "destructive" });
    } finally {
      setUploadingAvatar(false);
    }
  };

  return (
    <AppLayout>
      <div className="p-4 md:p-6 max-w-2xl">
        <div className="mb-6">
          <h1 className="font-display text-2xl font-bold">
            <span className="text-gradient-gold">{t("settings.title")}</span>
          </h1>
          <p className="text-sm text-muted-foreground">{t("settings.subtitle")}</p>
        </div>

        <div className="space-y-6">
          <Card className="bg-card border-border">
            <CardContent className="pt-6">
              <LanguageSelector />
            </CardContent>
          </Card>

          <SectionErrorBoundary title="Subscription">
            <SubscriptionSettingsCard />
          </SectionErrorBoundary>

          <Card className="bg-card border-border">
            <CardHeader className="pb-3">
              <CardTitle className="text-base">{t("settings.quickSettings")}</CardTitle>
              <CardDescription>{t("settings.quickSettingsDesc")}</CardDescription>
            </CardHeader>
            <CardContent className="flex flex-wrap gap-2">
              <Button asChild variant="outline">
                <Link to="/artist-profile-settings">{t("settings.openProfileCustomization")}</Link>
              </Button>
              <Button asChild variant="outline">
                <a href="/consent" target="_blank" rel="noopener noreferrer">{t("settings.openConsentPage")}</a>
              </Button>
            </CardContent>
          </Card>

          {/* Profile Picture */}
          <Card className="bg-card border-border">
            <CardHeader className="pb-3">
              <div className="flex items-center gap-2">
                <Camera className="h-5 w-5 text-primary" />
                <CardTitle className="text-base">Profile Picture</CardTitle>
              </div>
              <CardDescription>Upload a photo so your team can recognise you on the schedule</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="flex items-center gap-4">
                <Avatar className="h-16 w-16 cursor-pointer" onClick={() => fileInputRef.current?.click()}>
                  <AvatarImage src={avatarUrl || undefined} />
                  <AvatarFallback className="text-lg font-bold">{user?.email?.charAt(0).toUpperCase()}</AvatarFallback>
                </Avatar>
                <div className="space-y-1">
                  <Button variant="outline" size="sm" disabled={uploadingAvatar} onClick={() => fileInputRef.current?.click()}>
                    {uploadingAvatar ? "Uploading..." : "Change photo"}
                  </Button>
                  <p className="text-[10px] text-muted-foreground">JPG, PNG or WebP. Max 2 MB.</p>
                </div>
                <input
                  ref={fileInputRef}
                  type="file"
                  accept="image/jpeg,image/png,image/webp"
                  className="hidden"
                  onChange={handleAvatarUpload}
                />
              </div>
            </CardContent>
          </Card>

          {/* MFA / Two-Factor Authentication */}
          <SectionErrorBoundary title="Two-Factor Authentication">
            <MFAEnrollment />
          </SectionErrorBoundary>

          <Card className="bg-card border-border">
            <CardHeader className="pb-3">
              <div className="flex items-center gap-2">
                <Palette className="h-5 w-5 text-primary" />
                <CardTitle className="text-base">Artist profile customization</CardTitle>
              </div>
              <CardDescription>
                Update your public profile details, theme colors, profile photo and background image.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <Button asChild variant="outline">
                <Link to="/artist-profile-settings">Open profile customization</Link>
              </Button>
            </CardContent>
          </Card>

          <Card className="bg-card border-border">
            <CardHeader className="pb-3">
              <CardTitle className="text-base">App theme</CardTitle>
              <CardDescription>Choose your preferred app appearance. Your artist profile customization remains unchanged.</CardDescription>
            </CardHeader>
            <CardContent className="flex gap-2">
              <Button
                type="button"
                variant={theme === "dark" ? "default" : "outline"}
                className="gap-2"
                onClick={() => void setTheme("dark")}
              >
                <Moon className="h-4 w-4" />
                Dark
              </Button>
              <Button
                type="button"
                variant={theme === "light" ? "default" : "outline"}
                className="gap-2"
                onClick={() => void setTheme("light")}
              >
                <Sun className="h-4 w-4" />
                Light
              </Button>
            </CardContent>
          </Card>

          <Card className="bg-card border-border">
            <CardHeader className="pb-3">
              <div className="flex items-center gap-2">
                <FileSignature className="h-5 w-5 text-teal-500" />
                <CardTitle className="text-base">Client consent form</CardTitle>
              </div>
              <CardDescription>Clients open this page to read and sign your waiver (no login required).</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex flex-col sm:flex-row gap-2">
                <Input readOnly value={consentUrl} className="font-mono text-xs bg-secondary border-border" />
                <div className="flex gap-2 shrink-0">
                  <Button type="button" variant="outline" size="sm" onClick={copyConsentLink} className="gap-1">
                    <Copy className="h-4 w-4" /> Copy
                  </Button>
                  <Button type="button" variant="outline" size="sm" asChild className="gap-1">
                    <a href="/consent" target="_blank" rel="noopener noreferrer">
                      <ExternalLink className="h-4 w-4" /> Open
                    </a>
                  </Button>
                </div>
              </div>
              <p className="text-xs text-muted-foreground">
                Run the latest Supabase migration if submissions fail. Recent signatures appear below.
              </p>
              {consentRows.length > 0 ? (
                <ul className="rounded-lg border border-border divide-y divide-border max-h-48 overflow-y-auto text-sm">
                  {consentRows.map((r) => (
                    <li key={r.id} className="px-3 py-2 flex justify-between gap-2">
                      <div className="min-w-0">
                        <p className="font-medium truncate">{r.full_name}</p>
                        {r.consent_pdf_url ? (
                          <a href={r.consent_pdf_url} target="_blank" rel="noreferrer" className="text-[11px] text-primary hover:underline">
                            Open PDF
                          </a>
                        ) : (
                          <p className="text-[11px] text-muted-foreground">No PDF</p>
                        )}
                      </div>
                      <span className="text-muted-foreground text-xs shrink-0">{format(new Date(r.created_at), "d MMM yyyy, HH:mm")}</span>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="text-xs text-muted-foreground">No consent submissions yet.</p>
              )}
            </CardContent>
          </Card>

          {/* Booking Confirmations */}
          <Card className="bg-card border-border">
            <CardHeader className="pb-3">
              <div className="flex items-center gap-2">
                <Mail className="h-5 w-5 text-primary" />
                <CardTitle className="text-base">Booking Confirmations</CardTitle>
              </div>
              <CardDescription>Automatically send a confirmation when a new booking is created</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex items-center justify-between">
                <Label htmlFor="booking-confirm">Enable booking confirmations</Label>
                <Switch
                  id="booking-confirm"
                  checked={settings.bookingConfirmation}
                  onCheckedChange={(v) => update("bookingConfirmation", v)}
                />
              </div>
              <div className="rounded-lg border border-border p-3 space-y-2">
                <p className="text-xs text-muted-foreground">
                  Send a test email to <strong>{user?.email || "your account email"}</strong> to verify Resend/SMTP secrets on Supabase.
                </p>
                <Button type="button" variant="outline" size="sm" onClick={sendTestEmail} disabled={testingEmail}>
                  {testingEmail ? "Sending…" : "Send test email"}
                </Button>
              </div>
            </CardContent>
          </Card>

          {/* Deposit Reminders */}
          <Card className="bg-card border-border">
            <CardHeader className="pb-3">
              <div className="flex items-center gap-2">
                <Bell className="h-5 w-5 text-primary" />
                <CardTitle className="text-base">Deposit Reminders</CardTitle>
              </div>
              <CardDescription>Send reminders for unpaid deposits before tattoo and other appointments</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <p className="text-xs text-muted-foreground">
                Automatic deposit reminders are not sent for piercing bookings. You can still send one manually from a booking or the Deposits page.
              </p>
              <div className="flex items-center justify-between">
                <Label htmlFor="deposit-reminder">Enable deposit reminders</Label>
                <Switch
                  id="deposit-reminder"
                  checked={settings.depositReminder}
                  onCheckedChange={(v) => update("depositReminder", v)}
                />
              </div>
              {settings.depositReminder && (
                <div className="flex items-center justify-between">
                  <Label>Send reminder</Label>
                  <Select value={settings.depositReminderTiming} onValueChange={(v) => update("depositReminderTiming", v)}>
                    <SelectTrigger className="w-48 bg-secondary border-border">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="12h">12 hours before</SelectItem>
                      <SelectItem value="24h">24 hours before</SelectItem>
                      <SelectItem value="48h">48 hours before</SelectItem>
                      <SelectItem value="72h">72 hours before</SelectItem>
                      <SelectItem value="1w">1 week before</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              )}
            </CardContent>
          </Card>

          {/* Appointment Reminders */}
          <Card className="bg-card border-border">
            <CardHeader className="pb-3">
              <div className="flex items-center gap-2">
                <Clock className="h-5 w-5 text-primary" />
                <CardTitle className="text-base">Appointment Reminders</CardTitle>
              </div>
              <CardDescription>Send reminders to clients before their scheduled appointments</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex items-center justify-between">
                <Label htmlFor="appt-reminder">Enable appointment reminders</Label>
                <Switch
                  id="appt-reminder"
                  checked={settings.appointmentReminder}
                  onCheckedChange={(v) => update("appointmentReminder", v)}
                />
              </div>
              {settings.appointmentReminder && (
                <div className="flex items-center justify-between">
                  <Label>Send reminder</Label>
                  <Select value={settings.appointmentReminderTiming} onValueChange={(v) => update("appointmentReminderTiming", v)}>
                    <SelectTrigger className="w-48 bg-secondary border-border">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="1h">1 hour before</SelectItem>
                      <SelectItem value="3h">3 hours before</SelectItem>
                      <SelectItem value="12h">12 hours before</SelectItem>
                      <SelectItem value="24h">24 hours before</SelectItem>
                      <SelectItem value="48h">48 hours before</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              )}
            </CardContent>
          </Card>

          {/* Channel preference */}
          <Card className="bg-card border-border">
            <CardHeader className="pb-3">
              <div className="flex items-center gap-2">
                <MessageSquare className="h-5 w-5 text-primary" />
                <CardTitle className="text-base">Notification Channel</CardTitle>
              </div>
              <CardDescription>Choose how reminders are sent to clients</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="flex items-center justify-between">
                <Label>Send via</Label>
                <Select value={settings.reminderChannel} onValueChange={(v) => update("reminderChannel", v)}>
                  <SelectTrigger className="w-48 bg-secondary border-border">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="email">Email only</SelectItem>
                    <SelectItem value="sms">SMS only</SelectItem>
                    <SelectItem value="both">Email & SMS</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </CardContent>
          </Card>

          <Button onClick={saveSettings} disabled={saving} className="w-full">
            {saving ? "Saving..." : "Save Settings"}
          </Button>
        </div>
      </div>
    </AppLayout>
  );
};

export default SettingsPage;
