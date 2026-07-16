import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { Plus, Pencil, Trash2, GripVertical } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Switch } from "@/components/ui/switch";
import { toast } from "@/hooks/use-toast";
import {
  CALENDAR_TYPE_OPTIONS,
  defaultServiceCategoryForBookingType,
} from "@/lib/bookingTypes";
import { useTranslation } from "react-i18next";
import { currencyForShopCountry, formatShopMoney } from "@/lib/shopCurrency";
import { loadShopSettings } from "@/lib/shopSettings";
import { maxDepositAmountForCurrency, minDepositAmountForCurrency } from "@/lib/depositLimits";
import { parseDepositInput } from "@/lib/shopDepositSettings";
import { getUserOrganizationId } from "@/lib/shopSettings";
import { loadOrgServices, type OrgService } from "@/lib/shopServices";

interface Service extends OrgService {}

const COLOR_OPTIONS = [
  { value: "blue", label: "Blue", class: "bg-blue-500" },
  { value: "amber", label: "Amber", class: "bg-amber-500" },
  { value: "gold", label: "Gold", class: "bg-yellow-600" },
  { value: "red", label: "Red", class: "bg-red-500" },
  { value: "violet", label: "Violet", class: "bg-violet-500" },
  { value: "emerald", label: "Emerald", class: "bg-emerald-500" },
  { value: "pink", label: "Pink", class: "bg-pink-500" },
  { value: "orange", label: "Orange", class: "bg-orange-500" },
  { value: "cyan", label: "Cyan", class: "bg-cyan-500" },
];

const getColorClass = (color: string) => COLOR_OPTIONS.find((c) => c.value === color)?.class || "bg-blue-500";

const ServicesPage = () => {
  const { t } = useTranslation();
  const { user } = useAuth();
  const [services, setServices] = useState<Service[]>([]);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<Service | null>(null);
  const [shopCurrency, setShopCurrency] = useState("gbp");
  const [form, setForm] = useState({
    name: "",
    duration: "60",
    booking_type: "session",
    service_category: "tattoo",
    color: "blue",
    price: "",
    deposit_required: false,
    deposit_amount: "",
    is_active: true,
  });

  useEffect(() => {
    void loadShopSettings().then((shop) => setShopCurrency(currencyForShopCountry(shop?.country)));
  }, []);

  useEffect(() => {
    fetchServices();
  }, []);

  const fetchServices = async () => {
    const data = await loadOrgServices();
    setServices(data);
  };

  const openNew = () => {
    setEditing(null);
    setForm({
      name: "",
      duration: "60",
      booking_type: "session",
      service_category: "tattoo",
      color: "blue",
      price: "",
      deposit_required: false,
      deposit_amount: "",
      is_active: true,
    });
    setDialogOpen(true);
  };

  const openEdit = (s: Service) => {
    setEditing(s);
    setForm({
      name: s.name,
      duration: String(s.duration),
      booking_type: s.booking_type,
      service_category: s.service_category || "tattoo",
      color: s.color,
      price: s.price != null ? String(s.price) : "",
      deposit_required: !!s.deposit_required,
      deposit_amount: s.deposit_amount != null ? String(s.deposit_amount) : "",
      is_active: s.is_active,
    });
    setDialogOpen(true);
  };

  const handleSave = async () => {
    if (!user || !form.name.trim()) return;
    let depositAmount: number | null = null;
    if (form.deposit_required) {
      if (form.deposit_amount.trim()) {
        depositAmount = parseDepositInput(form.deposit_amount, shopCurrency);
        if (depositAmount == null) {
          toast({
            title: t("services.depositInvalid"),
            description: t("services.depositInvalidDesc", {
              min: formatShopMoney(minDepositAmountForCurrency(shopCurrency), shopCurrency),
              max: formatShopMoney(maxDepositAmountForCurrency(shopCurrency), shopCurrency),
            }),
            variant: "destructive",
          });
          return;
        }
      }
    }

    const payload = {
      name: form.name.trim(),
      duration: parseInt(form.duration) || 60,
      booking_type: form.booking_type,
      service_category: form.service_category,
      color: form.color,
      price: form.price ? parseFloat(form.price) : null,
      deposit_required: form.deposit_required,
      deposit_amount: form.deposit_required ? depositAmount : null,
      is_active: form.is_active,
    };

    if (editing) {
      const { error } = await supabase.from("services").update(payload).eq("id", editing.id);
      if (error) {
        toast({ title: t("services.errorUpdating"), description: error.message, variant: "destructive" });
        return;
      }
      toast({ title: t("services.serviceUpdated") });
    } else {
      const orgId = await getUserOrganizationId();
      if (!orgId) {
        toast({ title: t("services.errorCreating"), description: "No studio organization found.", variant: "destructive" });
        return;
      }
      const { error } = await supabase.from("services").insert({
        ...payload,
        organization_id: orgId,
        created_by: user.id,
        sort_order: services.length,
      });
      if (error) {
        toast({ title: t("services.errorCreating"), description: error.message, variant: "destructive" });
        return;
      }
      toast({ title: t("services.serviceCreated") });
    }
    setDialogOpen(false);
    fetchServices();
  };

  const handleDelete = async (id: string) => {
    const { error } = await supabase.from("services").delete().eq("id", id);
    if (error) {
      toast({ title: t("services.errorDeleting"), description: error.message, variant: "destructive" });
      return;
    }
    toast({ title: t("services.serviceDeleted") });
    fetchServices();
  };

  const update = (key: string, value: string | boolean) => {
    setForm((f) => {
      const next = { ...f, [key]: value } as typeof f;
      if (key === "booking_type" && typeof value === "string") {
        next.service_category = defaultServiceCategoryForBookingType(value);
      }
      return next;
    });
  };

  return (
    <>
      <div className="p-4 md:p-6 max-w-2xl">
        <div className="flex items-center justify-between mb-6">
          <div>
            <h1 className="font-display text-2xl font-bold">
              <span className="text-gold">{t("services.title")}</span>
            </h1>
            <p className="text-sm text-muted-foreground">{t("services.subtitle")}</p>
          </div>
          <Button variant="gold" size="sm" className="gap-1.5" onClick={openNew}>
            <Plus className="h-4 w-4" /> {t("services.newService")}
          </Button>
        </div>

        <div className="space-y-2">
          {services.map((s) => (
            <div
              key={s.id}
              className={`flex items-center gap-3 p-3 rounded-lg border border-border bg-card transition-colors hover:bg-secondary/30 ${
                !s.is_active ? "opacity-50" : ""
              }`}
            >
              <div className={`w-3 h-3 rounded-full shrink-0 ${getColorClass(s.color)}`} />
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium truncate">{s.name}</p>
                <p className="text-xs text-muted-foreground">
                  {s.duration}min · {s.booking_type} · {s.service_category || "tattoo"}
                  {s.price != null && ` · ${formatShopMoney(s.price, shopCurrency)}`}
                  {s.deposit_required
                    ? ` · ${t("services.depositRequiredShort", {
                        amount:
                          s.deposit_amount != null
                            ? formatShopMoney(s.deposit_amount, shopCurrency)
                            : t("services.depositShopDefault"),
                      })}`
                    : ` · ${t("services.noDeposit")}`}
                  {!s.is_active && ` · ${t("services.inactive")}`}
                </p>
              </div>
              <Button variant="ghost" size="icon" className="h-7 w-7 shrink-0" onClick={() => openEdit(s)}>
                <Pencil className="h-3.5 w-3.5" />
              </Button>
              <Button variant="ghost" size="icon" className="h-7 w-7 shrink-0 text-destructive" onClick={() => handleDelete(s.id)}>
                <Trash2 className="h-3.5 w-3.5" />
              </Button>
            </div>
          ))}
          {services.length === 0 && (
            <p className="text-sm text-muted-foreground text-center py-8">{t("services.noServices")}</p>
          )}
        </div>
      </div>

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="bg-card border-border sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="font-display">{editing ? t("services.editService") : t("services.newService")}</DialogTitle>
          </DialogHeader>
          <div className="space-y-3 mt-2">
            <div>
              <Label className="text-xs uppercase tracking-widest text-muted-foreground">{t("services.nameLabel")}</Label>
              <Input value={form.name} onChange={(e) => update("name", e.target.value)} className="mt-1 field-surface border-border" placeholder={t("services.namePlaceholder")} />
            </div>
            <div className="grid grid-cols-2 gap-2">
              <div>
                <Label className="text-xs uppercase tracking-widest text-muted-foreground">{t("services.durationLabel")}</Label>
                <Input type="number" value={form.duration} onChange={(e) => update("duration", e.target.value)} className="mt-1 field-surface border-border" />
              </div>
              <div>
                <Label className="text-xs uppercase tracking-widest text-muted-foreground">{t("services.priceLabel")}</Label>
                <Input type="number" value={form.price} onChange={(e) => update("price", e.target.value)} className="mt-1 field-surface border-border" placeholder={t("services.pricePlaceholder")} />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-2">
              <div>
                <Label className="text-xs uppercase tracking-widest text-muted-foreground">{t("services.calendarTypeLabel")}</Label>
                <Select value={form.booking_type} onValueChange={(v) => update("booking_type", v)}>
                  <SelectTrigger className="mt-1 field-surface border-border"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {CALENDAR_TYPE_OPTIONS.map((opt) => (
                      <SelectItem key={opt.value} value={opt.value}>
                        {opt.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label className="text-xs uppercase tracking-widest text-muted-foreground">{t("services.serviceCategoryLabel")}</Label>
                <Select value={form.service_category} onValueChange={(v) => update("service_category", v)}>
                  <SelectTrigger className="mt-1 field-surface border-border"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="tattoo">{t("services.categoryTattoo")}</SelectItem>
                    <SelectItem value="piercing">{t("services.categoryPiercing")}</SelectItem>
                    <SelectItem value="laser">{t("services.categoryLaser")}</SelectItem>
                    <SelectItem value="consultation">{t("services.categoryConsultation")}</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="rounded-lg border border-border p-3 space-y-3 bg-secondary/20">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <Label className="text-xs uppercase tracking-widest text-muted-foreground">{t("services.depositRequiredLabel")}</Label>
                  <p className="text-xs text-muted-foreground mt-1">{t("services.depositRequiredHint")}</p>
                </div>
                <Switch checked={form.deposit_required} onCheckedChange={(v) => update("deposit_required", v)} />
              </div>
              {form.deposit_required ? (
                <div>
                  <Label className="text-xs uppercase tracking-widest text-muted-foreground">{t("services.depositAmountLabel")}</Label>
                  <Input
                    type="number"
                    min={minDepositAmountForCurrency(shopCurrency)}
                    max={maxDepositAmountForCurrency(shopCurrency)}
                    step={0.01}
                    value={form.deposit_amount}
                    onChange={(e) => update("deposit_amount", e.target.value)}
                    className="mt-1 field-surface border-border"
                    placeholder={t("services.depositAmountPlaceholder")}
                  />
                  <p className="text-xs text-muted-foreground mt-1">{t("services.depositAmountHint")}</p>
                </div>
              ) : null}
            </div>
            <div className="grid grid-cols-2 gap-2">
              <div>
                <Label className="text-xs uppercase tracking-widest text-muted-foreground">{t("services.colorLabel")}</Label>
                <Select value={form.color} onValueChange={(v) => update("color", v)}>
                  <SelectTrigger className="mt-1 field-surface border-border">
                    <div className="flex items-center gap-2">
                      <div className={`w-3 h-3 rounded-full ${getColorClass(form.color)}`} />
                      <span className="capitalize">{form.color}</span>
                    </div>
                  </SelectTrigger>
                  <SelectContent>
                    {COLOR_OPTIONS.map((c) => (
                      <SelectItem key={c.value} value={c.value}>
                        <div className="flex items-center gap-2">
                          <div className={`w-3 h-3 rounded-full ${c.class}`} />
                          {c.label}
                        </div>
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="flex flex-col justify-end gap-2">
                <Label className="text-xs uppercase tracking-widest text-muted-foreground">{t("services.activeLabel")}</Label>
                <div className="flex h-10 items-center">
                  <Switch checked={form.is_active} onCheckedChange={(v) => update("is_active", v)} />
                </div>
              </div>
            </div>
            <Button variant="gold" className="w-full" onClick={handleSave} disabled={!form.name.trim()}>
              {editing ? t("services.saveChanges") : t("services.createService")}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
};

export default ServicesPage;
