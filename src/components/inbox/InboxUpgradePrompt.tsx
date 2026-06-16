import { Link } from "react-router-dom";
import { Check, Crown } from "lucide-react";
import { useTranslation } from "react-i18next";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

type InboxUpgradePromptProps = {
  compact?: boolean;
};

export default function InboxUpgradePrompt({ compact = false }: InboxUpgradePromptProps) {
  const { t } = useTranslation();
  const studioPerks = ["feed", "channels", "replies", "history"] as const;

  if (compact) {
    return (
      <Card className="border-gold/30 bg-card/80 h-fit lg:sticky lg:top-6">
        <CardHeader className="pb-3">
          <div className="mb-2 flex h-10 w-10 items-center justify-center rounded-full bg-gold/10">
            <Crown className="h-5 w-5 text-gold" />
          </div>
          <CardTitle className="font-display text-lg">{t("unifiedInbox.upgradeTitle")}</CardTitle>
          <CardDescription className="text-left">{t("unifiedInbox.upgradeBody")}</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <ul className="space-y-2 text-sm text-muted-foreground">
            {studioPerks.map((key) => (
              <li key={key} className="flex items-start gap-2">
                <Check className="mt-0.5 h-4 w-4 shrink-0 text-gold" />
                <span>{t(`unifiedInbox.studioAdds.${key}`)}</span>
              </li>
            ))}
          </ul>
          <Button variant="gold" className="w-full" asChild>
            <Link to="/subscribe?plan=studio">{t("unifiedInbox.upgradeCta")}</Link>
          </Button>
        </CardContent>
      </Card>
    );
  }

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
