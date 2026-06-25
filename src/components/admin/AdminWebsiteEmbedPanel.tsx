import { useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { toast } from "@/hooks/use-toast";
import { Copy, Code2, ExternalLink } from "lucide-react";
import { loadShopSettings } from "@/lib/shopSettings";
import {
  buildCustomerLoginButtonEmbed,
  buildCustomerLoginIframeEmbed,
  CUSTOMER_LOGIN_BUTTON_THEMES,
  CUSTOMER_LOGIN_EMBED_PRESETS,
  customerPortalEmbedPageUrl,
  customerPortalLoginUrl,
  type CustomerLoginButtonTheme,
  type CustomerLoginButtonVariant,
} from "@/lib/customerPortalEmbed";
import { BRANDING } from "@/lib/branding";

function stripEmbedComment(html: string): string {
  return html.replace(/<!--[\s\S]*?-->\n?/, "");
}

const AdminWebsiteEmbedPanel = () => {
  const { t } = useTranslation();
  const [shopName, setShopName] = useState(BRANDING.shopName);
  const [organizationId, setOrganizationId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [theme, setTheme] = useState<CustomerLoginButtonTheme>("gold");
  const [cardVariant, setCardVariant] = useState<CustomerLoginButtonVariant>("card");
  const [headerVariant, setHeaderVariant] = useState<CustomerLoginButtonVariant>("pill-sm");

  const origin = typeof window !== "undefined" ? window.location.origin : "";

  const embedBase = useMemo(
    () => ({
      origin,
      shopName,
      organizationId: organizationId ?? undefined,
      loginLabel: t("common.signIn"),
      poweredByLabel: t("admin.websiteEmbedPoweredBy", { platform: BRANDING.platformName }),
      theme,
    }),
    [origin, shopName, organizationId, theme, t],
  );

  useEffect(() => {
    void loadShopSettings().then((shop) => {
      if (shop?.shop_name) setShopName(shop.shop_name);
      if (shop?.organization_id) setOrganizationId(shop.organization_id);
      setLoading(false);
    });
  }, []);

  const loginUrl = useMemo(
    () => customerPortalLoginUrl(origin, organizationId ?? undefined),
    [origin, organizationId],
  );
  const embedPageUrl = useMemo(
    () => customerPortalEmbedPageUrl(origin, shopName, organizationId ?? undefined),
    [origin, shopName, organizationId],
  );

  const cardHtml = useMemo(
    () => buildCustomerLoginButtonEmbed({ ...embedBase, variant: cardVariant }),
    [embedBase, cardVariant],
  );

  const headerHtml = useMemo(
    () => buildCustomerLoginButtonEmbed({ ...embedBase, variant: headerVariant }),
    [embedBase, headerVariant],
  );

  const iframeHtml = useMemo(
    () => buildCustomerLoginIframeEmbed(embedBase),
    [embedBase],
  );

  const copy = async (text: string) => {
    try {
      await navigator.clipboard.writeText(text);
      toast({ title: t("admin.websiteEmbedCopied") });
    } catch {
      toast({ title: t("settings.saveFailed"), variant: "destructive" });
    }
  };

  const themeSelect = (
    <div className="flex flex-col gap-1.5 sm:flex-row sm:items-center sm:gap-3">
      <Label className="text-xs uppercase tracking-wider text-muted-foreground shrink-0">
        {t("admin.websiteEmbedTheme")}
      </Label>
      <Select value={theme} onValueChange={(v) => setTheme(v as CustomerLoginButtonTheme)}>
        <SelectTrigger className="w-full sm:w-[180px] h-9">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {CUSTOMER_LOGIN_BUTTON_THEMES.map((id) => (
            <SelectItem key={id} value={id}>
              {t(`admin.websiteEmbedTheme_${id}`)}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );

  const variantPicker = (
    variant: CustomerLoginButtonVariant,
    onChange: (v: CustomerLoginButtonVariant) => void,
    ids: CustomerLoginButtonVariant[],
  ) => (
    <div className="grid gap-2 sm:grid-cols-2">
      {CUSTOMER_LOGIN_EMBED_PRESETS.filter((p) => ids.includes(p.id)).map((preset) => (
        <button
          key={preset.id}
          type="button"
          onClick={() => onChange(preset.id)}
          className={`rounded-lg border px-3 py-2 text-left transition-colors ${
            variant === preset.id
              ? "border-gold bg-gold/10"
              : "border-border hover:border-gold/40"
          }`}
        >
          <p className="text-sm font-medium">{t(preset.labelKey)}</p>
          <p className="text-xs text-muted-foreground mt-0.5">{t(preset.descKey)}</p>
        </button>
      ))}
    </div>
  );

  if (loading) {
    return <p className="text-sm text-muted-foreground">{t("common.loading")}</p>;
  }

  if (!organizationId) {
    return (
      <Card className="border-border bg-card">
        <CardHeader>
          <CardTitle className="text-base">{t("admin.websiteEmbedTitle")}</CardTitle>
          <CardDescription>{t("admin.websiteEmbedNoOrg")}</CardDescription>
        </CardHeader>
      </Card>
    );
  }

  return (
    <div className="space-y-4">
      <Card className="border-border bg-card">
        <CardHeader className="pb-2">
          <div className="flex items-center gap-2">
            <Code2 className="h-5 w-5 text-primary" />
            <CardTitle className="text-base">{t("admin.websiteEmbedTitle")}</CardTitle>
          </div>
          <CardDescription>{t("admin.websiteEmbedIntro")}</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="rounded-lg border border-border/70 bg-secondary/40 px-3 py-2 text-sm">
            <p className="font-medium">{shopName}</p>
            <p className="text-xs text-muted-foreground mt-1 break-all">
              {t("admin.websiteEmbedLoginUrl")}:{" "}
              <a href={loginUrl} target="_blank" rel="noopener noreferrer" className="text-gold hover:underline">
                {loginUrl}
              </a>
            </p>
            <p className="text-xs text-muted-foreground mt-2">{t("admin.websiteEmbedOrgHint")}</p>
          </div>

          {themeSelect}

          <Tabs defaultValue="header">
            <TabsList className="flex h-auto flex-wrap gap-1">
              <TabsTrigger value="header">{t("admin.websiteEmbedHeaderTab")}</TabsTrigger>
              <TabsTrigger value="button">{t("admin.websiteEmbedButtonTab")}</TabsTrigger>
              <TabsTrigger value="iframe">{t("admin.websiteEmbedIframeTab")}</TabsTrigger>
            </TabsList>

            <TabsContent value="header" className="space-y-4 mt-4">
              <p className="text-sm text-muted-foreground">{t("admin.websiteEmbedHeaderDesc")}</p>
              {variantPicker(headerVariant, setHeaderVariant, ["navbar", "pill-sm", "pill-md", "link"])}
              <div className="rounded-xl border border-border bg-[#101216] p-4">
                <p className="text-xs text-muted-foreground mb-3">{t("admin.websiteEmbedPreviewHeader")}</p>
                <div className="flex items-center justify-between gap-4 rounded-lg border border-zinc-800 bg-zinc-950/80 px-4 py-3">
                  <span className="text-sm font-semibold text-zinc-400 truncate">Your site logo</span>
                  <div dangerouslySetInnerHTML={{ __html: stripEmbedComment(headerHtml) }} />
                </div>
              </div>
              <Textarea readOnly value={headerHtml} className="min-h-[120px] font-mono text-xs" />
              <Button type="button" className="gap-2" onClick={() => void copy(headerHtml)}>
                <Copy className="h-4 w-4" />
                {t("admin.websiteEmbedCopyButton")}
              </Button>
            </TabsContent>

            <TabsContent value="button" className="space-y-4 mt-4">
              <p className="text-sm text-muted-foreground">{t("admin.websiteEmbedButtonDesc")}</p>
              {variantPicker(cardVariant, setCardVariant, ["card", "compact"])}
              <div className="rounded-xl border border-border bg-[#101216] p-6">
                <p className="text-xs text-muted-foreground mb-3">{t("admin.websiteEmbedPreview")}</p>
                <div
                  className="mx-auto max-w-[320px] text-center"
                  dangerouslySetInnerHTML={{ __html: stripEmbedComment(cardHtml) }}
                />
              </div>
              <Textarea readOnly value={cardHtml} className="min-h-[160px] font-mono text-xs" />
              <Button type="button" className="gap-2" onClick={() => void copy(cardHtml)}>
                <Copy className="h-4 w-4" />
                {t("admin.websiteEmbedCopyButton")}
              </Button>
            </TabsContent>

            <TabsContent value="iframe" className="space-y-4 mt-4">
              <p className="text-sm text-muted-foreground">{t("admin.websiteEmbedIframeDesc")}</p>
              <div className="rounded-xl border border-border bg-[#101216] p-4">
                <p className="text-xs text-muted-foreground mb-3">{t("admin.websiteEmbedPreview")}</p>
                <iframe
                  src={embedPageUrl}
                  title={t("admin.websiteEmbedPreview")}
                  className="mx-auto block w-full max-w-[360px] h-[440px] rounded-xl border border-gold/30 bg-[#101216]"
                  loading="lazy"
                />
              </div>
              <Textarea readOnly value={iframeHtml} className="min-h-[200px] font-mono text-xs" />
              <div className="flex flex-wrap gap-2">
                <Button type="button" className="gap-2" onClick={() => void copy(iframeHtml)}>
                  <Copy className="h-4 w-4" />
                  {t("admin.websiteEmbedCopyIframe")}
                </Button>
                <Button type="button" variant="outline" className="gap-2" asChild>
                  <a href={embedPageUrl} target="_blank" rel="noopener noreferrer">
                    <ExternalLink className="h-4 w-4" />
                    {t("admin.websiteEmbedOpenPage")}
                  </a>
                </Button>
              </div>
            </TabsContent>
          </Tabs>
        </CardContent>
      </Card>
    </div>
  );
};

export default AdminWebsiteEmbedPanel;
