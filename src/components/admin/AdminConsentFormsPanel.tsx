import { useCallback, useEffect, useState } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { toast } from "@/hooks/use-toast";
import { Copy, FileSignature, Info, Plus, RotateCcw, Trash2 } from "lucide-react";
import { useTranslation } from "react-i18next";
import { loadShopSettings } from "@/lib/shopSettings";
import {
  consentFormPublicUrl,
  deleteConsentFormTemplate,
  loadShopConsentTemplates,
  saveConsentFormTemplate,
  type ConsentFormTemplateRow,
} from "@/lib/shopConsentTemplates";
import { defaultConsentForSlug } from "@/lib/defaultConsentTemplates";

function slugify(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 48);
}

function ConsentHandSignNotice() {
  const { t } = useTranslation();
  return (
    <div className="flex gap-2 rounded-lg border border-amber-500/30 bg-amber-500/5 px-3 py-2.5 text-sm text-muted-foreground">
      <Info className="h-4 w-4 shrink-0 text-amber-600 dark:text-amber-400 mt-0.5" />
      <p>{t("admin.consentHandSignNotice")}</p>
    </div>
  );
}

function ConsentFormEditor({
  template,
  onChange,
  onSave,
  onReset,
  onBack,
  saving,
  isNew,
  shopName,
}: {
  template: ConsentFormTemplateRow;
  onChange: (t: ConsentFormTemplateRow) => void;
  onSave: () => void;
  onReset: () => void;
  onBack: () => void;
  saving: boolean;
  isNew: boolean;
  shopName: string;
}) {
  const { t } = useTranslation();
  const c = template.content;

  const updateContent = (patch: Partial<typeof c>) => onChange({ ...template, content: { ...c, ...patch } });

  return (
    <div className="space-y-4 max-w-3xl">
      <Button type="button" variant="ghost" size="sm" onClick={onBack}>
        ← {t("admin.consentBackToList")}
      </Button>

      <ConsentHandSignNotice />

      {shopName ? (
        <p className="text-xs text-muted-foreground rounded-lg border border-border bg-secondary/30 px-3 py-2">
          {t("admin.consentAutoFillNote", { shopName })}
        </p>
      ) : null}

      <div className="grid gap-3 sm:grid-cols-2">
        <div>
          <Label>{t("admin.consentFormName")}</Label>
          <Input value={template.name} onChange={(e) => onChange({ ...template, name: e.target.value })} className="mt-1 bg-secondary" />
        </div>
        <div>
          <Label>{t("admin.consentFormSlug")}</Label>
          <Input
            value={template.slug}
            disabled={!isNew && (template.slug === "tattoo" || template.slug === "piercing")}
            onChange={(e) => onChange({ ...template, slug: slugify(e.target.value) })}
            className="mt-1 bg-secondary font-mono text-sm"
          />
        </div>
      </div>

      <div className="grid gap-3 sm:grid-cols-3">
        <div>
          <Label>{t("admin.consentFormVersion")}</Label>
          <Input value={template.version} onChange={(e) => onChange({ ...template, version: e.target.value })} className="mt-1 bg-secondary" />
        </div>
        <div>
          <Label>{t("admin.consentDefaultCategory")}</Label>
          <Select
            value={template.defaultForCategory ?? "none"}
            onValueChange={(v) =>
              onChange({
                ...template,
                defaultForCategory: v === "none" ? null : (v as "tattoo" | "piercing"),
              })
            }
          >
            <SelectTrigger className="mt-1 bg-secondary">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="none">{t("admin.consentNoDefault")}</SelectItem>
              <SelectItem value="tattoo">{t("admin.aftercareTabTattoo")}</SelectItem>
              <SelectItem value="piercing">{t("admin.aftercareTabPiercing")}</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div className="flex items-end justify-between rounded-lg border border-border px-3 py-2">
          <Label>{t("admin.consentFormActive")}</Label>
          <Switch checked={template.isActive} onCheckedChange={(v) => onChange({ ...template, isActive: v })} />
        </div>
      </div>

      <div>
        <Label>{t("admin.consentGuideTitle")}</Label>
        <Input value={c.formTitle} onChange={(e) => updateContent({ formTitle: e.target.value })} className="mt-1 bg-secondary" />
      </div>
      <div>
        <Label>{t("admin.consentPdfTitle")}</Label>
        <Input value={c.pdfTitle} onChange={(e) => updateContent({ pdfTitle: e.target.value })} className="mt-1 bg-secondary" />
      </div>
      <div>
        <Label>{t("admin.consentIntro")}</Label>
        <Textarea value={c.introText} onChange={(e) => updateContent({ introText: e.target.value })} rows={3} className="mt-1 bg-secondary text-sm" />
        <p className="mt-1 text-xs text-muted-foreground">{t("admin.consentIntroHint")}</p>
      </div>
      <div>
        <Label>{t("admin.consentPlacementLabel")}</Label>
        <Input value={c.placementLabel} onChange={(e) => updateContent({ placementLabel: e.target.value })} className="mt-1 bg-secondary" />
      </div>
      <div>
        <Label>{t("admin.consentDeclColumns")}</Label>
        <Select value={String(c.declColumns)} onValueChange={(v) => updateContent({ declColumns: v === "1" ? 1 : 2 })}>
          <SelectTrigger className="mt-1 w-40 bg-secondary">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="1">1</SelectItem>
            <SelectItem value="2">2</SelectItem>
          </SelectContent>
        </Select>
      </div>

      <div>
        <div className="flex items-center justify-between mb-2">
          <Label>{t("admin.consentHealthQuestions")}</Label>
          <Button type="button" variant="outline" size="sm" onClick={() => updateContent({ healthQuestions: [...c.healthQuestions, ""] })}>
            <Plus className="h-3.5 w-3.5 mr-1" /> {t("admin.consentAddQuestion")}
          </Button>
        </div>
        <div className="space-y-2">
          {c.healthQuestions.map((q, i) => (
            <div key={i} className="flex gap-2">
              <Textarea
                value={q}
                onChange={(e) => {
                  const next = [...c.healthQuestions];
                  next[i] = e.target.value;
                  updateContent({ healthQuestions: next });
                }}
                rows={2}
                className="bg-secondary text-sm flex-1"
              />
              <Button
                type="button"
                variant="ghost"
                size="icon"
                onClick={() => updateContent({ healthQuestions: c.healthQuestions.filter((_, j) => j !== i) })}
              >
                <Trash2 className="h-4 w-4" />
              </Button>
            </div>
          ))}
        </div>
      </div>

      <div>
        <div className="flex items-center justify-between mb-2">
          <Label>{t("admin.consentStatements")}</Label>
          <Button type="button" variant="outline" size="sm" onClick={() => updateContent({ statements: [...c.statements, ""] })}>
            <Plus className="h-3.5 w-3.5 mr-1" /> {t("admin.consentAddStatement")}
          </Button>
        </div>
        <div className="space-y-2">
          {c.statements.map((s, i) => (
            <div key={i} className="flex gap-2">
              <Textarea
                value={s}
                onChange={(e) => {
                  const next = [...c.statements];
                  next[i] = e.target.value;
                  updateContent({ statements: next });
                }}
                rows={2}
                className="bg-secondary text-sm flex-1"
              />
              <Button
                type="button"
                variant="ghost"
                size="icon"
                onClick={() => updateContent({ statements: c.statements.filter((_, j) => j !== i) })}
              >
                <Trash2 className="h-4 w-4" />
              </Button>
            </div>
          ))}
        </div>
      </div>

      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm">{t("admin.consentCheckboxLabels")}</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          {(Object.keys(c.declarations) as Array<keyof typeof c.declarations>).map((key) => (
            <div key={key}>
              <Label className="text-xs capitalize">{key}</Label>
              <Textarea
                value={c.declarations[key]}
                onChange={(e) =>
                  updateContent({
                    declarations: { ...c.declarations, [key]: e.target.value },
                  })
                }
                rows={2}
                className="mt-1 bg-secondary text-sm"
              />
            </div>
          ))}
        </CardContent>
      </Card>

      <div className="flex flex-wrap gap-2">
        <Button onClick={onSave} disabled={saving}>
          {saving ? t("settings.saving") : t("settings.saveSettings")}
        </Button>
        <Button type="button" variant="outline" className="gap-1" onClick={onReset} disabled={saving}>
          <RotateCcw className="h-4 w-4" />
          {t("admin.aftercareResetDefaults")}
        </Button>
      </div>
    </div>
  );
}

const AdminConsentFormsPanel = () => {
  const { t } = useTranslation();
  const [templates, setTemplates] = useState<ConsentFormTemplateRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState<ConsentFormTemplateRow | null>(null);
  const [saving, setSaving] = useState(false);
  const [shopName, setShopName] = useState("");

  const refresh = useCallback(async () => {
    const [rows, shop] = await Promise.all([loadShopConsentTemplates(true), loadShopSettings()]);
    setTemplates(rows);
    setShopName(shop?.shop_name?.trim() || shop?.trading_name?.trim() || "");
    setLoading(false);
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const startNew = () => {
    const base = defaultConsentForSlug("tattoo")!;
    setEditing({
      slug: "",
      name: "New consent form",
      version: "1.0",
      isActive: true,
      defaultForCategory: null,
      sortOrder: templates.length,
      content: { ...base, healthQuestions: [...base.healthQuestions], statements: [...base.statements] },
    });
  };

  const save = async () => {
    if (!editing) return;
    const slug = editing.slug || slugify(editing.name);
    if (!slug) {
      toast({ title: t("admin.consentSlugRequired"), variant: "destructive" });
      return;
    }
    setSaving(true);
    const { error } = await saveConsentFormTemplate({ ...editing, slug });
    setSaving(false);
    if (error) {
      toast({ title: t("settings.saveFailed"), description: error, variant: "destructive" });
      return;
    }
    toast({ title: t("settings.settingsSaved"), description: t("admin.consentSavedDesc") });
    setEditing(null);
    void refresh();
  };

  const reset = () => {
    if (!editing) return;
    const defaults = defaultConsentForSlug(editing.slug === "piercing" ? "piercing" : "tattoo");
    if (!defaults) return;
    if (!window.confirm(t("admin.aftercareResetConfirm"))) return;
    setEditing({
      ...editing,
      content: {
        ...defaults,
        healthQuestions: [...defaults.healthQuestions],
        statements: [...defaults.statements],
      },
    });
  };

  const remove = async (row: ConsentFormTemplateRow) => {
    if (!row.id) return;
    if (row.slug === "tattoo" || row.slug === "piercing") {
      toast({ title: t("admin.consentCannotDeleteBuiltIn"), variant: "destructive" });
      return;
    }
    if (!window.confirm(t("admin.consentDeleteConfirm", { name: row.name }))) return;
    const { error } = await deleteConsentFormTemplate(row.id);
    if (error) {
      toast({ title: t("settings.saveFailed"), description: error, variant: "destructive" });
      return;
    }
    toast({ title: t("admin.consentDeleted") });
    void refresh();
  };

  const copyLink = (slug: string) => {
    void navigator.clipboard.writeText(consentFormPublicUrl(slug));
    toast({ title: t("settings.linkCopied"), description: t("admin.consentLinkCopiedDesc") });
  };

  if (loading) {
    return <p className="text-sm text-muted-foreground">{t("common.loading")}</p>;
  }

  if (editing) {
    return (
      <ConsentFormEditor
        template={editing}
        onChange={setEditing}
        onSave={() => void save()}
        onReset={reset}
        onBack={() => setEditing(null)}
        saving={saving}
        isNew={!editing.id}
        shopName={shopName}
      />
    );
  }

  return (
    <div className="space-y-4">
      <Card className="border-border bg-card">
        <CardHeader className="pb-2">
          <div className="flex items-center justify-between gap-2 flex-wrap">
            <div className="flex items-center gap-2">
              <FileSignature className="h-5 w-5 text-primary" />
              <CardTitle className="text-base">{t("admin.consentFormsTitle")}</CardTitle>
            </div>
            <Button type="button" size="sm" className="gap-1" onClick={startNew}>
              <Plus className="h-4 w-4" />
              {t("admin.consentAddForm")}
            </Button>
          </div>
          <CardDescription>{t("admin.consentFormsIntro")}</CardDescription>
        </CardHeader>
        <CardContent>
          <ConsentHandSignNotice />
        </CardContent>
      </Card>

      <div className="grid gap-3 sm:grid-cols-2">
        {templates.map((row) => (
          <Card key={row.id ?? row.slug}>
            <CardContent className="pt-4 space-y-3">
              <div className="flex items-start justify-between gap-2">
                <div>
                  <p className="font-medium">{row.name}</p>
                  <p className="text-xs text-muted-foreground font-mono">/{row.slug}</p>
                </div>
                <div className="flex flex-col gap-1 items-end">
                  {row.isActive ? (
                    <Badge variant="default" className="text-[10px]">
                      {t("admin.consentActive")}
                    </Badge>
                  ) : (
                    <Badge variant="secondary" className="text-[10px]">
                      {t("admin.consentInactive")}
                    </Badge>
                  )}
                  {row.defaultForCategory ? (
                    <Badge variant="outline" className="text-[10px] capitalize">
                      {row.defaultForCategory}
                    </Badge>
                  ) : null}
                </div>
              </div>
              <p className="text-xs text-muted-foreground">
                {t("admin.consentVersionLabel", { version: row.version })}
              </p>
              <div className="flex flex-wrap gap-2">
                <Button type="button" size="sm" variant="default" onClick={() => setEditing(row)}>
                  {t("admin.consentEdit")}
                </Button>
                <Button type="button" size="sm" variant="outline" className="gap-1" onClick={() => copyLink(row.slug)}>
                  <Copy className="h-3.5 w-3.5" />
                  {t("admin.consentCopyLink")}
                </Button>
                {row.id && row.slug !== "tattoo" && row.slug !== "piercing" ? (
                  <Button type="button" size="sm" variant="ghost" className="text-destructive" onClick={() => void remove(row)}>
                    <Trash2 className="h-4 w-4" />
                  </Button>
                ) : null}
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      {templates.length === 0 ? (
        <p className="text-sm text-muted-foreground">{t("admin.consentNoForms")}</p>
      ) : null}
    </div>
  );
};

export default AdminConsentFormsPanel;
