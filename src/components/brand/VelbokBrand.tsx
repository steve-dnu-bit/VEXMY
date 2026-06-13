import { Link } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { cn } from "@/lib/utils";
import { BRANDING } from "@/lib/branding";
import VelbokLogo from "@/components/brand/VelbokLogo";

const VARIANTS = {
  marketing: {
    logoSize: "md" as const,
    title: "font-display text-xl font-bold tracking-[0.12em] text-gold",
    subtitle: "mt-0.5 text-[9px] tracking-[0.35em] text-gold/70",
    gap: "gap-3",
  },
  auth: {
    logoSize: "lg" as const,
    title: "font-display text-3xl font-bold tracking-[0.08em] text-gold",
    subtitle: "",
    gap: "gap-3",
  },
  dashboard: {
    logoSize: "sm" as const,
    title: "font-display text-lg font-bold text-gold",
    subtitle: "",
    gap: "gap-2.5",
  },
};

type VelbokBrandProps = {
  variant?: keyof typeof VARIANTS;
  className?: string;
  href?: string | null;
  showTagline?: boolean;
  hideText?: boolean;
};

const VelbokBrand = ({
  variant = "dashboard",
  className,
  href = null,
  showTagline = false,
  hideText = false,
}: VelbokBrandProps) => {
  const { t } = useTranslation();
  const styles = VARIANTS[variant];

  const content = (
    <div className={cn("inline-flex items-center", styles.gap, className)}>
      <VelbokLogo size={styles.logoSize} href={null} />
      {!hideText ? (
        <div className="flex min-w-0 flex-col leading-none">
          <span className={cn(styles.title, "truncate")}>{BRANDING.platformName.toUpperCase()}</span>
          {showTagline && variant === "marketing" ? (
            <span className={styles.subtitle}>{t("common.studioPlatform")}</span>
          ) : null}
        </div>
      ) : null}
    </div>
  );

  if (href == null) {
    return content;
  }

  return (
    <Link to={href} className="inline-flex shrink-0" aria-label={BRANDING.platformName}>
      {content}
    </Link>
  );
};

export default VelbokBrand;
