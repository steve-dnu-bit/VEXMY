import AppLayout from "@/components/AppLayout";
import SubscriptionGate from "@/components/subscription/SubscriptionGate";
import ContactHub from "@/components/inbox/ContactHub";
import StaffTicketsPanel from "@/components/tickets/StaffTicketsPanel";
import { useSearchParams } from "react-router-dom";
import { useTranslation } from "react-i18next";

const InboxPage = () => {
  const { t } = useTranslation();
  const [searchParams] = useSearchParams();
  const customerId = searchParams.get("customerId") || undefined;
  const ticketId = searchParams.get("ticketId") || undefined;

  return (
    <AppLayout>
      <SubscriptionGate>
        <div className="p-4 md:p-6 space-y-6">
          <div>
            <h1 className="font-display text-2xl font-semibold">{t("tickets.pageTitle")}</h1>
            <p className="mt-1 max-w-2xl text-sm text-muted-foreground">{t("tickets.pageSubtitle")}</p>
          </div>
          <StaffTicketsPanel highlightCustomerId={customerId} highlightTicketId={ticketId} />
          <ContactHub />
        </div>
      </SubscriptionGate>
    </AppLayout>
  );
};

export default InboxPage;
