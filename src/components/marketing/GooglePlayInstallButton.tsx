import { PLAY_ANDROID_BETA_URL } from "@/lib/androidDownload";
import { cn } from "@/lib/utils";
import { STORE_BADGE_BOX_CLASS, GOOGLE_PLAY_BADGE_IMG_CLASS } from "@/components/marketing/storeBadge";

type GooglePlayInstallButtonProps = {
  className?: string;
  badgeClassName?: string;
};

/** Official-style Google Play badge linking to the internal test opt-in page. */
export function GooglePlayInstallButton({ className, badgeClassName }: GooglePlayInstallButtonProps) {
  return (
    <a
      href={PLAY_ANDROID_BETA_URL}
      target="_blank"
      rel="noopener noreferrer"
      className={cn("transition-opacity hover:opacity-90", STORE_BADGE_BOX_CLASS, className)}
      aria-label="Get Velbok on Google Play"
    >
      <img
        src="https://play.google.com/intl/en_us/badges/static/images/badges/en_badge_web_generic.png"
        alt="Get it on Google Play"
        width={200}
        height={59}
        className={cn(GOOGLE_PLAY_BADGE_IMG_CLASS, badgeClassName)}
        loading="lazy"
        decoding="async"
      />
    </a>
  );
}
