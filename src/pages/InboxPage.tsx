import AppLayout from "@/components/AppLayout";
import UnifiedChatWorkspace from "@/components/chat/UnifiedChatWorkspace";
import { useSearchParams } from "react-router-dom";

const InboxPage = () => {
  const [searchParams] = useSearchParams();
  const customerId = searchParams.get("customerId") || undefined;

  return (
    <AppLayout>
      <div className="p-4 md:p-6">
        <UnifiedChatWorkspace mode="staff" initialCustomerId={customerId} />
      </div>
    </AppLayout>
  );
};

export default InboxPage;
