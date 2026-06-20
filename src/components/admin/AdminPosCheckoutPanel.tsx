import { useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { toast } from "sonner";
import { CreditCard, Percent, Wifi } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { getUserOrganizationId } from "@/lib/shopSettings";
import {
  defaultShopPosSettings,
  deleteArtistPosSplit,
  loadArtistPosSplits,
  loadShopPosSettings,
  saveArtistPosSplit,
  saveShopPosSettings,
  type ArtistPosSplit,
  type ShopPosSettings,
} from "@/lib/posCheckout";
import { invokeEdgeFunctionJson } from "@/lib/edgeFunctions";
import OrgPosSetupChecklist from "@/components/pos/OrgPosSetupChecklist";
import StripeConnectCard from "@/components/subscription/StripeConnectCard";

interface ArtistProfile {
  user_id: string;
  display_name: string;
}

const AdminPosCheckoutPanel = () => {
  const { t } = useTranslation();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [orgId, setOrgId] = useState<string | null>(null);
  const [settings, setSettings] = useState<Omit<ShopPosSettings, "organization_id">>(defaultShopPosSettings());
  const [artistSplits, setArtistSplits] = useState<ArtistPosSplit[]>([]);
  const [artists, setArtists] = useState<ArtistProfile[]>([]);
  const [draftSplits, setDraftSplits] = useState<Record<string, { shop: string; connect: string }>>({});
  const [settingUpTerminal, setSettingUpTerminal] = useState(false);
  const [diagnosingTerminal, setDiagnosingTerminal] = useState(false);
  const [terminalDiagnostics, setTerminalDiagnostics] = useState<Record<string, unknown> | null>(null);
  const [connectAccountId, setConnectAccountId] = useState<string | null>(null);

  useEffect(() => {
    void (async () => {
      const id = await getUserOrganizationId();
      setOrgId(id);
      if (!id) {
        setLoading(false);
        return;
      }

      const [posRow, splits, profilesRes, rolesRes, connectRes] = await Promise.all([
        loadShopPosSettings(id),
        loadArtistPosSplits(id),
        supabase.from("profiles").select("user_id, display_name"),
        supabase.from("user_roles").select("user_id, role").eq("role", "artist"),
        invokeEdgeFunctionJson<{ connectAccountId?: string | null }>("stripe-terminal-pos", { action: "connect_status" }),
      ]);

      const artistIds = new Set((rolesRes.data || []).map((r) => r.user_id));
      const artistProfiles = (profilesRes.data || []).filter((p) => artistIds.has(p.user_id)) as ArtistProfile[];

      setArtists(artistProfiles);
      setArtistSplits(splits);
      setConnectAccountId(connectRes.data?.connectAccountId ?? null);
      if (posRow) {
        const { organization_id: _org, ...rest } = posRow;
        setSettings(rest);
      }
      const draft: Record<string, { shop: string; connect: string }> = {};
      for (const artist of artistProfiles) {
        const override = splits.find((s) => s.artist_id === artist.user_id);
        draft[artist.user_id] = {
          shop: override ? String(override.shop_split_percent) : "",
          connect: override?.stripe_connect_account_id || "",
        };
      }
      setDraftSplits(draft);
      setLoading(false);
    })();
  }, []);

  const artistSplitMap = useMemo(() => {
    const map = new Map<string, ArtistPosSplit>();
    artistSplits.forEach((s) => map.set(s.artist_id, s));
    return map;
  }, [artistSplits]);

  const patchSettings = (partial: Partial<Omit<ShopPosSettings, "organization_id">>) => {
    setSettings((prev) => {
      const next = { ...prev, ...partial };
      if (partial.shop_split_percent != null) {
        next.artist_split_percent = 100 - Number(partial.shop_split_percent);
      }
      return next;
    });
  };

  const saveSettings = async () => {
    if (!orgId) return;
    setSaving(true);
    const { error } = await saveShopPosSettings(orgId, settings);
    setSaving(false);
    if (error) {
      toast.error(error);
      return;
    }
    toast.success(t("pos.settingsSaved"));
  };

  const saveArtistOverride = async (artistId: string) => {
    if (!orgId) return;
    const draft = draftSplits[artistId];
    const connectId = draft?.connect?.trim() || "";
    const shopRaw = draft?.shop?.trim() || "";

    if (!connectId && !shopRaw) {
      toast.error(
        t("pos.artistOverrideNothingToSave", {
          defaultValue: "Enter the artist Connect account (acct_…) and/or a custom shop split %, then save.",
        }),
      );
      return;
    }

    const shop = shopRaw ? Number(shopRaw) : settings.shop_split_percent;
    if (Number.isNaN(shop) || shop < 0 || shop > 100) {
      toast.error(t("pos.invalidSplit"));
      return;
    }

    const { error } = await saveArtistPosSplit(orgId, artistId, shop, connectId || null);
    if (error) {
      toast.error(error);
      return;
    }
    const refreshed = await loadArtistPosSplits(orgId);
    setArtistSplits(refreshed);
    const saved = refreshed.find((s) => s.artist_id === artistId);
    if (saved) {
      setDraftSplits((prev) => ({
        ...prev,
        [artistId]: {
          shop: Number(saved.shop_split_percent) === settings.shop_split_percent
            ? ""
            : String(saved.shop_split_percent),
          connect: saved.stripe_connect_account_id || "",
        },
      }));
    }
    const artistPercent = 100 - shop;
    if (connectId && !shopRaw) {
      toast.success(
        t("pos.artistConnectSaved", {
          defaultValue: "Artist payout account saved. Split uses shop default ({{shopPercent}}% shop / {{artistPercent}}% artist).",
          shopPercent: settings.shop_split_percent,
          artistPercent: settings.artist_split_percent,
        }),
      );
    } else {
      toast.success(
        t("pos.artistSplitSaved", {
          defaultValue: "Artist override saved ({{shopPercent}}% shop / {{artistPercent}}% artist).",
          shopPercent: shop,
          artistPercent,
        }),
      );
    }
  };

  const clearArtistOverride = async (artistId: string) => {
    if (!orgId) return;
    const { error } = await deleteArtistPosSplit(orgId, artistId);
    if (error) {
      toast.error(error);
      return;
    }
    setArtistSplits((prev) => prev.filter((s) => s.artist_id !== artistId));
    setDraftSplits((prev) => ({
      ...prev,
      [artistId]: { shop: "", connect: "" },
    }));
    toast.success(t("pos.artistSplitCleared"));
  };

  const setupTerminalLocation = async (forceRecreate = false) => {
    setSettingUpTerminal(true);
    const { data, error } = await invokeEdgeFunctionJson<{ locationId?: string; recreated?: boolean }>("stripe-terminal-pos", {
      action: "ensure_location",
      forceRecreate,
    });
    setSettingUpTerminal(false);
    if (error || !data.locationId) {
      toast.error(error?.message || t("pos.terminalSetupFailed"));
      return;
    }
    patchSettings({ stripe_terminal_location_id: data.locationId });
    if (orgId) {
      await saveShopPosSettings(orgId, { ...settings, stripe_terminal_location_id: data.locationId });
    }
    toast.success(data.recreated ? t("pos.terminalSetupRecreated") : t("pos.terminalSetupDone"));
  };

  const runTerminalDiagnostics = async () => {
    setDiagnosingTerminal(true);
    setTerminalDiagnostics(null);
    const { data, error } = await invokeEdgeFunctionJson<Record<string, unknown>>("stripe-terminal-pos", {
      action: "terminal_diagnose",
    });
    setDiagnosingTerminal(false);
    if (error) {
      toast.error(error.message || t("pos.terminalDiagnoseFailed"));
      return;
    }
    setTerminalDiagnostics(data ?? null);
    if (data?.connectionTokenOk && data?.locationValid) {
      toast.success(t("pos.terminalDiagnoseOk"));
    } else {
      toast.error(t("pos.terminalDiagnoseIssues"));
    }
  };

  if (loading) {
    return <p className="text-sm text-muted-foreground">{t("admin.loadingLabel")}</p>;
  }

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle className="text-base">{t("pos.setupChecklist.title")}</CardTitle>
          <CardDescription>{t("pos.setupChecklist.adminDesc")}</CardDescription>
        </CardHeader>
        <CardContent>
          <OrgPosSetupChecklist hideAdminLink />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <CreditCard className="h-4 w-4" />
            {t("pos.adminTitle")}
          </CardTitle>
          <CardDescription>{t("pos.adminIntro")}</CardDescription>
        </CardHeader>
        <CardContent className="space-y-6 max-w-2xl">
          <div className="flex items-center justify-between gap-4 rounded-lg border border-border p-4">
            <div>
              <p className="font-medium text-sm">{t("pos.enableCheckout")}</p>
              <p className="text-xs text-muted-foreground mt-0.5">{t("pos.enableCheckoutHint")}</p>
            </div>
            <Switch checked={settings.enabled} onCheckedChange={(v) => patchSettings({ enabled: v })} />
          </div>

          <div className="grid sm:grid-cols-2 gap-4">
            <div>
              <Label htmlFor="pos-shop-split">{t("pos.shopSplitPercent")}</Label>
              <div className="relative mt-1">
                <Input
                  id="pos-shop-split"
                  type="number"
                  min={0}
                  max={100}
                  step={1}
                  value={settings.shop_split_percent}
                  onChange={(e) => patchSettings({ shop_split_percent: Number(e.target.value) })}
                  className="pr-8"
                />
                <Percent className="absolute right-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
              </div>
              <p className="text-xs text-muted-foreground mt-1">
                {t("pos.artistGets", { percent: settings.artist_split_percent })}
              </p>
            </div>
            <div>
              <Label htmlFor="pos-gratuity">{t("pos.defaultGratuity")}</Label>
              <Input
                id="pos-gratuity"
                type="number"
                min={0}
                max={100}
                step={1}
                value={settings.default_gratuity_percent}
                onChange={(e) => patchSettings({ default_gratuity_percent: Number(e.target.value) })}
                className="mt-1"
                disabled={!settings.gratuity_enabled}
              />
            </div>
          </div>

          <div className="flex items-center justify-between gap-4">
            <div>
              <p className="font-medium text-sm">{t("pos.gratuityEnabled")}</p>
              <p className="text-xs text-muted-foreground">{t("pos.gratuityEnabledHint")}</p>
            </div>
            <Switch
              checked={settings.gratuity_enabled}
              onCheckedChange={(v) => patchSettings({ gratuity_enabled: v })}
            />
          </div>

          <div className="space-y-3 rounded-lg border border-border p-4">
            <div className="flex items-center gap-2">
              <Wifi className="h-4 w-4 text-muted-foreground" />
              <p className="font-medium text-sm">{t("pos.terminalTitle")}</p>
            </div>
            <p className="text-xs text-muted-foreground">{t("pos.terminalIntro")}</p>
            {connectAccountId ? (
              <div className="rounded-md border border-amber-500/30 bg-amber-500/5 p-3 text-xs space-y-1">
                <p className="font-medium">{t("pos.terminalConnectAccount")}</p>
                <p className="font-mono break-all">{connectAccountId}</p>
                <p className="text-muted-foreground">{t("pos.terminalConnectAccountHint")}</p>
              </div>
            ) : null}
            <div className="grid sm:grid-cols-2 gap-4">
              <div>
                <Label htmlFor="pos-reader-label">{t("pos.readerLabel")}</Label>
                <Input
                  id="pos-reader-label"
                  value={settings.reader_label}
                  onChange={(e) => patchSettings({ reader_label: e.target.value })}
                  className="mt-1"
                />
              </div>
              <div>
                <Label>{t("pos.terminalLocation")}</Label>
                <p className="text-xs font-mono mt-2 text-muted-foreground break-all">
                  {settings.stripe_terminal_location_id || t("pos.notConfigured")}
                </p>
              </div>
            </div>
            <div className="flex flex-wrap gap-2">
              <Button type="button" variant="outline" size="sm" disabled={settingUpTerminal} onClick={() => void setupTerminalLocation(false)}>
                {settingUpTerminal ? t("common.loading") : t("pos.setupTerminal")}
              </Button>
              {settings.stripe_terminal_location_id ? (
                <Button type="button" variant="outline" size="sm" disabled={settingUpTerminal} onClick={() => void setupTerminalLocation(true)}>
                  {t("pos.recreateTerminalLocation")}
                </Button>
              ) : null}
              <Button
                type="button"
                variant="outline"
                size="sm"
                disabled={diagnosingTerminal}
                onClick={() => void runTerminalDiagnostics()}
              >
                {diagnosingTerminal ? t("common.loading") : t("pos.terminalDiagnose")}
              </Button>
              <div className="flex items-center gap-2 text-sm">
                <Switch
                  checked={settings.simulated_reader}
                  onCheckedChange={(v) => patchSettings({ simulated_reader: v })}
                />
                <span className="text-muted-foreground">{t("pos.simulatedReader")}</span>
              </div>
            </div>
            {terminalDiagnostics ? (
              <pre className="text-[10px] font-mono bg-muted/50 rounded-md p-3 overflow-x-auto whitespace-pre-wrap break-all">
                {JSON.stringify(terminalDiagnostics, null, 2)}
              </pre>
            ) : null}
          </div>

          <Button onClick={() => void saveSettings()} disabled={saving}>
            {saving ? t("settings.saving") : t("common.save")}
          </Button>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">{t("pos.artistOverridesTitle")}</CardTitle>
          <CardDescription>{t("pos.artistOverridesIntro")}</CardDescription>
        </CardHeader>
        <CardContent className="p-0 overflow-x-auto">
          {artists.length === 0 ? (
            <p className="p-6 text-sm text-muted-foreground">{t("pos.noArtists")}</p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>{t("common.name")}</TableHead>
                  <TableHead>{t("pos.shopSplitPercent")}</TableHead>
                  <TableHead>{t("pos.artistConnectAccount")}</TableHead>
                  <TableHead className="text-right">{t("pos.actions")}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {artists.map((artist) => {
                  const override = artistSplitMap.get(artist.user_id);
                  const draft = draftSplits[artist.user_id] || { shop: "", connect: "" };
                  return (
                    <TableRow key={artist.user_id}>
                      <TableCell className="font-medium">{artist.display_name}</TableCell>
                      <TableCell>
                        <Input
                          type="number"
                          min={0}
                          max={100}
                          placeholder={String(settings.shop_split_percent)}
                          value={draft.shop}
                          onChange={(e) =>
                            setDraftSplits((prev) => ({
                              ...prev,
                              [artist.user_id]: {
                                shop: e.target.value,
                                connect: prev[artist.user_id]?.connect ?? "",
                              },
                            }))
                          }
                          className="h-8 w-24"
                        />
                        {override && (
                          <p className="text-[10px] text-muted-foreground mt-0.5">
                            {t("pos.artistGets", { percent: override.artist_split_percent })}
                          </p>
                        )}
                      </TableCell>
                      <TableCell>
                        <Input
                          placeholder="acct_…"
                          value={draft.connect}
                          onChange={(e) =>
                            setDraftSplits((prev) => ({
                              ...prev,
                              [artist.user_id]: {
                                shop: prev[artist.user_id]?.shop ?? "",
                                connect: e.target.value,
                              },
                            }))
                          }
                          className="h-8 font-mono text-xs"
                        />
                        {override?.stripe_connect_account_id ? (
                          <p className="text-[10px] text-emerald-600 mt-0.5 font-mono truncate">
                            {t("pos.artistConnectSavedShort", {
                              defaultValue: "Saved: {{accountId}}",
                              accountId: override.stripe_connect_account_id,
                            })}
                          </p>
                        ) : null}
                      </TableCell>
                      <TableCell className="text-right space-x-1">
                        <Button size="sm" variant="outline" onClick={() => void saveArtistOverride(artist.user_id)}>
                          {t("common.save")}
                        </Button>
                        {override ? (
                          <Button size="sm" variant="ghost" onClick={() => void clearArtistOverride(artist.user_id)}>
                            {t("common.clear", { defaultValue: "Clear" })}
                          </Button>
                        ) : null}
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      <StripeConnectCard compact returnPath="/admin?tab=pos-checkout" refreshPath="/admin?tab=pos-checkout" />
    </div>
  );
};

export default AdminPosCheckoutPanel;
