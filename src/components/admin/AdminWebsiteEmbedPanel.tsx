import { useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { toast } from "@/hooks/use-toast";
import { Copy, Code2, ExternalLink } from "lucide-react";
import { loadShopSettings } from "@/lib/shopSettings";
import {
  buildCustomerLoginButtonEmbed,
  buildCustomerLoginIframeEmbed,
  customerPortalEmbedPageUrl,
  customerPortalLoginUrl,
} from "@/lib/customerPortalEmbed";
import { BRANDING } from "@/lib/branding";

const AdminWebsiteEmbedPanel = () => {
  const { t } = useTranslation();
  const [shopName, setShopName] = useState(BRANDING.shopName);
  const [loading, setLoading] = useState(true);

  const origin = typeof window !== "undefined" ? window.location.origin : "";

  useEffect(() => {
    void loadShopSettings().then((shop) => {
      if (shop?.shop_name) setShopName(shop.shop_name);
      setLoading(false);
    });
  }, []);

  const loginUrl = useMemo(() => customerPortalLoginUrl(origin), [origin]);
  const embedPageUrl = useMemo(
    () => customerPortalEmbedPageUrl(origin, shopName),
    [origin, shopName],
  );

  const buttonHtml = useMemo(
    () =>
      buildCustomerLoginButtonEmbed({
        origin,
        shopName,
        loginLabel: t("common.signIn"),
        poweredByLabel: t("admin.websiteEmbedPoweredBy", { platform: BRANDING.platformName }),
      }),
    [origin, shopName, t],
  );

  const iframeHtml = useMemo(
    () =>
      buildCustomerLoginIframeEmbed({
        origin,
        shopName,
        poweredByLabel: t("admin.websiteEmbedPoweredBy", { platform: BRANDING.platformName }),
      }),
    [origin, shopName, t],
  );

  const copy = async (text: string) => {
    try {
      await navigator.clipboard.writeText(text);
      toast({ title: t("admin.websiteEmbedCopied") });
    } catch {
      toast({ title: t("settings.saveFailed"), variant: "destructive" });
    }
  };

  if (loading) {
    return <p className="text-sm text-muted-foreground">{t("common.loading")}</p>;
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
          </div>

          <Tabs defaultValue="button">
            <TabsList>
              <TabsTrigger value="button">{t("admin.websiteEmbedButtonTab")}</TabsTrigger>
              <TabsTrigger value="iframe">{t("admin.websiteEmbedIframeTab")}</TabsTrigger>
            </TabsList>

            <TabsContent value="button" className="space-y-4 mt-4">
              <p className="text-sm text-muted-foreground">{t("admin.websiteEmbedButtonDesc")}</p>
              <div className="rounded-xl border border-border bg-[#101216] p-6">
                <p className="text-xs text-muted-foreground mb-3">{t("admin.websiteEmbedPreview")}</p>
                <div
                  className="mx-auto max-w-[320px] text-center"
                  dangerouslySetInnerHTML={{
                    __html: buttonHtml.replace(/<!--[\s\S]*?-->\n?/, ""),
                  }}
                />
              </div>
              <Textarea readOnly value={buttonHtml} className="min-h-[160px] font-mono text-xs bg-secondary" />
              <Button type="button" className="gap-2" onClick={() => void copy(buttonHtml)}>
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
              <Textarea readOnly value={iframeHtml} className="min-h-[200px] font-mono text-xs bg-secondary" />
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
