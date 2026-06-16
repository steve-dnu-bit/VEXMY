import { useTranslation } from "react-i18next";
import LegalPageLayout from "@/components/LegalPageLayout";

const COOKIE_SECTIONS = ["what", "categories", "consent", "thirdParty", "pixels", "manage", "updates"] as const;

const CookiePolicyPage = () => {
  const { t } = useTranslation();

  return (
    <LegalPageLayout title={t("legal.cookies.title")} lastUpdated={t("legal.cookies.lastUpdated")}>
      {COOKIE_SECTIONS.map((key) => (
        <section key={key}>
          <h2 className="font-semibold text-foreground">{t(`legal.cookies.sections.${key}.title`)}</h2>
          <p>{t(`legal.cookies.sections.${key}.p1`)}</p>
        </section>
      ))}
    </LegalPageLayout>
  );
};

export default CookiePolicyPage;
