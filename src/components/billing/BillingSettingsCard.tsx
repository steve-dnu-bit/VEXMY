import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "sonner";
import { getUserOrganizationId } from "@/lib/shopSettings";
import {
  formatInvoiceNumberExample,
  loadOrganizationBillingProfile,
  loadOrgBillingContext,
  saveOrganizationBillingProfile,
  type OrganizationBillingProfileRow,
} from "@/lib/orgBilling";

const BillingSettingsCard = () => {
  const { t } = useTranslation();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [orgId, setOrgId] = useState<string | null>(null);
  const [currency, setCurrency] = useState("gbp");
  const [countryCode, setCountryCode] = useState("UK");
  const [orgSlug, setOrgSlug] = useState<string | null>(null);
  const [profile, setProfile] = useState<OrganizationBillingProfileRow | null>(null);

  useEffect(() => {
    void (async () => {
      const id = await getUserOrganizationId();
      setOrgId(id);
      const ctx = await loadOrgBillingContext(id);
      setCurrency(ctx.currency);
      setCountryCode(ctx.countryCode);
      setOrgSlug(ctx.organizationSlug);
      const row = await loadOrganizationBillingProfile(id);
      setProfile(row);
      setLoading(false);
    })();
  }, []);

  const patch = (partial: Partial<OrganizationBillingProfileRow>) => {
    if (!profile) return;
    setProfile({ ...profile, ...partial });
  };

  const save = async () => {
    if (!orgId || !profile) return;
    setSaving(true);
    const { error } = await saveOrganizationBillingProfile(orgId, {
      default_tax_rate: Number(profile.default_tax_rate) || 0,
      tax_label: profile.tax_label,
      tax_registration_number: profile.tax_registration_number,
      company_registration_number: profile.company_registration_number,
      prices_include_tax: profile.prices_include_tax,
      tax_exempt: profile.tax_exempt,
      invoice_legal_name: profile.invoice_legal_name,
      invoice_trading_name: profile.invoice_trading_name,
      invoice_address_line1: profile.invoice_address_line1,
      invoice_address_line2: profile.invoice_address_line2,
      invoice_city: profile.invoice_city,
      invoice_postcode: profile.invoice_postcode,
      invoice_support_email: profile.invoice_support_email,
      default_payment_method: profile.default_payment_method,
      default_payment_term_days: profile.default_payment_term_days,
    });
    setSaving(false);
    if (error) {
      toast.error(error);
      return;
    }
    toast.success(t("billing.settingsSaved"));
  };

  if (loading) {
    return (
      <Card>
        <CardContent className="p-6 text-sm text-muted-foreground">{t("common.loading")}</CardContent>
      </Card>
    );
  }

  if (!profile) {
    return (
      <Card>
        <CardContent className="p-6 text-sm text-muted-foreground">{t("billing.settingsUnavailable")}</CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">{t("billing.settingsTitle")}</CardTitle>
        <CardDescription>
          {t("billing.settingsSubtitle", { country: countryCode, currency: currency.toUpperCase() })}
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="rounded-md bg-muted/50 p-3 text-xs text-muted-foreground">
          {t("billing.settingsCountryHint")} · {t("billing.settingsCurrencyLabel")}: {currency.toUpperCase()}
        </div>

        <div className="grid sm:grid-cols-2 gap-4">
          <div>
            <Label className="text-xs">{t("billing.taxLabel")}</Label>
            <Input
              className="mt-1"
              value={profile.tax_label}
              onChange={(e) => patch({ tax_label: e.target.value })}
            />
          </div>
          <div>
            <Label className="text-xs">{t("billing.defaultTaxRate")}</Label>
            <Input
              className="mt-1"
              type="number"
              min={0}
              step={0.01}
              disabled={profile.tax_exempt}
              value={profile.default_tax_rate}
              onChange={(e) => patch({ default_tax_rate: parseFloat(e.target.value) || 0 })}
            />
          </div>
        </div>

        <div className="flex items-center justify-between gap-4">
          <div>
            <Label>{t("billing.taxExempt")}</Label>
            <p className="text-xs text-muted-foreground">{t("billing.taxExemptHint")}</p>
          </div>
          <Switch checked={profile.tax_exempt} onCheckedChange={(v) => patch({ tax_exempt: v })} />
        </div>

        <div className="flex items-center justify-between gap-4">
          <div>
            <Label>{t("billing.pricesIncludeTax")}</Label>
            <p className="text-xs text-muted-foreground">{t("billing.pricesIncludeTaxHint")}</p>
          </div>
          <Switch
            checked={profile.prices_include_tax}
            onCheckedChange={(v) => patch({ prices_include_tax: v })}
          />
        </div>

        <div className="grid sm:grid-cols-2 gap-4">
          <div>
            <Label className="text-xs">{t("billing.taxRegistrationNumber")}</Label>
            <Input
              className="mt-1"
              value={profile.tax_registration_number || ""}
              onChange={(e) => patch({ tax_registration_number: e.target.value || null })}
              placeholder={t("billing.taxRegistrationPlaceholder")}
            />
          </div>
          <div>
            <Label className="text-xs">{t("billing.companyRegistrationNumber")}</Label>
            <Input
              className="mt-1"
              value={profile.company_registration_number || ""}
              onChange={(e) => patch({ company_registration_number: e.target.value || null })}
            />
          </div>
        </div>

        <div className="grid sm:grid-cols-2 gap-4">
          <div>
            <Label className="text-xs">{t("billing.invoiceLegalName")}</Label>
            <Input
              className="mt-1"
              value={profile.invoice_legal_name}
              onChange={(e) => patch({ invoice_legal_name: e.target.value })}
            />
          </div>
          <div>
            <Label className="text-xs">{t("billing.invoiceTradingName")}</Label>
            <Input
              className="mt-1"
              value={profile.invoice_trading_name || ""}
              onChange={(e) => patch({ invoice_trading_name: e.target.value || null })}
            />
          </div>
        </div>

        <div className="grid sm:grid-cols-2 gap-4">
          <div>
            <Label className="text-xs">{t("billing.invoicePrefix")}</Label>
            <Input
              className="mt-1 uppercase font-mono"
              readOnly
              value={profile.invoice_number_prefix}
            />
            <p className="mt-1 text-xs text-muted-foreground">
              {t("billing.invoicePrefixHint", { slug: orgSlug ?? "—" })}
            </p>
            <p className="text-xs font-mono text-muted-foreground">
              {t("billing.invoicePrefixExample", {
                example: formatInvoiceNumberExample(profile.invoice_number_prefix),
              })}
            </p>
          </div>
          <div>
            <Label className="text-xs">{t("billing.defaultPaymentTermDays")}</Label>
            <Input
              className="mt-1"
              type="number"
              min={0}
              value={profile.default_payment_term_days}
              onChange={(e) => patch({ default_payment_term_days: parseInt(e.target.value, 10) || 0 })}
            />
          </div>
        </div>

        <div>
          <Label className="text-xs">{t("billing.defaultPaymentMethod")}</Label>
          <Select
            value={profile.default_payment_method}
            onValueChange={(v) => patch({ default_payment_method: v })}
          >
            <SelectTrigger className="mt-1">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="card">{t("billing.card")}</SelectItem>
              <SelectItem value="bank_transfer">{t("billing.bankTransfer")}</SelectItem>
              <SelectItem value="cash">{t("billing.cash")}</SelectItem>
            </SelectContent>
          </Select>
        </div>

        <Button onClick={save} disabled={saving}>
          {saving ? t("billing.saving") : t("billing.saveBillingSettings")}
        </Button>
      </CardContent>
    </Card>
  );
};

export default BillingSettingsCard;
