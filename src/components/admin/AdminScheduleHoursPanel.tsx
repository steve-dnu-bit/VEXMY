import { useEffect, useState } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "@/hooks/use-toast";
import { Clock } from "lucide-react";
import { useTranslation } from "react-i18next";
import {
  buildScheduleSlots,
  defaultShopScheduleHours,
  loadShopScheduleHours,
  saveShopScheduleHours,
  type ShopScheduleHours,
} from "@/lib/shopScheduleHours";

const AdminScheduleHoursPanel = () => {
  const { t } = useTranslation();
  const [settings, setSettings] = useState<ShopScheduleHours>(defaultShopScheduleHours);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    let cancelled = false;
    void loadShopScheduleHours().then((loaded) => {
      if (!cancelled) {
        setSettings(loaded);
        setLoading(false);
      }
    });
    return () => {
      cancelled = true;
    };
  }, []);

  const slotCount = buildScheduleSlots(settings).length;

  const saveSettings = async () => {
    setSaving(true);
    const { error } = await saveShopScheduleHours(settings);
    setSaving(false);
    if (error) {
      toast({ title: t("settings.saveFailed"), description: error, variant: "destructive" });
      return;
    }
    toast({
      title: t("settings.settingsSaved"),
      description: t("admin.scheduleHoursSavedDesc"),
    });
  };

  if (loading) {
    return <p className="text-sm text-muted-foreground">{t("admin.loadingLabel")}</p>;
  }

  return (
    <Card className="border-border bg-card">
      <CardHeader>
        <CardTitle className="text-base flex items-center gap-2">
          <Clock className="h-4 w-4" />
          {t("admin.scheduleHoursTitle")}
        </CardTitle>
        <CardDescription>{t("admin.scheduleHoursIntro")}</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4 max-w-lg">
        <div className="grid sm:grid-cols-2 gap-4">
          <div>
            <Label htmlFor="schedule-open">{t("admin.scheduleOpenTime")}</Label>
            <Input
              id="schedule-open"
              type="time"
              step={900}
              value={settings.openTime}
              onChange={(e) => setSettings((prev) => ({ ...prev, openTime: e.target.value }))}
              className="mt-1"
            />
          </div>
          <div>
            <Label htmlFor="schedule-close">{t("admin.scheduleCloseTime")}</Label>
            <Input
              id="schedule-close"
              type="time"
              step={900}
              value={settings.closeTime}
              onChange={(e) => setSettings((prev) => ({ ...prev, closeTime: e.target.value }))}
              className="mt-1"
            />
          </div>
        </div>

        <div className="grid sm:grid-cols-2 gap-4">
          <div>
            <Label htmlFor="schedule-buffer">{t("admin.scheduleExtraBuffer")}</Label>
            <Select
              value={String(settings.extraBufferMinutes)}
              onValueChange={(v) => setSettings((prev) => ({ ...prev, extraBufferMinutes: Number(v) }))}
            >
              <SelectTrigger id="schedule-buffer" className="mt-1">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="0">{t("admin.scheduleBufferNone")}</SelectItem>
                <SelectItem value="30">{t("admin.scheduleBuffer30")}</SelectItem>
                <SelectItem value="60">{t("admin.scheduleBuffer60")}</SelectItem>
                <SelectItem value="90">{t("admin.scheduleBuffer90")}</SelectItem>
                <SelectItem value="120">{t("admin.scheduleBuffer120")}</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label htmlFor="schedule-buffer-at">{t("admin.scheduleBufferAt")}</Label>
            <Select
              value={settings.extraBufferAt}
              onValueChange={(v) =>
                setSettings((prev) => ({
                  ...prev,
                  extraBufferAt: v === "start" || v === "both" ? v : "end",
                }))
              }
              disabled={settings.extraBufferMinutes === 0}
            >
              <SelectTrigger id="schedule-buffer-at" className="mt-1">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="start">{t("admin.scheduleBufferBeforeOpen")}</SelectItem>
                <SelectItem value="end">{t("admin.scheduleBufferAfterClose")}</SelectItem>
                <SelectItem value="both">{t("admin.scheduleBufferBeforeAndAfter")}</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>

        <p className="text-xs text-muted-foreground">
          {t("admin.scheduleHoursPreview", { slots: slotCount, minutes: 15 })}
        </p>

        <Button onClick={() => void saveSettings()} disabled={saving}>
          {saving ? t("settings.saving") : t("settings.saveSettings")}
        </Button>
      </CardContent>
    </Card>
  );
};

export default AdminScheduleHoursPanel;
