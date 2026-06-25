import { useTranslation } from "react-i18next";
import { BRANDING } from "@/lib/branding";

type AuthSupportFootnoteProps = {
  className?: string;
};

/** Subtle support contact — email and optional phone, not prominent. */
const AuthSupportFootnote = ({ className = "" }: AuthSupportFootnoteProps) => {
  const { t } = useTranslation();
  const email = BRANDING.supportEmail?.trim();
  const phone = BRANDING.supportPhone?.trim();
  if (!email && !phone) return null;

  return (
    <p className={`text-center text-[10px] leading-relaxed text-zinc-600 ${className}`}>
      {t("auth.needHelp")}{" "}
      {email ? (
        <a href={`mailto:${email}`} className="text-zinc-500 hover:text-zinc-400 hover:underline">
          {email}
        </a>
      ) : null}
      {email && phone ? <span className="text-zinc-700"> · </span> : null}
      {phone ? (
        <a href={`tel:${phone.replace(/\s/g, "")}`} className="text-zinc-500 hover:text-zinc-400 hover:underline">
          {phone}
        </a>
      ) : null}
    </p>
  );
};

export default AuthSupportFootnote;
