import { useTranslation } from "react-i18next";
import { useToast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";

const APP_STORE_BADGE_URL =
  "https://tools.applemediaservices.com/api/badges/download-on-the-app-store/black/en-us?size=250x83";

type AppStoreInstallButtonProps = {
  className?: string;
  badgeClassName?: string;
};

/** Official-style App Store badge — shows a coming-soon message until the iOS app is live. */
export function AppStoreInstallButton({ className, badgeClassName }: AppStoreInstallButtonProps) {
  const { t } = useTranslation();
  const { toast } = useToast();

  const handleClick = () => {
    toast({
      title: t("download.appStoreComingSoonTitle"),
      description: t("download.appStoreComingSoonDesc"),
    });
  };

  return (
    <button
      type="button"
      onClick={handleClick}
      className={cn(
        "inline-block cursor-pointer border-0 bg-transparent p-0 transition-opacity hover:opacity-90",
        className,
      )}
      aria-label={t("download.appStoreBadgeAria")}
    >
      <img
        src={APP_STORE_BADGE_URL}
        alt={t("download.appStoreBadgeAlt")}
        width={250}
        height={83}
        className={cn("h-12 w-auto sm:h-14", badgeClassName)}
        loading="lazy"
        decoding="async"
      />
    </button>
  );
}
