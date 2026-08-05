import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { format, parseISO } from "date-fns";
import { Package, Plus, CheckCircle, Clock, XCircle, ExternalLink, Trash2 } from "lucide-react";
import { toast } from "sonner";
import SubscriptionGate from "@/components/subscription/SubscriptionGate";
import { loadOrganizationMemberIds } from "@/lib/organizationMembers";
import { useTranslation } from "react-i18next";

interface StockItem {
  id: string;
  name: string;
  category: string;
  unit: string;
}

interface StockRequest {
  id: string;
  requested_by: string;
  stock_item_id: string;
  quantity: number;
  status: string;
  notes: string | null;
  supplier_name: string | null;
  supplier_url: string | null;
  reviewed_by: string | null;
  created_at: string;
}

interface SupplierLink {
  id: string;
  stock_item_id: string;
  supplier_name: string | null;
  supplier_url: string;
  created_at?: string | null;
}

interface Profile {
  user_id: string;
  display_name: string;
}

const categoryLabels: Record<string, string> = {
  needles: "🪡 Needles",
  ink: "🖤 Ink",
  grips: "✊ Grips",
  supplies: "📦 Supplies",
  gloves: "🧤 Gloves",
  barriers: "🛡️ Barriers",
  aftercare: "💊 Aftercare",
};

const StockPage = () => {
  const { t } = useTranslation();
  const { user } = useAuth();
  const [items, setItems] = useState<StockItem[]>([]);
  const [requests, setRequests] = useState<StockRequest[]>([]);
  const [supplierLinks, setSupplierLinks] = useState<SupplierLink[]>([]);
  const [profiles, setProfiles] = useState<Profile[]>([]);
  const [isAdmin, setIsAdmin] = useState(false);
  const [dialogOpen, setDialogOpen] = useState(false);

  // Form state
  const [selectedItem, setSelectedItem] = useState("");
  const [quantity, setQuantity] = useState("1");
  const [notes, setNotes] = useState("");
  const [supplierName, setSupplierName] = useState("");
  const [supplierUrl, setSupplierUrl] = useState("");
  const [saveSupplierLink, setSaveSupplierLink] = useState(true);
  const [selectedSavedLinkId, setSelectedSavedLinkId] = useState("none");
  const [filterCategory, setFilterCategory] = useState("all");

  useEffect(() => {
    fetchAll();
    checkAdmin();

    const channel = supabase
      .channel("stock-requests-rt")
      .on("postgres_changes", { event: "*", schema: "public", table: "stock_requests" }, () => fetchRequests())
      .subscribe();

    return () => { supabase.removeChannel(channel); };
  }, [user]);

  const checkAdmin = async () => {
    if (!user) return;
    const { data } = await supabase.rpc("has_role", { _user_id: user.id, _role: "admin" });
    setIsAdmin(!!data);
  };

  const fetchAll = async () => {
    const orgMemberIds = await loadOrganizationMemberIds();
    const memberIdList = [...orgMemberIds];

    const [itemsRes, requestsRes, profilesRes, supplierLinksRes] = await Promise.all([
      supabase.from("stock_items").select("*").eq("is_active", true).order("category").order("name"),
      supabase.from("stock_requests").select("*").order("created_at", { ascending: false }),
      memberIdList.length > 0
        ? supabase.from("profiles").select("user_id, display_name").in("user_id", memberIdList)
        : Promise.resolve({ data: [] as Array<{ user_id: string; display_name: string | null }> }),
      supabase
        .from("stock_supplier_links")
        .select("id, stock_item_id, supplier_name, supplier_url, created_at")
        .eq("is_active", true)
        .order("created_at", { ascending: false }),
    ]);
    if (itemsRes.data) setItems(itemsRes.data);
    if (requestsRes.data) setRequests(requestsRes.data);
    if (profilesRes.data) setProfiles(profilesRes.data);
    if (supplierLinksRes.data) setSupplierLinks(supplierLinksRes.data as SupplierLink[]);
  };

  const fetchRequests = async () => {
    const { data } = await supabase.from("stock_requests").select("*").order("created_at", { ascending: false });
    if (data) setRequests(data);
  };

  const getName = (userId: string) => profiles.find((p) => p.user_id === userId)?.display_name || "Unknown";
  const getItemName = (itemId: string) => items.find((i) => i.id === itemId)?.name || "Unknown";
  const getItemUnit = (itemId: string) => items.find((i) => i.id === itemId)?.unit || "";

  const handleSubmit = async () => {
    if (!selectedItem || !user) return;
    let normalizedSupplierUrl: string | null = null;
    if (supplierUrl.trim()) {
      try {
        normalizedSupplierUrl = new URL(supplierUrl.trim()).toString();
      } catch {
        toast.error(t("stock.invalidSupplierUrl"));
        return;
      }
    }

    const { error } = await supabase.from("stock_requests").insert({
      requested_by: user.id,
      stock_item_id: selectedItem,
      quantity: parseInt(quantity) || 1,
      notes: notes || null,
      supplier_name: supplierName.trim() || null,
      supplier_url: normalizedSupplierUrl,
    });
    if (error) {
      toast.error(t("stock.submitFailed"));
      return;
    }
    if (saveSupplierLink && normalizedSupplierUrl) {
      await supabase.from("stock_supplier_links").upsert({
        stock_item_id: selectedItem,
        supplier_name: supplierName.trim() || null,
        supplier_url: normalizedSupplierUrl,
        created_by: user.id,
        is_active: true,
      }, { onConflict: "stock_item_id,supplier_url" });
    }
    toast.success(t("stock.requestSubmitted"));
    setDialogOpen(false);
    setSelectedItem("");
    setQuantity("1");
    setNotes("");
    setSupplierName("");
    setSupplierUrl("");
    setSelectedSavedLinkId("none");
    await fetchAll();
  };

  const handleUpdateStatus = async (requestId: string, status: string) => {
    if (!user) return;
    const { error } = await supabase.from("stock_requests").update({ status, reviewed_by: user.id }).eq("id", requestId);
    if (error) {
      toast.error(t("stock.updateFailed"));
      return;
    }
    toast.success(t("stock.requestStatusUpdated", { status }));
  };

  const handleDeleteRequest = async (requestId: string) => {
    if (!user) return;
    const ok = window.confirm(t("stock.deleteConfirm"));
    if (!ok) return;
    const { error } = await supabase.from("stock_requests").delete().eq("id", requestId);
    if (error) {
      toast.error(error.message || t("stock.deleteFailed"));
      return;
    }
    toast.success(t("stock.requestDeleted"));
    await fetchRequests();
  };

  const categories = [...new Set(items.map((i) => i.category))];
  const filteredItems = filterCategory === "all" ? items : items.filter((i) => i.category === filterCategory);
  const linksForSelectedItem = selectedItem ? supplierLinks.filter((l) => l.stock_item_id === selectedItem) : [];

  const recentSavedLinks = useMemo(() => {
    const sorted = [...supplierLinks].sort((a, b) => {
      const ta = a.created_at ? new Date(a.created_at).getTime() : 0;
      const tb = b.created_at ? new Date(b.created_at).getTime() : 0;
      return tb - ta;
    });
    return sorted.slice(0, 8);
  }, [supplierLinks]);

  const canDeleteRequest = (r: StockRequest) => {
    if (!user) return false;
    if (isAdmin) return true;
    return r.requested_by === user.id && r.status === "pending";
  };

  const statusIcon: Record<string, React.ReactNode> = {
    pending: <Clock className="h-3 w-3 text-amber-400" />,
    approved: <CheckCircle className="h-3 w-3 text-emerald-400" />,
    denied: <XCircle className="h-3 w-3 text-destructive" />,
    ordered: <Package className="h-3 w-3 text-blue-400" />,
  };

  const statusColors: Record<string, string> = {
    pending: "bg-amber-500/15 text-amber-300 border-amber-500/25",
    approved: "bg-emerald-500/15 text-emerald-300 border-emerald-500/25",
    denied: "bg-destructive/15 text-destructive border-destructive/25",
    ordered: "bg-blue-500/15 text-blue-300 border-blue-500/25",
  };

  const pendingCount = requests.filter((r) => r.status === "pending").length;

  return (
      <SubscriptionGate>
      <div className="p-4 md:p-6 space-y-6 max-w-5xl mx-auto">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="font-display text-2xl font-bold">{t("stock.title")}</h1>
            <p className="text-sm text-muted-foreground mt-1">{t("stock.subtitle")}</p>
          </div>
          <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
            <DialogTrigger asChild>
              <Button size="sm" className="gap-1">
                <Plus className="h-4 w-4" /> {t("stock.newRequest")}
              </Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>{t("stock.requestSupplies")}</DialogTitle>
              </DialogHeader>
              <div className="space-y-4 mt-2">
                <div>
                  <label className="text-xs text-muted-foreground mb-1 block">{t("stock.category")}</label>
                  <Select value={filterCategory} onValueChange={setFilterCategory}>
                    <SelectTrigger className="text-sm">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">{t("stock.allCategories")}</SelectItem>
                      {categories.map((c) => (
                        <SelectItem key={c} value={c}>{categoryLabels[c] || c}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <label className="text-xs text-muted-foreground mb-1 block">{t("stock.item")}</label>
                  <Select value={selectedItem} onValueChange={setSelectedItem}>
                    <SelectTrigger className="text-sm">
                      <SelectValue placeholder={t("stock.selectItem")} />
                    </SelectTrigger>
                    <SelectContent>
                      {filteredItems.map((item) => (
                        <SelectItem key={item.id} value={item.id}>
                          {item.name} ({item.unit})
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <label className="text-xs text-muted-foreground mb-1 block">{t("stock.quantity")}</label>
                  <Input type="number" min="1" value={quantity} onChange={(e) => setQuantity(e.target.value)} className="text-sm" />
                </div>
                <div>
                  <label className="text-xs text-muted-foreground mb-1 block">{t("stock.savedSupplierLinks")}</label>
                  <Select
                    value={selectedSavedLinkId}
                    onValueChange={(value) => {
                      setSelectedSavedLinkId(value);
                      if (value === "none") return;
                      const selected = linksForSelectedItem.find((link) => link.id === value);
                      if (!selected) return;
                      setSupplierName(selected.supplier_name || "");
                      setSupplierUrl(selected.supplier_url);
                    }}
                  >
                    <SelectTrigger className="text-sm">
                      <SelectValue placeholder={linksForSelectedItem.length ? t("stock.pickSavedLink") : t("stock.noSavedLinksYet")} />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="none">{t("stock.noSavedLink")}</SelectItem>
                      {linksForSelectedItem.map((link) => (
                        <SelectItem key={link.id} value={link.id}>
                          {link.supplier_name || link.supplier_url}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <label className="text-xs text-muted-foreground mb-1 block">{t("stock.supplierNameOptional")}</label>
                  <Input value={supplierName} onChange={(e) => setSupplierName(e.target.value)} placeholder={t("stock.supplierNamePlaceholder")} className="text-sm" />
                </div>
                <div>
                  <label className="text-xs text-muted-foreground mb-1 block">{t("stock.supplierLinkOptional")}</label>
                  <Input value={supplierUrl} onChange={(e) => setSupplierUrl(e.target.value)} placeholder={t("stock.supplierLinkPlaceholder")} className="text-sm" />
                </div>
                <label className="flex items-center gap-2 text-xs text-muted-foreground">
                  <input
                    type="checkbox"
                    checked={saveSupplierLink}
                    onChange={(e) => setSaveSupplierLink(e.target.checked)}
                  />
                  {t("stock.saveSupplierLink")}
                </label>
                <div>
                  <label className="text-xs text-muted-foreground mb-1 block">{t("stock.notesOptional")}</label>
                  <Textarea value={notes} onChange={(e) => setNotes(e.target.value)} placeholder={t("stock.notesPlaceholder")} className="text-sm" />
                </div>
                <Button onClick={handleSubmit} disabled={!selectedItem} className="w-full">
                  {t("stock.submitRequest")}
                </Button>
              </div>
            </DialogContent>
          </Dialog>
        </div>

        {/* Requests list */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base flex items-center gap-2">
              <Package className="h-4 w-4" /> {t("stock.requestsTitle")} {pendingCount > 0 && <Badge className="bg-amber-500/15 text-amber-300 border-amber-500/25 text-[10px]">{t("stock.pendingCount", { count: pendingCount })}</Badge>}
            </CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            {requests.length === 0 ? (
              <p className="text-sm text-muted-foreground p-4">{t("stock.noRequests")}</p>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>{t("stock.itemCol")}</TableHead>
                    <TableHead>{t("stock.qtyCol")}</TableHead>
                    <TableHead className="hidden md:table-cell">{t("stock.requestedByCol")}</TableHead>
                    <TableHead className="hidden md:table-cell">{t("stock.dateCol")}</TableHead>
                    <TableHead>{t("stock.statusCol")}</TableHead>
                    <TableHead className="text-right">{t("stock.actionsCol")}</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {requests.map((r) => (
                    <TableRow key={r.id}>
                      <TableCell>
                        <div>
                          <p className="font-medium text-sm">{getItemName(r.stock_item_id)}</p>
                          {r.notes && <p className="text-[10px] text-muted-foreground mt-0.5">{r.notes}</p>}
                          {r.supplier_url && (
                            <a
                              href={r.supplier_url}
                              target="_blank"
                              rel="noreferrer"
                              className="text-[10px] text-primary mt-0.5 inline-flex items-center gap-1"
                            >
                              {r.supplier_name || t("stock.supplierLink")} <ExternalLink className="h-3 w-3" />
                            </a>
                          )}
                        </div>
                      </TableCell>
                      <TableCell className="text-sm">{r.quantity} {getItemUnit(r.stock_item_id)}</TableCell>
                      <TableCell className="hidden md:table-cell text-xs text-muted-foreground">{getName(r.requested_by)}</TableCell>
                      <TableCell className="hidden md:table-cell text-xs text-muted-foreground">{format(parseISO(r.created_at), "d MMM")}</TableCell>
                      <TableCell>
                        <Badge variant="outline" className={`text-[10px] gap-1 ${statusColors[r.status] || ""}`}>
                          {statusIcon[r.status]} {r.status}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-right">
                        <div className="flex gap-1 justify-end flex-wrap">
                          {isAdmin && r.status === "pending" && (
                            <>
                              <Button size="sm" variant="default" className="h-6 text-[10px] px-2" onClick={() => handleUpdateStatus(r.id, "approved")}>
                                {t("stock.approve")}
                              </Button>
                              <Button size="sm" variant="outline" className="h-6 text-[10px] px-2" onClick={() => handleUpdateStatus(r.id, "ordered")}>
                                {t("stock.ordered")}
                              </Button>
                              <Button size="sm" variant="ghost" className="h-6 text-[10px] px-2 text-destructive" onClick={() => handleUpdateStatus(r.id, "denied")}>
                                {t("stock.deny")}
                              </Button>
                            </>
                          )}
                          {canDeleteRequest(r) && (
                            <Button
                              size="sm"
                              variant="ghost"
                              className="h-6 w-6 p-0 text-muted-foreground hover:text-destructive"
                              title={t("stock.deleteRequestTitle")}
                              onClick={() => void handleDeleteRequest(r.id)}
                            >
                              <Trash2 className="h-3.5 w-3.5" />
                            </Button>
                          )}
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>

        {/* Recently saved supplier links */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base">{t("stock.recentLinksTitle")}</CardTitle>
          </CardHeader>
          <CardContent className="p-4 pt-0">
            {recentSavedLinks.length === 0 ? (
              <p className="text-sm text-muted-foreground">{t("stock.noRecentLinks")}</p>
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
                {recentSavedLinks.map((link) => {
                  const item = items.find((i) => i.id === link.stock_item_id);
                  return (
                    <div key={link.id} className="rounded-lg border border-border bg-card/40 p-3">
                      <p className="text-xs text-muted-foreground line-clamp-2">{item?.name || t("stock.unknownItem")}</p>
                      <p className="text-sm font-medium mt-1 line-clamp-2">{link.supplier_name || t("stock.savedLink")}</p>
                      <a
                        href={link.supplier_url}
                        target="_blank"
                        rel="noreferrer"
                        className="text-[11px] text-primary mt-2 inline-flex items-center gap-1 break-all"
                      >
                        {t("stock.open")} <ExternalLink className="h-3 w-3 shrink-0" />
                      </a>
                    </div>
                  );
                })}
              </div>
            )}
          </CardContent>
        </Card>
      </div>
      </SubscriptionGate>
  );
};

export default StockPage;
