import { PLAY_ANDROID_BETA_URL } from "@/lib/androidDownload";
import { cn } from "@/lib/utils";

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
      className={cn("inline-block transition-opacity hover:opacity-90", className)}
      aria-label="Get Velbok on Google Play"
    >
      <img
        src="https://play.google.com/intl/en_us/badges/static/images/badges/en_badge_web_generic.png"
        alt="Get it on Google Play"
        width={200}
        height={59}
        className={cn("h-12 w-auto sm:h-14", badgeClassName)}
        loading="lazy"
        decoding="async"
      />
    </a>
  );
}
