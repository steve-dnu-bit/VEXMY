import AppLayout from "@/components/AppLayout";
import UnifiedChatWorkspace from "@/components/chat/UnifiedChatWorkspace";
import SubscriptionGate from "@/components/subscription/SubscriptionGate";
import { useSearchParams } from "react-router-dom";
import { useTranslation } from "react-i18next";

const InboxPage = () => {
  const { t } = useTranslation();
  const [searchParams] = useSearchParams();
  const customerId = searchParams.get("customerId") || undefined;

  return (
    <AppLayout>
      <SubscriptionGate>
        <div className="p-4 md:p-6">
          <h1 className="sr-only">{t("nav.inbox")}</h1>
          <UnifiedChatWorkspace mode="staff" initialCustomerId={customerId} />
        </div>
      </SubscriptionGate>
    </AppLayout>
  );
};

export default InboxPage;
