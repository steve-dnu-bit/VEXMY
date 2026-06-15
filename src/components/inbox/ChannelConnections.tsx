import { useState, useEffect } from "react";
import { MessageSquare, Instagram, Facebook, Mail, Phone, X, Settings, ExternalLink, CheckCircle2, AlertCircle, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { invokeEdgeFunctionJson } from "@/lib/edgeFunctions";
import { getUserOrganizationId } from "@/lib/shopSettings";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { toast } from "@/hooks/use-toast";
import { useTranslation } from "react-i18next";

interface ChannelConfig {
  id: string;
  name: string;
  icon: any;
  color: string;
  description: string;
  fields: { key: string; label: string; placeholder: string; type?: string }[];
}

const channels: ChannelConfig[] = [
  {
    id: "whatsapp",
    name: "WhatsApp",
    icon: MessageSquare,
    color: "text-emerald-400",
    description: "Connect via Twilio WhatsApp Business API",
    fields: [
      { key: "account_sid", label: "Account SID", placeholder: "ACxxxxxxxx" },
      { key: "auth_token", label: "Auth Token", placeholder: "Your Twilio auth token", type: "password" },
      { key: "phone_number", label: "WhatsApp Number", placeholder: "+44..." },
    ],
  },
  {
    id: "instagram",
    name: "Instagram",
    icon: Instagram,
    color: "text-pink-400",
    description: "Connect via Meta Instagram Messaging API",
    fields: [
      { key: "page_id", label: "Page ID", placeholder: "Your Instagram page ID" },
      { key: "access_token", label: "Access Token", placeholder: "Meta access token", type: "password" },
    ],
  },
  {
    id: "facebook",
    name: "Facebook",
    icon: Facebook,
    color: "text-blue-400",
    description: "Connect via Meta Messenger Platform",
    fields: [
      { key: "page_id", label: "Page ID", placeholder: "Your Facebook page ID" },
      { key: "access_token", label: "Access Token", placeholder: "Meta access token", type: "password" },
    ],
  },
  {
    id: "email",
    name: "Email",
    icon: Mail,
    color: "text-primary",
    description: "Forward emails to your unified inbox",
    fields: [
      { key: "email", label: "Email Address", placeholder: "artist@example.com" },
      { key: "imap_host", label: "IMAP Host", placeholder: "imap.gmail.com" },
      { key: "imap_password", label: "App Password", placeholder: "App-specific password", type: "password" },
    ],
  },
  {
    id: "sms",
    name: "SMS",
    icon: Phone,
    color: "text-muted-foreground",
    description: "Connect via Twilio SMS",
    fields: [
      { key: "account_sid", label: "Account SID", placeholder: "ACxxxxxxxx" },
      { key: "auth_token", label: "Auth Token", placeholder: "Your Twilio auth token", type: "password" },
      { key: "phone_number", label: "Phone Number", placeholder: "+44..." },
    ],
  },
];

interface ChannelConnectionsProps {
  open: boolean;
  onClose: () => void;
}

const ChannelConnections = ({ open, onClose }: ChannelConnectionsProps) => {
  const { user } = useAuth();
  const { t } = useTranslation();
  const [connectedChannels, setConnectedChannels] = useState<Record<string, boolean>>({});
  const [expandedChannel, setExpandedChannel] = useState<string | null>(null);
  const [formValues, setFormValues] = useState<Record<string, Record<string, string>>>({});
  const [saving, setSaving] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (open && user) fetchConnections();
  }, [open, user]);

  const fetchConnections = async () => {
    if (!user) return;
    setLoading(true);
    const orgId = await getUserOrganizationId(user.id);
    let query = supabase.from("channel_connections").select("*").eq("user_id", user.id);
    if (orgId) query = supabase.from("channel_connections").select("*").eq("organization_id", orgId);
    const { data } = await query;

    if (data) {
      const connected: Record<string, boolean> = {};
      const values: Record<string, Record<string, string>> = {};
      data.forEach((row: any) => {
        connected[row.channel] = row.is_active;
        // Mask credentials for display — show only that they exist
        const creds = row.credentials as Record<string, string>;
        const masked: Record<string, string> = {};
        Object.keys(creds).forEach((k) => {
          masked[k] = "••••••••";
        });
        values[row.channel] = masked;
      });
      setConnectedChannels(connected);
      setFormValues(values);
    }
    setLoading(false);
  };

  if (!open) return null;

  const handleConnect = async (channelId: string) => {
    if (!user) return;
    const creds = formValues[channelId] || {};
    // Validate all fields filled
    const channelConfig = channels.find((c) => c.id === channelId);
    if (!channelConfig) return;
    const missing = channelConfig.fields.filter((f) => !creds[f.key] || creds[f.key] === "••••••••" || !creds[f.key].trim());
    if (missing.length > 0) {
      toast({ title: t("channel.missingFields", { defaultValue: "Missing fields" }), description: t("channel.fillFields", { fields: missing.map((f) => f.label).join(", "), defaultValue: `Please fill in: ${missing.map((f) => f.label).join(", ")}` }), variant: "destructive" });
      return;
    }

    setSaving(true);
    const { error } = await invokeEdgeFunctionJson("connect-inbox-channel", {
      action: "connect",
      channel: channelId,
      credentials: creds,
    });
    setSaving(false);

    if (error) {
      toast({ title: t("common.error"), description: error.message, variant: "destructive" });
      return;
    }

    setConnectedChannels((prev) => ({ ...prev, [channelId]: true }));
    setExpandedChannel(null);
    toast({ title: t("channel.connectedTitle", { name: channelConfig.name, defaultValue: `${channelConfig.name} connected` }), description: t("channel.connectedDesc", { defaultValue: "Your credentials have been saved securely." }) });
  };

  const handleDisconnect = async (channelId: string) => {
    if (!user) return;
    setSaving(true);
    const { error } = await invokeEdgeFunctionJson("connect-inbox-channel", {
      action: "disconnect",
      channel: channelId,
    });
    setSaving(false);
    if (error) {
      toast({ title: t("common.error"), description: error.message, variant: "destructive" });
      return;
    }
    setConnectedChannels((prev) => ({ ...prev, [channelId]: false }));
    setFormValues((prev) => { const n = { ...prev }; delete n[channelId]; return n; });
    toast({ title: t("channel.disconnected", { defaultValue: "Disconnected" }), description: t("channel.channelRemoved", { defaultValue: "Channel removed." }) });
  };

  const updateField = (channelId: string, fieldKey: string, value: string) => {
    setFormValues((prev) => ({
      ...prev,
      [channelId]: { ...(prev[channelId] || {}), [fieldKey]: value },
    }));
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-background/80 backdrop-blur-sm p-4">
      <div className="w-full max-w-lg rounded-xl border border-border bg-card shadow-elevated max-h-[85vh] overflow-y-auto">
        <div className="flex items-center justify-between p-4 border-b border-border sticky top-0 bg-card z-10">
          <div className="flex items-center gap-2">
            <Settings className="h-5 w-5 text-primary" />
            <h2 className="font-display text-lg font-semibold">{t("channel.title", { defaultValue: "My Channel Connections" })}</h2>
          </div>
          <Button variant="ghost" size="icon" className="h-8 w-8" onClick={onClose}>
            <X className="h-4 w-4" />
          </Button>
        </div>

        <div className="p-4 space-y-3">
          <p className="text-sm text-muted-foreground">
            {t("channel.subtitle", { defaultValue: "Connect your personal messaging accounts. Each artist manages their own channels independently." })}
          </p>

          {loading ? (
            <div className="flex justify-center py-8">
              <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
            </div>
          ) : (
            channels.map((ch) => {
              const connected = connectedChannels[ch.id];
              const expanded = expandedChannel === ch.id;
              const Icon = ch.icon;

              return (
                <div key={ch.id} className="rounded-lg border border-border bg-secondary/30 overflow-hidden">
                  <div className="flex items-center justify-between p-3">
                    <div className="flex items-center gap-3">
                      <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-secondary">
                        <Icon className={`h-5 w-5 ${ch.color}`} />
                      </div>
                      <div>
                        <p className="text-sm font-semibold">{ch.name}</p>
                        <p className="text-xs text-muted-foreground">{ch.description}</p>
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      {connected ? (
                        <>
                          <CheckCircle2 className="h-4 w-4 text-emerald-400" />
                          <Button variant="ghost" size="sm" className="text-xs text-destructive" onClick={() => handleDisconnect(ch.id)} disabled={saving}>
                            {t("channel.disconnect", { defaultValue: "Disconnect" })}
                          </Button>
                        </>
                      ) : (
                        <Button
                          variant="outline"
                          size="sm"
                          className="text-xs"
                          onClick={() => setExpandedChannel(expanded ? null : ch.id)}
                        >
                          {expanded ? t("common.cancel") : t("channel.connect", { defaultValue: "Connect" })}
                        </Button>
                      )}
                    </div>
                  </div>

                  {expanded && !connected && (
                    <div className="p-3 pt-0 border-t border-border mt-0 space-y-3">
                      <div className="pt-3 space-y-2">
                        {ch.fields.map((field) => (
                          <div key={field.key}>
                            <Label className="text-xs uppercase tracking-widest text-muted-foreground">{field.label}</Label>
                            <Input
                              type={field.type || "text"}
                              placeholder={field.placeholder}
                              value={formValues[ch.id]?.[field.key] || ""}
                              onChange={(e) => updateField(ch.id, field.key, e.target.value)}
                              className="mt-1 field-surface border-border text-sm"
                            />
                          </div>
                        ))}
                      </div>
                      <div className="flex items-center gap-2">
                        <Button variant="gold" size="sm" className="flex-1" onClick={() => handleConnect(ch.id)} disabled={saving}>
                          {saving ? <Loader2 className="h-4 w-4 animate-spin mr-1" /> : null}
                          {t("channel.connectWithName", { name: ch.name, defaultValue: `Connect ${ch.name}` })}
                        </Button>
                        <Button variant="ghost" size="sm" className="gap-1 text-xs text-muted-foreground">
                          <ExternalLink className="h-3 w-3" /> {t("channel.setupGuide", { defaultValue: "Setup Guide" })}
                        </Button>
                      </div>
                    </div>
                  )}
                </div>
              );
            })
          )}

          <div className="rounded-lg border border-border bg-secondary/20 p-3 flex items-start gap-2">
            <AlertCircle className="h-4 w-4 text-muted-foreground mt-0.5 shrink-0" />
            <p className="text-xs text-muted-foreground">
              {t("channel.securityNote", { defaultValue: "Your credentials are stored securely per-artist. Each team member connects their own accounts independently." })}
            </p>
          </div>
        </div>
      </div>
    </div>
  );
};

export default ChannelConnections;
