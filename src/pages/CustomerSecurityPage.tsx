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

function passwordChecks(pwd: string) {
  const minLen = pwd.length >= 8;
  const hasUpper = /[A-Z]/.test(pwd);
  const hasNumber = /\d/.test(pwd);
  const hasSymbol = /[^A-Za-z0-9]/.test(pwd);
  return { minLen, hasUpper, hasNumber, hasSymbol, ok: minLen && hasUpper && hasNumber && hasSymbol };
}

const CustomerSecurityPage = () => {
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
      toast.error("Passwords do not match");
      return;
    }
    const checks = passwordChecks(newPassword);
    if (!checks.ok) {
      toast.error("Use at least 8 characters with a capital letter, number, and symbol");
      return;
    }

    setUpdatingPassword(true);
    const { error } = await supabase.auth.updateUser({ password: newPassword });
    setUpdatingPassword(false);

    if (error) {
      toast.error(error.message || "Could not update password");
      return;
    }

    setNewPassword("");
    setConfirmPassword("");
    toast.success("Password updated");
  };

  if (checking || !user) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <p className="text-muted-foreground text-sm">Loading…</p>
      </div>
    );
  }

  return (
    <CustomerLayout>
      <div className="space-y-6">
        <div>
          <h1 className="font-display text-2xl font-bold text-gradient-gold">Security</h1>
          <p className="text-sm text-muted-foreground mt-1">Manage your account password.</p>
        </div>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base">Change password</CardTitle>
            <CardDescription>Use a strong password with at least 8 characters.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            <div>
              <Label htmlFor="new-password">New password</Label>
              <Input
                id="new-password"
                type="password"
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
                className="mt-1 bg-secondary"
                placeholder="At least 8 chars, capital, number, symbol"
              />
            </div>
            <div>
              <Label htmlFor="confirm-password">Confirm new password</Label>
              <Input
                id="confirm-password"
                type="password"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                className="mt-1 bg-secondary"
                placeholder="Repeat new password"
              />
            </div>
            <Button size="sm" variant="outline" onClick={savePassword} disabled={updatingPassword}>
              {updatingPassword ? "Updating..." : "Save password"}
            </Button>
          </CardContent>
        </Card>
      </div>
    </CustomerLayout>
  );
};

export default CustomerSecurityPage;
