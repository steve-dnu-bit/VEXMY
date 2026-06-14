import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "sonner";
import { useTranslation } from "react-i18next";
import { computeInvoiceTotals } from "@/lib/orgBilling";
import { formatShopMoney } from "@/lib/shopCurrency";

type PaymentMethod = "card" | "bank_transfer" | "cash";
type PaymentTerm = "paid_in_full" | "due";

interface InvoiceItem {
  description: string;
  quantity: number;
  unit_price: number;
}

interface InvoiceRow {
  id: string;
  client_name: string;
  client_email: string | null;
  due_date: string | null;
  payment_method: string | null;
  payment_term: string | null;
  notes: string | null;
  items: unknown;
  tax_rate?: number | null;
  tax_label?: string | null;
  currency?: string | null;
  prices_include_tax?: boolean | null;
}

interface Props {
  invoice: InvoiceRow;
  onSaved: () => void;
  trigger?: React.ReactNode;
}

const EditInvoiceDialog = ({ invoice, onSaved, trigger }: Props) => {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [clientName, setClientName] = useState(invoice.client_name);
  const [clientEmail, setClientEmail] = useState(invoice.client_email || "");
  const [dueDate, setDueDate] = useState(invoice.due_date || "");
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod>((invoice.payment_method as PaymentMethod) || "card");
  const [paymentTerm, setPaymentTerm] = useState<PaymentTerm>((invoice.payment_term as PaymentTerm) || "due");
  const [notes, setNotes] = useState(invoice.notes || "");
  const [taxRate, setTaxRate] = useState(Number(invoice.tax_rate ?? 0));
  const [items, setItems] = useState<InvoiceItem[]>([]);

  const currency = invoice.currency || "gbp";
  const taxLabel = invoice.tax_label || "VAT";
  const pricesIncludeTax = !!invoice.prices_include_tax;

  useEffect(() => {
    const parsed = Array.isArray(invoice.items) ? (invoice.items as InvoiceItem[]) : [];
    setItems(parsed.length > 0 ? parsed : [{ description: "", quantity: 1, unit_price: 0 }]);
    setTaxRate(Number(invoice.tax_rate ?? 0));
  }, [invoice.items, invoice.tax_rate]);

  const updateItem = (i: number, field: keyof InvoiceItem, value: string | number) => {
    setItems((prev) => prev.map((it, idx) => (idx === i ? { ...it, [field]: value } : it)));
  };
  const addItem = () => setItems((prev) => [...prev, { description: "", quantity: 1, unit_price: 0 }]);
  const removeItem = (i: number) => setItems((prev) => prev.filter((_, idx) => idx !== i));

  const lineGross = items.reduce((s, i) => s + Number(i.quantity || 0) * Number(i.unit_price || 0), 0);
  const { subtotal, taxAmount, total } = computeInvoiceTotals(lineGross, taxRate, pricesIncludeTax);

  const save = async () => {
    if (!clientName.trim()) return toast.error(t("billing.clientNameRequired"));
    if (!clientEmail.trim()) return toast.error(t("billing.clientEmailRequired"));
    if (items.some((i) => !i.description?.trim())) return toast.error(t("billing.lineNeedsDescription"));
    setSaving(true);
    const { error } = await supabase
      .from("invoices" as any)
      .update({
        client_name: clientName,
        client_email: clientEmail,
        due_date: dueDate || null,
        payment_method: paymentMethod,
        payment_term: paymentTerm,
        notes: notes || null,
        items: items as any,
        subtotal,
        tax_rate: taxRate,
        tax_amount: taxAmount,
        total,
      } as any)
      .eq("id", invoice.id);
    setSaving(false);
    if (error) return toast.error(error.message || t("billing.failedSaveInvoice"));
    toast.success(t("billing.invoiceUpdated"));
    setOpen(false);
    onSaved();
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>{trigger || <Button variant="outline" size="sm">{t("billing.edit")}</Button>}</DialogTrigger>
      <DialogContent className="max-w-xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{t("billing.editInvoice")}</DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <Label className="text-xs">{t("billing.client")}</Label>
              <Input value={clientName} onChange={(e) => setClientName(e.target.value)} />
            </div>
            <div>
              <Label className="text-xs">{t("billing.clientEmail")}</Label>
              <Input value={clientEmail} onChange={(e) => setClientEmail(e.target.value)} />
            </div>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <div>
              <Label className="text-xs">{t("billing.dueDate")}</Label>
              <Input type="date" value={dueDate} onChange={(e) => setDueDate(e.target.value)} />
            </div>
            <div>
              <Label className="text-xs">{t("billing.paymentMethod")}</Label>
              <Select value={paymentMethod} onValueChange={(v) => setPaymentMethod(v as PaymentMethod)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="card">{t("billing.card")}</SelectItem>
                  <SelectItem value="bank_transfer">{t("billing.bankTransfer")}</SelectItem>
                  <SelectItem value="cash">{t("billing.cash")}</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label className="text-xs">{t("billing.paymentOption")}</Label>
              <Select value={paymentTerm} onValueChange={(v) => setPaymentTerm(v as PaymentTerm)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="due">{t("billing.due")}</SelectItem>
                  <SelectItem value="paid_in_full">{t("billing.paidInFull")}</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          <div>
            <Label className="text-xs mb-2 block">{t("billing.lineItems")}</Label>
            <div className="space-y-2">
              {items.map((item, i) => (
                <div key={i} className="flex gap-2 items-center">
                  <Input className="flex-1" value={item.description} onChange={(e) => updateItem(i, "description", e.target.value)} />
                  <Input className="w-16" type="number" value={item.quantity || ""} onChange={(e) => updateItem(i, "quantity", parseInt(e.target.value, 10) || 1)} />
                  <Input className="w-24" type="number" step={0.01} value={item.unit_price || ""} onChange={(e) => updateItem(i, "unit_price", parseFloat(e.target.value) || 0)} />
                  {items.length > 1 && <Button type="button" variant="ghost" size="sm" onClick={() => removeItem(i)}>×</Button>}
                </div>
              ))}
            </div>
            <Button type="button" variant="outline" size="sm" className="mt-2" onClick={addItem}>{t("billing.addLine")}</Button>
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
            <div className="flex justify-between font-bold border-t border-border pt-1">
              <span>{t("billing.total")}</span>
              <span>{formatShopMoney(total, currency)}</span>
            </div>
          </div>

          <div>
            <Label className="text-xs">{t("billing.notes")}</Label>
            <Textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={2} />
          </div>
          <Button className="w-full" onClick={save} disabled={saving}>{saving ? t("billing.saving") : t("billing.saveChanges")}</Button>
        </div>
      </DialogContent>
    </Dialog>
  );
};

export default EditInvoiceDialog;
