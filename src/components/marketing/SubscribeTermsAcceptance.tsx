import { Link } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { Checkbox } from "@/components/ui/checkbox";
import { PLATFORM_PRIVACY_VERSION, PLATFORM_TERMS_VERSION } from "@/lib/legalVersions";

type SubscribeTermsAcceptanceProps = {
  id: string;
  checked: boolean;
  onCheckedChange: (checked: boolean) => void;
  disabled?: boolean;
};

const SubscribeTermsAcceptance = ({
  id,
  checked,
  onCheckedChange,
  disabled,
}: SubscribeTermsAcceptanceProps) => {
  const { t } = useTranslation();

  return (
    <div className="flex items-start gap-3 rounded-lg border border-border/60 bg-secondary/20 p-3">
      <Checkbox
        id={id}
        checked={checked}
        onCheckedChange={(value) => onCheckedChange(value === true)}
        disabled={disabled}
        className="mt-0.5"
      />
      <label htmlFor={id} className="text-xs leading-relaxed text-muted-foreground cursor-pointer">
        {t("subscribe.termsCheckboxLead")}{" "}
        <Link to="/terms" target="_blank" rel="noopener noreferrer" className="text-gold hover:underline">
          {t("common.terms")}
        </Link>{" "}
        {t("common.and")}{" "}
        <Link to="/privacy" target="_blank" rel="noopener noreferrer" className="text-gold hover:underline">
          {t("common.privacy")}
        </Link>{" "}
        ({t("subscribe.termsVersionLabel", { version: PLATFORM_TERMS_VERSION })}).{" "}
        {t("subscribe.termsCheckboxBody")}
      </label>
    </div>
  );
};

export { PLATFORM_PRIVACY_VERSION, PLATFORM_TERMS_VERSION };
export default SubscribeTermsAcceptance;
