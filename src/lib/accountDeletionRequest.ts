import { BRANDING } from "@/lib/branding";

/** Pre-filled mailto for Google Play–compliant in-app account deletion requests. */
export function buildAccountDeletionMailto(user: { id: string; email?: string | null }): string {
  const email = user.email?.trim() || "(no email on account)";
  const subject = encodeURIComponent(`${BRANDING.platformName} account deletion request`);
  const body = encodeURIComponent(
    [
      "I request deletion of my Velbok account and personal data that Inkaholics Limited holds as platform controller.",
      "",
      "I understand:",
      "• Some studio booking or consent records may need to be kept by the tattoo studio (separate controller) for legal, medical, or tax reasons.",
      "• Velbok may retain minimal billing or audit records where required by law.",
      "",
      `Account email: ${email}`,
      `User ID: ${user.id}`,
      "",
      "Please confirm when deletion is complete.",
    ].join("\n"),
  );
  return `mailto:${BRANDING.privacyEmail}?subject=${subject}&body=${body}`;
}
