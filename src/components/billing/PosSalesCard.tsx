import { useEffect, useState } from "react";
import { format, parseISO } from "date-fns";
import { Link } from "react-router-dom";
import { CreditCard } from "lucide-react";
import { useTranslation } from "react-i18next";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { loadOrganizationArtists } from "@/lib/organizationMembers";
import { loadRecentPosSales, type PosLineItem, type PosSaleRow } from "@/lib/posCheckout";
import { formatShopMoney } from "@/lib/shopCurrency";

const PosSalesCard = () => {
  const { t } = useTranslation();
  const [sales, setSales] = useState<PosSaleRow[]>([]);
  const [artists, setArtists] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    void (async () => {
      setLoading(true);
      const [rows, artistProfiles] = await Promise.all([loadRecentPosSales(8), loadOrganizationArtists()]);
      const map: Record<string, string> = {};
      artistProfiles.forEach((artist) => {
        map[artist.user_id] = artist.display_name;
      });
      setArtists(map);
      setSales(rows);
      setLoading(false);
    })();
  }, []);

  if (loading) {
    return (
      <Card>
        <CardContent className="p-6 text-sm text-muted-foreground">{t("common.loading")}</CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader className="pb-3 flex flex-col sm:flex-row sm:items-start sm:justify-between gap-3">
        <div className="min-w-0">
          <CardTitle className="text-lg flex items-center gap-2">
            <CreditCard className="h-5 w-5 text-primary shrink-0" />
            {t("pos.recentSales")}
          </CardTitle>
          <CardDescription>{t("pos.recentSalesHint")}</CardDescription>
        </div>
        <Button variant="outline" size="sm" className="shrink-0 self-start" asChild>
          <Link to="/checkout">{t("pos.checkoutTitle")}</Link>
        </Button>
      </CardHeader>
      <CardContent>
        {sales.length === 0 ? (
          <p className="text-sm text-muted-foreground py-2">{t("pos.noRecentSales")}</p>
        ) : (
          <div className="space-y-3">
            {sales.map((sale) => {
              const items = Array.isArray(sale.items) ? (sale.items as PosLineItem[]) : [];
              const summary = items.map((i) => i.name).slice(0, 2).join(", ");
              return (
                <div key={sale.id} className="rounded-xl border border-border bg-card/80 p-4 space-y-2 text-sm">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="font-semibold truncate">{sale.client_name || "—"}</p>
                      <p className="text-xs text-muted-foreground truncate">{summary || artists[sale.artist_id] || "—"}</p>
                    </div>
                    <div className="text-right shrink-0">
                      <p className="font-semibold tabular-nums">{formatShopMoney(Number(sale.total), sale.currency)}</p>
                      <Badge variant={sale.status === "succeeded" ? "default" : "outline"} className="text-[10px] mt-1 capitalize">
                        {sale.status === "succeeded"
                          ? t("pos.saleStatusSucceeded")
                          : sale.status === "pending"
                            ? t("pos.saleStatusPending")
                            : t("pos.saleStatusFailed")}
                      </Badge>
                    </div>
                  </div>
                  <p className="text-xs text-muted-foreground pt-1 border-t border-border/60">
                    {format(parseISO(sale.created_at), "d MMM yyyy, HH:mm")}
                  </p>
                </div>
              );
            })}
          </div>
        )}
      </CardContent>
    </Card>
  );
};

export default PosSalesCard;
