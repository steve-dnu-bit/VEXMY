import type { RefObject } from "react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";
import { Loader2, User } from "lucide-react";
import { useScheduleI18n } from "@/hooks/useScheduleI18n";

export type ClientPick = {
  client_name: string;
  client_email: string | null;
  client_phone: string | null;
  client_user_id: string | null;
};

interface BookingClientSearchProps {
  clientName: string;
  onClientNameChange: (value: string) => void;
  clientSuggestions: ClientPick[];
  suggestionsOpen: boolean;
  suggestionsLoading: boolean;
  setSuggestionsOpen: (open: boolean) => void;
  applyClientPick: (c: ClientPick) => void;
  clientNameWrapRef: RefObject<HTMLDivElement>;
}

const BookingClientSearch = ({
  clientName,
  onClientNameChange,
  clientSuggestions,
  suggestionsOpen,
  suggestionsLoading,
  setSuggestionsOpen,
  applyClientPick,
  clientNameWrapRef,
}: BookingClientSearchProps) => {
  const { t } = useScheduleI18n();
  return (
    <div className="relative" ref={clientNameWrapRef}>
      <Label className="text-xs uppercase tracking-widest text-muted-foreground">{t("schedule.clientNameRequired")}</Label>
      <p className="text-[10px] text-muted-foreground mt-0.5 mb-1">{t("schedule.clientSearchHint")}</p>
      <div className="relative">
        <Input
          value={clientName}
          onChange={(e) => {
            const v = e.target.value;
            onClientNameChange(v);
            if (v.trim().length >= 2) setSuggestionsOpen(true);
            else setSuggestionsOpen(false);
          }}
          onFocus={() => {
            if (clientName.trim().length >= 2) setSuggestionsOpen(true);
          }}
          autoComplete="off"
          className="mt-0 bg-secondary border-border pr-9"
          placeholder={t("schedule.clientSearchPlaceholder")}
        />
        {suggestionsLoading && (
          <Loader2 className="absolute right-2.5 top-1/2 h-4 w-4 -translate-y-1/2 animate-spin text-muted-foreground pointer-events-none" />
        )}
      </div>
      {suggestionsOpen && clientSuggestions.length > 0 && (
        <ul
          className="absolute z-[100] mt-1 max-h-52 w-full overflow-auto rounded-md border border-border bg-popover py-1 text-sm shadow-md"
          role="listbox"
        >
          {clientSuggestions.map((c, i) => (
            <li key={`${c.client_name}-${c.client_email}-${c.client_phone}-${c.client_user_id}-${i}`}>
              <button
                type="button"
                className={cn(
                  "flex w-full flex-col items-start gap-0.5 px-3 py-2 text-left hover:bg-accent hover:text-accent-foreground",
                )}
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => applyClientPick(c)}
              >
                <span className="flex items-center gap-1.5 font-medium">
                  <User className="h-3.5 w-3.5 shrink-0 opacity-60" />
                  {c.client_name}
                </span>
                <span className="pl-5 text-xs text-muted-foreground line-clamp-1">
                  {[c.client_email, c.client_phone].filter(Boolean).join(" · ") || t("schedule.noContactOnFile")}
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}
      {suggestionsOpen && !suggestionsLoading && clientName.trim().length >= 2 && clientSuggestions.length === 0 && (
        <p className="absolute z-[100] mt-1 w-full rounded-md border border-border bg-popover px-3 py-2 text-xs text-muted-foreground shadow-md">
          {t("schedule.noClientMatches")}
        </p>
      )}
    </div>
  );
};

export default BookingClientSearch;
