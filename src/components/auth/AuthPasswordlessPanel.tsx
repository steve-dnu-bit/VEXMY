import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Loader2, Mail, Smartphone } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { useTranslation } from "react-i18next";
import { PHONE_SIGN_IN_ENABLED } from "@/lib/authConfig";
import { sendEmailMagicLink, sendPhoneOtp, verifyPhoneOtp } from "@/lib/passwordlessAuth";

type Mode = "email" | "phone";

type AuthPasswordlessPanelProps = {
  compact?: boolean;
  defaultEmail?: string;
  defaultPhone?: string;
  onSuccess?: () => void;
  onCancel?: () => void;
};

const AuthPasswordlessPanel = ({
  compact = false,
  defaultEmail = "",
  defaultPhone = "",
  onSuccess,
  onCancel,
}: AuthPasswordlessPanelProps) => {
  const { t } = useTranslation();
  const { toast } = useToast();
  const [mode, setMode] = useState<Mode>("email");
  const [email, setEmail] = useState(defaultEmail);
  const [phone, setPhone] = useState(defaultPhone);
  const [otp, setOtp] = useState("");
  const [phoneOtpSent, setPhoneOtpSent] = useState(false);
  const [loading, setLoading] = useState(false);

  const handleSendEmail = async () => {
    if (!email.trim()) {
      toast({ title: t("auth.emailRequired"), description: t("auth.emailRequiredDesc"), variant: "destructive" });
      return;
    }
    setLoading(true);
    const { error } = await sendEmailMagicLink(email);
    setLoading(false);
    if (error) {
      toast({ title: t("common.error"), description: error.message, variant: "destructive" });
      return;
    }
    toast({ title: t("auth.magicLinkSent"), description: t("auth.magicLinkSentDesc") });
    onSuccess?.();
  };

  const handleSendPhone = async () => {
    setLoading(true);
    const { error } = await sendPhoneOtp(phone);
    setLoading(false);
    if (error) {
      const msg =
        error.message === "invalid_phone"
          ? t("auth.invalidPhone")
          : /phone.*disabled|signup.*disabled/i.test(error.message)
            ? t("auth.phoneSignInDisabled")
            : error.message;
      toast({ title: t("common.error"), description: msg, variant: "destructive" });
      return;
    }
    setPhoneOtpSent(true);
    toast({ title: t("auth.phoneCodeSent"), description: t("auth.phoneCodeSentDesc") });
  };

  const handleVerifyPhone = async () => {
    if (otp.length < 6) return;
    setLoading(true);
    const { error } = await verifyPhoneOtp(phone, otp);
    setLoading(false);
    if (error) {
      toast({ title: t("mfa.invalidCode"), description: error.message, variant: "destructive" });
      return;
    }
    onSuccess?.();
  };

  return (
    <div className={`space-y-4 ${compact ? "text-sm" : ""}`}>
      <div>
        <p className={`font-medium text-foreground ${compact ? "text-sm" : "text-base"}`}>
          {t("auth.passwordlessTitle")}
        </p>
        <p className="text-xs text-muted-foreground mt-1">{t("auth.passwordlessDesc")}</p>
      </div>

      {PHONE_SIGN_IN_ENABLED ? (
        <div className="flex gap-1 rounded-lg border border-border/60 p-0.5 bg-secondary/30">
          <button
            type="button"
            className={`flex-1 rounded-md py-1.5 text-xs font-medium transition-colors ${
              mode === "email" ? "bg-background text-foreground shadow-sm" : "text-muted-foreground"
            }`}
            onClick={() => {
              setMode("email");
              setPhoneOtpSent(false);
              setOtp("");
            }}
          >
            {t("common.email")}
          </button>
          <button
            type="button"
            className={`flex-1 rounded-md py-1.5 text-xs font-medium transition-colors ${
              mode === "phone" ? "bg-background text-foreground shadow-sm" : "text-muted-foreground"
            }`}
            onClick={() => setMode("phone")}
          >
            {t("auth.phoneTab")}
          </button>
        </div>
      ) : null}

      {mode === "email" ? (
        <div className="space-y-3">
          <div>
            <Label className="text-xs text-muted-foreground">{t("common.email")}</Label>
            <div className="relative mt-1">
              <Mail className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder={t("auth.enterEmail")}
                className="pl-10 field-surface border-border"
              />
            </div>
          </div>
          <Button type="button" variant="outline" className="w-full" disabled={loading} onClick={() => void handleSendEmail()}>
            {loading ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <Mail className="h-4 w-4 mr-2" />}
            {t("auth.sendMagicLink")}
          </Button>
        </div>
      ) : (
        <div className="space-y-3">
          <div>
            <Label className="text-xs text-muted-foreground">{t("auth.phoneLabel")}</Label>
            <div className="relative mt-1">
              <Smartphone className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                placeholder="+44 7700 900000"
                className="pl-10 field-surface border-border"
              />
            </div>
          </div>
          {!phoneOtpSent ? (
            <Button type="button" variant="outline" className="w-full" disabled={loading || !phone.trim()} onClick={() => void handleSendPhone()}>
              {loading ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <Smartphone className="h-4 w-4 mr-2" />}
              {t("auth.sendPhoneCode")}
            </Button>
          ) : (
            <>
              <Input
                value={otp}
                onChange={(e) => setOtp(e.target.value.replace(/\D/g, "").slice(0, 6))}
                placeholder="000000"
                className="field-surface border-border text-center text-lg tracking-[0.5em] font-mono"
                maxLength={6}
              />
              <Button
                type="button"
                variant="gold"
                className="w-full"
                disabled={loading || otp.length !== 6}
                onClick={() => void handleVerifyPhone()}
              >
                {loading ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
                {t("auth.verifyPhoneCode")}
              </Button>
              <Button type="button" variant="ghost" size="sm" className="w-full text-muted-foreground" onClick={() => void handleSendPhone()}>
                {t("auth.resendPhoneCode")}
              </Button>
            </>
          )}
        </div>
      )}

      {onCancel ? (
        <Button type="button" variant="ghost" size="sm" className="w-full text-muted-foreground" onClick={onCancel}>
          {t("auth.backToSignIn")}
        </Button>
      ) : null}
    </div>
  );
};

export default AuthPasswordlessPanel;
