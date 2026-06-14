import type { SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";

export type OrgBillingContext = {
  organizationId: string | null;
  countryCode: string;
  currency: string;
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
  defaultPaymentMethod: string;
  defaultPaymentTermDays: number;
};

function parseOrgBillingContext(raw: Record<string, unknown> | null): OrgBillingContext {
  return {
    organizationId: (raw?.organization_id as string | null) ?? null,
    countryCode: (raw?.country_code as string) ?? "UK",
    currency: (raw?.currency as string) ?? "gbp",
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
    defaultPaymentMethod: (raw?.default_payment_method as string) ?? "card",
    defaultPaymentTermDays: Number(raw?.default_payment_term_days ?? 7),
  };
}

export async function getOrgBillingContext(
  admin: SupabaseClient,
  organizationId: string | null | undefined,
): Promise<OrgBillingContext> {
  const { data, error } = await admin.rpc("get_org_billing_context", {
    _org_id: organizationId ?? null,
  });
  if (error || !data) {
    return parseOrgBillingContext(null);
  }
  return parseOrgBillingContext(data as Record<string, unknown>);
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
