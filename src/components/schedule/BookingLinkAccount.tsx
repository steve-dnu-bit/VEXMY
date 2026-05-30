import type { RefObject, MutableRefObject } from "react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Loader2, User } from "lucide-react";
import { useScheduleI18n } from "@/hooks/useScheduleI18n";

export interface LinkAccountSuggestion {
  user_id: string;
  display_name: string;
  public_contact_email: string | null;
}

interface BookingLinkAccountProps {
  linkAccountInput: string;
  setLinkAccountInput: (value: string) => void;
  linkAccountOpen: boolean;
  linkAccountSuggestions: LinkAccountSuggestion[];
  linkAccountLoading: boolean;
  linkAccountWrapRef: RefObject<HTMLDivElement>;
  setClientUserId: (id: string) => void;
  setLinkAccountOpen: (open: boolean) => void;
  setLinkAccountSuggestions: (suggestions: LinkAccountSuggestion[]) => void;
  suppressLinkSearchRef: MutableRefObject<boolean>;
  skipAutoLinkFromEmailRef: MutableRefObject<boolean>;
  syncPortalLinkFromEmail: () => Promise<void>;
}

const BookingLinkAccount = ({
  linkAccountInput,
  setLinkAccountInput,
  linkAccountOpen,
  linkAccountSuggestions,
  linkAccountLoading,
  linkAccountWrapRef,
  setClientUserId,
  setLinkAccountOpen,
  setLinkAccountSuggestions,
  suppressLinkSearchRef,
  skipAutoLinkFromEmailRef,
  syncPortalLinkFromEmail,
}: BookingLinkAccountProps) => {
  const { t } = useScheduleI18n();
  return (
    <div className="relative" ref={linkAccountWrapRef}>
      <Label className="text-xs uppercase tracking-widest text-muted-foreground">{t("schedule.linkAccount")}</Label>
      <p className="text-[10px] text-muted-foreground mt-0.5 mb-1">{t("schedule.linkAccountHint")}</p>
      <div className="relative mt-1">
        <Input
          value={linkAccountInput}
          onChange={(e) => {
            const v = e.target.value;
            setLinkAccountInput(v);
            setClientUserId("");
            skipAutoLinkFromEmailRef.current = v.trim().length >= 2;
            if (v.trim().length >= 2) setLinkAccountOpen(true);
            else {
              setLinkAccountOpen(false);
              setLinkAccountSuggestions([]);
            }
          }}
          onBlur={(e) => {
            if (e.currentTarget.value.trim().length >= 2) return;
            skipAutoLinkFromEmailRef.current = false;
            void syncPortalLinkFromEmail();
          }}
          onFocus={() => {
            if (linkAccountInput.trim().length >= 2) setLinkAccountOpen(true);
          }}
          placeholder={t("schedule.linkAccountPlaceholder")}
          autoComplete="off"
          className="bg-secondary border-border pr-9"
        />
        {linkAccountLoading && (
          <Loader2 className="absolute right-2.5 top-1/2 h-4 w-4 -translate-y-1/2 animate-spin text-muted-foreground pointer-events-none" />
        )}
      </div>
      {linkAccountOpen && linkAccountInput.trim().length >= 2 && linkAccountSuggestions.length > 0 && (
        <ul
          className="absolute z-[100] mt-1 max-h-52 w-full overflow-auto rounded-md border border-border bg-popover py-1 text-sm shadow-md"
          role="listbox"
        >
          {linkAccountSuggestions.map((row) => (
            <li key={row.user_id}>
              <button
                type="button"
                className="flex w-full flex-col items-start gap-0.5 px-3 py-2 text-left hover:bg-accent hover:text-accent-foreground"
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => {
                  suppressLinkSearchRef.current = true;
                  setLinkAccountInput(row.display_name);
                  setClientUserId(row.user_id);
                  setLinkAccountOpen(false);
                  setLinkAccountSuggestions([]);
                  skipAutoLinkFromEmailRef.current = false;
                }}
              >
                <span className="flex items-center gap-1.5 font-medium text-xs">
                  <User className="h-3.5 w-3.5 shrink-0 opacity-60" />
                  {row.display_name}
                </span>
                {row.public_contact_email && (
                  <span className="pl-5 text-[11px] text-muted-foreground line-clamp-1">{row.public_contact_email}</span>
                )}
              </button>
            </li>
          ))}
        </ul>
      )}
      {linkAccountOpen && linkAccountInput.trim().length >= 2 && !linkAccountLoading && linkAccountSuggestions.length === 0 && (
        <p className="absolute z-[100] mt-1 w-full rounded-md border border-border bg-popover px-3 py-2 text-xs text-muted-foreground shadow-md">
          {t("schedule.noPortalMatch")}
        </p>
      )}
      <p className="text-[10px] text-muted-foreground mt-1">{t("schedule.linkAccountAutoHint")}</p>
    </div>
  );
};

export default BookingLinkAccount;
