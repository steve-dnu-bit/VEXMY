import { useEffect, useRef, useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { Browser } from "@capacitor/browser";
import { CheckCircle2, Loader2, Shield, UserRound } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import VelbokBrand from "@/components/brand/VelbokBrand";
import SubscribeTermsAcceptance, {
  PLATFORM_PRIVACY_VERSION,
  PLATFORM_TERMS_VERSION,
} from "@/components/marketing/SubscribeTermsAcceptance";
import { isSubscriptionActive, useSubscription } from "@/hooks/useSubscription";
import { usePricingPlansI18n } from "@/hooks/usePricingPlansI18n";
import { invokeEdgeFunctionJson } from "@/lib/edgeFunctions";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";
import { isNativeApp } from "@/lib/platform";

const FEATURES_SHOWN = 5;

/** Simplified in-app pricing + subscribe page (native shell and small screens). */
const MobileSubscribePage = () => {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { toast } = useToast();
  const [searchParams] = useSearchParams();
  const pricingPlans = usePricingPlansI18n();
  const { data: orgSub, isActive, canManageBilling, refetch } = useSubscription();

  const initialPlan = (searchParams.get("plan") || "studio").toLowerCase();
  const [selectedId, setSelectedId] = useState(
    pricingPlans.some((p) => p.id === initialPlan) ? initialPlan : "studio",
  );
  const [studioName, setStudioName] = useState("");
  const [termsAccepted, setTermsAccepted] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [waitingForPayment, setWaitingForPayment] = useState(false);
  const pollingRef = useRef(false);

  const selectedPlan = pricingPlans.find((p) => p.id === selectedId) ?? pricingPlans[0];

  useEffect(() => {
    if (isActive) navigate("/schedule", { replace: true });
  }, [isActive, navigate]);

  useEffect(() => {
    if (orgSub?.organizationName && !studioName) setStudioName(orgSub.organizationName);
  }, [orgSub?.organizationName, studioName]);

  // After Stripe checkout closes in the in-app browser, poll until the webhook activates the sub.
  useEffect(() => {
    if (!isNativeApp()) return;
    const listener = Browser.addListener("browserFinished", () => {
      if (pollingRef.current) return;
      pollingRef.current = true;
      setWaitingForPayment(true);
      let attempts = 0;
      const poll = async () => {
        attempts += 1;
        const { data } = await refetch();
        if (isSubscriptionActive(data?.subscription?.status)) {
          pollingRef.current = false;
          navigate("/", { replace: true });
          return;
        }
        if (attempts < 10) {
          window.setTimeout(() => void poll(), 3_000);
        } else {
          pollingRef.current = false;
          setWaitingForPayment(false);
        }
      };
      void poll();
    });
    return () => {
      void listener.then((h) => h.remove());
    };
  }, [refetch, navigate]);

  const startCheckout = async () => {
    if (!termsAccepted) {
      toast({ title: t("subscribe.termsRequired"), variant: "destructive" });
      return;
    }
    const organizationId =
      canManageBilling && orgSub?.organizationId ? orgSub.organizationId : undefined;
    if (!organizationId && studioName.trim().length < 2) {
      toast({ title: t("common.studioName"), variant: "destructive" });
      return;
    }
    setSubmitting(true);
    try {
      const { data, error } = await invokeEdgeFunctionJson<{
        checkoutUrl?: string;
        error?: string;
      }>("create-platform-checkout", {
        planId: selectedPlan.id,
        studioName: organizationId ? undefined : studioName.trim(),
        organizationId,
        acceptedTerms: true,
        termsVersion: PLATFORM_TERMS_VERSION,
        privacyVersion: PLATFORM_PRIVACY_VERSION,
      });
      if (error) throw new Error(error.message || data?.error || t("subscribe.checkoutFailed"));
      if (!data.checkoutUrl) throw new Error(data.error || t("subscribe.checkoutFailed"));

      if (isNativeApp()) {
        await Browser.open({ url: data.checkoutUrl });
      } else {
        window.location.href = data.checkoutUrl;
        return;
      }
    } catch (e) {
      toast({
        title: t("subscribe.checkoutFailed"),
        description: e instanceof Error ? e.message : t("common.error"),
        variant: "destructive",
      });
    } finally {
      setSubmitting(false);
    }
  };

  const handleSignOut = async () => {
    await supabase.auth.signOut();
    navigate("/auth", { replace: true });
  };

  return (
    <div className="min-h-screen bg-background px-4 pb-10 pt-[calc(env(safe-area-inset-top)+1.5rem)]">
      <div className="mx-auto max-w-md space-y-6">
        <div className="text-center">
          <VelbokBrand className="mx-auto" />
          <h1 className="mt-4 font-display text-2xl font-bold">
            {t("subscribe.mobileTitle", { defaultValue: "Choose your plan" })}
          </h1>
          <p className="mt-2 text-sm text-muted-foreground">
            {t("subscribe.mobileSubtitle", {
              defaultValue:
                "Every plan includes scheduling, client CRM, consent forms, deposits and the customer portal. Solo, Starter and Studio start with a 14-day free trial.",
            })}
          </p>
        </div>

        <div className="space-y-3">
          {pricingPlans.map((plan) => {
            const selected = plan.id === selectedPlan.id;
            return (
              <button
                key={plan.id}
                type="button"
                onClick={() => setSelectedId(plan.id)}
                className={`w-full rounded-xl border p-4 text-left transition-colors ${
                  selected
                    ? "border-gold bg-gold/10"
                    : "border-border/70 bg-card/55 hover:border-gold/50"
                }`}
              >
                <div className="flex items-baseline justify-between gap-2">
                  <span className="font-display text-lg font-semibold">{plan.name}</span>
                  <span className="font-display text-lg font-bold text-gold">
                    {plan.price}
                    <span className="text-xs font-normal text-muted-foreground"> {plan.period}</span>
                  </span>
                </div>
                <p className="mt-0.5 text-xs text-muted-foreground">{plan.seats}</p>
                {selected ? (
                  <ul className="mt-3 space-y-1.5">
                    {plan.features.slice(0, FEATURES_SHOWN).map((f) => (
                      <li key={f} className="flex items-start gap-2 text-xs text-muted-foreground">
                        <CheckCircle2 className="mt-0.5 h-3.5 w-3.5 shrink-0 text-gold" />
                        {f}
                      </li>
                    ))}
                  </ul>
                ) : null}
              </button>
            );
          })}
        </div>

        {!orgSub?.organizationId ? (
          <div className="space-y-2">
            <Label htmlFor="mobile-studio-name">{t("common.studioName")}</Label>
            <Input
              id="mobile-studio-name"
              value={studioName}
              onChange={(e) => setStudioName(e.target.value)}
              className="bg-secondary/80"
            />
          </div>
        ) : (
          <p className="text-sm text-muted-foreground">
            {t("subscribe.organization")}:{" "}
            <span className="text-foreground">{orgSub.organizationName}</span>
          </p>
        )}

        <SubscribeTermsAcceptance
          id="mobile-subscribe-terms"
          checked={termsAccepted}
          onCheckedChange={setTermsAccepted}
          disabled={submitting}
        />

        <Button
          variant="gold"
          className="w-full"
          disabled={submitting || waitingForPayment || !termsAccepted}
          onClick={() => void startCheckout()}
        >
          {submitting || waitingForPayment ? (
            <>
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              {waitingForPayment
                ? t("subscribe.waitingForPayment", { defaultValue: "Confirming your subscription…" })
                : t("subscribe.redirectingStripe")}
            </>
          ) : (
            t("subscribe.startWith", { plan: selectedPlan.name })
          )}
        </Button>
        <p className="flex items-center justify-center gap-2 text-xs text-muted-foreground">
          <Shield className="h-3.5 w-3.5" />
          {t("subscribe.secureCheckout")}
        </p>

        <Card className="border-border/60 bg-card/40">
          <CardContent className="flex items-start gap-3 p-4">
            <UserRound className="mt-0.5 h-4 w-4 shrink-0 text-gold" />
            <p className="text-xs leading-relaxed text-muted-foreground">
              {t("subscribe.clientInviteNotice", {
                defaultValue:
                  "Are you a client of a tattoo studio? You don't need a subscription — ask your artist or the shop admin to invite you. Invites unlock the customer portal with your bookings, consent forms and deposits.",
              })}
            </p>
          </CardContent>
        </Card>

        <div className="flex items-center justify-center gap-4 text-xs">
          <Link to="/account" className="text-muted-foreground hover:text-foreground">
            {t("subscribe.backToAccount", { defaultValue: "Back to account" })}
          </Link>
          <button
            type="button"
            className="text-muted-foreground hover:text-foreground"
            onClick={() => void handleSignOut()}
          >
            {t("common.signOut")}
          </button>
        </div>
      </div>
    </div>
  );
};

export default MobileSubscribePage;
