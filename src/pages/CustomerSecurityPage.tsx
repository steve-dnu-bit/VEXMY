import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { fetchIsOnlyCustomer } from "@/hooks/useUserRoles";
import CustomerLayout from "@/components/CustomerLayout";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { useTranslation } from "react-i18next";

function passwordChecks(pwd: string) {
  const minLen = pwd.length >= 8;
  const hasUpper = /[A-Z]/.test(pwd);
  const hasNumber = /\d/.test(pwd);
  const hasSymbol = /[^A-Za-z0-9]/.test(pwd);
  return { minLen, hasUpper, hasNumber, hasSymbol, ok: minLen && hasUpper && hasNumber && hasSymbol };
}

const CustomerSecurityPage = () => {
  const { t } = useTranslation();
  const { user } = useAuth();
  const navigate = useNavigate();
  const [checking, setChecking] = useState(true);
  const [updatingPassword, setUpdatingPassword] = useState(false);
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");

  useEffect(() => {
    if (!user) return;
    (async () => {
      const only = await fetchIsOnlyCustomer(user.id);
      if (!only) {
        navigate("/schedule", { replace: true });
        return;
      }
      setChecking(false);
    })();
  }, [navigate, user]);

  const savePassword = async () => {
    if (newPassword !== confirmPassword) {
      toast.error(t("auth.passwordsMismatch"));
      return;
    }
    const checks = passwordChecks(newPassword);
    if (!checks.ok) {
      toast.error(t("customer.passwordRulesError"));
      return;
    }

    setUpdatingPassword(true);
    const { error } = await supabase.auth.updateUser({ password: newPassword });
    setUpdatingPassword(false);

    if (error) {
      toast.error(error.message || t("auth.couldNotUpdatePassword"));
      return;
    }

    setNewPassword("");
    setConfirmPassword("");
    toast.success(t("auth.passwordUpdated"));
  };

  if (checking || !user) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <p className="text-muted-foreground text-sm">{t("customer.loadingPortal")}</p>
      </div>
    );
  }

  return (
    <CustomerLayout>
      <div className="space-y-6">
        <div>
          <h1 className="font-display text-2xl font-bold text-gold">{t("customer.securityTitle")}</h1>
          <p className="text-sm text-muted-foreground mt-1">{t("customer.securitySubtitle")}</p>
        </div>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base">{t("customer.changePasswordTitle")}</CardTitle>
            <CardDescription>{t("customer.changePasswordDesc")}</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            <div>
              <Label htmlFor="new-password">{t("customer.newPassword")}</Label>
              <Input
                id="new-password"
                type="password"
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
                className="mt-1 bg-secondary"
                placeholder={t("customer.newPasswordPlaceholder")}
              />
            </div>
            <div>
              <Label htmlFor="confirm-password">{t("customer.confirmNewPassword")}</Label>
              <Input
                id="confirm-password"
                type="password"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                className="mt-1 bg-secondary"
                placeholder={t("customer.confirmPasswordPlaceholder")}
              />
            </div>
            <Button size="sm" variant="outline" onClick={savePassword} disabled={updatingPassword}>
              {updatingPassword ? t("customer.updating") : t("customer.savePassword")}
            </Button>
          </CardContent>
        </Card>
      </div>
    </CustomerLayout>
  );
};

export default CustomerSecurityPage;
