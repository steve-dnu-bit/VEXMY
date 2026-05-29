import CustomerLayout from "@/components/CustomerLayout";
import UnifiedChatWorkspace from "@/components/chat/UnifiedChatWorkspace";

const CustomerChatsPage = () => {
  return (
    <CustomerLayout>
      <div className="space-y-3">
        <div>
          <h1 className="font-display text-2xl font-bold text-gradient-gold">Messages</h1>
          <p className="text-sm text-muted-foreground">Chat securely with any artist and share reference images.</p>
        </div>
        <UnifiedChatWorkspace mode="customer" />
      </div>
    </CustomerLayout>
  );
};

export default CustomerChatsPage;
