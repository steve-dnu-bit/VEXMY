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
import { GOOGLE_SIGN_IN_ENABLED } from "@/lib/authConfig";

function getAuthSiteOrigin(): string {
  const fromEnv =
    import.meta.env.VITE_SITE_URL?.trim() || import.meta.env.VITE_SHOP_WEBSITE_URL?.trim();
  if (fromEnv) return fromEnv.replace(/\/$/, "");
  return window.location.origin;
}

function getSubscribeOAuthRedirectUrl(plan: string): string {
  return `${getAuthSiteOrigin()}/subscribe?plan=${encodeURIComponent(plan)}`;
}

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
  const [googleLoading, setGoogleLoading] = useState(false);
  const [termsAccepted, setTermsAccepted] = useState(false);

  const configError = getSupabaseConfigError();

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

  const handleGoogleSignIn = async () => {
    if (configError) return;
    if (!termsAccepted) {
      toast({ title: t("subscribe.termsRequired"), variant: "destructive" });
      return;
    }
    setGoogleLoading(true);
    try {
      const { error } = await supabase.auth.signInWithOAuth({
        provider: "google",
        options: { redirectTo: getSubscribeOAuthRedirectUrl(selfServePlan.id) },
      });
      if (error) throw error;
    } catch (e) {
      toast({
        title: t("common.error"),
        description: e instanceof Error ? e.message : t("auth.googleSignInFailed"),
        variant: "destructive",
      });
      setGoogleLoading(false);
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
          const { error } = await supabase.auth.signUp({
            email: email.trim(),
            password,
            options: { emailRedirectTo: `${window.location.origin}/subscribe/success?plan=${selfServePlan.id}` },
          });
          if (error) throw error;
          toast({
            title: t("auth.checkEmail"),
            description: t("auth.confirmEmailSent"),
          });
          setSubmitting(false);
          return;
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
            <p className="mt-2 text-sm text-gold/80">{t("subscribe.trialNote")}</p>
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
                  disabled={submitting || googleLoading}
                />
                {GOOGLE_SIGN_IN_ENABLED ? (
                  <>
                    <Button
                      type="button"
                      variant="outline"
                      className="h-11 w-full border-border/80 bg-secondary/40 text-sm"
                      disabled={submitting || googleLoading || !!configError || !termsAccepted}
                      onClick={handleGoogleSignIn}
                    >
                      {googleLoading ? (
                        <>
                          <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                          {t("auth.continuingWithGoogle")}
                        </>
                      ) : (
                        <>
                          <svg className="mr-2 h-4 w-4" viewBox="0 0 24 24" aria-hidden>
                            <path
                              fill="currentColor"
                              d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
                            />
                            <path
                              fill="currentColor"
                              d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
                            />
                            <path
                              fill="currentColor"
                              d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"
                            />
                            <path
                              fill="currentColor"
                              d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"
                            />
                          </svg>
                          {t("auth.continueWithGoogle")}
                        </>
                      )}
                    </Button>
                    <div className="relative">
                      <div className="absolute inset-0 flex items-center">
                        <span className="w-full border-t border-border/60" />
                      </div>
                      <div className="relative flex justify-center text-xs uppercase">
                        <span className="bg-card/55 px-2 text-muted-foreground">{t("auth.or")}</span>
                      </div>
                    </div>
                  </>
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
