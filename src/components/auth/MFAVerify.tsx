import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { Shield, Loader2 } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { useTranslation } from "react-i18next";
import AuthPasswordlessPanel from "@/components/auth/AuthPasswordlessPanel";
import AuthSupportFootnote from "@/components/auth/AuthSupportFootnote";
import { registerTrustedDevice } from "@/lib/trustedDevice";

interface MFAVerifyProps {
  factorId: string;
  onVerified: () => void;
  onCancel: () => void;
  compact?: boolean;
}

const MFAVerify = ({ factorId, onVerified, onCancel, compact = false }: MFAVerifyProps) => {
  const [code, setCode] = useState("");
  const [recoveryCode, setRecoveryCode] = useState("");
  const [loading, setLoading] = useState(false);
  const [showRecovery, setShowRecovery] = useState(false);
  const [recoveryMode, setRecoveryMode] = useState<"code" | "email">("code");
  const [trustDevice, setTrustDevice] = useState(true);
  const { toast } = useToast();
  const { t } = useTranslation();

  const handleVerify = async () => {
    if (code.length !== 6) return;
    setLoading(true);

    const { data: challengeData, error: challengeError } = await supabase.auth.mfa.challenge({
      factorId,
    });

    if (challengeError) {
      toast({ title: t("common.error"), description: challengeError.message, variant: "destructive" });
      setLoading(false);
      return;
    }

    const { error: verifyError } = await supabase.auth.mfa.verify({
      factorId,
      challengeId: challengeData.id,
      code,
    });

    if (verifyError) {
      toast({ title: t("mfa.invalidCode"), description: t("mfa.verifyPrompt"), variant: "destructive" });
      setCode("");
      setLoading(false);
      return;
    }

    if (trustDevice) {
      try {
        await registerTrustedDevice();
      } catch {
        /* non-blocking */
      }
    }

    onVerified();
  };

  const handleRecoveryVerify = async () => {
    const trimmed = recoveryCode.trim();
    if (!trimmed) return;
    setLoading(true);

    const { data: challengeData, error: challengeError } = await supabase.auth.mfa.challenge({ factorId });
    if (challengeError) {
      toast({ title: t("common.error"), description: challengeError.message, variant: "destructive" });
      setLoading(false);
      return;
    }

    const { error: verifyError } = await supabase.auth.mfa.verify({
      factorId,
      challengeId: challengeData.id,
      code: trimmed,
    });

    setLoading(false);
    if (verifyError) {
      toast({ title: t("mfa.invalidCode"), description: t("mfa.recoveryCodeInvalid"), variant: "destructive" });
      return;
    }

    if (trustDevice) {
      try {
        await registerTrustedDevice();
      } catch {
        /* non-blocking */
      }
    }
    onVerified();
  };

  if (showRecovery) {
    return (
      <div className="space-y-4">
        <div className="text-center">
          <h2 className={`font-display font-semibold ${compact ? "text-lg" : "text-xl"}`}>
            {t("mfa.recoveryTitle")}
          </h2>
          <p className="text-sm text-muted-foreground mt-1">{t("mfa.recoveryDesc")}</p>
        </div>

        <div className="flex gap-1 rounded-lg border border-border/60 p-0.5 bg-secondary/30">
          <button
            type="button"
            className={`flex-1 rounded-md py-1.5 text-xs font-medium ${
              recoveryMode === "code" ? "bg-background text-foreground shadow-sm" : "text-muted-foreground"
            }`}
            onClick={() => setRecoveryMode("code")}
          >
            {t("mfa.recoveryCodeTab")}
          </button>
          <button
            type="button"
            className={`flex-1 rounded-md py-1.5 text-xs font-medium ${
              recoveryMode === "email" ? "bg-background text-foreground shadow-sm" : "text-muted-foreground"
            }`}
            onClick={() => setRecoveryMode("email")}
          >
            {t("auth.sendMagicLink")}
          </button>
        </div>

        {recoveryMode === "code" ? (
          <div className="space-y-3">
            <div>
              <Label className="text-xs text-muted-foreground">{t("mfa.recoveryCodeLabel")}</Label>
              <Input
                value={recoveryCode}
                onChange={(e) => setRecoveryCode(e.target.value)}
                placeholder="xxxx-xxxx"
                className="mt-1 field-surface border-border font-mono"
                autoFocus
              />
            </div>
            <Button
              type="button"
              variant="gold"
              className="w-full"
              disabled={!recoveryCode.trim() || loading}
              onClick={() => void handleRecoveryVerify()}
            >
              {loading ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
              {t("mfa.verify")}
            </Button>
          </div>
        ) : (
          <AuthPasswordlessPanel
            compact
            onSuccess={onCancel}
            onCancel={() => setShowRecovery(false)}
          />
        )}

        <Button type="button" variant="ghost" size="sm" className="w-full text-muted-foreground" onClick={() => setShowRecovery(false)}>
          {t("auth.backToAuthenticator")}
        </Button>
        <AuthSupportFootnote />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="text-center">
        <div
          className={`mx-auto rounded-full bg-primary/10 flex items-center justify-center mb-3 ${
            compact ? "w-10 h-10" : "w-12 h-12"
          }`}
        >
          <Shield className={compact ? "h-5 w-5 text-primary" : "h-6 w-6 text-primary"} />
        </div>
        <h2 className={`font-display font-semibold ${compact ? "text-lg" : "text-xl"}`}>{t("mfa.title")}</h2>
        <p className="text-sm text-muted-foreground mt-1">{t("mfa.verifyPromptNewDevice")}</p>
      </div>

      <div className="space-y-3">
        <Input
          value={code}
          onChange={(e) => setCode(e.target.value.replace(/\D/g, "").slice(0, 6))}
          placeholder="000000"
          className={`field-surface border-border text-center tracking-[0.5em] font-mono ${
            compact ? "text-xl h-12" : "text-2xl h-14"
          }`}
          maxLength={6}
          autoFocus
          onKeyDown={(e) => e.key === "Enter" && code.length === 6 && void handleVerify()}
        />

        <div className="rounded-lg border-2 border-border bg-secondary/50 p-4">
          <div className="flex items-start gap-3">
            <Checkbox
              id="trust-device"
              checked={trustDevice}
              onCheckedChange={(v) => setTrustDevice(v === true)}
              className="mt-0.5"
            />
            <Label htmlFor="trust-device" className="text-sm leading-snug cursor-pointer font-normal">
              {t("mfa.trustDevice")}
            </Label>
          </div>
        </div>

        <Button
          onClick={() => void handleVerify()}
          disabled={code.length !== 6 || loading}
          variant="gold"
          className="w-full"
        >
          {loading ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
          {t("mfa.verify")}
        </Button>
        <Button type="button" variant="ghost" size="sm" className="w-full text-muted-foreground" onClick={() => setShowRecovery(true)}>
          {t("mfa.cantAccessAuthenticator")}
        </Button>
        <Button variant="ghost" size="sm" className="w-full text-muted-foreground" onClick={onCancel}>
          {t("mfa.signInDifferent")}
        </Button>
      </div>
      <AuthSupportFootnote />
    </div>
  );
};

export default MFAVerify;
