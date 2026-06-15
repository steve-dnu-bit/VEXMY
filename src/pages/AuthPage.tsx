import { useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { getSupabaseConfigError, supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";
import MFAVerify from "@/components/auth/MFAVerify";
import { resolvePostLoginPath } from "@/hooks/useUserRoles";
import { Mail } from "lucide-react";
import PasswordField from "@/components/auth/PasswordField";
import { BRANDING } from "@/lib/branding";
import LanguageSelector from "@/components/i18n/LanguageSelector";
import VelbokBrand from "@/components/brand/VelbokBrand";

/** Password-reset links must match Supabase Auth → URL Configuration allow list. */
function getAuthSiteOrigin(): string {
  const fromEnv =
    import.meta.env.VITE_SITE_URL?.trim() || import.meta.env.VITE_SHOP_WEBSITE_URL?.trim();
  if (fromEnv) return fromEnv.replace(/\/$/, "");
  return window.location.origin;
}

const AuthPage = () => {
  const { t } = useTranslation();
  const [isLogin, setIsLogin] = useState(true);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [loading, setLoading] = useState(false);
  const [forgotPasswordLoading, setForgotPasswordLoading] = useState(false);
  const [recoveryPassword, setRecoveryPassword] = useState("");
  const [recoveryPasswordConfirm, setRecoveryPasswordConfirm] = useState("");
  const [mfaFactorId, setMfaFactorId] = useState<string | null>(null);
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const { toast } = useToast();
  const recoveryMode =
    searchParams.get("mode") === "recovery" ||
    (typeof window !== "undefined" && window.location.hash.includes("type=recovery"));

  const configError = getSupabaseConfigError();

  const authErrorMessage = (error: { message?: string }) => {
    const msg = error.message || t("common.error");
    if (/invalid login credentials/i.test(msg)) {
      return t("auth.invalidCredentialsHint");
    }
    if (/email not confirmed/i.test(msg)) {
      return t("auth.emailNotConfirmed");
    }
    return msg;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);

    try {
      if (isLogin) {
        const { data, error } = await supabase.auth.signInWithPassword({ email, password });
        if (error) throw error;

        // Check if user has MFA factors
        const { data: factorsData } = await supabase.auth.mfa.listFactors();
        const verifiedFactors = factorsData?.totp?.filter((f: any) => f.status === "verified") || [];

        if (verifiedFactors.length > 0) {
          // Need MFA verification
          setMfaFactorId(verifiedFactors[0].id);
          setLoading(false);
          return;
        }

        if (data.user) {
          navigate(await resolvePostLoginPath(data.user.id, searchParams.get("next")));
        } else {
          navigate("/account");
        }
      } else {
        const { error } = await supabase.auth.signUp({
          email,
          password,
          options: {
            data: { display_name: displayName },
            emailRedirectTo: window.location.origin,
          },
        });
        if (error) throw error;
        toast({
          title: t("auth.checkEmail"),
          description: t("auth.confirmEmailSent"),
        });
      }
    } catch (error: any) {
      toast({
        title: t("common.error"),
        description: authErrorMessage(error),
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  const handleMFAVerified = async () => {
    const { data: { user: u } } = await supabase.auth.getUser();
    if (u) {
      navigate(await resolvePostLoginPath(u.id, searchParams.get("next")));
    } else {
      navigate("/account");
    }
  };

  const handleMFACancel = async () => {
    await supabase.auth.signOut();
    setMfaFactorId(null);
  };

  const handleForgotPassword = async () => {
    if (!email.trim()) {
      toast({
        title: t("auth.emailRequired"),
        description: t("auth.emailRequiredDesc"),
        variant: "destructive",
      });
      return;
    }

    setForgotPasswordLoading(true);
    try {
      const { error } = await supabase.auth.resetPasswordForEmail(email.trim(), {
        redirectTo: `${getAuthSiteOrigin()}/auth?mode=recovery`,
      });
      if (error) throw error;
      toast({
        title: t("auth.resetEmailSent"),
        description: t("auth.resetEmailSentDesc"),
      });
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : String(error);
      const smtpFailure =
        /error sending recovery email/i.test(message) ||
        /error sending confirmation email/i.test(message);
      toast({
        title: t("auth.couldNotSendReset"),
        description: smtpFailure ? t("auth.resetEmailSmtpError") : message || t("common.error"),
        variant: "destructive",
      });
    } finally {
      setForgotPasswordLoading(false);
    }
  };

  const handleRecoveryPasswordUpdate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!recoveryPassword || recoveryPassword.length < 6) {
      toast({
        title: t("auth.passwordTooShort"),
        description: t("auth.passwordTooShortDesc"),
        variant: "destructive",
      });
      return;
    }
    if (recoveryPassword !== recoveryPasswordConfirm) {
      toast({
        title: t("auth.passwordsNoMatch"),
        description: t("auth.passwordsNoMatchDesc"),
        variant: "destructive",
      });
      return;
    }

    setLoading(true);
    try {
      const { error } = await supabase.auth.updateUser({ password: recoveryPassword });
      if (error) throw error;
      toast({
        title: t("auth.passwordUpdated"),
        description: t("auth.passwordUpdatedDesc"),
      });
      navigate("/schedule");
    } catch (error: any) {
      toast({
        title: t("auth.couldNotUpdatePassword"),
        description: error?.message ?? t("common.error"),
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="relative flex min-h-screen items-center justify-center overflow-hidden bg-[#090a0f] px-4 py-10">
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_50%_50%,rgba(255,255,255,0.05),transparent_42%),linear-gradient(180deg,#07080d_0%,#0d0f17_100%)]" />
      <div className="pointer-events-none absolute inset-y-0 left-0 w-[32vw] opacity-55 [background-image:url('data:image/svg+xml,%3Csvg%20xmlns%3D%27http%3A%2F%2Fwww.w3.org%2F2000%2Fsvg%27%20viewBox%3D%270%200%20320%20900%27%3E%3Cpath%20d%3D%27M20%2040%20C130%2080%20150%20190%2085%20280%20C35%20350%2042%20430%20128%20500%20C205%20562%20220%20665%20150%20735%20C112%20772%2070%20815%2042%20860%27%20fill%3D%27none%27%20stroke%3D%27%23d4af37%27%20stroke-opacity%3D%270.32%27%20stroke-width%3D%272%27%2F%3E%3Cpath%20d%3D%27M62%2070%20C168%20112%20180%20214%20120%20285%20C68%20346%2070%20420%20150%20486%20C232%20556%20244%20664%20176%20739%20C143%20776%20104%20814%2077%20850%27%20fill%3D%27none%27%20stroke%3D%27%23d4af37%27%20stroke-opacity%3D%270.18%27%20stroke-width%3D%271.4%27%2F%3E%3C%2Fsvg%3E')] bg-no-repeat bg-left-top bg-contain" />
      <div className="pointer-events-none absolute inset-y-0 right-0 w-[32vw] opacity-55 [background-image:url('data:image/svg+xml,%3Csvg%20xmlns%3D%27http%3A%2F%2Fwww.w3.org%2F2000%2Fsvg%27%20viewBox%3D%270%200%20320%20900%27%3E%3Cpath%20d%3D%27M300%2040%20C190%2080%20170%20190%20235%20280%20C285%20350%20278%20430%20192%20500%20C115%20562%20100%20665%20170%20735%20C208%20772%20250%20815%20278%20860%27%20fill%3D%27none%27%20stroke%3D%27%23d4af37%27%20stroke-opacity%3D%270.32%27%20stroke-width%3D%272%27%2F%3E%3Cpath%20d%3D%27M258%2070%20C152%20112%20140%20214%20200%20285%20C252%20346%20250%20420%20170%20486%20C88%20556%2076%20664%20144%20739%20C177%20776%20216%20814%20243%20850%27%20fill%3D%27none%27%20stroke%3D%27%23d4af37%27%20stroke-opacity%3D%270.18%27%20stroke-width%3D%271.4%27%2F%3E%3C%2Fsvg%3E')] bg-no-repeat bg-right-top bg-contain" />

      <div className="relative z-10 w-full max-w-[345px]">
        <div className="mb-4 flex flex-col items-center">
          <VelbokBrand variant="auth" href={null} />
          <div className="mx-auto mt-3 h-px w-36 bg-gradient-to-r from-transparent via-gold/80 to-transparent" />
          <p className="mt-1.5 text-[10px] tracking-[0.3em] text-gold/90">{BRANDING.platformTagline.toUpperCase()}</p>
        </div>

        {configError ? (
          <div className="mb-4 rounded-lg border border-destructive/50 bg-destructive/10 px-4 py-3 text-sm text-destructive">
            {configError}
          </div>
        ) : null}

        <div className="rounded-2xl border border-gold/40 bg-[#101216]/82 p-5 shadow-[0_14px_32px_rgba(0,0,0,0.48)] backdrop-blur-sm">
          {mfaFactorId ? (
            <MFAVerify
              factorId={mfaFactorId}
              onVerified={handleMFAVerified}
              onCancel={handleMFACancel}
            />
          ) : recoveryMode ? (
            <>
              <h2 className="font-display text-xl font-semibold mb-2">{t("auth.setNewPassword")}</h2>
              <p className="text-xs text-muted-foreground mb-6">{t("auth.setNewPasswordDesc")}</p>
              <form onSubmit={handleRecoveryPasswordUpdate} className="space-y-4">
                <div>
                  <Label className="text-xs uppercase tracking-widest text-muted-foreground">
                    {t("auth.newPassword")}
                  </Label>
                  <PasswordField
                    value={recoveryPassword}
                    onChange={setRecoveryPassword}
                    placeholder="••••••••"
                    showLockIcon={false}
                    className="mt-1.5"
                    inputClassName="h-10 field-surface border-border"
                    required
                    minLength={6}
                    autoComplete="new-password"
                  />
                </div>
                <div>
                  <Label className="text-xs uppercase tracking-widest text-muted-foreground">
                    {t("auth.confirmPassword")}
                  </Label>
                  <PasswordField
                    value={recoveryPasswordConfirm}
                    onChange={setRecoveryPasswordConfirm}
                    placeholder="••••••••"
                    showLockIcon={false}
                    className="mt-1.5"
                    inputClassName="h-10 field-surface border-border"
                    required
                    minLength={6}
                    autoComplete="new-password"
                  />
                </div>
                <Button type="submit" variant="gold" className="w-full" disabled={loading}>
                  {loading ? t("auth.updating") : t("auth.updatePassword")}
                </Button>
              </form>
            </>
          ) : (
            <>
              <h2 className="mb-1.5 text-center font-display text-3xl font-semibold text-white">
                {isLogin ? t("common.signIn") : t("auth.createAccount")}
              </h2>
              <div className="mx-auto mb-4 h-px w-20 bg-gradient-to-r from-transparent via-gold/80 to-transparent" />
              <p className="mb-4 text-center text-[11px] leading-[1.4] text-zinc-300">{t("auth.authSubtitle")}</p>

              <form onSubmit={handleSubmit} className="space-y-4">
                {!isLogin && (
                  <div>
                    <Label className="text-xs uppercase tracking-widest text-gold">
                      {t("auth.displayName")}
                    </Label>
                    <Input
                      value={displayName}
                      onChange={(e) => setDisplayName(e.target.value)}
                      placeholder={t("auth.yourName")}
                      className="mt-2 h-11 border-gold/20 bg-black/30 text-zinc-100 placeholder:text-zinc-500"
                      required
                    />
                  </div>
                )}
                <div>
                  <Label className="text-xs uppercase tracking-widest text-gold">
                    {t("common.email")}
                  </Label>
                  <div className="relative mt-2">
                    <Mail className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gold/85" />
                    <Input
                      type="email"
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      placeholder={t("auth.enterEmail")}
                      className="h-11 border-gold/20 bg-black/30 pl-10 text-zinc-100 placeholder:text-zinc-500"
                      required
                    />
                  </div>
                </div>
                <div>
                  <Label className="text-xs uppercase tracking-widest text-gold">
                    {t("common.password")}
                  </Label>
                  <PasswordField
                    value={password}
                    onChange={setPassword}
                    placeholder={t("auth.enterPassword")}
                    className="mt-2"
                    inputClassName="h-11 border-gold/20 bg-black/30 text-zinc-100 placeholder:text-zinc-500"
                    required
                    minLength={6}
                    autoComplete={isLogin ? "current-password" : "new-password"}
                  />
                </div>
                <Button type="submit" variant="gold" className="h-11 w-full text-sm tracking-[0.12em]" disabled={loading}>
                  {loading ? t("common.loading") : isLogin ? t("common.signIn") : t("auth.signUp")}
                </Button>
                {isLogin ? (
                  <>
                    <div className="flex items-center gap-3 py-1">
                      <div className="h-px flex-1 bg-zinc-700/70" />
                      <span className="text-xs text-zinc-500">{t("auth.or")}</span>
                      <div className="h-px flex-1 bg-zinc-700/70" />
                    </div>
                    <button
                      type="button"
                      className="mx-auto block text-sm text-gold hover:underline"
                      onClick={() => void handleForgotPassword()}
                      disabled={forgotPasswordLoading}
                    >
                      {forgotPasswordLoading ? t("auth.sendingReset") : t("auth.forgotPassword")}
                    </button>
                  </>
                ) : null}
              </form>

              <p className="mt-5 text-center text-sm text-zinc-400">
                {isLogin ? t("auth.noAccount") : t("auth.hasAccount")}{" "}
                <button
                  onClick={() => setIsLogin(!isLogin)}
                  className="text-gold hover:underline"
                >
                  {isLogin ? t("auth.signUp") : t("common.signIn")}
                </button>
              </p>
            </>
          )}
        </div>
        <p className="mt-4 text-center text-[11px] text-zinc-500">
          {t("auth.termsAgree")}{" "}
          <Link to="/terms" className="underline underline-offset-2 hover:text-zinc-200">{t("common.terms")}</Link>,{" "}
          <Link to="/privacy" className="underline underline-offset-2 hover:text-zinc-200">{t("auth.privacyNotice")}</Link>, {t("common.and")}{" "}
          <Link to="/cookies" className="underline underline-offset-2 hover:text-zinc-200">{t("auth.cookiePolicy")}</Link>.
        </p>
        <div className="mt-3 flex flex-col items-center gap-2">
          <LanguageSelector compact className="w-[160px]" />
          <button
            type="button"
            className="text-[11px] text-primary hover:underline"
            onClick={() => window.dispatchEvent(new CustomEvent("cookie-consent:open"))}
          >
            {t("common.cookieSettings")}
          </button>
        </div>
      </div>
    </div>
  );
};

export default AuthPage;
