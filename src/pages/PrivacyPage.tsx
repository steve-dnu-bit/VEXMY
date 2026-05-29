import LegalPageLayout from "@/components/LegalPageLayout";
import { BRANDING } from "@/lib/branding";

const PrivacyPage = () => {
  return (
    <LegalPageLayout title="Privacy Notice (UK/EU GDPR)" lastUpdated="29 May 2026">
      <section>
        <h2 className="font-semibold text-foreground">General statement</h2>
        <p>
          {BRANDING.shopLegalName} is committed to protecting your privacy and takes its responsibilities regarding the security of customer information seriously.
          This notice explains how we use personal data and how we protect your privacy when you interact with our shop, website, and services.
        </p>
        <p>
          If you have questions, contact us at{" "}
          <a href={`mailto:${BRANDING.privacyEmail}`} className="text-primary hover:underline">
            {BRANDING.privacyEmail}
          </a>
          . For CCTV or data protection complaints, you may contact our DPO at{" "}
          <a href={`mailto:${BRANDING.dpoEmail}`} className="text-primary hover:underline">
            {BRANDING.dpoEmail}
          </a>
          .
        </p>
      </section>

      <section>
        <h2 className="font-semibold text-foreground">Data we collect</h2>
        <p>
          Depending on your interaction with us, we may collect: name, gender, date of birth, address, email, phone number, booking history,
          service notes, complaint/feedback records, payment details, cookie/device and technical usage data, social media handle (if you message us),
          and CCTV images captured at premises.
        </p>
        <p>
          Where legally required to verify age for tattooing, we may request and retain a copy of photo identification with your consent documentation.
        </p>
      </section>

      <section>
        <h2 className="font-semibold text-foreground">When we collect data</h2>
        <p>
          We collect data when you use our website or account, make a booking or purchase, contact us, enter promotions, complete surveys,
          leave reviews, engage on social media, or otherwise interact with our business.
        </p>
      </section>

      <section>
        <h2 className="font-semibold text-foreground">Lawful bases (UK GDPR / EU GDPR)</h2>
        <p>
          We rely on consent, contractual necessity, legal obligation, legitimate interests, and vital interests depending on context.
        </p>
        <p><strong className="text-foreground">Consent:</strong> e.g. newsletter opt-in and optional cookie categories.</p>
        <p><strong className="text-foreground">Contract:</strong> to provide booked services and process payments/deposits.</p>
        <p><strong className="text-foreground">Legal obligation:</strong> where required to share data for fraud/crime prevention or legal process.</p>
        <p><strong className="text-foreground">Legitimate interests:</strong> business operations, communications, service updates, and quality improvement.</p>
        <p><strong className="text-foreground">Vital interests:</strong> where needed to protect life/health in emergencies.</p>
      </section>

      <section>
        <h2 className="font-semibold text-foreground">How and why we use data</h2>
        <p>
          We use personal data to provide services, manage bookings and deposits, send required service communications, process complaints and feedback,
          improve products and systems, administer surveys and competitions, protect security, and meet legal obligations.
        </p>
        <p>
          {BRANDING.shopLegalName} does not share marketing data with third-party organizations for their own marketing. We do share data with payment
          and service providers where necessary to run transactions and operations securely.
        </p>
      </section>

      <section>
        <h2 className="font-semibold text-foreground">Cookies, pixels, and website technologies</h2>
        <p>
          Cookies and similar technologies help us run website features and remember preferences. Our cookies are not intended to contain direct
          personal identifiers. You can manage browser cookies and in-app cookie preferences.
        </p>
        <p>
          We may use email tracking pixels to understand whether emails were opened and whether your client can render text or HTML content.
        </p>
      </section>

      <section>
        <h2 className="font-semibold text-foreground">Security and retention</h2>
        <p>
          We use encryption, secure processing standards, and access controls to protect data. No internet transmission is entirely risk free,
          but we apply reasonable technical and organizational safeguards.
        </p>
        <p>
          Standard retention is at least 5 years from last visit/transaction, or longer where legal/insurance claims require this. For insurance
          and damages claims we may retain relevant data up to 21 years.
        </p>
      </section>

      <section>
        <h2 className="font-semibold text-foreground">CCTV policy summary</h2>
        <p>
          Our premises are monitored by CCTV 24/7 for prevention/detection of crime, safety, and asset protection. Cameras are placed in prominent
          areas and not in sensitive spaces. Access is restricted to authorized trained personnel.
        </p>
        <p>
          CCTV data is processed lawfully, fairly, transparently, and securely. Footage is generally stored for a minimum of 14 days and no longer
          than 1 year unless required for investigations, disciplinary proceedings, or legal evidence.
        </p>
      </section>

      <section>
        <h2 className="font-semibold text-foreground">Your rights</h2>
        <p>
          You may request access, correction, deletion (where applicable), restriction, objection, portability, and withdrawal of consent.
          You can also ask us to stop direct marketing. You may request a copy of your data by emailing{" "}
          <a href={`mailto:${BRANDING.privacyEmail}`} className="text-primary hover:underline">
            {BRANDING.privacyEmail}
          </a>
          {BRANDING.address ? (
            <> or writing to: {BRANDING.address}.</>
          ) : (
            <>.</>
          )}
        </p>
        <p>
          If we refuse a request, we will explain why. You also have the right to complain to the UK Information Commissioner's Office (ICO)
          or your local EU supervisory authority.
        </p>
      </section>

      <section>
        <h2 className="font-semibold text-foreground">Policy updates</h2>
        <p>
          We may update this notice periodically. Material changes will be posted here so you remain aware of what data we collect, how we use it,
          and when it may be disclosed.
        </p>
      </section>
    </LegalPageLayout>
  );
};

export default PrivacyPage;
