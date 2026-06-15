import { useEffect, useRef, useState } from "react";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "@/hooks/use-toast";
import { LayoutDashboard } from "lucide-react";
import { useTranslation } from "react-i18next";
import { THEME_PRESETS } from "@/lib/themePresets";
import {
  defaultShopDashboardThemeSettings,
  loadShopDashboardThemeSettings,
  saveShopDashboardThemeSettings,
  type DashboardThemeMode,
  type ShopDashboardThemeSettings,
} from "@/lib/shopDashboardTheme";

const AdminDashboardThemePanel = () => {
  const { user } = useAuth();
  const { t } = useTranslation();
  const [settings, setSettings] = useState<ShopDashboardThemeSettings>(defaultShopDashboardThemeSettings);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [uploadingBg, setUploadingBg] = useState(false);
  const bgInputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    let cancelled = false;
    void loadShopDashboardThemeSettings().then((loaded) => {
      if (!cancelled) {
        setSettings(loaded);
        setLoading(false);
      }
    });
    return () => {
      cancelled = true;
    };
  }, []);

  const uploadBgImage = async (file: File) => {
    if (!user) return;
    setUploadingBg(true);
    try {
      const ext = file.name.split(".").pop() || "jpg";
      const path = `shop_portal_bg/${user.id}-${Date.now()}.${ext}`;
      const { error } = await supabase.storage.from("uploads").upload(path, file);
      if (error) throw error;
      const { data } = supabase.storage.from("uploads").getPublicUrl(path);
      setSettings((prev) => ({
        ...prev,
        portalBgImageUrl: `${data.publicUrl}?t=${Date.now()}`,
      }));
      toast({ title: t("admin.dashboardThemeImageUploaded") });
    } catch (e) {
      toast({
        title: t("settings.uploadFailed"),
        description: e instanceof Error ? e.message : String(e),
        variant: "destructive",
      });
    } finally {
      setUploadingBg(false);
    }
  };

  const saveSettings = async () => {
    setSaving(true);
    const { error } = await saveShopDashboardThemeSettings(settings);
    setSaving(false);
    if (error) {
      toast({ title: t("settings.saveFailed"), description: error, variant: "destructive" });
      return;
    }
    toast({
      title: t("settings.settingsSaved"),
      description: t("admin.dashboardThemeSavedDesc"),
    });
  };

  if (loading) {
    return <p className="text-sm text-muted-foreground">{t("admin.loadingLabel")}</p>;
  }

  const shopMode = settings.mode === "shop";
  const bgColor = settings.portalBgColor || defaultShopDashboardThemeSettings.portalBgColor!;

  return (
    <Card className="border-border bg-card">
      <CardHeader>
        <CardTitle className="text-base flex items-center gap-2">
          <LayoutDashboard className="h-4 w-4" />
          {t("admin.dashboardThemeTitle")}
        </CardTitle>
        <CardDescription>{t("admin.dashboardThemeIntro")}</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4 max-w-lg">
        <div>
          <Label htmlFor="dashboard-theme-mode">{t("admin.dashboardThemeMode")}</Label>
          <Select
            value={settings.mode}
            onValueChange={(v) =>
              setSettings((prev) => ({
                ...prev,
                mode: (v === "shop" ? "shop" : "per_artist") as DashboardThemeMode,
              }))
            }
          >
            <SelectTrigger id="dashboard-theme-mode" className="mt-1">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="per_artist">{t("admin.dashboardThemePerArtist")}</SelectItem>
              <SelectItem value="shop">{t("admin.dashboardThemeShopWide")}</SelectItem>
            </SelectContent>
          </Select>
          <p className="text-xs text-muted-foreground mt-2">
            {shopMode ? t("admin.dashboardThemeShopWideHint") : t("admin.dashboardThemePerArtistHint")}
          </p>
        </div>

        {shopMode ? (
          <div className="space-y-4 rounded-lg border border-border p-4 bg-secondary/20">
            <p className="text-sm font-medium">{t("admin.dashboardThemeShopLook")}</p>
            <div>
              <Label>{t("admin.dashboardThemePresets")}</Label>
              <div className="mt-2 grid grid-cols-2 sm:grid-cols-4 gap-2">
                {THEME_PRESETS.map((preset) => {
                  const active = bgColor.toLowerCase() === preset.bgColor.toLowerCase();
                  return (
                    <button
                      key={preset.key}
                      type="button"
                      onClick={() => setSettings((prev) => ({ ...prev, portalBgColor: preset.bgColor }))}
                      className={`rounded-md border p-2 text-left transition ${active ? "border-primary ring-1 ring-primary" : "border-border"}`}
                    >
                      <div className="flex items-center gap-2">
                        <span
                          className="h-4 w-4 rounded-full border border-border shrink-0"
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
              <Label htmlFor="shop-portal-color">{t("admin.dashboardThemeCustomColor")}</Label>
              <Input
                id="shop-portal-color"
                type="color"
                value={bgColor}
                onChange={(e) => setSettings((prev) => ({ ...prev, portalBgColor: e.target.value }))}
                className="mt-1 h-10 w-24 p-1 bg-secondary"
              />
            </div>
            <div>
              <Label>{t("admin.dashboardThemeBackgroundImage")}</Label>
              <div className="mt-1 flex flex-wrap items-center gap-2">
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => bgInputRef.current?.click()}
                  disabled={uploadingBg}
                >
                  {uploadingBg ? t("settings.uploading") : t("admin.dashboardThemeUploadImage")}
                </Button>
                {settings.portalBgImageUrl ? (
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    onClick={() => setSettings((prev) => ({ ...prev, portalBgImageUrl: null }))}
                  >
                    {t("admin.dashboardThemeRemoveImage")}
                  </Button>
                ) : null}
                <input
                  ref={bgInputRef}
                  type="file"
                  accept="image/jpeg,image/png,image/webp"
                  className="hidden"
                  onChange={(e) => {
                    const file = e.target.files?.[0];
                    if (file) void uploadBgImage(file);
                    e.currentTarget.value = "";
                  }}
                />
              </div>
              {settings.portalBgImageUrl ? (
                <p className="text-xs text-muted-foreground mt-2 break-all">{settings.portalBgImageUrl}</p>
              ) : null}
            </div>
          </div>
        ) : null}

        <Button onClick={() => void saveSettings()} disabled={saving}>
          {saving ? t("settings.saving") : t("settings.saveSettings")}
        </Button>
      </CardContent>
    </Card>
  );
};

export default AdminDashboardThemePanel;
