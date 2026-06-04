import CustomerLayout from "@/components/CustomerLayout";
import UnifiedChatWorkspace from "@/components/chat/UnifiedChatWorkspace";
import { useTranslation } from "react-i18next";

const CustomerChatsPage = () => {
  const { t } = useTranslation();
  return (
    <CustomerLayout>
      <div className="space-y-3">
        <div>
          <h1 className="font-display text-2xl font-bold text-gold">{t("customer.messages")}</h1>
          <p className="text-sm text-muted-foreground">{t("customer.messagesDesc", { defaultValue: "Chat securely with any artist and share reference images." })}</p>
        </div>
        <UnifiedChatWorkspace mode="customer" />
      </div>
    </CustomerLayout>
  );
};

export default CustomerChatsPage;
