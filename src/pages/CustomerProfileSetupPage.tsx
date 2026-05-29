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

function passwordChecks(pwd: string) {
  const minLen = pwd.length >= 8;
  const hasUpper = /[A-Z]/.test(pwd);
  const hasNumber = /\d/.test(pwd);
  const hasSymbol = /[^A-Za-z0-9]/.test(pwd);
  return { minLen, hasUpper, hasNumber, hasSymbol, ok: minLen && hasUpper && hasNumber && hasSymbol };
}

const CustomerProfileSetupPage = () => {
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
        title: "Invite email is invalid",
        variant: "destructive",
      });
      return;
    }
    if (!fullName.trim() || !phone.trim()) {
      toast({
        title: "Complete all required fields",
        description: "Full name, email, phone, and password are required.",
        variant: "destructive",
      });
      return;
    }
    if (password !== confirmPassword) {
      toast({
        title: "Passwords do not match",
        variant: "destructive",
      });
      return;
    }
    const pwd = passwordChecks(password);
    if (!pwd.ok) {
      toast({
        title: "Password is too weak",
        description: "Use at least 8 characters, with a capital letter, a number, and a symbol.",
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

      toast({ title: "Profile completed" });
      navigate("/account");
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : undefined;
      toast({
        title: "Could not save",
        description: message ?? "Please try again.",
        variant: "destructive",
      });
    } finally {
      setSaving(false);
    }
  };

  return (
    <CustomerLayout>
      <div className="flex flex-col gap-4 p-4 md:p-6 max-w-2xl">
        <h1 className="font-display text-2xl font-bold">Set up your account</h1>
        <p className="text-sm text-muted-foreground">
          Finish your invite by confirming your customer profile details.
        </p>

        <Card className="p-4 md:p-6">
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="space-y-2">
              <Label className="text-xs uppercase tracking-widest text-muted-foreground">Full name</Label>
              <Input
                value={fullName}
                onChange={(e) => setFullName(e.target.value)}
                placeholder="Your full name"
                className="bg-secondary border-border"
                disabled={loading}
                required
              />
            </div>

            <div className="space-y-2">
              <Label className="text-xs uppercase tracking-widest text-muted-foreground">Email</Label>
              <Input
                type="email"
                value={email}
                className="bg-secondary/50 border-border"
                disabled
                required
              />
              <p className="text-[11px] text-muted-foreground">Locked to the invitation email for this account.</p>
            </div>

            <div className="space-y-2">
              <Label className="text-xs uppercase tracking-widest text-muted-foreground">Phone</Label>
              <Input
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                placeholder="Your phone number"
                className="bg-secondary border-border"
                disabled={loading}
                required
              />
            </div>

            <div className="space-y-2">
              <Label className="text-xs uppercase tracking-widest text-muted-foreground">Create password</Label>
              <Input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="At least 8 chars, capital, number, symbol"
                className="bg-secondary border-border"
                disabled={loading}
                required
              />
            </div>

            <div className="space-y-2">
              <Label className="text-xs uppercase tracking-widest text-muted-foreground">Confirm password</Label>
              <Input
                type="password"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                placeholder="Repeat password"
                className="bg-secondary border-border"
                disabled={loading}
                required
              />
            </div>

            <Button type="submit" variant="gold" className="w-full" disabled={!canSubmit}>
              {saving ? "Saving..." : "Save & continue"}
            </Button>
          </form>
        </Card>
      </div>
    </CustomerLayout>
  );
};

export default CustomerProfileSetupPage;

