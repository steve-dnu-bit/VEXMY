import { Link } from "react-router-dom";
import { useTranslation } from "react-i18next";
import LegalPageLayout from "@/components/LegalPageLayout";
import { Button } from "@/components/ui/button";
import { BRANDING } from "@/lib/branding";
import { useAuth } from "@/hooks/useAuth";
import { buildAccountDeletionMailto } from "@/lib/accountDeletionRequest";

const AccountDeletionPage = () => {
  const { t } = useTranslation();
  const { user } = useAuth();
  const mailto = user
    ? buildAccountDeletionMailto({ id: user.id, email: user.email })
    : `mailto:${BRANDING.privacyEmail}?subject=${encodeURIComponent(`${BRANDING.platformName} account deletion request`)}`;

  return (
    <LegalPageLayout title={t("legal.accountDeletion.title")} lastUpdated={t("legal.accountDeletion.lastUpdated")}>
      <section>
        <h2 className="font-semibold text-foreground">{t("legal.accountDeletion.overviewTitle")}</h2>
        <p>{t("legal.accountDeletion.overviewP1", { shopLegalName: BRANDING.shopLegalName })}</p>
        <p>{t("legal.accountDeletion.overviewP2")}</p>
      </section>

      <section>
        <h2 className="font-semibold text-foreground">{t("legal.accountDeletion.inAppTitle")}</h2>
        <p>{t("legal.accountDeletion.inAppP1")}</p>
        <ul className="list-disc pl-5 space-y-1">
          <li>{t("legal.accountDeletion.inAppStaff")}</li>
          <li>{t("legal.accountDeletion.inAppCustomer")}</li>
        </ul>
        {user ? (
          <p className="pt-2">
            <Button variant="destructive" size="sm" asChild>
              <a href={mailto}>{t("accountDeletion.requestButton")}</a>
            </Button>
          </p>
        ) : (
          <p className="pt-2">
            <Link to="/auth" className="text-primary hover:underline">
              {t("legal.accountDeletion.signInToRequest")}
            </Link>
          </p>
        )}
      </section>

      <section>
        <h2 className="font-semibold text-foreground">{t("legal.accountDeletion.emailTitle")}</h2>
        <p>{t("legal.accountDeletion.emailP1")}</p>
        <p>
          <a href={mailto} className="text-primary hover:underline">
            {BRANDING.privacyEmail}
          </a>
        </p>
        <p className="text-xs">{t("legal.accountDeletion.emailP2")}</p>
      </section>

      <section>
        <h2 className="font-semibold text-foreground">{t("legal.accountDeletion.whatDeletedTitle")}</h2>
        <ul className="list-disc pl-5 space-y-1">
          <li>{t("legal.accountDeletion.whatDeleted1")}</li>
          <li>{t("legal.accountDeletion.whatDeleted2")}</li>
          <li>{t("legal.accountDeletion.whatDeleted3")}</li>
        </ul>
      </section>

      <section>
        <h2 className="font-semibold text-foreground">{t("legal.accountDeletion.timingTitle")}</h2>
        <p>{t("legal.accountDeletion.timingP1")}</p>
      </section>

      <section>
        <p>
          {t("legal.accountDeletion.privacyLinkLead")}{" "}
          <Link to="/privacy" className="text-primary hover:underline">
            {t("legal.layout.privacy")}
          </Link>
          .
        </p>
      </section>
    </LegalPageLayout>
  );
};

export default AccountDeletionPage;
