import AppLayout from "@/components/AppLayout";
import SubscriptionGate from "@/components/subscription/SubscriptionGate";
import UnifiedInbox from "@/components/inbox/UnifiedInbox";
import ContactHub from "@/components/inbox/ContactHub";
import InboxUpgradePrompt from "@/components/inbox/InboxUpgradePrompt";
import { useSearchParams } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { useInboxPlan } from "@/hooks/useInboxPlan";
import { Loader2 } from "lucide-react";

const InboxPage = () => {
  const { t } = useTranslation();
  const [searchParams] = useSearchParams();
  const customerId = searchParams.get("customerId") || undefined;
  const { isLoading, hasStaffInbox, hasContactLinksOnly } = useInboxPlan();

  return (
    <AppLayout>
      <SubscriptionGate>
        <div className="p-4 md:p-6">
          <h1 className="sr-only">{t("nav.inbox")}</h1>
          {isLoading ? (
            <div className="flex justify-center py-12">
              <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
            </div>
          ) : hasStaffInbox ? (
            <UnifiedInbox highlightSenderId={customerId} />
          ) : hasContactLinksOnly ? (
            <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_18rem] lg:items-start">
              <ContactHub />
              <InboxUpgradePrompt compact />
            </div>
          ) : (
            <InboxUpgradePrompt />
          )}
        </div>
      </SubscriptionGate>
    </AppLayout>
  );
};

export default InboxPage;
