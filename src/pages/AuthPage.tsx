import { useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
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

const AuthPage = () => {
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
    const msg = error.message || "Something went wrong";
    if (/invalid login credentials/i.test(msg)) {
      return "Invalid email or password. VexMy uses a new database — your old Inkaholics password will not work until you set a new one with “Forgot your password?”.";
    }
    if (/email not confirmed/i.test(msg)) {
      return "Please confirm your email first (check your inbox), then try again.";
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
          title: "Check your email",
          description: "We sent you a confirmation link to verify your account.",
        });
      }
    } catch (error: any) {
      toast({
        title: "Error",
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
        title: "Email required",
        description: "Enter your email address first, then try again.",
        variant: "destructive",
      });
      return;
    }

    setForgotPasswordLoading(true);
    try {
      const { error } = await supabase.auth.resetPasswordForEmail(email.trim(), {
        redirectTo: `${window.location.origin}/auth?mode=recovery`,
      });
      if (error) throw error;
      toast({
        title: "Reset email sent",
        description: "Check your inbox for your password reset link.",
      });
    } catch (error: any) {
      toast({
        title: "Could not send reset email",
        description: error?.message ?? "Please try again.",
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
        title: "Password too short",
        description: "Use at least 6 characters.",
        variant: "destructive",
      });
      return;
    }
    if (recoveryPassword !== recoveryPasswordConfirm) {
      toast({
        title: "Passwords do not match",
        description: "Please re-enter and try again.",
        variant: "destructive",
      });
      return;
    }

    setLoading(true);
    try {
      const { error } = await supabase.auth.updateUser({ password: recoveryPassword });
      if (error) throw error;
      toast({
        title: "Password updated",
        description: "You can now sign in with your new password.",
      });
      navigate("/schedule");
    } catch (error: any) {
      toast({
        title: "Could not update password",
        description: error?.message ?? "Please try again.",
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
        <div className="mb-4 text-center">
          <h1 className="font-display text-3xl font-bold tracking-[0.08em] text-[#d4af37]">{BRANDING.platformName.toUpperCase()}</h1>
          <div className="mx-auto mt-2 h-px w-36 bg-gradient-to-r from-transparent via-[#d4af37]/80 to-transparent" />
          <p className="mt-1.5 text-[10px] tracking-[0.3em] text-[#d4af37]/85">{BRANDING.platformTagline.toUpperCase()}</p>
        </div>

        {configError ? (
          <div className="mb-4 rounded-lg border border-destructive/50 bg-destructive/10 px-4 py-3 text-sm text-destructive">
            {configError}
          </div>
        ) : null}

        <div className="rounded-2xl border border-[#d4af37]/40 bg-[#101216]/82 p-5 shadow-[0_14px_32px_rgba(0,0,0,0.48)] backdrop-blur-sm">
          {mfaFactorId ? (
            <MFAVerify
              factorId={mfaFactorId}
              onVerified={handleMFAVerified}
              onCancel={handleMFACancel}
            />
          ) : recoveryMode ? (
            <>
              <h2 className="font-display text-xl font-semibold mb-2">Set New Password</h2>
              <p className="text-xs text-muted-foreground mb-6">
                Choose a new password for your account.
              </p>
              <form onSubmit={handleRecoveryPasswordUpdate} className="space-y-4">
                <div>
                  <Label className="text-xs uppercase tracking-widest text-muted-foreground">
                    New Password
                  </Label>
                  <PasswordField
                    value={recoveryPassword}
                    onChange={setRecoveryPassword}
                    placeholder="••••••••"
                    showLockIcon={false}
                    className="mt-1.5"
                    inputClassName="h-10 bg-secondary border-border"
                    required
                    minLength={6}
                    autoComplete="new-password"
                  />
                </div>
                <div>
                  <Label className="text-xs uppercase tracking-widest text-muted-foreground">
                    Confirm Password
                  </Label>
                  <PasswordField
                    value={recoveryPasswordConfirm}
                    onChange={setRecoveryPasswordConfirm}
                    placeholder="••••••••"
                    showLockIcon={false}
                    className="mt-1.5"
                    inputClassName="h-10 bg-secondary border-border"
                    required
                    minLength={6}
                    autoComplete="new-password"
                  />
                </div>
                <Button type="submit" variant="gold" className="w-full" disabled={loading}>
                  {loading ? "Updating..." : "Update Password"}
                </Button>
              </form>
            </>
          ) : (
            <>
              <h2 className="mb-1.5 text-center font-display text-3xl font-semibold text-white">
                {isLogin ? "Sign In" : "Create Account"}
              </h2>
              <div className="mx-auto mb-4 h-px w-20 bg-gradient-to-r from-transparent via-[#d4af37]/80 to-transparent" />
              <p className="mb-4 text-center text-[11px] leading-[1.4] text-zinc-300">
                Custom booking and customer management system. Creating an account helps streamline communication and the booking process.
              </p>

              <form onSubmit={handleSubmit} className="space-y-4">
                {!isLogin && (
                  <div>
                    <Label className="text-xs uppercase tracking-widest text-[#d4af37]">
                      Display Name
                    </Label>
                    <Input
                      value={displayName}
                      onChange={(e) => setDisplayName(e.target.value)}
                      placeholder="Your name"
                      className="mt-2 h-11 border-[#d4af37]/20 bg-black/30 text-zinc-100 placeholder:text-zinc-500"
                      required
                    />
                  </div>
                )}
                <div>
                  <Label className="text-xs uppercase tracking-widest text-[#d4af37]">
                    Email
                  </Label>
                  <div className="relative mt-2">
                    <Mail className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[#d4af37]/85" />
                    <Input
                      type="email"
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      placeholder="Enter your email"
                      className="h-11 border-[#d4af37]/20 bg-black/30 pl-10 text-zinc-100 placeholder:text-zinc-500"
                      required
                    />
                  </div>
                </div>
                <div>
                  <Label className="text-xs uppercase tracking-widest text-[#d4af37]">
                    Password
                  </Label>
                  <PasswordField
                    value={password}
                    onChange={setPassword}
                    placeholder="Enter your password"
                    className="mt-2"
                    inputClassName="h-11 border-[#d4af37]/20 bg-black/30 text-zinc-100 placeholder:text-zinc-500"
                    required
                    minLength={6}
                    autoComplete={isLogin ? "current-password" : "new-password"}
                  />
                </div>
                <Button type="submit" variant="gold" className="h-11 w-full text-sm tracking-[0.12em]" disabled={loading}>
                  {loading ? "Loading..." : isLogin ? "Sign In" : "Sign Up"}
                </Button>
                {isLogin ? (
                  <>
                    <div className="flex items-center gap-3 py-1">
                      <div className="h-px flex-1 bg-zinc-700/70" />
                      <span className="text-xs text-zinc-500">or</span>
                      <div className="h-px flex-1 bg-zinc-700/70" />
                    </div>
                    <button
                      type="button"
                      className="mx-auto block text-sm text-[#d4af37] hover:underline"
                      onClick={() => void handleForgotPassword()}
                      disabled={forgotPasswordLoading}
                    >
                      {forgotPasswordLoading ? "Sending reset email..." : "Forgot your password?"}
                    </button>
                  </>
                ) : null}
              </form>

              <p className="mt-5 text-center text-sm text-zinc-400">
                {isLogin ? "Don't have an account?" : "Already have an account?"}{" "}
                <button
                  onClick={() => setIsLogin(!isLogin)}
                  className="text-[#d4af37] hover:underline"
                >
                  {isLogin ? "Sign Up" : "Sign In"}
                </button>
              </p>
            </>
          )}
        </div>
        <p className="mt-4 text-center text-[11px] text-zinc-500">
          By continuing you agree to our{" "}
          <Link to="/terms" className="underline underline-offset-2 hover:text-zinc-200">Terms</Link>,{" "}
          <Link to="/privacy" className="underline underline-offset-2 hover:text-zinc-200">Privacy Notice</Link>, and{" "}
          <Link to="/cookies" className="underline underline-offset-2 hover:text-zinc-200">Cookie Policy</Link>.
        </p>
        <p className="mt-2 text-center text-[11px]">
          <button
            type="button"
            className="text-primary hover:underline"
            onClick={() => window.dispatchEvent(new CustomEvent("cookie-consent:open"))}
          >
            Cookie settings
          </button>
        </p>
      </div>
    </div>
  );
};

export default AuthPage;
