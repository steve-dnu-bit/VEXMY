import { useTranslation } from "react-i18next";
import LegalPageLayout from "@/components/LegalPageLayout";
import { BRANDING } from "@/lib/branding";

const TERMS_SECTIONS = [
  "scope",
  "eligibility",
  "children",
  "acceptableUse",
  "bookings",
  "subscription",
  "studioObligations",
  "dataProcessing",
  "ip",
  "data",
  "thirdParty",
  "disclaimer",
  "indemnity",
  "availability",
  "liability",
  "changes",
  "governingLaw",
] as const;

const TermsPage = () => {
  const { t } = useTranslation();
  const vars = { platformName: BRANDING.platformName, shopLegalName: BRANDING.shopLegalName };

  return (
    <LegalPageLayout title={t("legal.terms.title")} lastUpdated={t("legal.terms.lastUpdated")}>
      {TERMS_SECTIONS.map((key) => (
        <section key={key}>
          <h2 className="font-semibold text-foreground">{t(`legal.terms.sections.${key}.title`)}</h2>
          <p>{t(`legal.terms.sections.${key}.p1`, vars)}</p>
          {t(`legal.terms.sections.${key}.p2`, { defaultValue: "" }) ? (
            <p>{t(`legal.terms.sections.${key}.p2`, vars)}</p>
          ) : null}
        </section>
      ))}
    </LegalPageLayout>
  );
};

export default TermsPage;
