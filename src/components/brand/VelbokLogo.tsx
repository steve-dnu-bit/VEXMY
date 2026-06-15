import { Link } from "react-router-dom";
import { cn } from "@/lib/utils";
import { BRANDING } from "@/lib/branding";

/** In-app logo sizes (~12.5% larger than the original 32/40/64/96px set). */
const LOGO_PX = {
  sm: 36,
  md: 45,
  lg: 72,
  xl: 108,
} as const;

const SIZES = {
  sm: "h-9 w-9",
  md: "h-[45px] w-[45px]",
  lg: "h-[4.5rem] w-[4.5rem]",
  xl: "h-[6.75rem] w-[6.75rem]",
} as const;

type VelbokLogoProps = {
  size?: keyof typeof SIZES;
  className?: string;
  imageClassName?: string;
  href?: string | null;
};

const VelbokLogo = ({ size = "md", className, imageClassName, href = "/" }: VelbokLogoProps) => {
  const image = (
    <img
      src={BRANDING.markSrc}
      alt=""
      aria-hidden
      className={cn(SIZES[size], "object-contain", imageClassName)}
      width={LOGO_PX[size]}
      height={LOGO_PX[size]}
    />
  );

  if (href == null) {
    return <div className={cn("inline-flex shrink-0", className)}>{image}</div>;
  }

  return (
    <Link to={href} className={cn("inline-flex shrink-0", className)} aria-label={BRANDING.platformName}>
      {image}
    </Link>
  );
};

export default VelbokLogo;
