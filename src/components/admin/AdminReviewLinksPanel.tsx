import { useCallback, useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { Plus, Star, Trash2 } from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "sonner";
import {
  loadShopReviewSettings,
  saveShopReviewSettings,
  isUnreliableReviewShareUrl,
  type ShopReviewLink,
} from "@/lib/shopReviewLinks";

const emptyLink = (): ShopReviewLink => ({ label: "", url: "" });

const AdminReviewLinksPanel = () => {
  const { t } = useTranslation();
  const [links, setLinks] = useState<ShopReviewLink[]>([emptyLink()]);
  const [message, setMessage] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    void loadShopReviewSettings().then((data) => {
      setLinks(data.links.length > 0 ? data.links : [emptyLink()]);
      setMessage(data.message);
      setLoading(false);
    });
  }, []);

  const updateLink = (index: number, patch: Partial<ShopReviewLink>) => {
    setLinks((prev) => prev.map((row, i) => (i === index ? { ...row, ...patch } : row)));
  };

  const addLink = () => {
    setLinks((prev) => (prev.length >= 8 ? prev : [...prev, emptyLink()]));
  };

  const removeLink = (index: number) => {
    setLinks((prev) => {
      const next = prev.filter((_, i) => i !== index);
      return next.length > 0 ? next : [emptyLink()];
    });
  };

  const save = useCallback(async () => {
    if (links.some((l) => l.url.trim() && isUnreliableReviewShareUrl(l.url))) {
      toast.warning(t("admin.reviewLinkShareUrlWarning"));
    }
    setSaving(true);
    const { error } = await saveShopReviewSettings({ links, message });
    if (error) {
      setSaving(false);
      toast.error(error);
      return;
    }
    const refreshed = await loadShopReviewSettings();
    setLinks(refreshed.links.length > 0 ? refreshed.links : [emptyLink()]);
    setMessage(refreshed.message);
    setSaving(false);
    toast.success(t("admin.reviewLinksSaved"));
  }, [links, message, t]);

  if (loading) {
    return <p className="text-sm text-muted-foreground p-4">{t("common.loading")}</p>;
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base flex items-center gap-2">
          <Star className="h-4 w-4 text-gold" />
          {t("admin.reviewLinksTitle")}
        </CardTitle>
        <CardDescription>{t("admin.reviewLinksDesc")}</CardDescription>
      </CardHeader>
      <CardContent className="space-y-5 max-w-2xl">
        <div className="space-y-3">
          {links.map((link, index) => (
            <div key={index} className="grid gap-3 sm:grid-cols-[1fr_1.4fr_auto] items-end rounded-lg border border-border p-3">
              <div>
                <Label htmlFor={`review-label-${index}`} className="text-xs">
                  {t("admin.reviewLinkLabel")}
                </Label>
                <Input
                  id={`review-label-${index}`}
                  value={link.label}
                  onChange={(e) => updateLink(index, { label: e.target.value })}
                  placeholder={t("admin.reviewLinkLabelPlaceholder")}
                  className="mt-1"
                />
              </div>
              <div>
                <Label htmlFor={`review-url-${index}`} className="text-xs">
                  {t("admin.reviewLinkUrl")}
                </Label>
                <Input
                  id={`review-url-${index}`}
                  type="url"
                  value={link.url}
                  onChange={(e) => updateLink(index, { url: e.target.value })}
                  placeholder="https://g.page/r/..."
                  className="mt-1"
                />
              </div>
              <Button
                type="button"
                variant="ghost"
                size="icon"
                className="shrink-0 text-muted-foreground hover:text-destructive"
                onClick={() => removeLink(index)}
                aria-label={t("admin.reviewLinkRemove")}
              >
                <Trash2 className="h-4 w-4" />
              </Button>
            </div>
          ))}
          <Button type="button" variant="outline" size="sm" onClick={addLink} disabled={links.length >= 8}>
            <Plus className="h-4 w-4 mr-1" />
            {t("admin.reviewLinkAdd")}
          </Button>
        </div>

        <div>
          <Label htmlFor="review-email-message" className="text-xs">
            {t("admin.reviewEmailMessage")}
          </Label>
          <Textarea
            id="review-email-message"
            value={message}
            onChange={(e) => setMessage(e.target.value)}
            placeholder={t("admin.reviewEmailMessagePlaceholder")}
            className="mt-1 min-h-[80px]"
          />
          <p className="text-xs text-muted-foreground mt-1">{t("admin.reviewEmailMessageHint")}</p>
        </div>

        <Button type="button" onClick={() => void save()} disabled={saving}>
          {saving ? t("common.saving") : t("common.save")}
        </Button>
      </CardContent>
    </Card>
  );
};

export default AdminReviewLinksPanel;
