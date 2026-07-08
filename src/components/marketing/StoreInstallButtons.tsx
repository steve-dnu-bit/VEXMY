import { cn } from "@/lib/utils";
import { AppStoreInstallButton } from "@/components/marketing/AppStoreInstallButton";
import { GooglePlayInstallButton } from "@/components/marketing/GooglePlayInstallButton";

type StoreInstallButtonsProps = {
  className?: string;
  badgeClassName?: string;
};

export function StoreInstallButtons({ className, badgeClassName }: StoreInstallButtonsProps) {
  return (
    <div className={cn("flex flex-wrap items-center justify-center gap-3 sm:gap-4", className)}>
      <GooglePlayInstallButton badgeClassName={badgeClassName} />
      <AppStoreInstallButton badgeClassName={badgeClassName} />
    </div>
  );
}
