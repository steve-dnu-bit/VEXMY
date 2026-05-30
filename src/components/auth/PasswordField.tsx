import { useState } from "react";
import { Eye, EyeOff, Lock } from "lucide-react";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import { useTranslation } from "react-i18next";

type PasswordFieldProps = {
  id?: string;
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  className?: string;
  inputClassName?: string;
  required?: boolean;
  minLength?: number;
  showLockIcon?: boolean;
  autoComplete?: string;
};

const PasswordField = ({
  id,
  value,
  onChange,
  placeholder,
  className,
  inputClassName,
  required,
  minLength,
  showLockIcon = true,
  autoComplete,
}: PasswordFieldProps) => {
  const { t } = useTranslation();
  const [visible, setVisible] = useState(false);

  return (
    <div className={cn("relative", className)}>
      {showLockIcon ? (
        <Lock className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[#d4af37]/85" />
      ) : null}
      <Input
        id={id}
        type={visible ? "text" : "password"}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className={cn(showLockIcon ? "pl-10 pr-10" : "pr-10", inputClassName)}
        required={required}
        minLength={minLength}
        autoComplete={autoComplete}
      />
      <button
        type="button"
        tabIndex={-1}
        className="absolute right-2 top-1/2 flex h-8 w-8 -translate-y-1/2 items-center justify-center rounded-md text-[#d4af37]/85 transition-colors hover:text-[#d4af37] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#d4af37]/50"
        onClick={() => setVisible((v) => !v)}
        aria-label={visible ? t("mfa.hidePassword") : t("mfa.showPassword")}
        aria-pressed={visible}
      >
        {visible ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
      </button>
    </div>
  );
};

export default PasswordField;
