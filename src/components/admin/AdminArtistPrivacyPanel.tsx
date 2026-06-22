import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { Shield } from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { toast } from "@/hooks/use-toast";
import { useArtistDataPrivacy } from "@/hooks/useArtistDataPrivacy";
import { loadArtistDataPrivacy, saveArtistDataPrivacy } from "@/lib/shopArtistPrivacy";
import { loadShopSettings } from "@/lib/shopSettings";

const AdminArtistPrivacyPanel = () => {
  const { t } = useTranslation();
  const { bypasses: viewerBypassesPrivacy } = useArtistDataPrivacy();
  const [enabled, setEnabled] = useState(false);
  const [shopId, setShopId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const shop = await loadShopSettings();
      if (cancelled) return;
      setShopId(shop?.id ?? null);
      setEnabled(await loadArtistDataPrivacy(shop?.organization_id));
      setLoading(false);
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const onToggle = async (next: boolean) => {
    if (!shopId) return;
    setEnabled(next);
    setSaving(true);
    const { error } = await saveArtistDataPrivacy(next, shopId);
    setSaving(false);
    if (error) {
      setEnabled(!next);
      toast({ title: t("settings.saveFailed"), description: error, variant: "destructive" });
      return;
    }
    toast({
      title: t("settings.settingsSaved"),
      description: next ? t("admin.artistPrivacyEnabledDesc") : t("admin.artistPrivacyDisabledDesc"),
    });
  };

  return (
    <Card className="bg-card border-border">
      <CardHeader className="pb-3">
        <CardTitle className="text-base flex items-center gap-2">
          <Shield className="h-4 w-4" />
          {t("admin.artistPrivacyTitle")}
        </CardTitle>
        <CardDescription>{t("admin.artistPrivacyDesc")}</CardDescription>
      </CardHeader>
      <CardContent>
        <div className="flex items-start justify-between gap-4 rounded-lg border border-border p-4">
          <div className="space-y-1">
            <Label htmlFor="artist-data-privacy" className="text-sm font-medium">
              {t("admin.artistPrivacyToggle")}
            </Label>
            <p className="text-xs text-muted-foreground leading-snug">{t("admin.artistPrivacyToggleHint")}</p>
          </div>
          <Switch
            id="artist-data-privacy"
            checked={enabled}
            disabled={loading || saving || !shopId}
            onCheckedChange={(v) => void onToggle(v)}
          />
        </div>
        <ul className="mt-4 space-y-2 text-xs text-muted-foreground list-disc pl-5">
          <li>{t("admin.artistPrivacyBullet1")}</li>
          <li>{t("admin.artistPrivacyBullet2")}</li>
          <li>{t("admin.artistPrivacyBullet3")}</li>
        </ul>
        {enabled && viewerBypassesPrivacy ? (
          <p className="mt-4 rounded-md border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-xs text-amber-900 dark:text-amber-100">
            {t("admin.artistPrivacyOwnerBypassNote")}
          </p>
        ) : null}
      </CardContent>
    </Card>
  );
};

export default AdminArtistPrivacyPanel;
