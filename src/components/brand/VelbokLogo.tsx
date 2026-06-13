import { Link } from "react-router-dom";
import { cn } from "@/lib/utils";
import { BRANDING } from "@/lib/branding";

const SIZES = {
  sm: "h-8 w-8",
  md: "h-10 w-10",
  lg: "h-16 w-16",
  xl: "h-24 w-24",
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
      src={BRANDING.logoSrc}
      alt={BRANDING.platformName}
      className={cn(SIZES[size], "rounded-[18%] object-cover", imageClassName)}
      width={size === "xl" ? 96 : size === "lg" ? 64 : size === "md" ? 40 : 32}
      height={size === "xl" ? 96 : size === "lg" ? 64 : size === "md" ? 40 : 32}
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
