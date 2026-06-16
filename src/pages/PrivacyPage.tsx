import { useTranslation } from "react-i18next";
import LegalPageLayout from "@/components/LegalPageLayout";
import { BRANDING } from "@/lib/branding";

const PrivacyPage = () => {
  const { t } = useTranslation();
  const vars = { shopLegalName: BRANDING.shopLegalName };

  return (
    <LegalPageLayout title={t("legal.privacy.title")} lastUpdated={t("legal.privacy.lastUpdated")}>
      <section>
        <h2 className="font-semibold text-foreground">{t("legal.privacy.sections.general.title")}</h2>
        <p>{t("legal.privacy.sections.general.p1", vars)}</p>
        <p>
          {t("legal.privacy.sections.general.contactLead")}{" "}
          <a href={`mailto:${BRANDING.privacyEmail}`} className="text-primary hover:underline">
            {BRANDING.privacyEmail}
          </a>
          . {t("legal.privacy.sections.general.contactDpo")}{" "}
          <a href={`mailto:${BRANDING.dpoEmail}`} className="text-primary hover:underline">
            {BRANDING.dpoEmail}
          </a>
          .
        </p>
      </section>

      <section>
        <h2 className="font-semibold text-foreground">{t("legal.privacy.sections.dataCollect.title")}</h2>
        <p>{t("legal.privacy.sections.dataCollect.p1")}</p>
        <p>{t("legal.privacy.sections.dataCollect.p2")}</p>
      </section>

      <section>
        <h2 className="font-semibold text-foreground">{t("legal.privacy.sections.whenCollect.title")}</h2>
        <p>{t("legal.privacy.sections.whenCollect.p1")}</p>
      </section>

      <section>
        <h2 className="font-semibold text-foreground">{t("legal.privacy.sections.lawfulBases.title")}</h2>
        <p>{t("legal.privacy.sections.lawfulBases.p1")}</p>
        {(["consent", "contract", "legal", "legitimate", "vital"] as const).map((basis) => (
          <p key={basis}>
            <strong className="text-foreground">{t(`legal.privacy.sections.lawfulBases.${basis}`)}</strong>{" "}
            {t(`legal.privacy.sections.lawfulBases.${basis}Desc`)}
          </p>
        ))}
      </section>

      <section>
        <h2 className="font-semibold text-foreground">{t("legal.privacy.sections.howUse.title")}</h2>
        <p>{t("legal.privacy.sections.howUse.p1")}</p>
        <p>{t("legal.privacy.sections.howUse.p2", vars)}</p>
      </section>

      <section>
        <h2 className="font-semibold text-foreground">{t("legal.privacy.sections.cookies.title")}</h2>
        <p>{t("legal.privacy.sections.cookies.p1")}</p>
        <p>{t("legal.privacy.sections.cookies.p2")}</p>
      </section>

      <section>
        <h2 className="font-semibold text-foreground">{t("legal.privacy.sections.security.title")}</h2>
        <p>{t("legal.privacy.sections.security.p1")}</p>
        <p>{t("legal.privacy.sections.security.p2")}</p>
      </section>

      <section>
        <h2 className="font-semibold text-foreground">{t("legal.privacy.sections.cctv.title")}</h2>
        <p>{t("legal.privacy.sections.cctv.p1")}</p>
        <p>{t("legal.privacy.sections.cctv.p2")}</p>
      </section>

      <section>
        <h2 className="font-semibold text-foreground">{t("legal.privacy.sections.rights.title")}</h2>
        <p>
          {t("legal.privacy.sections.rights.p1")}{" "}
          <a href={`mailto:${BRANDING.privacyEmail}`} className="text-primary hover:underline">
            {BRANDING.privacyEmail}
          </a>
          {BRANDING.address ? (
            <> {t("legal.privacy.sections.rights.orWriteTo")} {BRANDING.address}.</>
          ) : (
            "."
          )}
        </p>
        <p>{t("legal.privacy.sections.rights.p2")}</p>
      </section>

      <section>
        <h2 className="font-semibold text-foreground">{t("legal.privacy.sections.updates.title")}</h2>
        <p>{t("legal.privacy.sections.updates.p1")}</p>
      </section>
    </LegalPageLayout>
  );
};

export default PrivacyPage;
