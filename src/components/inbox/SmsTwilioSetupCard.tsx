import { useCallback, useEffect, useState } from "react";
import { ExternalLink, Phone, Settings } from "lucide-react";
import { useTranslation } from "react-i18next";
import { Link } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { supabase } from "@/integrations/supabase/client";
import { getUserOrganizationId } from "@/lib/shopSettings";
import { useAuth } from "@/hooks/useAuth";
import ChannelConnections from "@/components/inbox/ChannelConnections";

const SMS_SETUP_DOC = "/docs/sms-twilio-setup";

const SmsTwilioSetupCard = ({ defaultOpen = false }: { defaultOpen?: boolean }) => {
  const { t } = useTranslation();
  const { user } = useAuth();
  const [smsConnected, setSmsConnected] = useState(false);
  const [loading, setLoading] = useState(true);
  const [settingsOpen, setSettingsOpen] = useState(defaultOpen);

  const refreshStatus = useCallback(async () => {
    if (!user) return;
    setLoading(true);
    const orgId = await getUserOrganizationId(user.id);
    let query = supabase.from("channel_connections").select("id, is_active").eq("channel", "sms");
    if (orgId) query = query.eq("organization_id", orgId);
    else query = query.eq("user_id", user.id);
    const { data } = await query.maybeSingle();
    setSmsConnected(!!data?.is_active);
    setLoading(false);
  }, [user]);

  useEffect(() => {
    void refreshStatus();
  }, [refreshStatus]);

  return (
    <>
      <Card className="border-primary/25 bg-primary/5">
        <CardHeader className="pb-2">
          <div className="flex flex-wrap items-center gap-2 justify-between">
            <div className="flex items-center gap-2">
              <Phone className="h-5 w-5 text-primary" />
              <CardTitle className="text-base">{t("inbox.smsSetupTitle")}</CardTitle>
            </div>
            {!loading ? (
              <Badge variant={smsConnected ? "default" : "outline"} className="text-[10px]">
                {smsConnected ? t("inbox.smsConnected") : t("inbox.smsNotConnected")}
              </Badge>
            ) : null}
          </div>
          <CardDescription>{t("inbox.smsSetupDesc")}</CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <ul className="text-xs text-muted-foreground space-y-1 list-disc pl-4">
            <li>{t("inbox.smsSetupBullet1")}</li>
            <li>{t("inbox.smsSetupBullet2")}</li>
            <li>{t("inbox.smsSetupBullet3")}</li>
          </ul>
          <div className="flex flex-wrap gap-2">
            <Button type="button" variant="gold" size="sm" className="gap-1.5" onClick={() => setSettingsOpen(true)}>
              <Settings className="h-3.5 w-3.5" />
              {smsConnected ? t("inbox.smsManageConnection") : t("inbox.smsConnectTwilio")}
            </Button>
            <Button type="button" variant="outline" size="sm" className="gap-1.5" asChild>
              <Link to={SMS_SETUP_DOC}>
                <ExternalLink className="h-3.5 w-3.5" />
                {t("inbox.smsSetupGuide")}
              </Link>
            </Button>
            <Button type="button" variant="ghost" size="sm" asChild>
              <Link to="/admin">{t("inbox.smsReminderSettings")}</Link>
            </Button>
          </div>
        </CardContent>
      </Card>

      <ChannelConnections
        open={settingsOpen}
        initialChannel="sms"
        channelIds={["sms"]}
        onClose={() => {
          setSettingsOpen(false);
          void refreshStatus();
        }}
      />
    </>
  );
};

export default SmsTwilioSetupCard;
