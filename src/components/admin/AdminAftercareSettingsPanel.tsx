import { useEffect, useState } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Checkbox } from "@/components/ui/checkbox";
import { toast } from "@/hooks/use-toast";
import { HeartPulse, Plus, RotateCcw, Trash2 } from "lucide-react";
import { useTranslation } from "react-i18next";
import {
  loadShopAftercareTemplates,
  resetShopAftercareTemplate,
  saveShopAftercareTemplate,
  type AftercareKind,
  type AftercareSection,
  type ShopAftercareTemplate,
} from "@/lib/shopAftercareTemplates";

function emptySection(): AftercareSection {
  return { title: "New section", listItems: [""] };
}

function AftercareEditor({
  template,
  onChange,
  onSave,
  onReset,
  saving,
}: {
  template: ShopAftercareTemplate;
  onChange: (next: ShopAftercareTemplate) => void;
  onSave: () => void;
  onReset: () => void;
  saving: boolean;
}) {
  const { t } = useTranslation();

  const updateSection = (index: number, patch: Partial<AftercareSection>) => {
    const sections = template.sections.map((s, i) => (i === index ? { ...s, ...patch } : s));
    onChange({ ...template, sections });
  };

  const updateListItem = (sectionIndex: number, itemIndex: number, value: string) => {
    const sections = [...template.sections];
    const section = { ...sections[sectionIndex] };
    const items = [...(section.listItems || [])];
    items[itemIndex] = value;
    section.listItems = items;
    sections[sectionIndex] = section;
    onChange({ ...template, sections });
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between rounded-lg border border-border px-3 py-2">
        <Label htmlFor={`${template.kind}-enabled`}>{t("admin.aftercareEnable")}</Label>
        <Switch
          id={`${template.kind}-enabled`}
          checked={template.enabled}
          onCheckedChange={(v) => onChange({ ...template, enabled: v })}
        />
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        <div>
          <Label>{t("admin.aftercareBadge")}</Label>
          <Input
            value={template.badge}
            onChange={(e) => onChange({ ...template, badge: e.target.value })}
            className="mt-1"
          />
        </div>
        <div>
          <Label>{t("admin.aftercareEmailSubject")}</Label>
          <Input
            value={template.emailSubject}
            onChange={(e) => onChange({ ...template, emailSubject: e.target.value })}
            className="mt-1"
          />
        </div>
      </div>

      <div>
        <Label>{t("admin.aftercareGuideTitle")}</Label>
        <Input
          value={template.title}
          onChange={(e) => onChange({ ...template, title: e.target.value })}
          className="mt-1"
        />
      </div>

      <div>
        <Label>{t("admin.aftercareIntro")}</Label>
        <p className="text-xs text-muted-foreground mt-0.5 mb-1">{t("admin.aftercareIntroHint")}</p>
        <Textarea
          value={template.introTemplate}
          onChange={(e) => onChange({ ...template, introTemplate: e.target.value })}
          rows={4}
          className="bg-secondary font-mono text-sm"
        />
      </div>

      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <Label className="text-base">{t("admin.aftercareSections")}</Label>
          <Button type="button" variant="outline" size="sm" className="gap-1" onClick={() => onChange({ ...template, sections: [...template.sections, emptySection()] })}>
            <Plus className="h-3.5 w-3.5" />
            {t("admin.aftercareAddSection")}
          </Button>
        </div>

        {template.sections.map((section, sectionIndex) => (
          <Card key={sectionIndex} className="border-border/80">
            <CardHeader className="py-3 px-4">
              <div className="flex items-start gap-2">
                <Input
                  value={section.title}
                  onChange={(e) => updateSection(sectionIndex, { title: e.target.value })}
                  className="bg-secondary font-medium"
                />
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  className="shrink-0 text-destructive"
                  onClick={() => onChange({ ...template, sections: template.sections.filter((_, i) => i !== sectionIndex) })}
                >
                  <Trash2 className="h-4 w-4" />
                </Button>
              </div>
            </CardHeader>
            <CardContent className="px-4 pb-4 pt-0 space-y-3">
              <div className="flex flex-wrap gap-4">
                <div className="flex items-center gap-2">
                  <Checkbox
                    id={`${template.kind}-list-${sectionIndex}`}
                    checked={!!section.listItems?.length && !section.bodyHtml}
                    onCheckedChange={(checked) => {
                      if (checked) {
                        updateSection(sectionIndex, { bodyHtml: undefined, listItems: section.listItems?.length ? section.listItems : [""] });
                      } else {
                        updateSection(sectionIndex, { listItems: undefined, bodyHtml: section.bodyHtml || "" });
                      }
                    }}
                  />
                  <Label htmlFor={`${template.kind}-list-${sectionIndex}`} className="text-sm font-normal">
                    {t("admin.aftercareBulletList")}
                  </Label>
                </div>
                {section.listItems?.length ? (
                  <div className="flex items-center gap-2">
                    <Checkbox
                      id={`${template.kind}-ordered-${sectionIndex}`}
                      checked={!!section.orderedList}
                      onCheckedChange={(v) => updateSection(sectionIndex, { orderedList: !!v })}
                    />
                    <Label htmlFor={`${template.kind}-ordered-${sectionIndex}`} className="text-sm font-normal">
                      {t("admin.aftercareNumberedList")}
                    </Label>
                  </div>
                ) : null}
              </div>

              {section.listItems?.length ? (
                <div className="space-y-2">
                  {section.listItems.map((item, itemIndex) => (
                    <div key={itemIndex} className="flex gap-2">
                      <Textarea
                        value={item}
                        onChange={(e) => updateListItem(sectionIndex, itemIndex, e.target.value)}
                        rows={2}
                        className="bg-secondary text-sm flex-1"
                      />
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        className="shrink-0"
                        onClick={() => {
                          const items = section.listItems!.filter((_, i) => i !== itemIndex);
                          updateSection(sectionIndex, { listItems: items.length ? items : [""] });
                        }}
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                  ))}
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => updateSection(sectionIndex, { listItems: [...(section.listItems || []), ""] })}
                  >
                    {t("admin.aftercareAddBullet")}
                  </Button>
                </div>
              ) : (
                <div>
                  <Label className="text-xs text-muted-foreground">{t("admin.aftercareParagraphHtml")}</Label>
                  <Textarea
                    value={section.bodyHtml || ""}
                    onChange={(e) => updateSection(sectionIndex, { bodyHtml: e.target.value, listItems: undefined })}
                    rows={4}
                    className="mt-1 font-mono text-xs"
                  />
                </div>
              )}
            </CardContent>
          </Card>
        ))}
      </div>

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

const AdminAftercareSettingsPanel = () => {
  const { t } = useTranslation();
  const [templates, setTemplates] = useState<ShopAftercareTemplate[]>([]);
  const [loading, setLoading] = useState(true);
  const [savingKind, setSavingKind] = useState<AftercareKind | null>(null);
  const [activeKind, setActiveKind] = useState<AftercareKind>("tattoo");

  useEffect(() => {
    let cancelled = false;
    void loadShopAftercareTemplates().then((loaded) => {
      if (!cancelled) {
        setTemplates(loaded);
        setLoading(false);
      }
    });
    return () => {
      cancelled = true;
    };
  }, []);

  const current = templates.find((x) => x.kind === activeKind);

  const setForKind = (kind: AftercareKind, next: ShopAftercareTemplate) => {
    setTemplates((prev) => prev.map((t) => (t.kind === kind ? next : t)));
  };

  const save = async (kind: AftercareKind) => {
    const tpl = templates.find((x) => x.kind === kind);
    if (!tpl) return;
    setSavingKind(kind);
    const { error } = await saveShopAftercareTemplate(tpl);
    setSavingKind(null);
    if (error) {
      toast({ title: t("settings.saveFailed"), description: error, variant: "destructive" });
      return;
    }
    toast({ title: t("settings.settingsSaved"), description: t("admin.aftercareSavedDesc") });
  };

  const reset = async (kind: AftercareKind) => {
    if (!window.confirm(t("admin.aftercareResetConfirm"))) return;
    setSavingKind(kind);
    const { error } = await resetShopAftercareTemplate(kind);
    setSavingKind(null);
    if (error) {
      toast({ title: t("settings.saveFailed"), description: error, variant: "destructive" });
      return;
    }
    const loaded = await loadShopAftercareTemplates();
    setTemplates(loaded);
    toast({ title: t("admin.aftercareResetDone") });
  };

  if (loading) {
    return <p className="text-sm text-muted-foreground">{t("common.loading")}</p>;
  }

  return (
    <div className="space-y-4 max-w-3xl">
      <Card className="border-border bg-card">
        <CardHeader className="pb-2">
          <div className="flex items-center gap-2">
            <HeartPulse className="h-5 w-5 text-primary" />
            <CardTitle className="text-base">{t("admin.aftercareTitle")}</CardTitle>
          </div>
          <CardDescription>{t("admin.aftercareIntroPanel")}</CardDescription>
        </CardHeader>
      </Card>

      <Tabs value={activeKind} onValueChange={(v) => setActiveKind(v as AftercareKind)}>
        <TabsList>
          <TabsTrigger value="tattoo">{t("admin.aftercareTabTattoo")}</TabsTrigger>
          <TabsTrigger value="piercing">{t("admin.aftercareTabPiercing")}</TabsTrigger>
        </TabsList>
        {(["tattoo", "piercing"] as const).map((kind) => {
          const tpl = templates.find((x) => x.kind === kind);
          if (!tpl) return null;
          return (
            <TabsContent key={kind} value={kind} className="mt-4">
              <AftercareEditor
                template={tpl}
                onChange={(next) => setForKind(kind, next)}
                onSave={() => void save(kind)}
                onReset={() => void reset(kind)}
                saving={savingKind === kind}
              />
            </TabsContent>
          );
        })}
      </Tabs>

      {current ? (
        <p className="text-xs text-muted-foreground">
          {t("admin.aftercareSendNote")}
        </p>
      ) : null}
    </div>
  );
};

export default AdminAftercareSettingsPanel;
