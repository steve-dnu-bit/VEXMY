import { Globe } from "lucide-react";
import { useTranslation } from "react-i18next";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { SUPPORTED_LANGUAGES, type AppLanguage } from "@/i18n/languages";
import { useLanguagePreference } from "@/components/i18n/LanguageProvider";

type LanguageSelectorProps = {
  compact?: boolean;
  className?: string;
};

const LanguageSelector = ({ compact = false, className = "" }: LanguageSelectorProps) => {
  const { t } = useTranslation();
  const { language, setLanguage } = useLanguagePreference();

  if (compact) {
    return (
      <Select value={language} onValueChange={(v) => void setLanguage(v as AppLanguage)}>
        <SelectTrigger className={`h-9 w-[140px] bg-secondary/80 border-border ${className}`} aria-label={t("common.language")}>
          <Globe className="mr-2 h-3.5 w-3.5 shrink-0 opacity-70" />
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {SUPPORTED_LANGUAGES.map((lang) => (
            <SelectItem key={lang.code} value={lang.code}>
              {lang.nativeLabel}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    );
  }

  return (
    <div className={className}>
      <Label htmlFor="app-language" className="flex items-center gap-2">
        <Globe className="h-4 w-4" />
        {t("settings.languageTitle")}
      </Label>
      <Select value={language} onValueChange={(v) => void setLanguage(v as AppLanguage)}>
        <SelectTrigger id="app-language" className="mt-2 bg-secondary border-border">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {SUPPORTED_LANGUAGES.map((lang) => (
            <SelectItem key={lang.code} value={lang.code}>
              {lang.nativeLabel} ({lang.label})
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      <p className="mt-2 text-xs text-muted-foreground">{t("settings.languageDesc")}</p>
    </div>
  );
};

export default LanguageSelector;
