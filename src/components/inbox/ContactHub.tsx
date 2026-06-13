import { useEffect, useMemo, useState } from "react";
import { Loader2 } from "lucide-react";
import { useTranslation } from "react-i18next";
import { supabase } from "@/integrations/supabase/client";
import { Input } from "@/components/ui/input";
import ExternalMessageActions from "@/components/messaging/ExternalMessageActions";

type ClientRow = {
  name: string;
  email: string | null;
  phone: string | null;
};

export default function ContactHub() {
  const { t } = useTranslation();
  const [clients, setClients] = useState<ClientRow[]>([]);
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    void (async () => {
      setLoading(true);
      const { data } = await supabase
        .from("bookings")
        .select("client_name, client_email, client_phone")
        .order("created_at", { ascending: false })
        .limit(200);
      const seen = new Set<string>();
      const rows: ClientRow[] = [];
      (data || []).forEach((b: { client_name: string; client_email: string | null; client_phone: string | null }) => {
        const key = `${b.client_name}|${b.client_email}|${b.client_phone}`;
        if (seen.has(key)) return;
        seen.add(key);
        if (!b.client_email && !b.client_phone) return;
        rows.push({ name: b.client_name, email: b.client_email, phone: b.client_phone });
      });
      setClients(rows);
      setLoading(false);
    })();
  }, []);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return clients;
    return clients.filter(
      (c) => c.name.toLowerCase().includes(q) || (c.email || "").toLowerCase().includes(q) || (c.phone || "").includes(q),
    );
  }, [clients, search]);

  return (
    <div className="space-y-4">
      <div>
        <h2 className="font-display text-xl font-semibold">{t("unifiedInbox.contactTitle")}</h2>
        <p className="mt-1 text-sm text-muted-foreground">{t("unifiedInbox.contactSubtitle")}</p>
      </div>
      <Input
        value={search}
        onChange={(e) => setSearch(e.target.value)}
        placeholder={t("unifiedInbox.searchClients")}
        className="max-w-md"
      />
      {loading ? (
        <div className="flex justify-center py-8">
          <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
        </div>
      ) : filtered.length === 0 ? (
        <p className="text-sm text-muted-foreground">{t("unifiedInbox.noClients")}</p>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2">
          {filtered.map((c) => (
            <div key={`${c.name}-${c.email}-${c.phone}`} className="space-y-3 rounded-lg border border-border/70 bg-card/55 p-4">
              <p className="font-medium">{c.name}</p>
              <p className="text-xs text-muted-foreground">{c.email || c.phone || "—"}</p>
              <ExternalMessageActions
                phone={c.phone}
                whatsAppMessage={t("chat.whatsAppPrefill", { name: c.name })}
                layout="column"
              />
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
