import { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import AppLayout from "@/components/AppLayout";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { toast } from "sonner";
import { THEME_PRESETS } from "@/lib/themePresets";
import { canArtistCustomizeDashboardTheme, notifyPortalThemeUpdated } from "@/lib/shopDashboardTheme";
import { uploadFileToUploads } from "@/lib/uploadStorage";

const ArtistProfileSettingsPage = () => {
  const { t } = useTranslation();
  const { user } = useAuth();
  const navigate = useNavigate();

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [uploadingAvatar, setUploadingAvatar] = useState(false);
  const [uploadingBg, setUploadingBg] = useState(false);
  const [updatingPassword, setUpdatingPassword] = useState(false);

  const [displayName, setDisplayName] = useState("");
  const [avatarUrl, setAvatarUrl] = useState("");
  const [bio, setBio] = useState("");
  const [contactEmail, setContactEmail] = useState("");
  const [contactPhone, setContactPhone] = useState("");
  const [instagram, setInstagram] = useState("");
  const [bgImageUrl, setBgImageUrl] = useState("");
  const [bgColor, setBgColor] = useState("#111827");
  const [canCustomizeTheme, setCanCustomizeTheme] = useState(true);
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");

  const avatarInputRef = useRef<HTMLInputElement | null>(null);
  const bgInputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    void canArtistCustomizeDashboardTheme().then(setCanCustomizeTheme);
  }, []);

  useEffect(() => {
    if (!user) return;
    (async () => {
      const { data, error } = await supabase
        .from("profiles")
        .select(
          "display_name, avatar_url, portal_public_bio, public_contact_email, public_contact_phone, public_instagram, portal_bg_image_url, portal_bg_color",
        )
        .eq("user_id", user.id)
        .maybeSingle();

      if (error) {
        toast.error(error.message || t("artistProfile.loadFailed"));
        setLoading(false);
        return;
      }

      if (data) {
        setDisplayName(data.display_name || "");
        setAvatarUrl(data.avatar_url || "");
        setBio(data.portal_public_bio || "");
        setContactEmail(data.public_contact_email || "");
        setContactPhone(data.public_contact_phone || "");
        setInstagram(data.public_instagram || "");
        setBgImageUrl(data.portal_bg_image_url || "");
        setBgColor(data.portal_bg_color || "#111827");
      }

      setLoading(false);
    })();
  }, [user]);

  const uploadAsset = async (file: File, folder: "avatars" | "artist_portal_bg") => {
    if (!user) return null;
    const ext = file.name.split(".").pop() || "jpg";
    const path = `${folder}/${user.id}-${Date.now()}.${ext}`;
    return uploadFileToUploads(path, file);
  };

  const onAvatarFile = async (file?: File) => {
    if (!file) return;
    setUploadingAvatar(true);
    try {
      const url = await uploadAsset(file, "avatars");
      if (url) setAvatarUrl(url);
      toast.success(t("artistProfile.uploadSuccess"));
    } catch (e: any) {
      toast.error(e?.message || t("artistProfile.uploadFailed"));
    } finally {
      setUploadingAvatar(false);
    }
  };

  const onBgFile = async (file?: File) => {
    if (!file) return;
    setUploadingBg(true);
    try {
      const url = await uploadAsset(file, "artist_portal_bg");
      if (url) setBgImageUrl(url);
      toast.success(t("artistProfile.bgUploadSuccess"));
    } catch (e: any) {
      toast.error(e?.message || t("artistProfile.uploadFailed"));
    } finally {
      setUploadingBg(false);
    }
  };

  const saveProfile = async (markCompleted: boolean) => {
    if (!user) return;
    setSaving(true);

    const payload: Record<string, unknown> = {
      user_id: user.id,
      display_name: displayName.trim() || user.email?.split("@")[0] || "Artist",
      avatar_url: avatarUrl || null,
      portal_public_bio: bio.trim() || null,
      public_contact_email: contactEmail.trim() || null,
      public_contact_phone: contactPhone.trim() || null,
      public_instagram: instagram.trim() || null,
      public_profile_completed: markCompleted ? true : undefined,
    };
    if (canCustomizeTheme) {
      payload.portal_bg_image_url = bgImageUrl || null;
      payload.portal_bg_color = bgColor || null;
    }

    const { error } = await supabase.from("profiles").upsert(payload, { onConflict: "user_id" });
    setSaving(false);
    if (error) {
      toast.error(error.message || t("artistProfile.saveFailed"));
      return;
    }

    toast.success(markCompleted ? t("artistProfile.profileCompleted") : t("artistProfile.profileSaved"));
    if (canCustomizeTheme) notifyPortalThemeUpdated();
    if (markCompleted) navigate("/schedule");
  };

  const updatePassword = async () => {
    if (!newPassword || newPassword.length < 6) {
      toast.error(t("artistProfile.passwordTooShort"));
      return;
    }
    if (newPassword !== confirmPassword) {
      toast.error(t("artistProfile.passwordMismatch"));
      return;
    }

    setUpdatingPassword(true);
    const { error } = await supabase.auth.updateUser({ password: newPassword });
    setUpdatingPassword(false);

    if (error) {
      toast.error(error.message || t("artistProfile.passwordUpdateFailed"));
      return;
    }

    setNewPassword("");
    setConfirmPassword("");
    toast.success(t("artistProfile.passwordUpdated"));
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <p className="text-sm text-muted-foreground">{t("common.loading")}</p>
      </div>
    );
  }

  return (
    <AppLayout>
      <div className="p-4 md:p-6 max-w-3xl mx-auto space-y-4">
        <div>
          <h1 className="font-display text-2xl font-bold">{t("artistProfile.title")}</h1>
          <p className="text-sm text-muted-foreground mt-1">{t("artistProfile.subtitle")}</p>
          <p className="text-xs text-muted-foreground mt-1">{t("artistProfile.revisitHint")}</p>
        </div>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">{t("artistProfile.basicsTitle")}</CardTitle>
            <CardDescription>{t("artistProfile.basicsDesc")}</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex items-center gap-4">
              <Avatar className="h-20 w-20">
                <AvatarImage src={avatarUrl || undefined} />
                <AvatarFallback>{displayName?.charAt(0)?.toUpperCase() || "A"}</AvatarFallback>
              </Avatar>
              <div className="space-y-2">
                <Button variant="outline" onClick={() => avatarInputRef.current?.click()} disabled={uploadingAvatar}>
                  {uploadingAvatar ? t("artistProfile.uploading") : t("artistProfile.uploadPicture")}
                </Button>
                <input
                  ref={avatarInputRef}
                  type="file"
                  accept="image/jpeg,image/png,image/webp"
                  className="hidden"
                  onChange={(e) => void onAvatarFile(e.target.files?.[0])}
                />
              </div>
            </div>

            <div>
              <Label>{t("artistProfile.name")}</Label>
              <Input value={displayName} onChange={(e) => setDisplayName(e.target.value)} className="mt-1" />
            </div>
            <div>
              <Label>{t("artistProfile.description")}</Label>
              <Textarea value={bio} onChange={(e) => setBio(e.target.value)} rows={4} className="mt-1" />
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">{t("artistProfile.contactTitle")}</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <div>
              <Label>{t("artistProfile.contactEmail")}</Label>
              <Input value={contactEmail} onChange={(e) => setContactEmail(e.target.value)} className="mt-1" />
            </div>
            <div>
              <Label>{t("artistProfile.contactPhone")}</Label>
              <Input value={contactPhone} onChange={(e) => setContactPhone(e.target.value)} className="mt-1" />
            </div>
            <div>
              <Label>{t("artistProfile.instagram")}</Label>
              <Input value={instagram} onChange={(e) => setInstagram(e.target.value)} className="mt-1" placeholder={t("artistProfile.instagramPlaceholder")} />
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">{t("artistProfile.securityTitle")}</CardTitle>
            <CardDescription>{t("artistProfile.securityDesc")}</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            <div>
              <Label>{t("artistProfile.newPassword")}</Label>
              <Input
                type="password"
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
                className="mt-1"
                minLength={6}
                placeholder={t("artistProfile.passwordPlaceholder")}
              />
            </div>
            <div>
              <Label>{t("artistProfile.confirmPassword")}</Label>
              <Input
                type="password"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                className="mt-1"
                minLength={6}
                placeholder={t("artistProfile.confirmPlaceholder")}
              />
            </div>
            <Button variant="outline" onClick={() => void updatePassword()} disabled={updatingPassword}>
              {updatingPassword ? t("artistProfile.updating") : t("artistProfile.savePassword")}
            </Button>
          </CardContent>
        </Card>

        {canCustomizeTheme ? (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">{t("artistProfile.themeTitle")}</CardTitle>
            <CardDescription>{t("artistProfile.themeDesc")}</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            <div>
              <Label>{t("artistProfile.presetThemes")}</Label>
              <div className="mt-2 grid grid-cols-2 sm:grid-cols-4 gap-2">
                {THEME_PRESETS.map((preset) => {
                  const active = bgColor.toLowerCase() === preset.bgColor.toLowerCase();
                  return (
                    <button
                      key={preset.key}
                      type="button"
                      onClick={() => setBgColor(preset.bgColor)}
                      className={`rounded-md border p-2 text-left transition ${active ? "border-primary ring-1 ring-primary" : "border-border"}`}
                    >
                      <div className="flex items-center gap-2">
                        <span
                          className="h-4 w-4 rounded-full border border-border"
                          style={{ backgroundColor: preset.bgColor }}
                        />
                        <span className="text-xs font-medium">{preset.label}</span>
                      </div>
                    </button>
                  );
                })}
              </div>
            </div>
            <div>
              <Label>{t("artistProfile.customColor")}</Label>
              <Input type="color" value={bgColor} onChange={(e) => setBgColor(e.target.value)} className="mt-1 h-10 w-24 p-1" />
            </div>
            <div>
              <Label>{t("artistProfile.backgroundImage")}</Label>
              <div className="mt-1 flex items-center gap-2">
                <Button variant="outline" onClick={() => bgInputRef.current?.click()} disabled={uploadingBg}>
                  {uploadingBg ? t("artistProfile.uploading") : t("artistProfile.uploadBackground")}
                </Button>
                <input
                  ref={bgInputRef}
                  type="file"
                  accept="image/jpeg,image/png,image/webp"
                  className="hidden"
                  onChange={(e) => void onBgFile(e.target.files?.[0])}
                />
              </div>
              {bgImageUrl ? <p className="text-xs text-muted-foreground mt-2 break-all">{bgImageUrl}</p> : null}
            </div>
          </CardContent>
        </Card>
        ) : (
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Profile Theme</CardTitle>
              <CardDescription>{t("artistProfile.themeLockedDesc")}</CardDescription>
            </CardHeader>
          </Card>
        )}

        <div className="flex gap-2">
          <Button variant="outline" onClick={() => void saveProfile(false)} disabled={saving}>
            {saving ? t("artistProfile.saving") : t("artistProfile.save")}
          </Button>
          <Button onClick={() => void saveProfile(true)} disabled={saving}>
            {saving ? t("artistProfile.saving") : t("artistProfile.saveContinue")}
          </Button>
        </div>
      </div>
    </AppLayout>
  );
};

export default ArtistProfileSettingsPage;

