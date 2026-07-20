import { useEffect, useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { useTranslation } from "react-i18next";
import MarketingLayout from "@/components/marketing/MarketingLayout";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { CheckCircle2, Loader2, Shield } from "lucide-react";
import { useAuth } from "@/hooks/useAuth";
import { isSubscriptionActive, useSubscription } from "@/hooks/useSubscription";
import { usePricingPlansI18n } from "@/hooks/usePricingPlansI18n";
import { invokeEdgeFunctionJson } from "@/lib/edgeFunctions";
import { useToast } from "@/hooks/use-toast";
import { getSupabaseConfigError, supabase } from "@/integrations/supabase/client";
import SubscribeTermsAcceptance, {
  PLATFORM_PRIVACY_VERSION,
  PLATFORM_TERMS_VERSION,
} from "@/components/marketing/SubscribeTermsAcceptance";
import OAuthSocialButtons from "@/components/auth/OAuthSocialButtons";
import { GOOGLE_SIGN_IN_ENABLED, APPLE_SIGN_IN_ENABLED } from "@/lib/authConfig";
import { authIntentFromSearchParams, stashAuthIntent } from "@/lib/authIntent";
import { completeStashedAuthProvisioning } from "@/lib/authProvisioning";

const SubscribePage = () => {
  const { t } = useTranslation();
  const pricingPlans = usePricingPlansI18n();
  const [searchParams] = useSearchParams();
  const planId = (searchParams.get("plan") || "studio").toLowerCase();
  const canceled = searchParams.get("canceled") === "1";
  const selfServePlan = pricingPlans.find((p) => p.id === planId) ?? pricingPlans.find((p) => p.id === "studio")!;

  const { user, loading: authLoading } = useAuth();
  const { data: orgSub, isLoading: subLoading, canManageBilling } = useSubscription();
  const navigate = useNavigate();
  const { toast } = useToast();

  const [studioName, setStudioName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [authMode, setAuthMode] = useState<"signin" | "signup">("signup");
  const [submitting, setSubmitting] = useState(false);
  const [termsAccepted, setTermsAccepted] = useState(false);

  const showOAuth = GOOGLE_SIGN_IN_ENABLED || APPLE_SIGN_IN_ENABLED;
  const subscribeOAuthIntent = {
    type: "studio_subscribe" as const,
    planId,
  };

  const configError = getSupabaseConfigError();

  useEffect(() => {
    const fromUrl = authIntentFromSearchParams(searchParams);
    if (fromUrl) stashAuthIntent(fromUrl);
  }, [searchParams]);

  useEffect(() => {
    if (!user) return;
    void completeStashedAuthProvisioning();
  }, [user]);

  useEffect(() => {
    if (canceled) {
      toast({
        title: t("subscribe.checkoutCanceled"),
        description: t("subscribe.checkoutCanceledDesc"),
      });
    }
  }, [canceled, toast, t]);

  useEffect(() => {
    if (orgSub?.organizationName && !studioName) {
      setStudioName(orgSub.organizationName);
    }
  }, [orgSub?.organizationName, studioName]);

  useEffect(() => {
    if (!user || studioName.trim()) return;
    const meta = user.user_metadata as Record<string, unknown> | undefined;
    const fromGoogle =
      (typeof meta?.full_name === "string" && meta.full_name) ||
      (typeof meta?.name === "string" && meta.name) ||
      (typeof meta?.display_name === "string" && meta.display_name);
    if (fromGoogle?.trim()) setStudioName(fromGoogle.trim());
  }, [user, studioName]);

  useEffect(() => {
    if (authLoading || subLoading || !user || !orgSub?.subscription) return;
    if (isSubscriptionActive(orgSub.subscription.status)) {
      navigate("/schedule", { replace: true });
    }
  }, [authLoading, subLoading, user, orgSub?.subscription, navigate]);

  const startCheckout = async () => {
    if (!termsAccepted) {
      toast({ title: t("subscribe.termsRequired"), variant: "destructive" });
      return;
    }
    setSubmitting(true);
    try {
      const organizationId =
        canManageBilling && orgSub?.organizationId ? orgSub.organizationId : undefined;
      const { data, error } = await invokeEdgeFunctionJson<{
        checkoutUrl?: string;
        error?: string;
        organizationId?: string;
      }>("create-platform-checkout", {
        planId: selfServePlan.id,
        studioName: organizationId ? undefined : studioName.trim(),
        organizationId,
        acceptedTerms: true,
        termsVersion: PLATFORM_TERMS_VERSION,
        privacyVersion: PLATFORM_PRIVACY_VERSION,
      });

      if (error) {
        throw new Error(error.message || data.error || t("subscribe.checkoutFailed"));
      }
      if (!data.checkoutUrl) {
        throw new Error(data.error || t("subscribe.checkoutFailed"));
      }

      window.location.href = data.checkoutUrl;
    } catch (e) {
      toast({
        title: t("subscribe.checkoutFailed"),
        description: e instanceof Error ? e.message : t("common.error"),
        variant: "destructive",
      });
      setSubmitting(false);
    }
  };


  const handleAuthAndCheckout = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);

    try {
      if (!user) {
        if (authMode === "signup") {
          if (!studioName.trim() || studioName.trim().length < 2) {
            throw new Error(t("common.studioName"));
          }
          const { data, error } = await supabase.auth.signUp({
            email: email.trim(),
            password,
            options: { emailRedirectTo: `${window.location.origin}/subscribe/success?plan=${selfServePlan.id}` },
          });
          if (error) throw error;
          if (data.session) {
            // Autoconfirm path — continue into checkout below.
          } else {
            toast({
              title: t("auth.checkEmail"),
              description: t("auth.confirmEmailSent"),
            });
            setSubmitting(false);
            return;
          }
        }
        const { error } = await supabase.auth.signInWithPassword({ email: email.trim(), password });
        if (error) throw error;
      }

      if (!orgSub?.organizationId && !studioName.trim()) {
        throw new Error(t("common.studioName"));
      }

      await startCheckout();
    } catch (e) {
      toast({
        title: t("common.error"),
        description: e instanceof Error ? e.message : t("common.error"),
        variant: "destructive",
      });
      setSubmitting(false);
    }
  };

  const handleLoggedInCheckout = async () => {
    if (!orgSub?.organizationId && studioName.trim().length < 2) {
      toast({ title: t("common.studioName"), variant: "destructive" });
      return;
    }
    await startCheckout();
  };

  const handleSignOut = async () => {
    await supabase.auth.signOut();
    setStudioName("");
    navigate("/subscribe?plan=" + selfServePlan.id, { replace: true });
  };

  if (authLoading || subLoading) {
    return (
      <MarketingLayout>
        <div className="flex min-h-[50vh] items-center justify-center">
          <Loader2 className="h-8 w-8 animate-spin text-gold" />
        </div>
      </MarketingLayout>
    );
  }

  return (
    <MarketingLayout>
      <section className="px-4 py-12 sm:px-6 sm:py-20">
        <div className="mx-auto grid max-w-5xl gap-10 lg:grid-cols-2 lg:gap-16">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.3em] text-gold/80">{t("subscribe.label")}</p>
            <h1 className="mt-3 font-display text-3xl font-bold sm:text-4xl">
              {t("subscribe.startWith", { plan: selfServePlan.name })}
            </h1>
            <p className="mt-3 text-muted-foreground">{selfServePlan.description}</p>
            <p className="mt-6 font-display text-4xl font-bold text-gold">
              {selfServePlan.price}
              <span className="text-base font-normal text-muted-foreground">{selfServePlan.period}</span>
            </p>
            <p className="mt-2 text-sm text-gold/80">
              {selfServePlan.id === "enterprise"
                ? t("subscribe.trialNoteImmediate")
                : t("subscribe.trialNote")}
            </p>
            <ul className="mt-8 space-y-3">
              {selfServePlan.features.slice(0, 6).map((f) => (
                <li key={f} className="flex items-start gap-2 text-sm text-muted-foreground">
                  <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-gold" />
                  {f}
                </li>
              ))}
            </ul>
            <div className="mt-8 flex flex-wrap gap-2">
              {pricingPlans.map((p) => (
                <Button
                  key={p.id}
                  variant={p.id === selfServePlan.id ? "gold" : "gold-outline"}
                  size="sm"
                  asChild
                >
                  <Link to={`/subscribe?plan=${p.id}`}>{p.name}</Link>
                </Button>
              ))}
            </div>
            <p className="mt-6 flex items-center gap-2 text-xs text-muted-foreground">
              <Shield className="h-3.5 w-3.5" />
              {t("subscribe.secureCheckout")}
            </p>
          </div>

          <div className="rounded-2xl border border-border/70 bg-card/55 p-6 sm:p-8">
            {user ? (
              <div className="space-y-6">
                <div>
                  <h2 className="font-display text-xl font-semibold">{t("subscribe.completeSubscription")}</h2>
                  <p className="mt-1 text-sm text-muted-foreground">{t("subscribe.signedInAs", { email: user.email })}</p>
                </div>
                {!orgSub?.organizationId ? (
                  <div className="space-y-2">
                    <Label htmlFor="studioName">{t("common.studioName")}</Label>
                    <Input
                      id="studioName"
                      value={studioName}
                      onChange={(e) => setStudioName(e.target.value)}
                      className="bg-secondary/80"
                    />
                  </div>
                ) : (
                  <p className="text-sm text-muted-foreground">
                    {t("subscribe.organization")}: <span className="text-foreground">{orgSub.organizationName}</span>
                  </p>
                )}
                <SubscribeTermsAcceptance
                  id="subscribe-terms-logged-in"
                  checked={termsAccepted}
                  onCheckedChange={setTermsAccepted}
                  disabled={submitting}
                />
                <Button
                  variant="gold"
                  className="w-full"
                  disabled={submitting || !termsAccepted}
                  onClick={handleLoggedInCheckout}
                >
                  {submitting ? (
                    <>
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      {t("subscribe.redirectingStripe")}
                    </>
                  ) : (
                    t("subscribe.continueCheckout")
                  )}
                </Button>
                <Button variant="ghost" size="sm" className="w-full" onClick={() => void handleSignOut()}>
                  {t("common.signOut")}
                </Button>
                <Button variant="ghost" size="sm" className="w-full" onClick={() => navigate("/pricing")}>
                  {t("common.comparePlans")}
                </Button>
              </div>
            ) : (
              <div className="space-y-5">
                <div>
                  <h2 className="font-display text-xl font-semibold">{t("subscribe.createAccountTitle")}</h2>
                  <p className="mt-1 text-sm text-muted-foreground">
                    {authMode === "signup" ? t("auth.signupSubtitle") : t("auth.loginSubtitle")}{" "}
                    <button
                      type="button"
                      className="text-gold hover:underline"
                      onClick={() => setAuthMode(authMode === "signup" ? "signin" : "signup")}
                    >
                      {authMode === "signup" ? t("common.signIn") : t("auth.signUp")}
                    </button>
                  </p>
                </div>
                <SubscribeTermsAcceptance
                  id="subscribe-terms-guest"
                  checked={termsAccepted}
                  onCheckedChange={setTermsAccepted}
                  disabled={submitting}
                />
                {showOAuth ? (
                  <OAuthSocialButtons
                    intent={subscribeOAuthIntent}
                    disabled={submitting || !!configError || !termsAccepted}
                  />
                ) : null}
                <form onSubmit={handleAuthAndCheckout} className="space-y-5">
                {authMode === "signup" ? (
                  <div className="space-y-2">
                    <Label htmlFor="studioName">{t("common.studioName")}</Label>
                    <Input
                      id="studioName"
                      value={studioName}
                      onChange={(e) => setStudioName(e.target.value)}
                      required
                      className="bg-secondary/80"
                    />
                  </div>
                ) : null}
                <div className="space-y-2">
                  <Label htmlFor="email">{t("common.email")}</Label>
                  <Input
                    id="email"
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    required
                    autoComplete="email"
                    className="bg-secondary/80"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="password">{t("common.password")}</Label>
                  <Input
                    id="password"
                    type="password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    required
                    minLength={8}
                    autoComplete={authMode === "signup" ? "new-password" : "current-password"}
                    className="bg-secondary/80"
                  />
                </div>
                <Button variant="gold" type="submit" className="w-full" disabled={submitting || !termsAccepted}>
                  {submitting ? (
                    <>
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      {t("common.pleaseWait")}
                    </>
                  ) : authMode === "signup" ? (
                    t("subscribe.createAndContinue")
                  ) : (
                    t("subscribe.signInContinue")
                  )}
                </Button>
              </form>
              </div>
            )}
          </div>
        </div>
      </section>
    </MarketingLayout>
  );
};

export default SubscribePage;
