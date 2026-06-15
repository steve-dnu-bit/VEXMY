import { Store } from "lucide-react";
import { useTranslation } from "react-i18next";
import { useCustomerShop } from "@/hooks/useCustomerShop";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

const CustomerShopSelector = () => {
  const { t } = useTranslation();
  const { shops, selectedOrgId, hasMultipleShops, loading, setSelectedOrgId } = useCustomerShop();

  if (loading || !hasMultipleShops || !selectedOrgId) return null;

  return (
    <div className="mb-4 rounded-lg border border-border bg-card/90 p-3">
      <label className="flex items-center gap-2 text-xs font-medium text-muted-foreground mb-2">
        <Store className="h-3.5 w-3.5" />
        {t("customer.selectStudio")}
      </label>
      <Select value={selectedOrgId} onValueChange={setSelectedOrgId}>
        <SelectTrigger className="w-full">
          <SelectValue placeholder={t("customer.selectStudioPlaceholder")} />
        </SelectTrigger>
        <SelectContent>
          {shops.map((shop) => (
            <SelectItem key={shop.organizationId} value={shop.organizationId}>
              <span className="flex items-center gap-2">
                {shop.logoUrl ? (
                  <img src={shop.logoUrl} alt="" className="h-5 w-5 rounded object-cover" />
                ) : null}
                {shop.shopName}
              </span>
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      <p className="text-[11px] text-muted-foreground mt-2">{t("customer.selectStudioHint")}</p>
    </div>
  );
};

export default CustomerShopSelector;
