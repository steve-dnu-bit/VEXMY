import { useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { useTranslation } from "react-i18next";
import MarketingLayout from "@/components/marketing/MarketingLayout";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { BRANDING } from "@/lib/branding";
import { usePricingPlansI18n } from "@/hooks/usePricingPlansI18n";
import { CheckCircle2, Mail, MessageSquare, Clock } from "lucide-react";
import { useToast } from "@/hooks/use-toast";

const FORM_NAME = "contact";

const encodeFormBody = (data: Record<string, string>) =>
  new URLSearchParams({ "form-name": FORM_NAME, ...data }).toString();

const ContactPage = () => {
  const { t } = useTranslation();
  const pricingPlans = usePricingPlansI18n();
  const [searchParams] = useSearchParams();
  const preselectedPlan = searchParams.get("plan") || "";
  const { toast } = useToast();

  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [studio, setStudio] = useState("");
  const [plan, setPlan] = useState(preselectedPlan);
  const [message, setMessage] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);

  const selectedPlan = pricingPlans.find((p) => p.id === preselectedPlan);

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setSubmitting(true);
    try {
      const body = encodeFormBody({
        name: name.trim(),
        email: email.trim(),
        studio: studio.trim(),
        plan: plan || "not-sure",
        message: message.trim(),
      });
      const res = await fetch("/", {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body,
      });
      if (!res.ok) throw new Error("Submit failed");
      setSubmitted(true);
      toast({
        title: t("contact.messageSent"),
        description: t("contact.messageSentDesc"),
      });
    } catch {
      toast({
        title: t("contact.couldNotSend"),
        description: t("contact.couldNotSendDesc", { email: BRANDING.supportEmail }),
        variant: "destructive",
      });
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <MarketingLayout>
      <section className="px-4 py-16 sm:px-6 sm:py-24">
        <div className="mx-auto grid max-w-6xl gap-12 lg:grid-cols-5">
          <div className="lg:col-span-2">
            <h1 className="font-display text-4xl font-bold sm:text-5xl">{t("contact.title")}</h1>
            <p className="mt-4 text-muted-foreground leading-relaxed">{t("contact.subtitle")}</p>

            <ul className="mt-10 space-y-5">
              <li className="flex gap-3 text-sm">
                <Mail className="mt-0.5 h-5 w-5 shrink-0 text-[#d4af37]" />
                <div>
                  <p className="font-medium">{t("common.email")}</p>
                  <a href={`mailto:${BRANDING.supportEmail}`} className="text-[#d4af37] hover:underline">
                    {BRANDING.supportEmail}
                  </a>
                </div>
              </li>
              <li className="flex gap-3 text-sm">
                <Clock className="mt-0.5 h-5 w-5 shrink-0 text-[#d4af37]" />
                <div>
                  <p className="font-medium">{t("contact.responseTime")}</p>
                  <p className="text-muted-foreground">{t("contact.withinOneDay")}</p>
                </div>
              </li>
              <li className="flex gap-3 text-sm">
                <MessageSquare className="mt-0.5 h-5 w-5 shrink-0 text-[#d4af37]" />
                <div>
                  <p className="font-medium">{t("contact.alreadyCustomer")}</p>
                  <Link to="/auth" className="text-[#d4af37] hover:underline">
                    {t("contact.signInApp")}
                  </Link>
                </div>
              </li>
            </ul>

            <div className="mt-10 rounded-xl border border-[#d4af37]/20 bg-[#101216]/60 p-6">
              <p className="text-xs font-semibold uppercase tracking-wider text-[#d4af37]/80">{t("contact.popularRequest")}</p>
              <p className="mt-2 text-sm text-muted-foreground">{t("contact.popularRequestBody")}</p>
              <Button variant="gold-outline" size="sm" className="mt-4" asChild>
                <Link to="/pricing">{t("common.comparePlans")}</Link>
              </Button>
            </div>
          </div>

          <div className="lg:col-span-3">
            {submitted ? (
              <div className="rounded-2xl border border-[#d4af37]/30 bg-[#101216]/80 p-10 text-center">
                <CheckCircle2 className="mx-auto h-12 w-12 text-[#d4af37]" />
                <h2 className="mt-4 font-display text-2xl font-bold">{t("contact.thanksTitle")}</h2>
                <p className="mt-2 text-sm text-muted-foreground">{t("contact.thanksBody", { email })}</p>
                <Button variant="gold" className="mt-8" asChild>
                  <Link to="/">{t("contact.backHome")}</Link>
                </Button>
              </div>
            ) : (
              <form
                name={FORM_NAME}
                method="POST"
                data-netlify="true"
                data-netlify-honeypot="bot-field"
                onSubmit={handleSubmit}
                className="rounded-2xl border border-border/70 bg-card/55 p-6 sm:p-8"
              >
                <input type="hidden" name="form-name" value={FORM_NAME} />
                <p className="hidden">
                  <label>
                    Don&apos;t fill this out: <input name="bot-field" />
                  </label>
                </p>

                <div className="grid gap-5 sm:grid-cols-2">
                  <div className="space-y-2">
                    <Label htmlFor="contact-name">{t("contact.yourName")}</Label>
                    <Input id="contact-name" name="name" required value={name} onChange={(e) => setName(e.target.value)} />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="contact-email">{t("common.email")}</Label>
                    <Input
                      id="contact-email"
                      name="email"
                      type="email"
                      required
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                    />
                  </div>
                </div>

                <div className="mt-5 grid gap-5 sm:grid-cols-2">
                  <div className="space-y-2">
                    <Label htmlFor="contact-studio">{t("common.studioName")}</Label>
                    <Input id="contact-studio" name="studio" value={studio} onChange={(e) => setStudio(e.target.value)} />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="contact-plan">{t("contact.interestedIn")}</Label>
                    <select
                      id="contact-plan"
                      name="plan"
                      value={plan}
                      onChange={(e) => setPlan(e.target.value)}
                      className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                    >
                      <option value="">{t("contact.notSureYet")}</option>
                      {pricingPlans.map((p) => (
                        <option key={p.id} value={p.id}>
                          {p.name} ({p.price}{p.period})
                        </option>
                      ))}
                    </select>
                  </div>
                </div>

                <div className="mt-5 space-y-2">
                  <Label htmlFor="contact-message">{t("contact.message")}</Label>
                  <Textarea
                    id="contact-message"
                    name="message"
                    required
                    rows={5}
                    value={message}
                    onChange={(e) => setMessage(e.target.value)}
                    placeholder={
                      selectedPlan
                        ? t("contact.messagePlaceholderPlan", { plan: selectedPlan.name })
                        : t("contact.messagePlaceholder")
                    }
                  />
                </div>

                <p className="mt-4 text-xs text-muted-foreground">
                  {t("contact.submitAgree")}{" "}
                  <Link to="/privacy" className="text-[#d4af37] hover:underline">
                    {t("common.privacy")}
                  </Link>
                  .
                </p>

                <Button type="submit" variant="gold" size="lg" className="mt-6 w-full sm:w-auto" disabled={submitting}>
                  {submitting ? t("contact.sending") : t("contact.sendMessage")}
                </Button>
              </form>
            )}
          </div>
        </div>
      </section>
    </MarketingLayout>
  );
};

export default ContactPage;
