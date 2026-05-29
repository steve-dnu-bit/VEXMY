import LegalPageLayout from "@/components/LegalPageLayout";

const CookiePolicyPage = () => {
  return (
    <LegalPageLayout title="Cookie Policy" lastUpdated="04 May 2026">
      <section>
        <h2 className="font-semibold text-foreground">1. What cookies are</h2>
        <p>
          Cookies are small text files stored on your device. We also use similar technologies (such as local storage) where needed for
          application functionality and user preferences.
        </p>
      </section>

      <section>
        <h2 className="font-semibold text-foreground">2. Cookie categories we use</h2>
        <p>
          <strong className="text-foreground">Strictly necessary:</strong> required for authentication, security, session handling, and core features.
          <br />
          <strong className="text-foreground">Preferences:</strong> store UI and usability choices.
          <br />
          <strong className="text-foreground">Analytics:</strong> help us understand performance and usage trends.
          <br />
          <strong className="text-foreground">Marketing:</strong> support campaign effectiveness and tailored promotion.
        </p>
      </section>

      <section>
        <h2 className="font-semibold text-foreground">3. Consent model</h2>
        <p>
          Strictly necessary technologies are always active. Optional categories (preferences, analytics, marketing) are activated only after
          your consent and can be changed any time from the cookie preferences interface.
        </p>
      </section>

      <section>
        <h2 className="font-semibold text-foreground">4. Third-party services</h2>
        <p>
          Some integrated providers may set their own cookies or similar identifiers when their functionality is used. Their privacy/cookie terms
          apply in addition to this policy.
        </p>
      </section>

      <section>
        <h2 className="font-semibold text-foreground">Email pixels</h2>
        <p>
          We may include tracking pixels in certain emails to understand engagement (for example, whether an email was opened) and content rendering
          capability (text vs HTML). This helps us improve communication quality and relevance.
        </p>
      </section>

      <section>
        <h2 className="font-semibold text-foreground">5. How to manage cookies</h2>
        <p>
          You can accept all, reject non-essential, or set granular choices in-app. You can also configure your browser to block cookies, but
          this may impact core features such as sign-in or secure session handling.
        </p>
      </section>

      <section>
        <h2 className="font-semibold text-foreground">6. Updates</h2>
        <p>
          We may update this policy to reflect legal, technical, or product changes. The latest version and update date are always published here.
        </p>
      </section>
    </LegalPageLayout>
  );
};

export default CookiePolicyPage;
