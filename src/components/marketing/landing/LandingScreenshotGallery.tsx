import { useTranslation } from "react-i18next";
import { Calendar, CreditCard, FileSignature, Sparkles } from "lucide-react";
import { cn } from "@/lib/utils";
import { ConsentMock, DepositsMock, ScheduleMock, StencilMock } from "./LandingAppMocks";
import LandingScreenshotFrame from "./LandingScreenshotFrame";
import { LANDING_MEDIA } from "./landingMedia";

const ITEMS = [
  { id: "schedule", icon: Calendar, useScreenshot: true as const },
  { id: "deposits", icon: CreditCard, Mock: DepositsMock },
  { id: "stencil", icon: Sparkles, useScreenshot: true as const },
  { id: "consent", icon: FileSignature, Mock: ConsentMock },
] as const;

const LandingScreenshotGallery = () => {
  const { t } = useTranslation();

  const copy: Record<(typeof ITEMS)[number]["id"], { title: string; body: string }> = {
    schedule: { title: t("landing.screenScheduleTitle"), body: t("landing.screenScheduleBody") },
    deposits: { title: t("landing.screenDepositsTitle"), body: t("landing.screenDepositsBody") },
    stencil: { title: t("landing.screenStencilTitle"), body: t("landing.screenStencilBody") },
    consent: { title: t("landing.screenConsentTitle"), body: t("landing.screenConsentBody") },
  };

  return (
    <section id="screenshots" className="px-4 py-20 sm:px-6">
      <div className="mx-auto max-w-6xl">
        <div className="mx-auto max-w-2xl text-center">
          <h2 className="font-display text-3xl font-bold sm:text-4xl">{t("landing.screensTitle")}</h2>
          <p className="mt-4 text-muted-foreground">{t("landing.screensSubtitle")}</p>
        </div>

        <div className="mt-14 grid gap-10 lg:grid-cols-2">
          {ITEMS.map((item, i) => {
            const { id, icon: Icon } = item;
            const flip = i % 2 === 1;

            return (
              <article key={id} className="group grid gap-5 sm:grid-cols-[1fr_1.1fr] sm:items-center">
                <div className={flip ? "sm:order-2" : undefined}>
                  <div className="mb-3 inline-flex rounded-lg bg-gold/10 p-2 text-gold">
                    <Icon className="h-5 w-5" />
                  </div>
                  <h3 className="font-display text-xl font-semibold">{copy[id].title}</h3>
                  <p className="mt-2 text-sm leading-relaxed text-muted-foreground">{copy[id].body}</p>
                </div>
                <div
                  className={cn(
                    "transition-transform duration-500 group-hover:scale-[1.02]",
                    flip ? "sm:order-1" : undefined,
                  )}
                >
                  {"useScreenshot" in item && item.useScreenshot ? (
                    <LandingScreenshotFrame
                      src={LANDING_MEDIA[id as "schedule" | "stencil"].poster}
                      alt={t(LANDING_MEDIA[id as "schedule" | "stencil"].altKey)}
                      title={LANDING_MEDIA[id as "schedule" | "stencil"].title}
                    />
                  ) : (
                    <item.Mock />
                  )}
                </div>
              </article>
            );
          })}
        </div>
      </div>
    </section>
  );
};

export default LandingScreenshotGallery;
