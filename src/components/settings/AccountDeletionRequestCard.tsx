import { Link } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { UserX } from "lucide-react";
import { useAuth } from "@/hooks/useAuth";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { BRANDING } from "@/lib/branding";
import { buildAccountDeletionMailto } from "@/lib/accountDeletionRequest";

const AccountDeletionRequestCard = () => {
  const { t } = useTranslation();
  const { user } = useAuth();

  if (!user) return null;

  const mailto = buildAccountDeletionMailto({ id: user.id, email: user.email });

  return (
    <Card className="bg-card border-border border-destructive/20">
      <CardHeader className="pb-3">
        <div className="flex items-center gap-2">
          <UserX className="h-5 w-5 text-destructive" />
          <CardTitle className="text-base">{t("accountDeletion.title")}</CardTitle>
        </div>
        <CardDescription>{t("accountDeletion.desc")}</CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        <ul className="text-xs text-muted-foreground space-y-1.5 list-disc pl-4">
          <li>{t("accountDeletion.bulletProfile")}</li>
          <li>{t("accountDeletion.bulletStudio")}</li>
          <li>{t("accountDeletion.bulletLegal")}</li>
        </ul>
        <p className="text-xs text-muted-foreground">
          {t("accountDeletion.responseTime")}{" "}
          <Link to="/account-deletion" className="text-primary hover:underline">
            {t("legal.layout.accountDeletion")}
          </Link>
          .
        </p>
        <div className="flex flex-wrap gap-2">
          <Button variant="destructive" size="sm" asChild>
            <a href={mailto}>{t("accountDeletion.requestButton")}</a>
          </Button>
          <Button variant="outline" size="sm" asChild>
            <a href={`mailto:${BRANDING.privacyEmail}`}>{BRANDING.privacyEmail}</a>
          </Button>
        </div>
      </CardContent>
    </Card>
  );
};

export default AccountDeletionRequestCard;
