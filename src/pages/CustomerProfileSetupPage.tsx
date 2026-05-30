import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import CustomerLayout from "@/components/CustomerLayout";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";
import { useTranslation } from "react-i18next";

function passwordChecks(pwd: string) {
  const minLen = pwd.length >= 8;
  const hasUpper = /[A-Z]/.test(pwd);
  const hasNumber = /\d/.test(pwd);
  const hasSymbol = /[^A-Za-z0-9]/.test(pwd);
  return { minLen, hasUpper, hasNumber, hasSymbol, ok: minLen && hasUpper && hasNumber && hasSymbol };
}

const CustomerProfileSetupPage = () => {
  const { t } = useTranslation();
  const { user } = useAuth();
  const navigate = useNavigate();
  const { toast } = useToast();

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const [fullName, setFullName] = useState("");
  const [phone, setPhone] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");

  useEffect(() => {
    let cancelled = false;

    async function load() {
      if (!user) return;
      setLoading(true);

      const { data } = await supabase
        .from("profiles")
        .select("display_name, phone, public_contact_email")
        .eq("user_id", user.id)
        .maybeSingle();

      if (cancelled) return;

      setFullName("");
      setPhone(data?.phone ?? "");
      setEmail((user.email || "").trim().toLowerCase());
      setLoading(false);
    }

    load();
    return () => {
      cancelled = true;
    };
  }, [user]);

  const canSubmit =
    !saving &&
    !loading &&
    fullName.trim().length > 0 &&
    (user?.email || "").trim().length > 0 &&
    password.trim().length > 0 &&
    confirmPassword.trim().length > 0 &&
    phone.trim().length > 0;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user) return;

    const emailValue = (user.email || "").trim().toLowerCase();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(emailValue)) {
      toast({
        title: t("customer.invalidInviteEmail"),
        variant: "destructive",
      });
      return;
    }
    if (!fullName.trim() || !phone.trim()) {
      toast({
        title: "Complete all required fields",
        description: t("customer.requiredFieldsDesc"),
        variant: "destructive",
      });
      return;
    }
    if (password !== confirmPassword) {
      toast({
        title: t("auth.passwordsMismatch"),
        variant: "destructive",
      });
      return;
    }
    const pwd = passwordChecks(password);
    if (!pwd.ok) {
      toast({
        title: t("customer.passwordTooWeak"),
        description: t("customer.passwordTooWeakDesc"),
        variant: "destructive",
      });
      return;
    }

    setSaving(true);
    try {
      const { error: passwordError } = await supabase.auth.updateUser({ password });
      if (passwordError) throw passwordError;

      const { error: profileError } = await supabase
        .from("profiles")
        .upsert(
          {
            user_id: user.id,
            display_name: fullName.trim(),
            phone: phone.trim(),
            public_contact_email: emailValue,
            customer_profile_completed: true,
          },
          { onConflict: "user_id" }
        );

      if (profileError) throw profileError;

      toast({ title: t("customer.profileCompleted") });
      navigate("/account");
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : undefined;
      toast({
        title: t("customer.couldNotSave"),
        description: message ?? t("customer.pleaseTryAgain"),
        variant: "destructive",
      });
    } finally {
      setSaving(false);
    }
  };

  return (
    <CustomerLayout>
      <div className="flex flex-col gap-4 p-4 md:p-6 max-w-2xl">
        <h1 className="font-display text-2xl font-bold">{t("customer.setUpAccountTitle")}</h1>
        <p className="text-sm text-muted-foreground">
          {t("customer.setUpAccountSubtitle")}
        </p>

        <Card className="p-4 md:p-6">
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="space-y-2">
              <Label className="text-xs uppercase tracking-widest text-muted-foreground">{t("customer.fullName")}</Label>
              <Input
                value={fullName}
                onChange={(e) => setFullName(e.target.value)}
                placeholder={t("customer.fullName")}
                className="bg-secondary border-border"
                disabled={loading}
                required
              />
            </div>

            <div className="space-y-2">
              <Label className="text-xs uppercase tracking-widest text-muted-foreground">{t("common.email")}</Label>
              <Input
                type="email"
                value={email}
                className="bg-secondary/50 border-border"
                disabled
                required
              />
              <p className="text-[11px] text-muted-foreground">{t("customer.emailLocked")}</p>
            </div>

            <div className="space-y-2">
              <Label className="text-xs uppercase tracking-widest text-muted-foreground">{t("schedule.phone")}</Label>
              <Input
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                placeholder={t("schedule.phone")}
                className="bg-secondary border-border"
                disabled={loading}
                required
              />
            </div>

            <div className="space-y-2">
              <Label className="text-xs uppercase tracking-widest text-muted-foreground">{t("customer.createPassword")}</Label>
              <Input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder={t("customer.newPasswordPlaceholder")}
                className="bg-secondary border-border"
                disabled={loading}
                required
              />
            </div>

            <div className="space-y-2">
              <Label className="text-xs uppercase tracking-widest text-muted-foreground">{t("customer.confirmPassword")}</Label>
              <Input
                type="password"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                placeholder={t("customer.confirmPasswordPlaceholder")}
                className="bg-secondary border-border"
                disabled={loading}
                required
              />
            </div>

            <Button type="submit" variant="gold" className="w-full" disabled={!canSubmit}>
              {saving ? t("billing.saving") : t("customer.saveContinue")}
            </Button>
          </form>
        </Card>
      </div>
    </CustomerLayout>
  );
};

export default CustomerProfileSetupPage;

