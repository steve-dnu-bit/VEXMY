import { useTranslation } from "react-i18next";
import { cn } from "@/lib/utils";

function MockChrome({ title, children, className }: { title: string; children: React.ReactNode; className?: string }) {
  return (
    <div className={cn("overflow-hidden rounded-xl border border-border/60 bg-[#0c0d12] shadow-2xl", className)}>
      <div className="flex items-center gap-2 border-b border-border/50 bg-[#101216] px-4 py-2.5">
        <span className="h-2.5 w-2.5 rounded-full bg-red-500/80" />
        <span className="h-2.5 w-2.5 rounded-full bg-amber-400/80" />
        <span className="h-2.5 w-2.5 rounded-full bg-emerald-500/80" />
        <span className="ml-2 truncate text-[10px] text-muted-foreground sm:text-xs">{title}</span>
      </div>
      {children}
    </div>
  );
}

export function ScheduleMock() {
  const { t } = useTranslation();
  const m = "marketing.landingMocks";
  const artists = ["Alex", "Mia", "Jordan"];
  const bookings = [
    { time: "10:00", artist: "Alex", label: t(`${m}.bookingFullSleeve`), tone: "gold" },
    { time: "11:30", artist: "Mia", label: t(`${m}.bookingPortrait`), tone: "teal" },
    { time: "14:00", artist: "Jordan", label: t(`${m}.bookingTouchUp`), tone: "violet" },
    { time: "16:30", artist: "Alex", label: t(`${m}.bookingConsult`), tone: "gold" },
  ] as const;

  return (
    <MockChrome title={t(`${m}.scheduleTitle`)}>
      <div className="p-3 sm:p-4">
        <div className="mb-3 flex items-center justify-between gap-2">
          <div>
            <p className="text-[10px] uppercase tracking-widest text-gold/70">{t(`${m}.scheduleLabel`)}</p>
            <p className="font-display text-sm font-semibold">{t(`${m}.scheduleDay`)}</p>
          </div>
          <span className="rounded-md bg-gold/15 px-2 py-1 text-[10px] text-gold">{t(`${m}.newBooking`)}</span>
        </div>
        <div className="mb-2 flex gap-1">
          {artists.map((a) => (
            <span key={a} className="rounded-full bg-secondary/80 px-2 py-0.5 text-[9px] font-medium">
              {a}
            </span>
          ))}
        </div>
        <div className="space-y-1.5">
          {bookings.map((b) => {
            const tone =
              b.tone === "gold"
                ? "border-gold/40 bg-gold/15"
                : b.tone === "teal"
                  ? "border-teal-500/35 bg-teal-500/10"
                  : "border-violet-500/35 bg-violet-500/10";
            return (
              <div
                key={`${b.time}-${b.label}`}
                className={cn("flex items-center gap-2 rounded-lg border px-2.5 py-2", tone)}
              >
                <span className="w-10 shrink-0 text-[10px] text-muted-foreground">{b.time}</span>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-xs font-medium">{b.label}</p>
                  <p className="text-[10px] text-muted-foreground">{b.artist}</p>
                </div>
                <span className="rounded bg-black/20 px-1.5 py-0.5 text-[9px] text-emerald-300">{t(`${m}.confirmed`)}</span>
              </div>
            );
          })}
        </div>
      </div>
    </MockChrome>
  );
}

export function DepositsMock() {
  const { t } = useTranslation();
  const m = "marketing.landingMocks";
  const rows = [
    { client: "Sam R.", when: "Fri 14 Jun · 2:00pm", amount: "£50", status: "paid" as const },
    { client: "Jordan K.", when: "Sat 15 Jun · 11:30am", amount: "£75", status: "pending" as const },
    { client: "Alex P.", when: "Mon 17 Jun · 4:00pm", amount: "£50", status: "pending" as const },
  ];

  return (
    <MockChrome title={t(`${m}.depositsTitle`)}>
      <div className="p-3 sm:p-4">
        <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
          <div>
            <p className="text-[10px] uppercase tracking-widest text-gold/70">{t(`${m}.depositsLabel`)}</p>
            <p className="font-display text-sm font-semibold">{t(`${m}.depositsSubtitle`)}</p>
          </div>
          <img src="/marketing/stripe-wordmark.svg" alt="Stripe" className="h-5 w-auto opacity-90" />
        </div>
        <div className="mb-2 grid grid-cols-3 gap-2">
          {[
            { label: t(`${m}.inWindow`), value: "12" },
            { label: t(`${m}.paid`), value: "8", tone: "text-emerald-400" },
            { label: t(`${m}.pending`), value: "4", tone: "text-amber-300" },
          ].map((s) => (
            <div key={s.label} className="rounded-lg border border-border/50 bg-card/40 px-2 py-2">
              <p className="text-[9px] uppercase text-muted-foreground">{s.label}</p>
              <p className={cn("font-display text-base font-bold", s.tone)}>{s.value}</p>
            </div>
          ))}
        </div>
        <div className="space-y-1.5">
          {rows.map((r) => (
            <div
              key={r.client}
              className="flex items-center justify-between gap-2 rounded-lg border border-border/50 bg-card/35 px-2.5 py-2"
            >
              <div className="min-w-0">
                <p className="truncate text-xs font-medium">{r.client}</p>
                <p className="truncate text-[10px] text-muted-foreground">{r.when}</p>
              </div>
              <div className="shrink-0 text-right">
                <p className="text-xs font-semibold">{r.amount}</p>
                <span
                  className={cn(
                    "inline-block rounded px-1.5 py-0.5 text-[9px]",
                    r.status === "paid"
                      ? "bg-emerald-500/15 text-emerald-300"
                      : "bg-amber-500/15 text-amber-200",
                  )}
                >
                  {r.status === "paid" ? t(`${m}.paid`) : t(`${m}.sendLink`)}
                </span>
              </div>
            </div>
          ))}
        </div>
      </div>
    </MockChrome>
  );
}

export function StencilMock() {
  const { t } = useTranslation();
  const m = "marketing.landingMocks";

  return (
    <MockChrome title={t(`${m}.stencilTitle`)}>
      <div className="p-3 sm:p-4">
        <div className="mb-3 flex items-center justify-between gap-2">
          <div>
            <p className="text-[10px] uppercase tracking-widest text-gold/70">{t(`${m}.stencilLabel`)}</p>
            <p className="font-display text-sm font-semibold">{t(`${m}.stencilSubtitle`)}</p>
          </div>
          <span className="rounded-md bg-violet-500/15 px-2 py-1 text-[10px] text-violet-200">{t(`${m}.generate`)}</span>
        </div>
        <div className="grid gap-2 sm:grid-cols-2">
          <div className="rounded-lg border border-dashed border-border/60 bg-card/25 p-3">
            <p className="text-[10px] uppercase tracking-wide text-muted-foreground">{t(`${m}.reference`)}</p>
            <div className="mt-2 aspect-square rounded-md bg-gradient-to-br from-zinc-700/50 to-zinc-900/80" />
          </div>
          <div className="rounded-lg border border-gold/25 bg-gold/5 p-3">
            <p className="text-[10px] uppercase tracking-wide text-gold/80">{t(`${m}.stencilOutput`)}</p>
            <div className="relative mt-2 aspect-square overflow-hidden rounded-md bg-[#050608]">
              <svg viewBox="0 0 100 100" className="h-full w-full text-white/85">
                <path
                  d="M20 75 Q35 20 50 45 T80 25"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="1.5"
                />
                <path d="M30 60 L55 35 L70 55" fill="none" stroke="currentColor" strokeWidth="1" opacity="0.7" />
                <circle cx="48" cy="42" r="8" fill="none" stroke="currentColor" strokeWidth="1" />
              </svg>
            </div>
          </div>
        </div>
        <div className="mt-2 flex gap-2">
          <span className="rounded bg-secondary px-2 py-1 text-[9px] text-muted-foreground">{t(`${m}.contrast`)}</span>
          <span className="rounded bg-secondary px-2 py-1 text-[9px] text-muted-foreground">{t(`${m}.lineWeight`)}</span>
          <span className="rounded bg-secondary px-2 py-1 text-[9px] text-muted-foreground">{t(`${m}.exportPng`)}</span>
        </div>
      </div>
    </MockChrome>
  );
}

export function ConsentMock() {
  const { t } = useTranslation();
  const m = "marketing.landingMocks";
  const steps = [t(`${m}.clientDetails`), t(`${m}.healthQuestionnaire`), t(`${m}.aftercareAck`)];

  return (
    <MockChrome title={t(`${m}.consentTitle`)}>
      <div className="p-3 sm:p-4">
        <p className="text-[10px] uppercase tracking-widest text-gold/70">{t(`${m}.consentLabel`)}</p>
        <p className="font-display text-sm font-semibold">{t(`${m}.consentFormTitle`)}</p>
        <div className="mt-3 space-y-2 rounded-lg border border-border/50 bg-card/30 p-3">
          {steps.map((line, i) => (
            <div key={line} className="flex items-center gap-2 text-[10px] sm:text-xs">
              <span
                className={cn(
                  "flex h-4 w-4 items-center justify-center rounded-full text-[9px]",
                  i < 2 ? "bg-emerald-500/20 text-emerald-300" : "bg-secondary text-muted-foreground",
                )}
              >
                {i < 2 ? "✓" : "·"}
              </span>
              <span className={i < 2 ? "text-foreground" : "text-muted-foreground"}>{line}</span>
            </div>
          ))}
          <div className="mt-2 rounded border border-gold/20 bg-gold/5 px-2 py-3">
            <p className="text-[9px] uppercase text-gold/70">{t(`${m}.signature`)}</p>
            <p className="mt-1 font-display text-lg italic text-gold/90">Jordan Smith</p>
          </div>
        </div>
      </div>
    </MockChrome>
  );
}
