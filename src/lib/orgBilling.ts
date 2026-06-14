import { supabase } from "@/integrations/supabase/client";
import { getUserOrganizationId } from "@/lib/shopSettings";
import type { ShopCountryCode, ShopCurrencyCode } from "@/lib/shopCurrency";

export interface OrgBillingContext {
  organizationId: string | null;
  countryCode: ShopCountryCode;
  currency: ShopCurrencyCode;
  stripeCountry: string;
  taxLabel: string;
  defaultTaxRate: number;
  pricesIncludeTax: boolean;
  taxExempt: boolean;
  taxRegistrationNumber: string | null;
  companyRegistrationNumber: string | null;
  invoiceLegalName: string | null;
  invoiceTradingName: string | null;
  invoiceAddressLine1: string | null;
  invoiceAddressLine2: string | null;
  invoiceCity: string | null;
  invoicePostcode: string | null;
  invoiceSupportEmail: string | null;
  invoiceNumberPrefix: string;
  organizationSlug: string | null;
  defaultPaymentMethod: "card" | "bank_transfer" | "cash";
  defaultPaymentTermDays: number;
}

export function sanitizeInvoiceNumberPrefix(prefix: string): string {
  const cleaned = prefix.toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 8);
  return cleaned.length >= 2 ? cleaned : "INV";
}

export function formatInvoiceNumberExample(prefix: string): string {
  const code = sanitizeInvoiceNumberPrefix(prefix);
  const date = new Date().toISOString().slice(2, 10).replace(/-/g, "");
  return `${code}-${date}-0001`;
}

export interface OrganizationBillingProfileRow {
  organization_id: string;
  country_code: string;
  currency: string;
  default_tax_rate: number;
  tax_label: string;
  tax_registration_number: string | null;
  company_registration_number: string | null;
  prices_include_tax: boolean;
  tax_exempt: boolean;
  invoice_legal_name: string;
  invoice_trading_name: string | null;
  invoice_address_line1: string | null;
  invoice_address_line2: string | null;
  invoice_city: string | null;
  invoice_postcode: string | null;
  invoice_support_email: string | null;
  invoice_number_prefix: string;
  default_payment_method: string;
  default_payment_term_days: number;
}

export function parseOrgBillingContext(raw: Record<string, unknown> | null): OrgBillingContext {
  return {
    organizationId: (raw?.organization_id as string | null) ?? null,
    countryCode: (raw?.country_code as ShopCountryCode) ?? "UK",
    currency: (raw?.currency as ShopCurrencyCode) ?? "gbp",
    stripeCountry: (raw?.stripe_country as string) ?? "GB",
    taxLabel: (raw?.tax_label as string) ?? "VAT",
    defaultTaxRate: Number(raw?.default_tax_rate ?? 0),
    pricesIncludeTax: !!raw?.prices_include_tax,
    taxExempt: !!raw?.tax_exempt,
    taxRegistrationNumber: (raw?.tax_registration_number as string | null) ?? null,
    companyRegistrationNumber: (raw?.company_registration_number as string | null) ?? null,
    invoiceLegalName: (raw?.invoice_legal_name as string | null) ?? null,
    invoiceTradingName: (raw?.invoice_trading_name as string | null) ?? null,
    invoiceAddressLine1: (raw?.invoice_address_line1 as string | null) ?? null,
    invoiceAddressLine2: (raw?.invoice_address_line2 as string | null) ?? null,
    invoiceCity: (raw?.invoice_city as string | null) ?? null,
    invoicePostcode: (raw?.invoice_postcode as string | null) ?? null,
    invoiceSupportEmail: (raw?.invoice_support_email as string | null) ?? null,
    invoiceNumberPrefix: (raw?.invoice_number_prefix as string) ?? "INV",
    organizationSlug: (raw?.organization_slug as string | null) ?? null,
    defaultPaymentMethod: (raw?.default_payment_method as OrgBillingContext["defaultPaymentMethod"]) ?? "card",
    defaultPaymentTermDays: Number(raw?.default_payment_term_days ?? 7),
  };
}

export async function loadOrgBillingContext(orgId?: string | null): Promise<OrgBillingContext> {
  const resolvedOrgId = orgId ?? (await getUserOrganizationId());
  const { data, error } = await supabase.rpc("get_org_billing_context", {
    _org_id: resolvedOrgId,
  });
  if (error || !data) {
    return parseOrgBillingContext(null);
  }
  return parseOrgBillingContext(data as Record<string, unknown>);
}

export async function loadOrganizationBillingProfile(
  orgId?: string | null,
): Promise<OrganizationBillingProfileRow | null> {
  const resolvedOrgId = orgId ?? (await getUserOrganizationId());
  if (!resolvedOrgId) return null;
  const { data, error } = await supabase
    .from("organization_billing_profiles" as any)
    .select("*")
    .eq("organization_id", resolvedOrgId)
    .maybeSingle();
  if (error || !data) return null;
  return data as OrganizationBillingProfileRow;
}

export type BillingProfilePatch = Partial<
  Pick<
    OrganizationBillingProfileRow,
    | "default_tax_rate"
    | "tax_label"
    | "tax_registration_number"
    | "company_registration_number"
    | "prices_include_tax"
    | "tax_exempt"
    | "invoice_legal_name"
    | "invoice_trading_name"
    | "invoice_address_line1"
    | "invoice_address_line2"
    | "invoice_city"
    | "invoice_postcode"
    | "invoice_support_email"
    | "invoice_number_prefix"
    | "default_payment_method"
    | "default_payment_term_days"
  >
>;

export async function saveOrganizationBillingProfile(
  orgId: string,
  patch: BillingProfilePatch,
): Promise<{ error: string | null }> {
  const { error } = await supabase
    .from("organization_billing_profiles" as any)
    .update({ ...patch, updated_at: new Date().toISOString() })
    .eq("organization_id", orgId);
  return { error: error?.message ?? null };
}

export async function allocateInvoiceNumber(orgId?: string | null): Promise<string> {
  const resolvedOrgId = orgId ?? (await getUserOrganizationId());
  const { data, error } = await supabase.rpc("allocate_invoice_number", {
    _org_id: resolvedOrgId,
  });
  if (error || !data) {
    const ctx = await loadOrgBillingContext(resolvedOrgId);
    const prefix = sanitizeInvoiceNumberPrefix(ctx.invoiceNumberPrefix);
    const date = new Date().toISOString().slice(2, 10).replace(/-/g, "");
    const rand = Math.random().toString(36).substring(2, 6).toUpperCase();
    return `${prefix}-${date}-${rand}`;
  }
  return String(data);
}

export function computeInvoiceTotals(
  lineGross: number,
  taxRate: number,
  pricesIncludeTax: boolean,
): { subtotal: number; taxAmount: number; total: number } {
  const rate = Math.max(0, Number(taxRate) || 0);
  const gross = Math.max(0, Number(lineGross) || 0);
  if (rate <= 0) {
    return { subtotal: gross, taxAmount: 0, total: gross };
  }
  if (pricesIncludeTax) {
    const taxAmount = gross - gross / (1 + rate / 100);
    const subtotal = gross - taxAmount;
    return { subtotal, taxAmount, total: gross };
  }
  const subtotal = gross;
  const taxAmount = (subtotal * rate) / 100;
  return { subtotal, taxAmount, total: subtotal + taxAmount };
}
