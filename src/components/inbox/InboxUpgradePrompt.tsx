import { Link } from "react-router-dom";
import { Crown } from "lucide-react";
import { useTranslation } from "react-i18next";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

export default function InboxUpgradePrompt() {
  const { t } = useTranslation();

  return (
    <Card className="border-gold/30 bg-card/80 max-w-lg mx-auto">
      <CardHeader className="text-center">
        <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-full bg-gold/10">
          <Crown className="h-6 w-6 text-gold" />
        </div>
        <CardTitle className="font-display">{t("unifiedInbox.upgradeTitle")}</CardTitle>
        <CardDescription>{t("unifiedInbox.upgradeBody")}</CardDescription>
      </CardHeader>
      <CardContent className="flex justify-center">
        <Button variant="gold" asChild>
          <Link to="/subscribe?plan=studio">{t("unifiedInbox.upgradeCta")}</Link>
        </Button>
      </CardContent>
    </Card>
  );
}
