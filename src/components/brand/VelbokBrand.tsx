import { Link } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { cn } from "@/lib/utils";
import { BRANDING } from "@/lib/branding";
import VelbokLogo from "@/components/brand/VelbokLogo";

const VARIANTS = {
  marketing: {
    title: "font-display text-xl font-bold tracking-[0.12em] text-gold",
    subtitle: "mt-0.5 text-[9px] tracking-[0.35em] text-gold/70",
    gap: "gap-2.5",
    /** Title + tagline stack on the landing header (+50% from 44px) */
    logoWithTagline: "h-[4.125rem] w-[4.125rem]",
    logo: "h-[2.625rem] w-[2.625rem]",
  },
  auth: {
    title: "font-display text-3xl font-bold tracking-[0.08em] text-gold",
    subtitle: "",
    gap: "gap-3",
    logo: "h-[3.75rem] w-[3.75rem]",
  },
  dashboard: {
    title: "font-display text-lg font-bold text-gold",
    subtitle: "",
    gap: "gap-2.5",
    logo: "h-12 w-12",
    logoIconOnly: "h-[3.375rem] w-[3.375rem]",
  },
} as const;

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

  const logoClass =
    hideText && variant === "dashboard"
      ? styles.logoIconOnly
      : showTagline && variant === "marketing"
        ? styles.logoWithTagline
        : styles.logo;

  const title = (
    <span className={cn(styles.title, "truncate")}>{BRANDING.platformName.toUpperCase()}</span>
  );

  const tagline =
    showTagline && variant === "marketing" ? (
      <span className={styles.subtitle}>{t("common.studioPlatform")}</span>
    ) : null;

  const content =
    hideText ? (
      <div className={cn("inline-flex items-center", className)}>
        <VelbokLogo href={null} imageClassName={cn(logoClass, "shrink-0")} />
      </div>
    ) : showTagline && variant === "marketing" ? (
      <div
        className={cn(
          "inline-grid grid-cols-[auto_1fr] items-center",
          styles.gap,
          className,
        )}
      >
        <VelbokLogo
          href={null}
          className="row-span-2 self-center"
          imageClassName={cn(logoClass, "shrink-0")}
        />
        {title}
        {tagline}
      </div>
    ) : (
      <div className={cn("inline-flex items-center", styles.gap, className)}>
        <VelbokLogo href={null} imageClassName={cn(logoClass, "shrink-0")} />
        {title}
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
