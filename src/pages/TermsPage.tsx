import LegalPageLayout from "@/components/LegalPageLayout";
import { BRANDING } from "@/lib/branding";

const TermsPage = () => {
  return (
    <LegalPageLayout title="Terms and Conditions of Use" lastUpdated="29 May 2026">
      <section>
        <h2 className="font-semibold text-foreground">1. Scope</h2>
        <p>
          These Terms govern access to and use of the {BRANDING.platformName} web application (the "Service") by staff and customers in the UK and EU.
          By using the Service, you agree to these Terms.
        </p>
      </section>

      <section>
        <h2 className="font-semibold text-foreground">2. Eligibility and account security</h2>
        <p>
          You must provide accurate information, keep credentials confidential, and notify us promptly of unauthorized account access.
          You are responsible for activity carried out under your account unless caused by our fault.
        </p>
      </section>

      <section>
        <h2 className="font-semibold text-foreground">3. Acceptable use</h2>
        <p>
          You must not misuse the Service, interfere with security controls, upload unlawful content, or use the Service in a way that
          breaches applicable law, including UK GDPR, EU GDPR, and consumer protection rules.
        </p>
      </section>

      <section>
        <h2 className="font-semibold text-foreground">4. Booking and deposit workflows</h2>
        <p>
          The Service supports booking management and deposit reminders. Payment handling is provided by integrated third-party providers.
          You are responsible for ensuring booking and payment information entered is correct before sending notifications.
        </p>
        <p>
          Additional studio terms apply to booked tattoo services:
          once tattooing services are provided, the agreed price is payable in full and no credit is offered; deposits are collected via online
          payment provider integration; deposits are refundable only where formal cancellation is made by email at least 24 hours before the
          appointment; and dissatisfaction with style preference changes after service does not create a refund entitlement.
        </p>
      </section>

      <section>
        <h2 className="font-semibold text-foreground">5. Intellectual property</h2>
        <p>
          The Service design, software, and content are protected by intellectual property rights. You may use the Service only for internal
          business or personal booking purposes and not for unauthorized copying, resale, or reverse engineering.
        </p>
      </section>

      <section>
        <h2 className="font-semibold text-foreground">6. Data protection</h2>
        <p>
          Personal data is processed in line with our Privacy Notice and applicable UK/EU data protection law.
          Where required, we rely on consent, contract, legal obligation, or legitimate interests as a lawful basis.
        </p>
      </section>

      <section>
        <h2 className="font-semibold text-foreground">7. Service availability</h2>
        <p>
          We aim for reliable operation but do not guarantee uninterrupted availability. Planned maintenance, updates, and third-party outages
          may affect access.
        </p>
      </section>

      <section>
        <h2 className="font-semibold text-foreground">8. Liability</h2>
        <p>
          Nothing in these Terms limits liability that cannot be limited under law (including fraud or death/personal injury caused by negligence).
          Subject to mandatory law, we exclude indirect losses and limit liability to foreseeable direct losses arising from breach.
        </p>
      </section>

      <section>
        <h2 className="font-semibold text-foreground">9. Changes and termination</h2>
        <p>
          We may update these Terms where required by law, security, or product changes. Material changes are published in-app with a revised date.
          We may suspend or terminate access where terms are breached or misuse is detected.
        </p>
      </section>

      <section>
        <h2 className="font-semibold text-foreground">10. Governing law</h2>
        <p>
          These Terms are governed by the laws of England and Wales, unless mandatory consumer law in your country of residence provides otherwise.
        </p>
      </section>
    </LegalPageLayout>
  );
};

export default TermsPage;
