import { useEffect, useMemo, useState } from "react";
import { addDays, format } from "date-fns";
import { FilePlus, Plus, Search, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { invokeEdgeFunctionJson } from "@/lib/edgeFunctions";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { useTranslation } from "react-i18next";
import {
  allocateInvoiceNumber,
  computeInvoiceTotals,
  loadOrgBillingContext,
  type OrgBillingContext,
} from "@/lib/orgBilling";
import { formatShopMoney } from "@/lib/shopCurrency";
import { getUserOrganizationId } from "@/lib/shopSettings";

interface LineItem {
  description: string;
  quantity: number;
  unit_price: number;
}

interface Company {
  id: string;
  name: string;
  legal_name?: string;
}

interface Props {
  companies: Company[];
  userId: string;
  onCreated: () => void;
}

type PaymentMethod = "card" | "bank_transfer" | "cash";

interface ClientSuggestion {
  client_name: string;
  client_email: string | null;
  client_phone: string | null;
}

interface LineTemplate {
  id: string;
  description: string;
  unit_price: number;
  default_quantity: number;
}

const CreateInvoiceDialog = ({ companies, userId, onCreated }: Props) => {
  const { t } = useTranslation();
  const defaultCompany = useMemo(() => companies[0] ?? null, [companies]);
  const [billing, setBilling] = useState<OrgBillingContext | null>(null);
  const [open, setOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [clientName, setClientName] = useState("");
  const [clientEmail, setClientEmail] = useState("");
  const [clientSearch, setClientSearch] = useState("");
  const [suggestions, setSuggestions] = useState<ClientSuggestion[]>([]);
  const [suggestionsOpen, setSuggestionsOpen] = useState(false);
  const [suggestionsLoading, setSuggestionsLoading] = useState(false);
  const [dueDate, setDueDate] = useState("");
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod>("card");
  const [notes, setNotes] = useState("");
  const [taxRate, setTaxRate] = useState(0);
  const [items, setItems] = useState<LineItem[]>([{ description: "", quantity: 1, unit_price: 0 }]);
  const [lineTemplates, setLineTemplates] = useState<LineTemplate[]>([]);

  const currency = billing?.currency ?? "gbp";
  const taxLabel = billing?.taxLabel ?? "VAT";
  const pricesIncludeTax = billing?.pricesIncludeTax ?? false;

  const lineGross = items.reduce((s, i) => s + i.quantity * i.unit_price, 0);
  const { subtotal, taxAmount, total } = computeInvoiceTotals(lineGross, taxRate, pricesIncludeTax);

  const addItem = () => setItems([...items, { description: "", quantity: 1, unit_price: 0 }]);
  const removeItem = (i: number) => setItems(items.filter((_, idx) => idx !== i));
  const updateItem = (i: number, field: keyof LineItem, value: string | number) => {
    setItems(items.map((item, idx) => (idx === i ? { ...item, [field]: value } : item)));
  };

  const fetchClientSuggestions = async (query: string) => {
    const q = query.trim();
    if (q.length < 2) {
      setSuggestions([]);
      return;
    }
    setSuggestionsLoading(true);
    try {
      const pattern = `%${q}%`;
      const [byName, byEmail, importedByName, importedByEmail, customerRoles] = await Promise.all([
        supabase
          .from("bookings")
          .select("client_name, client_email, client_phone")
          .ilike("client_name", pattern)
          .order("starts_at", { ascending: false })
          .limit(25),
        supabase
          .from("bookings")
          .select("client_name, client_email, client_phone")
          .ilike("client_email", pattern)
          .order("starts_at", { ascending: false })
          .limit(25),
        supabase
          .from("contacts_import" as any)
          .select("name, email, phone")
          .ilike("name", pattern)
          .limit(25),
        supabase
          .from("contacts_import" as any)
          .select("name, email, phone")
          .ilike("email", pattern)
          .limit(25),
        supabase.from("user_roles").select("user_id").eq("role", "customer"),
      ]);
      const map = new Map<string, ClientSuggestion>();
      for (const row of [...(byName.data || []), ...(byEmail.data || [])]) {
        const key = `${row.client_name}|${row.client_email || ""}|${row.client_phone || ""}`.toLowerCase();
        if (!map.has(key) && row.client_name) {
          map.set(key, {
            client_name: row.client_name,
            client_email: row.client_email,
            client_phone: row.client_phone,
          });
        }
      }
      for (const row of [...(importedByName.data || []), ...(importedByEmail.data || [])]) {
        const name = (row.name || "").trim();
        if (!name) continue;
        const email = row.email || null;
        const phone = row.phone || null;
        const key = `${name}|${email || ""}|${phone || ""}`.toLowerCase();
        if (!map.has(key)) {
          map.set(key, { client_name: name, client_email: email, client_phone: phone });
        }
      }
      const customerIds = (customerRoles.data || []).map((r) => r.user_id).filter(Boolean);
      if (customerIds.length > 0) {
        const { data: customerProfiles } = await supabase
          .from("profiles")
          .select("display_name, phone")
          .in("user_id", customerIds)
          .ilike("display_name", pattern)
          .limit(25);
        for (const profile of customerProfiles || []) {
          const name = (profile.display_name || "").trim();
          if (!name) continue;
          const phone = profile.phone || null;
          const key = `${name}||${phone || ""}`.toLowerCase();
          if (!map.has(key)) {
            map.set(key, { client_name: name, client_email: null, client_phone: phone });
          }
        }
      }
      setSuggestions([...map.values()].slice(0, 12));
    } finally {
      setSuggestionsLoading(false);
    }
  };

  const fetchLineTemplates = async () => {
    const { data, error } = await supabase
      .from("invoice_line_item_templates" as any)
      .select("id, description, unit_price, default_quantity")
      .eq("created_by", userId)
      .order("description");
    if (error) return;
    setLineTemplates((data || []) as LineTemplate[]);
  };

  const applyTemplate = (index: number, templateId: string) => {
    const tmpl = lineTemplates.find((x) => x.id === templateId);
    if (!tmpl) return;
    setItems((prev) =>
      prev.map((item, i) =>
        i === index
          ? {
              ...item,
              description: tmpl.description,
              unit_price: Number(tmpl.unit_price || 0),
              quantity: Number(tmpl.default_quantity || 1),
            }
          : item,
      ),
    );
  };

  const saveItemAsTemplate = async (index: number) => {
    const row = items[index];
    if (!row?.description?.trim()) {
      toast.error(t("billing.lineItemSaveFirst"));
      return;
    }
    const payload = {
      created_by: userId,
      description: row.description.trim(),
      unit_price: Number(row.unit_price || 0),
      default_quantity: Number(row.quantity || 1),
    };
    const { error } = await supabase
      .from("invoice_line_item_templates" as any)
      .upsert(payload, { onConflict: "created_by,description" });
    if (error) {
      toast.error(error.message || t("billing.lineItemSaveFailed"));
      return;
    }
    toast.success(t("billing.lineItemSaved"));
    fetchLineTemplates();
  };

  const applySuggestion = (s: ClientSuggestion) => {
    setClientName(s.client_name);
    setClientEmail(s.client_email || "");
    setClientSearch(s.client_name);
    setSuggestionsOpen(false);
  };

  const resetForm = async () => {
    const ctx = await loadOrgBillingContext();
    setBilling(ctx);
    const defaultDue = format(addDays(new Date(), ctx.defaultPaymentTermDays || 7), "yyyy-MM-dd");
    setClientName("");
    setClientEmail("");
    setClientSearch("");
    setSuggestions([]);
    setSuggestionsOpen(false);
    setDueDate(defaultDue);
    setPaymentMethod(ctx.defaultPaymentMethod);
    setNotes("");
    setTaxRate(ctx.taxExempt ? 0 : ctx.defaultTaxRate);
    setItems([{ description: "", quantity: 1, unit_price: 0 }]);
    fetchLineTemplates();
  };

  useEffect(() => {
    if (open) void resetForm();
  }, [open]);

  const handleSave = async () => {
    if (!clientName.trim()) {
      toast.error(t("billing.clientNameRequired"));
      return;
    }
    if (!clientEmail.trim()) {
      toast.error(t("billing.clientEmailRequired"));
      return;
    }
    if (items.some((i) => !i.description.trim())) {
      toast.error(t("billing.lineDescriptionRequired"));
      return;
    }

    setSaving(true);
    const orgId = await getUserOrganizationId();
    const invoiceNumber = await allocateInvoiceNumber(orgId);

    const { data: createdRows, error } = await supabase
      .from("invoices" as any)
      .insert({
        invoice_number: invoiceNumber,
        organization_id: orgId,
        client_name: clientName,
        client_email: clientEmail || null,
        company_id: defaultCompany?.id || null,
        items: items as any,
        subtotal,
        tax_rate: taxRate,
        tax_amount: taxAmount,
        total,
        currency,
        tax_label: taxLabel,
        prices_include_tax: pricesIncludeTax,
        notes: notes || null,
        due_date: dueDate || null,
        payment_method: paymentMethod,
        payment_term: "due",
        created_by: userId,
        status: "draft",
      } as any)
      .select("id")
      .limit(1);

    if (error) {
      setSaving(false);
      toast.error(error.message || t("billing.failedCreateInvoice"));
      return;
    }

    const invoiceId = createdRows?.[0]?.id as string | undefined;
    if (!invoiceId) {
      setSaving(false);
      toast.error(t("billing.invoiceMissingId"));
      return;
    }

    const { data: sendData, error: sendError } = await invokeEdgeFunctionJson("send-invoice", { invoiceId });
    if (sendError || (sendData as any)?.error) {
      setSaving(false);
      toast.error((sendData as any)?.error || sendError?.message || t("billing.savedFailedSend"));
      return;
    }
    const emailSent = !!(sendData as any)?.emailSent;
    const emailError = ((sendData as any)?.emailError as string | null | undefined) ?? null;
    if (!emailSent) {
      setSaving(false);
      toast.error(t("billing.savedEmailNotSent", { reason: emailError || "Unknown email delivery error" }));
      return;
    }

    const { error: markError } = await supabase.from("invoices" as any).update({ status: "sent" }).eq("id", invoiceId);
    if (markError) {
      setSaving(false);
      toast.error(markError.message || t("billing.sentStatusUpdateFailed"));
      return;
    }

    setSaving(false);
    toast.success(t("billing.invoiceSavedSent"));
    setOpen(false);
    onCreated();
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button size="sm" className="gap-2">
          <FilePlus className="h-4 w-4" /> {t("billing.createInvoice")}
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto mx-4">
        <DialogHeader>
          <DialogTitle>{t("billing.createInvoice")}</DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          <div>
            <Label className="text-xs">{t("billing.searchClient")}</Label>
            <div className="relative mt-1">
              <Search className="absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
              <Input
                value={clientSearch}
                onChange={(e) => {
                  const v = e.target.value;
                  setClientSearch(v);
                  setSuggestionsOpen(v.trim().length >= 2);
                  void fetchClientSuggestions(v);
                }}
                placeholder={t("billing.searchPlaceholder")}
                className="pl-8"
              />
            </div>
            {suggestionsOpen && (
              <div className="mt-1 rounded-md border border-border bg-popover shadow-md">
                {suggestionsLoading ? (
                  <p className="px-3 py-2 text-xs text-muted-foreground">{t("billing.searching")}</p>
                ) : suggestions.length === 0 ? (
                  <p className="px-3 py-2 text-xs text-muted-foreground">{t("billing.noMatches")}</p>
                ) : (
                  suggestions.map((s, i) => (
                    <button
                      type="button"
                      key={`${s.client_name}-${s.client_email}-${i}`}
                      onClick={() => applySuggestion(s)}
                      className="w-full px-3 py-2 text-left hover:bg-accent text-sm"
                    >
                      <p className="font-medium">{s.client_name}</p>
                      <p className="text-xs text-muted-foreground">
                        {[s.client_email, s.client_phone].filter(Boolean).join(" · ") || t("billing.noEmailPhone")}
                      </p>
                    </button>
                  ))
                )}
              </div>
            )}
          </div>

          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div>
              <Label className="text-xs">{t("billing.clientName")}</Label>
              <Input value={clientName} onChange={(e) => setClientName(e.target.value)} placeholder={t("billing.client")} />
            </div>
            <div>
              <Label className="text-xs">{t("billing.clientEmail")}</Label>
              <Input value={clientEmail} onChange={(e) => setClientEmail(e.target.value)} placeholder="email@example.com" />
            </div>
          </div>

          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div>
              <Label className="text-xs">{t("billing.companyLabel")}</Label>
              <Input value={billing?.invoiceLegalName || defaultCompany?.legal_name || t("billing.yourStudio")} readOnly />
            </div>
            <div>
              <Label className="text-xs">{t("billing.dueDateLabel")}</Label>
              <Input type="date" value={dueDate} onChange={(e) => setDueDate(e.target.value)} />
            </div>
          </div>

          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div>
              <Label className="text-xs">{t("billing.paymentMethod")}</Label>
              <Select value={paymentMethod} onValueChange={(v) => setPaymentMethod(v as PaymentMethod)}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="card">{t("billing.card")}</SelectItem>
                  <SelectItem value="bank_transfer">{t("billing.bankTransfer")}</SelectItem>
                  <SelectItem value="cash">{t("billing.cash")}</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          <div>
            <Label className="text-xs mb-2 block">{t("billing.lineItems")}</Label>
            <div className="space-y-2">
              {items.map((item, i) => (
                <div key={i} className="rounded-md border border-border p-2 space-y-2">
                  <div className="grid grid-cols-1 sm:grid-cols-4 gap-2 items-center">
                    <div className="sm:col-span-2">
                      <Label className="text-[10px] text-muted-foreground">{t("billing.savedItem")}</Label>
                      <Select onValueChange={(v) => applyTemplate(i, v)}>
                        <SelectTrigger className="h-8">
                          <SelectValue placeholder={lineTemplates.length ? t("billing.chooseSavedItem") : t("billing.noSavedItems")} />
                        </SelectTrigger>
                        <SelectContent>
                          {lineTemplates.map((tmpl) => (
                            <SelectItem key={tmpl.id} value={tmpl.id}>
                              {tmpl.description} · {formatShopMoney(Number(tmpl.unit_price), currency)}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="sm:col-span-2 flex justify-start sm:justify-end pt-4 sm:pt-0">
                      <Button type="button" variant="outline" size="sm" className="h-8 text-[10px]" onClick={() => saveItemAsTemplate(i)}>
                        {t("billing.saveThisItem")}
                      </Button>
                    </div>
                  </div>

                  <div className="flex flex-col items-stretch gap-2 sm:flex-row sm:items-center">
                    <Input
                      className="flex-1"
                      placeholder={t("billing.description")}
                      value={item.description}
                      onChange={(e) => updateItem(i, "description", e.target.value)}
                    />
                    <Input
                      className="w-16"
                      type="number"
                      min={1}
                      placeholder={t("billing.qty")}
                      value={item.quantity || ""}
                      onChange={(e) => updateItem(i, "quantity", parseInt(e.target.value, 10) || 1)}
                    />
                    <Input
                      className="w-24"
                      type="number"
                      min={0}
                      step={0.01}
                      placeholder={t("billing.price")}
                      value={item.unit_price || ""}
                      onChange={(e) => updateItem(i, "unit_price", parseFloat(e.target.value) || 0)}
                    />
                    {items.length > 1 && (
                      <Button variant="ghost" size="sm" className="h-8 w-8 p-0" onClick={() => removeItem(i)}>
                        <Trash2 className="h-3.5 w-3.5 text-muted-foreground" />
                      </Button>
                    )}
                  </div>
                </div>
              ))}
            </div>
            <Button variant="outline" size="sm" className="mt-2 gap-1 text-xs" onClick={addItem}>
              <Plus className="h-3 w-3" /> {t("billing.addLine")}
            </Button>
          </div>

          <div className="flex items-center gap-3">
            <Label className="text-xs whitespace-nowrap">{t("billing.taxRatePercent", { label: taxLabel })}</Label>
            <Input
              className="w-20"
              type="number"
              min={0}
              value={taxRate}
              onChange={(e) => setTaxRate(parseFloat(e.target.value) || 0)}
            />
          </div>

          <div className="bg-muted/50 rounded-lg p-3 space-y-1 text-sm">
            <div className="flex justify-between">
              <span className="text-muted-foreground">{t("billing.subtotal")}</span>
              <span>{formatShopMoney(subtotal, currency)}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">{t("billing.taxWithRate", { label: taxLabel, rate: taxRate })}</span>
              <span>{formatShopMoney(taxAmount, currency)}</span>
            </div>
            <div className="mt-1 flex justify-between border-t border-border pt-1 font-bold">
              <span>{t("billing.total")}</span>
              <span>{formatShopMoney(total, currency)}</span>
            </div>
          </div>

          <div>
            <Label className="text-xs">{t("billing.notes")}</Label>
            <Textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder={t("billing.additionalNotes")}
              rows={2}
            />
          </div>

          <Button className="w-full" onClick={handleSave} disabled={saving}>
            {saving ? t("billing.saving") : t("billing.createInvoice")}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
};

export default CreateInvoiceDialog;
