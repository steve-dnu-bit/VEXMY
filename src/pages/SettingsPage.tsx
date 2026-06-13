import React, { useState, useEffect, useRef } from "react";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";
import AppLayout from "@/components/AppLayout";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { toast } from "@/hooks/use-toast";
import { Camera, FileSignature, Copy, ExternalLink, Palette, Moon, Sun } from "lucide-react";
import { Link } from "react-router-dom";
import { format } from "date-fns";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import MFAEnrollment from "@/components/auth/MFAEnrollment";
import LanguageSelector from "@/components/i18n/LanguageSelector";
import { useThemePreference } from "@/components/theme/ThemeProvider";
import { useTranslation } from "react-i18next";
import { canArtistCustomizeDashboardTheme } from "@/lib/shopDashboardTheme";

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
  const [avatarUrl, setAvatarUrl] = useState<string | null>(null);
  const [uploadingAvatar, setUploadingAvatar] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [consentRows, setConsentRows] = useState<Array<{ id: string; full_name: string; email: string | null; created_at: string; consent_pdf_url: string | null }>>([]);
  const [canCustomizeTheme, setCanCustomizeTheme] = useState(true);

  useEffect(() => {
    void canArtistCustomizeDashboardTheme().then(setCanCustomizeTheme);
  }, []);

  useEffect(() => {
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
    toast({ title: t("settings.linkCopied"), description: t("settings.linkCopiedDesc") });
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
      toast({ title: t("settings.profileUpdated") });
    } catch (err: any) {
      toast({ title: t("settings.uploadFailed"), description: err.message, variant: "destructive" });
    } finally {
      setUploadingAvatar(false);
    }
  };

  return (
    <AppLayout>
      <div className="p-4 md:p-6 max-w-2xl">
        <div className="mb-6">
          <h1 className="font-display text-2xl font-bold">
            <span className="text-gold">{t("settings.title")}</span>
          </h1>
          <p className="text-sm text-muted-foreground">{t("settings.subtitle")}</p>
        </div>

        <div className="space-y-6">
          <Card className="bg-card border-border">
            <CardContent className="pt-6">
              <LanguageSelector />
            </CardContent>
          </Card>

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
                <CardTitle className="text-base">{t("settings.profilePicture")}</CardTitle>
              </div>
              <CardDescription>{t("settings.profilePictureDesc")}</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="flex items-center gap-4">
                <Avatar className="h-16 w-16 cursor-pointer" onClick={() => fileInputRef.current?.click()}>
                  <AvatarImage src={avatarUrl || undefined} />
                  <AvatarFallback className="text-lg font-bold">{user?.email?.charAt(0).toUpperCase()}</AvatarFallback>
                </Avatar>
                <div className="space-y-1">
                  <Button variant="outline" size="sm" disabled={uploadingAvatar} onClick={() => fileInputRef.current?.click()}>
                    {uploadingAvatar ? t("settings.uploading") : t("settings.changePhoto")}
                  </Button>
                  <p className="text-[10px] text-muted-foreground">{t("settings.photoFormats")}</p>
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
                <CardTitle className="text-base">{t("settings.artistProfileTitle")}</CardTitle>
              </div>
              <CardDescription>{t("settings.artistProfileDesc")}</CardDescription>
            </CardHeader>
            <CardContent className="space-y-2">
              {!canCustomizeTheme ? (
                <p className="text-xs text-muted-foreground">{t("settings.artistProfileShopThemeNote")}</p>
              ) : null}
              <Button asChild variant="outline">
                <Link to="/artist-profile-settings">{t("settings.openProfileCustomization")}</Link>
              </Button>
            </CardContent>
          </Card>

          <Card className="bg-card border-border">
            <CardHeader className="pb-3">
              <CardTitle className="text-base">{t("settings.appTheme")}</CardTitle>
              <CardDescription>{t("settings.appThemeDesc")}</CardDescription>
            </CardHeader>
            <CardContent className="flex gap-2">
              <Button
                type="button"
                variant={theme === "dark" ? "default" : "outline"}
                className="gap-2"
                onClick={() => void setTheme("dark")}
              >
                <Moon className="h-4 w-4" />
                {t("common.dark")}
              </Button>
              <Button
                type="button"
                variant={theme === "light" ? "default" : "outline"}
                className="gap-2"
                onClick={() => void setTheme("light")}
              >
                <Sun className="h-4 w-4" />
                {t("common.light")}
              </Button>
            </CardContent>
          </Card>

          <Card className="bg-card border-border">
            <CardHeader className="pb-3">
              <div className="flex items-center gap-2">
                <FileSignature className="h-5 w-5 text-teal-500" />
                <CardTitle className="text-base">{t("settings.consentFormTitle")}</CardTitle>
              </div>
              <CardDescription>{t("settings.consentFormDesc")}</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <p className="text-xs text-muted-foreground rounded-lg border border-amber-500/30 bg-amber-500/5 px-3 py-2.5">
                {t("settings.consentHandSignNotice")}
              </p>
              <div className="flex flex-col sm:flex-row gap-2">
                <Input readOnly value={consentUrl} className="font-mono text-xs bg-secondary border-border" />
                <div className="flex gap-2 shrink-0">
                  <Button type="button" variant="outline" size="sm" onClick={copyConsentLink} className="gap-1">
                    <Copy className="h-4 w-4" /> {t("settings.copy")}
                  </Button>
                  <Button type="button" variant="outline" size="sm" asChild className="gap-1">
                    <a href="/consent" target="_blank" rel="noopener noreferrer">
                      <ExternalLink className="h-4 w-4" /> {t("settings.open")}
                    </a>
                  </Button>
                </div>
              </div>
              <p className="text-xs text-muted-foreground">{t("settings.consentMigrationHint")}</p>
              {consentRows.length > 0 ? (
                <ul className="rounded-lg border border-border divide-y divide-border max-h-48 overflow-y-auto text-sm">
                  {consentRows.map((r) => (
                    <li key={r.id} className="px-3 py-2 flex justify-between gap-2">
                      <div className="min-w-0">
                        <p className="font-medium truncate">{r.full_name}</p>
                        {r.consent_pdf_url ? (
                          <a href={r.consent_pdf_url} target="_blank" rel="noreferrer" className="text-[11px] text-primary hover:underline">
                            {t("settings.openPdf")}
                          </a>
                        ) : (
                          <p className="text-[11px] text-muted-foreground">{t("settings.noPdf")}</p>
                        )}
                      </div>
                      <span className="text-muted-foreground text-xs shrink-0">{format(new Date(r.created_at), "d MMM yyyy, HH:mm")}</span>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="text-xs text-muted-foreground">{t("settings.noConsentYet")}</p>
              )}
            </CardContent>
          </Card>

        </div>
      </div>
    </AppLayout>
  );
};

export default SettingsPage;
