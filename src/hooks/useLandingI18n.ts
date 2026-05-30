import { useMemo } from "react";
import { useTranslation } from "react-i18next";
import {
  Calendar,
  CreditCard,
  FileSignature,
  Inbox,
  LayoutDashboard,
  Package,
  Sparkles,
  Users,
  type LucideIcon,
} from "lucide-react";
import { BRANDING } from "@/lib/branding";

type FeatureItem = { icon: LucideIcon; title: string; description: string };
type StepItem = { step: string; title: string; body: string };
type AudienceItem = { title: string; points: string[] };
type FaqItem = { q: string; a: string };

export function useLandingI18n() {
  const { t } = useTranslation();

  const features = useMemo<FeatureItem[]>(
    () => [
      { icon: Calendar, title: t("landing.featureScheduleTitle"), description: t("landing.featureScheduleDesc") },
      { icon: Users, title: t("landing.featureCrmTitle"), description: t("landing.featureCrmDesc") },
      { icon: CreditCard, title: t("landing.featureDepositsTitle"), description: t("landing.featureDepositsDesc") },
      { icon: FileSignature, title: t("landing.featureConsentTitle"), description: t("landing.featureConsentDesc") },
      { icon: Inbox, title: t("landing.featureInboxTitle"), description: t("landing.featureInboxDesc") },
      { icon: LayoutDashboard, title: t("landing.featureBillingTitle"), description: t("landing.featureBillingDesc") },
      { icon: Package, title: t("landing.featureStockTitle"), description: t("landing.featureStockDesc") },
      { icon: Sparkles, title: t("landing.featureStencilTitle"), description: t("landing.featureStencilDesc") },
    ],
    [t],
  );

  const steps = useMemo<StepItem[]>(
    () => [
      { step: "01", title: t("landing.step1Title"), body: t("landing.step1Body") },
      { step: "02", title: t("landing.step2Title"), body: t("landing.step2Body") },
      { step: "03", title: t("landing.step3Title"), body: t("landing.step3Body") },
    ],
    [t],
  );

  const audiences = useMemo<AudienceItem[]>(
    () => [
      {
        title: t("landing.audienceOwnersTitle"),
        points: [t("landing.audienceOwners1"), t("landing.audienceOwners2"), t("landing.audienceOwners3")],
      },
      {
        title: t("landing.audienceArtistsTitle"),
        points: [t("landing.audienceArtists1"), t("landing.audienceArtists2"), t("landing.audienceArtists3")],
      },
      {
        title: t("landing.audienceClientsTitle"),
        points: [t("landing.audienceClients1"), t("landing.audienceClients2"), t("landing.audienceClients3")],
      },
    ],
    [t],
  );

  const faqs = useMemo<FaqItem[]>(
    () => [
      { q: t("landing.faq1Q"), a: t("landing.faq1A") },
      { q: t("landing.faq2Q"), a: t("landing.faq2A") },
      { q: t("landing.faq3Q"), a: t("landing.faq3A") },
      { q: t("landing.faq4Q"), a: t("landing.faq4A") },
    ],
    [t],
  );

  const previewSlots = useMemo(
    () => [
      { time: "10:00", label: t("landing.previewSlot1") },
      { time: "13:30", label: t("landing.previewSlot2") },
      { time: "16:00", label: t("landing.previewSlot3") },
    ],
    [t],
  );

  const heroSubtitle = t("landing.heroSubtitle", { platform: BRANDING.platformName });

  return { features, steps, audiences, faqs, previewSlots, heroSubtitle, t };
}
