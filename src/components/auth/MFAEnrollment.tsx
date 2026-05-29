import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Shield, ShieldCheck, ShieldOff, Loader2 } from "lucide-react";
import { toast } from "sonner";

const MFAEnrollment = () => {
  const { user } = useAuth();
  const [factors, setFactors] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [enrolling, setEnrolling] = useState(false);
  const [qrCode, setQrCode] = useState<string | null>(null);
  const [secret, setSecret] = useState<string | null>(null);
  const [factorId, setFactorId] = useState<string | null>(null);
  const [verifyCode, setVerifyCode] = useState("");
  const [verifying, setVerifying] = useState(false);

  useEffect(() => {
    if (user) loadFactors();
  }, [user]);

  const loadFactors = async () => {
    setLoading(true);
    const { data, error } = await supabase.auth.mfa.listFactors();
    if (data) {
      setFactors(data.totp || []);
    }
    setLoading(false);
  };

  const startEnroll = async () => {
    setEnrolling(true);
    const { data, error } = await supabase.auth.mfa.enroll({
      factorType: "totp",
      friendlyName: "Authenticator App",
    });
    if (error) {
      toast.error(error.message);
      setEnrolling(false);
      return;
    }
    if (data) {
      setQrCode(data.totp.qr_code);
      setSecret(data.totp.secret);
      setFactorId(data.id);
    }
    setEnrolling(false);
  };

  const verifyEnrollment = async () => {
    if (!factorId || !verifyCode) return;
    setVerifying(true);

    const { data: challengeData, error: challengeError } = await supabase.auth.mfa.challenge({
      factorId,
    });
    if (challengeError) {
      toast.error(challengeError.message);
      setVerifying(false);
      return;
    }

    const { error: verifyError } = await supabase.auth.mfa.verify({
      factorId,
      challengeId: challengeData.id,
      code: verifyCode,
    });
    if (verifyError) {
      toast.error("Invalid code. Please try again.");
      setVerifying(false);
      return;
    }

    toast.success("MFA enabled successfully!");
    setQrCode(null);
    setSecret(null);
    setFactorId(null);
    setVerifyCode("");
    setVerifying(false);
    loadFactors();
  };

  const unenroll = async (id: string) => {
    const { error } = await supabase.auth.mfa.unenroll({ factorId: id });
    if (error) {
      toast.error(error.message);
      return;
    }
    toast.success("MFA disabled");
    loadFactors();
  };

  const verifiedFactors = factors.filter((f) => f.status === "verified");
  const hasActiveMFA = verifiedFactors.length > 0;

  if (loading) {
    return (
      <Card className="bg-card border-border">
        <CardContent className="flex items-center justify-center py-8">
          <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="bg-card border-border">
      <CardHeader className="pb-3">
        <div className="flex items-center gap-2">
          <Shield className="h-5 w-5 text-primary" />
          <CardTitle className="text-base">Two-Factor Authentication</CardTitle>
        </div>
        <CardDescription>
          Add an extra layer of security using an authenticator app (Google Authenticator, Authy, etc.)
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {hasActiveMFA && !qrCode && (
          <div className="space-y-3">
            <div className="flex items-center gap-2 text-emerald-400">
              <ShieldCheck className="h-4 w-4" />
              <span className="text-sm font-medium">MFA is enabled</span>
            </div>
            {verifiedFactors.map((f) => (
              <div key={f.id} className="flex items-center justify-between rounded-lg border border-border bg-secondary p-3">
                <div>
                  <p className="text-sm font-medium">{f.friendly_name || "Authenticator App"}</p>
                  <p className="text-[11px] text-muted-foreground">Added {new Date(f.created_at).toLocaleDateString()}</p>
                </div>
                <Button
                  variant="outline"
                  size="sm"
                  className="text-destructive border-destructive/30 hover:bg-destructive/10"
                  onClick={() => unenroll(f.id)}
                >
                  <ShieldOff className="h-3.5 w-3.5 mr-1" /> Remove
                </Button>
              </div>
            ))}
          </div>
        )}

        {!hasActiveMFA && !qrCode && (
          <div className="space-y-3">
            <div className="flex items-center gap-2 text-muted-foreground">
              <ShieldOff className="h-4 w-4" />
              <span className="text-sm">MFA is not enabled</span>
            </div>
            <Button onClick={startEnroll} disabled={enrolling} variant="gold" className="w-full">
              {enrolling ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <Shield className="h-4 w-4 mr-2" />}
              Enable MFA
            </Button>
          </div>
        )}

        {qrCode && (
          <div className="space-y-4">
            <div className="text-sm text-muted-foreground">
              <p className="font-medium text-foreground mb-2">Step 1: Scan this QR code</p>
              <p>Open your authenticator app and scan the code below:</p>
            </div>
            <div className="flex justify-center p-4 bg-white rounded-lg">
              <img src={qrCode} alt="MFA QR Code" loading="lazy" className="w-48 h-48" />
            </div>
            {secret && (
              <div className="text-center">
                <p className="text-[11px] text-muted-foreground mb-1">Or enter this code manually:</p>
                <code className="text-xs bg-secondary px-3 py-1.5 rounded border border-border select-all">
                  {secret}
                </code>
              </div>
            )}
            <div>
              <p className="text-sm font-medium text-foreground mb-2">Step 2: Enter verification code</p>
              <div className="flex gap-2">
                <Input
                  value={verifyCode}
                  onChange={(e) => setVerifyCode(e.target.value.replace(/\D/g, "").slice(0, 6))}
                  placeholder="000000"
                  className="bg-secondary border-border text-center text-lg tracking-[0.5em] font-mono"
                  maxLength={6}
                />
                <Button
                  onClick={verifyEnrollment}
                  disabled={verifyCode.length !== 6 || verifying}
                  variant="gold"
                >
                  {verifying ? <Loader2 className="h-4 w-4 animate-spin" /> : "Verify"}
                </Button>
              </div>
            </div>
            <Button
              variant="ghost"
              size="sm"
              className="w-full text-muted-foreground"
              onClick={() => {
                setQrCode(null);
                setSecret(null);
                setFactorId(null);
                setVerifyCode("");
              }}
            >
              Cancel
            </Button>
          </div>
        )}
      </CardContent>
    </Card>
  );
};

export default MFAEnrollment;
