import { useEffect, useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import MarketingLayout from "@/components/marketing/MarketingLayout";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { CheckCircle2, Loader2, Shield } from "lucide-react";
import { useAuth } from "@/hooks/useAuth";
import { useSubscription } from "@/hooks/useSubscription";
import { getPlanById, PRICING_PLANS } from "@/lib/pricingPlans";
import { invokeEdgeFunctionJson } from "@/lib/edgeFunctions";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";

const SubscribePage = () => {
  const [searchParams] = useSearchParams();
  const planId = (searchParams.get("plan") || "studio").toLowerCase();
  const canceled = searchParams.get("canceled") === "1";
  const plan = getPlanById(planId);
  const selfServePlan = plan ?? getPlanById("studio")!;

  const { user, loading: authLoading } = useAuth();
  const { data: orgSub, isLoading: subLoading } = useSubscription();
  const navigate = useNavigate();
  const { toast } = useToast();

  const [studioName, setStudioName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [authMode, setAuthMode] = useState<"signin" | "signup">("signup");
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (canceled) {
      toast({
        title: "Checkout canceled",
        description: "No charges were made. You can try again when ready.",
      });
    }
  }, [canceled, toast]);

  useEffect(() => {
    if (orgSub?.organizationName && !studioName) {
      setStudioName(orgSub.organizationName);
    }
  }, [orgSub?.organizationName, studioName]);

  const startCheckout = async (organizationId?: string) => {
    setSubmitting(true);
    try {
      const { data, error } = await invokeEdgeFunctionJson<{
        checkoutUrl?: string;
        error?: string;
        organizationId?: string;
      }>("create-platform-checkout", {
        planId: selfServePlan.id,
        studioName: organizationId ? undefined : studioName.trim(),
        organizationId,
      });

      if (error || !data.checkoutUrl) {
        throw new Error(data.error || error?.message || "Could not start checkout");
      }

      window.location.href = data.checkoutUrl;
    } catch (e) {
      toast({
        title: "Checkout failed",
        description: e instanceof Error ? e.message : "Please try again or contact support.",
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
            throw new Error("Enter your studio name (at least 2 characters).");
          }
          const { error } = await supabase.auth.signUp({
            email: email.trim(),
            password,
            options: { emailRedirectTo: `${window.location.origin}/subscribe/success?plan=${selfServePlan.id}` },
          });
          if (error) throw error;
          toast({
            title: "Check your email",
            description: "Confirm your email, then return here to complete checkout.",
          });
          setSubmitting(false);
          return;
        }
        const { error } = await supabase.auth.signInWithPassword({ email: email.trim(), password });
        if (error) throw error;
      }

      if (!orgSub?.organizationId && !studioName.trim()) {
        throw new Error("Enter your studio name.");
      }

      await startCheckout(orgSub?.organizationId);
    } catch (e) {
      toast({
        title: "Could not continue",
        description: e instanceof Error ? e.message : "Please try again.",
        variant: "destructive",
      });
      setSubmitting(false);
    }
  };

  const handleLoggedInCheckout = async () => {
    if (!orgSub?.organizationId && studioName.trim().length < 2) {
      toast({ title: "Studio name required", variant: "destructive" });
      return;
    }
    await startCheckout(orgSub?.organizationId);
  };

  if (authLoading || subLoading) {
    return (
      <MarketingLayout>
        <div className="flex min-h-[50vh] items-center justify-center">
          <Loader2 className="h-8 w-8 animate-spin text-[#d4af37]" />
        </div>
      </MarketingLayout>
    );
  }

  return (
    <MarketingLayout>
      <section className="px-4 py-12 sm:px-6 sm:py-20">
        <div className="mx-auto grid max-w-5xl gap-10 lg:grid-cols-2 lg:gap-16">
          {/* Plan summary */}
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.3em] text-[#d4af37]/80">Subscribe</p>
            <h1 className="mt-3 font-display text-3xl font-bold sm:text-4xl">
              Start with {selfServePlan.name}
            </h1>
            <p className="mt-3 text-muted-foreground">{selfServePlan.description}</p>
            <p className="mt-6 font-display text-4xl font-bold text-gradient-gold">
              {selfServePlan.price}
              <span className="text-base font-normal text-muted-foreground">{selfServePlan.period}</span>
            </p>
            <p className="mt-2 text-sm text-[#d4af37]/80">14-day free trial · Cancel anytime</p>
            <ul className="mt-8 space-y-3">
              {selfServePlan.features.slice(0, 6).map((f) => (
                <li key={f} className="flex items-start gap-2 text-sm text-muted-foreground">
                  <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-[#d4af37]" />
                  {f}
                </li>
              ))}
            </ul>
            <div className="mt-8 flex flex-wrap gap-2">
              {PRICING_PLANS.map((p) => (
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
              Secure checkout powered by Stripe. Card details never touch our servers.
            </p>
          </div>

          {/* Checkout form */}
          <div className="rounded-2xl border border-border/60 bg-card/40 p-6 sm:p-8">
            {user ? (
              <div className="space-y-6">
                <div>
                  <h2 className="font-display text-xl font-semibold">Complete your subscription</h2>
                  <p className="mt-1 text-sm text-muted-foreground">Signed in as {user.email}</p>
                </div>
                {!orgSub?.organizationId ? (
                  <div className="space-y-2">
                    <Label htmlFor="studioName">Studio name</Label>
                    <Input
                      id="studioName"
                      value={studioName}
                      onChange={(e) => setStudioName(e.target.value)}
                      placeholder="e.g. Black Rose Tattoo"
                      className="bg-background/50"
                    />
                  </div>
                ) : (
                  <p className="text-sm text-muted-foreground">
                    Organization: <span className="text-foreground">{orgSub.organizationName}</span>
                  </p>
                )}
                <Button
                  variant="gold"
                  className="w-full"
                  disabled={submitting}
                  onClick={handleLoggedInCheckout}
                >
                  {submitting ? (
                    <>
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      Redirecting to Stripe…
                    </>
                  ) : (
                    "Continue to secure checkout"
                  )}
                </Button>
                <Button variant="ghost" size="sm" className="w-full" onClick={() => navigate("/pricing")}>
                  Compare all plans
                </Button>
              </div>
            ) : (
              <form onSubmit={handleAuthAndCheckout} className="space-y-5">
                <div>
                  <h2 className="font-display text-xl font-semibold">Create your account</h2>
                  <p className="mt-1 text-sm text-muted-foreground">
                    Sign up, then complete payment on Stripe. Already have an account?{" "}
                    <button
                      type="button"
                      className="text-[#d4af37] hover:underline"
                      onClick={() => setAuthMode(authMode === "signup" ? "signin" : "signup")}
                    >
                      {authMode === "signup" ? "Sign in" : "Sign up"}
                    </button>
                  </p>
                </div>
                {authMode === "signup" ? (
                  <div className="space-y-2">
                    <Label htmlFor="studioName">Studio name</Label>
                    <Input
                      id="studioName"
                      value={studioName}
                      onChange={(e) => setStudioName(e.target.value)}
                      placeholder="e.g. Black Rose Tattoo"
                      required
                      className="bg-background/50"
                    />
                  </div>
                ) : null}
                <div className="space-y-2">
                  <Label htmlFor="email">Email</Label>
                  <Input
                    id="email"
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    required
                    autoComplete="email"
                    className="bg-background/50"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="password">Password</Label>
                  <Input
                    id="password"
                    type="password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    required
                    minLength={8}
                    autoComplete={authMode === "signup" ? "new-password" : "current-password"}
                    className="bg-background/50"
                  />
                </div>
                <Button variant="gold" type="submit" className="w-full" disabled={submitting}>
                  {submitting ? (
                    <>
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      Please wait…
                    </>
                  ) : authMode === "signup" ? (
                    "Create account & continue"
                  ) : (
                    "Sign in & continue"
                  )}
                </Button>
                <p className="text-center text-xs text-muted-foreground">
                  By subscribing you agree to our{" "}
                  <Link to="/terms" className="text-[#d4af37] hover:underline">
                    Terms
                  </Link>{" "}
                  and{" "}
                  <Link to="/privacy" className="text-[#d4af37] hover:underline">
                    Privacy Policy
                  </Link>
                  .
                </p>
              </form>
            )}
          </div>
        </div>
      </section>
    </MarketingLayout>
  );
};

export default SubscribePage;
