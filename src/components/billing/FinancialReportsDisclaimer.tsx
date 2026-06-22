import { Info } from "lucide-react";
import { useTranslation } from "react-i18next";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";

interface FinancialReportsDisclaimerProps {
  compact?: boolean;
}

const FinancialReportsDisclaimer = ({ compact = false }: FinancialReportsDisclaimerProps) => {
  const { t } = useTranslation();

  return (
    <Alert className="border-amber-500/35 bg-amber-500/5">
      <Info className="h-4 w-4 text-amber-600 dark:text-amber-400" />
      {!compact ? <AlertTitle className="text-sm">{t("accounting.disclaimerTitle")}</AlertTitle> : null}
      <AlertDescription className={compact ? "text-xs text-muted-foreground" : "text-xs sm:text-sm text-muted-foreground"}>
        {compact ? t("accounting.disclaimerShort") : t("accounting.disclaimer")}
      </AlertDescription>
    </Alert>
  );
};

export default FinancialReportsDisclaimer;
