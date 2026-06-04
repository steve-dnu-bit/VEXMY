import { useEffect, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { supabase, getSupabaseConfigError } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";
import MFAVerify from "@/components/auth/MFAVerify";
import { resolvePostLoginPath } from "@/hooks/useUserRoles";
import { Mail } from "lucide-react";
import PasswordField from "@/components/auth/PasswordField";
import { BRANDING } from "@/lib/branding";
import { useAuth } from "@/hooks/useAuth";

function navigateAfterLogin(path: string) {
  if (typeof window !== "undefined" && window.self !== window.top) {
    window.top!.location.assign(`${window.location.origin}${path}`);
    return;
  }
  window.location.assign(path);
}

const CustomerEmbedLoginPage = () => {
  const { t } = useTranslation();
  const { user, loading: authLoading } = useAuth();
  const [searchParams] = useSearchParams();
  const shopDisplay = searchParams.get("shop")?.trim() || BRANDING.shopName;

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [mfaFactorId, setMfaFactorId] = useState<string | null>(null);
  const { toast } = useToast();
  const configError = getSupabaseConfigError();

  useEffect(() => {
    if (authLoading || !user) return;
    void (async () => {
      const path = await resolvePostLoginPath(user.id, "/account");
      navigateAfterLogin(path);
    })();
  }, [authLoading, user]);

  const authErrorMessage = (error: { message?: string }) => {
    const msg = error.message || t("common.error");
    if (/invalid login credentials/i.test(msg)) return t("auth.invalidCredentialsHint");
    if (/email not confirmed/i.test(msg)) return t("auth.emailNotConfirmed");
    return msg;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    try {
      const { data, error } = await supabase.auth.signInWithPassword({ email, password });
      if (error) throw error;

      const { data: factorsData } = await supabase.auth.mfa.listFactors();
      const verifiedFactors = factorsData?.totp?.filter((f: { status: string }) => f.status === "verified") || [];

      if (verifiedFactors.length > 0) {
        setMfaFactorId(verifiedFactors[0].id);
        setLoading(false);
        return;
      }

      if (data.user) {
        const path = await resolvePostLoginPath(data.user.id, "/account");
        navigateAfterLogin(path);
      } else {
        navigateAfterLogin("/account");
      }
    } catch (error: unknown) {
      const err = error as { message?: string };
      toast({
        title: t("common.error"),
        description: authErrorMessage(err),
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  const handleMFAVerified = async () => {
    const {
      data: { user: u },
    } = await supabase.auth.getUser();
    const path = u ? await resolvePostLoginPath(u.id, "/account") : "/account";
    navigateAfterLogin(path);
  };

  const handleMFACancel = async () => {
    await supabase.auth.signOut();
    setMfaFactorId(null);
  };

  return (
    <div className="min-h-[440px] bg-[#101216] px-4 py-5 text-zinc-100">
      <div className="mx-auto max-w-[300px]">
        <h1 className="text-center font-display text-lg font-semibold tracking-wide text-gold">{shopDisplay}</h1>
        <p className="mt-1 text-center text-[10px] uppercase tracking-[0.2em] text-gold/80">
          {t("embed.customerPortalSubtitle")}
        </p>

        {configError ? (
          <p className="mt-4 rounded-lg border border-destructive/50 bg-destructive/10 px-3 py-2 text-xs text-destructive">
            {configError}
          </p>
        ) : null}

        <div className="mt-4 rounded-xl border border-gold/30 bg-[#090a0f]/90 p-4">
          {mfaFactorId ? (
            <MFAVerify factorId={mfaFactorId} onVerified={handleMFAVerified} onCancel={handleMFACancel} />
          ) : (
            <form onSubmit={handleSubmit} className="space-y-3">
              <div>
                <Label className="text-[10px] uppercase tracking-widest text-gold">{t("common.email")}</Label>
                <div className="relative mt-1.5">
                  <Mail className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gold/85" />
                  <Input
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder={t("auth.enterEmail")}
                    className="h-10 border-gold/20 bg-black/30 pl-10 text-sm text-zinc-100 placeholder:text-zinc-500"
                    required
                    autoComplete="email"
                  />
                </div>
              </div>
              <div>
                <Label className="text-[10px] uppercase tracking-widest text-gold">{t("common.password")}</Label>
                <PasswordField
                  value={password}
                  onChange={setPassword}
                  placeholder={t("auth.enterPassword")}
                  className="mt-1.5"
                  inputClassName="h-10 border-gold/20 bg-black/30 text-sm text-zinc-100 placeholder:text-zinc-500"
                  required
                  minLength={6}
                  autoComplete="current-password"
                />
              </div>
              <Button type="submit" variant="gold" className="h-10 w-full text-sm" disabled={loading}>
                {loading ? t("common.loading") : t("common.signIn")}
              </Button>
            </form>
          )}
        </div>

        <p className="mt-4 text-center text-[10px] text-zinc-500">
          {t("embed.poweredBy", { platform: BRANDING.platformName })}
        </p>
      </div>
    </div>
  );
};

export default CustomerEmbedLoginPage;
