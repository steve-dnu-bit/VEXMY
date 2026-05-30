import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Shield, Loader2 } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { useTranslation } from "react-i18next";

interface MFAVerifyProps {
  factorId: string;
  onVerified: () => void;
  onCancel: () => void;
}

const MFAVerify = ({ factorId, onVerified, onCancel }: MFAVerifyProps) => {
  const [code, setCode] = useState("");
  const [loading, setLoading] = useState(false);
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

    onVerified();
  };

  return (
    <div className="space-y-6">
      <div className="text-center">
        <div className="mx-auto w-12 h-12 rounded-full bg-primary/10 flex items-center justify-center mb-3">
          <Shield className="h-6 w-6 text-primary" />
        </div>
        <h2 className="font-display text-xl font-semibold">{t("mfa.title")}</h2>
        <p className="text-sm text-muted-foreground mt-1">{t("mfa.verifyPrompt")}</p>
      </div>

      <div className="space-y-3">
        <Input
          value={code}
          onChange={(e) => setCode(e.target.value.replace(/\D/g, "").slice(0, 6))}
          placeholder="000000"
          className="bg-secondary border-border text-center text-2xl tracking-[0.5em] font-mono h-14"
          maxLength={6}
          autoFocus
          onKeyDown={(e) => e.key === "Enter" && code.length === 6 && handleVerify()}
        />
        <Button
          onClick={handleVerify}
          disabled={code.length !== 6 || loading}
          variant="gold"
          className="w-full"
        >
          {loading ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
          {t("mfa.verify")}
        </Button>
        <Button variant="ghost" size="sm" className="w-full text-muted-foreground" onClick={onCancel}>
          {t("mfa.signInDifferent")}
        </Button>
      </div>
    </div>
  );
};

export default MFAVerify;
