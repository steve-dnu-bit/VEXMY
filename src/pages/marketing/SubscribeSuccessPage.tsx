import { useEffect, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import MarketingLayout from "@/components/marketing/MarketingLayout";
import { Button } from "@/components/ui/button";
import { CheckCircle2, Loader2 } from "lucide-react";
import { useAuth } from "@/hooks/useAuth";
import { useSubscription } from "@/hooks/useSubscription";

const SubscribeSuccessPage = () => {
  const [searchParams] = useSearchParams();
  const sessionId = searchParams.get("session_id");
  const { user, loading: authLoading } = useAuth();
  const { data, isLoading, refetch, isActive } = useSubscription();
  const [pollCount, setPollCount] = useState(0);

  useEffect(() => {
    if (!sessionId || isActive) return;
    if (pollCount >= 8) return;

    const timer = window.setTimeout(() => {
      refetch();
      setPollCount((c) => c + 1);
    }, 2000);

    return () => window.clearTimeout(timer);
  }, [sessionId, isActive, pollCount, refetch]);

  const waitingForWebhook = !!sessionId && !isActive && pollCount < 8;

  return (
    <MarketingLayout>
      <section className="mx-auto max-w-lg px-4 py-20 text-center">
        {authLoading || (isLoading && !data) ? (
          <Loader2 className="mx-auto h-10 w-10 animate-spin text-[#d4af37]" />
        ) : waitingForWebhook ? (
          <>
            <Loader2 className="mx-auto h-10 w-10 animate-spin text-[#d4af37]" />
            <h1 className="mt-6 font-display text-2xl font-bold">Confirming your subscription…</h1>
            <p className="mt-3 text-sm text-muted-foreground">This usually takes a few seconds.</p>
          </>
        ) : (
          <>
            <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-[#d4af37]/15">
              <CheckCircle2 className="h-8 w-8 text-[#d4af37]" />
            </div>
            <h1 className="mt-6 font-display text-3xl font-bold">You&apos;re all set!</h1>
            <p className="mt-3 text-muted-foreground">
              {data?.plan?.name ? (
                <>
                  Your <strong>{data.plan.name}</strong> plan is active
                  {data.subscription?.status === "trialing" ? " with a free trial" : ""}.
                </>
              ) : (
                "Your subscription is being activated."
              )}
            </p>
            {data?.organizationName ? (
              <p className="mt-2 text-sm text-muted-foreground">Studio: {data.organizationName}</p>
            ) : null}
            <div className="mt-8 flex flex-col gap-3 sm:flex-row sm:justify-center">
              {user ? (
                <Button variant="gold" asChild>
                  <Link to="/schedule">Go to your schedule</Link>
                </Button>
              ) : (
                <Button variant="gold" asChild>
                  <Link to="/auth">Sign in to your studio</Link>
                </Button>
              )}
              <Button variant="gold-outline" asChild>
                <Link to="/settings">Subscription settings</Link>
              </Button>
            </div>
          </>
        )}
      </section>
    </MarketingLayout>
  );
};

export default SubscribeSuccessPage;
