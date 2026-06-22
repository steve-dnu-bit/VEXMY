import { useEffect, useState } from "react";
import { format } from "date-fns";
import { Receipt, Upload } from "lucide-react";
import { toast } from "sonner";
import { useTranslation } from "react-i18next";
import { useAuth } from "@/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { getUserOrganizationId } from "@/lib/shopSettings";
import { uploadFileToUploads } from "@/lib/uploadStorage";
import {
  createExpense,
  loadExpenseCategories,
  updateExpense,
  type ExpenseCategory,
  type ExpenseRow,
} from "@/lib/expenses";

interface Props {
  currency: string;
  expense?: ExpenseRow | null;
  onSaved: () => void;
  trigger?: React.ReactNode;
}

const CreateExpenseDialog = ({ currency, expense, onSaved, trigger }: Props) => {
  const { t } = useTranslation();
  const { user } = useAuth();
  const isEdit = !!expense;
  const [open, setOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [categories, setCategories] = useState<ExpenseCategory[]>([]);
  const [categoryId, setCategoryId] = useState<string>("");
  const [amount, setAmount] = useState("");
  const [expenseDate, setExpenseDate] = useState(format(new Date(), "yyyy-MM-dd"));
  const [vendor, setVendor] = useState("");
  const [notes, setNotes] = useState("");
  const [receiptFile, setReceiptFile] = useState<File | null>(null);

  useEffect(() => {
    if (!open) return;
    void (async () => {
      const orgId = await getUserOrganizationId();
      if (!orgId) return;
      const cats = await loadExpenseCategories(orgId);
      setCategories(cats);
      if (expense) {
        setCategoryId(expense.category_id || cats[0]?.id || "");
        setAmount(String(expense.amount));
        setExpenseDate(expense.expense_date);
        setVendor(expense.vendor || "");
        setNotes(expense.notes || "");
      } else {
        setCategoryId(cats[0]?.id || "");
        setAmount("");
        setExpenseDate(format(new Date(), "yyyy-MM-dd"));
        setVendor("");
        setNotes("");
      }
      setReceiptFile(null);
    })();
  }, [open, expense]);

  const handleSave = async () => {
    const parsed = parseFloat(amount);
    if (!parsed || parsed <= 0) {
      toast.error(t("expenses.amountRequired"));
      return;
    }
    const orgId = await getUserOrganizationId();
    if (!orgId) return;

    setSaving(true);
    try {
      let receiptPath: string | undefined;
      if (receiptFile) {
        const path = `expenses/${orgId}/${Date.now()}-${receiptFile.name.replace(/[^a-zA-Z0-9._-]/g, "_")}`;
        receiptPath = await uploadFileToUploads(path, receiptFile);
      }

      if (isEdit && expense) {
        const ok = await updateExpense(expense.id, {
          category_id: categoryId || null,
          amount: parsed,
          expense_date: expenseDate,
          vendor,
          notes,
          ...(receiptPath ? { receipt_path: receiptPath } : {}),
        });
        if (!ok) {
          toast.error(t("expenses.saveFailed"));
          return;
        }
        toast.success(t("expenses.updated"));
      } else {
        const row = await createExpense(orgId, {
          category_id: categoryId || null,
          amount: parsed,
          currency,
          expense_date: expenseDate,
          vendor,
          notes,
          receipt_path: receiptPath,
          created_by: user?.id,
        });
        if (!row) {
          toast.error(t("expenses.saveFailed"));
          return;
        }
        toast.success(t("expenses.created"));
      }
      setOpen(false);
      onSaved();
    } catch {
      toast.error(t("expenses.saveFailed"));
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        {trigger || (
          <Button className="gap-2">
            <Receipt className="h-4 w-4" />
            {t("expenses.addExpense")}
          </Button>
        )}
      </DialogTrigger>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>{isEdit ? t("expenses.editExpense") : t("expenses.addExpense")}</DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label htmlFor="exp-amount">{t("expenses.amount")} *</Label>
              <Input
                id="exp-amount"
                type="number"
                min="0"
                step="0.01"
                className="mt-1"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
              />
            </div>
            <div>
              <Label htmlFor="exp-date">{t("expenses.date")}</Label>
              <Input
                id="exp-date"
                type="date"
                className="mt-1"
                value={expenseDate}
                max={format(new Date(), "yyyy-MM-dd")}
                onChange={(e) => setExpenseDate(e.target.value)}
              />
            </div>
          </div>
          <div>
            <Label>{t("expenses.category")}</Label>
            <Select value={categoryId} onValueChange={setCategoryId}>
              <SelectTrigger className="mt-1">
                <SelectValue placeholder={t("expenses.selectCategory")} />
              </SelectTrigger>
              <SelectContent>
                {categories.map((c) => (
                  <SelectItem key={c.id} value={c.id}>
                    <span className="flex items-center gap-2">
                      <span className="h-2 w-2 rounded-full shrink-0" style={{ backgroundColor: c.color }} />
                      {c.name}
                    </span>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label htmlFor="exp-vendor">{t("expenses.vendor")}</Label>
            <Input id="exp-vendor" className="mt-1" value={vendor} onChange={(e) => setVendor(e.target.value)} placeholder={t("expenses.vendorPlaceholder")} />
          </div>
          <div>
            <Label htmlFor="exp-notes">{t("expenses.notes")}</Label>
            <Textarea id="exp-notes" className="mt-1" value={notes} onChange={(e) => setNotes(e.target.value)} rows={2} />
          </div>
          <div>
            <Label htmlFor="exp-receipt">{t("expenses.receipt")}</Label>
            <div className="mt-1 flex items-center gap-2">
              <Input
                id="exp-receipt"
                type="file"
                accept="image/*,.pdf"
                className="text-xs"
                onChange={(e) => setReceiptFile(e.target.files?.[0] || null)}
              />
              <Upload className="h-4 w-4 text-muted-foreground shrink-0" />
            </div>
          </div>
          <Button className="w-full" disabled={saving} onClick={() => void handleSave()}>
            {saving ? t("billing.saving") : isEdit ? t("billing.saveChanges") : t("expenses.addExpense")}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
};

export default CreateExpenseDialog;
