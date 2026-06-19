import React from "react";
import { useTranslation } from "react-i18next";
import LegalPageLayout from "@/components/LegalPageLayout";
import { BRANDING } from "@/lib/branding";

const PrivacyPage = () => {
  const { t } = useTranslation();
  const vars = { shopLegalName: BRANDING.shopLegalName, platformName: BRANDING.platformName };

  const section = (key: string, extra?: React.ReactNode) => (
    <section key={key}>
      <h2 className="font-semibold text-foreground">{t(`legal.privacy.sections.${key}.title`)}</h2>
      <p>{t(`legal.privacy.sections.${key}.p1`, vars)}</p>
      {t(`legal.privacy.sections.${key}.p2`, { defaultValue: "" }) ? (
        <p>{t(`legal.privacy.sections.${key}.p2`, vars)}</p>
      ) : null}
      {extra}
    </section>
  );

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

      {section("roles")}
      {section("dataCollect")}
      {section("healthData")}
      {section("whenCollect")}
      {section("mobile")}
      {section("subprocessors")}
      {section("transfers")}

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

      {section("howUse")}
      {section("cookies")}
      {section("security")}
      {section("children")}

      <section>
        <h2 className="font-semibold text-foreground">{t("legal.privacy.sections.ccpa.title")}</h2>
        <p>
          {t("legal.privacy.sections.ccpa.p1")}{" "}
          <a href={`mailto:${BRANDING.privacyEmail}`} className="text-primary hover:underline">
            {BRANDING.privacyEmail}
          </a>
          .
        </p>
        <p>{t("legal.privacy.sections.ccpa.p2")}</p>
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

      {section("updates")}
    </LegalPageLayout>
  );
};

export default PrivacyPage;
