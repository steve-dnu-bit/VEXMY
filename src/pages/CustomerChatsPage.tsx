import CustomerLayout from "@/components/CustomerLayout";
import ExternalMessageActions from "@/components/messaging/ExternalMessageActions";
import { useCustomerShop } from "@/hooks/useCustomerShop";
import { useTranslation } from "react-i18next";
import { supabase } from "@/integrations/supabase/client";
import { useEffect, useState } from "react";

const CustomerContactPage = () => {
  const { t } = useTranslation();
  const { selectedOrgId } = useCustomerShop();
  const [contact, setContact] = useState<{ phone: string | null; email: string | null; instagram: string | null }>({
    phone: null,
    email: null,
    instagram: null,
  });

  useEffect(() => {
    void (async () => {
      if (!selectedOrgId) return;
      const { data: shop } = await supabase
        .from("shop_settings" as any)
        .select("support_email, phone")
        .eq("organization_id", selectedOrgId)
        .maybeSingle();
      setContact({
        phone: (shop as any)?.phone ?? null,
        email: (shop as any)?.support_email ?? null,
        instagram: null,
      });
    })();
  }, [selectedOrgId]);

  return (
    <CustomerLayout>
      <div className="space-y-4 max-w-lg">
        <div>
          <h1 className="font-display text-2xl font-bold text-gold">{t("customer.contactStudio")}</h1>
          <p className="text-sm text-muted-foreground mt-1">{t("customer.contactStudioDesc")}</p>
        </div>
        <ExternalMessageActions phone={contact.phone} instagramHandle={contact.instagram} layout="column" />
        {contact.email ? (
          <p className="text-sm text-muted-foreground">
            {t("customer.emailStudio", { defaultValue: "Email" })}:{" "}
            <a href={`mailto:${contact.email}`} className="text-gold hover:underline">
              {contact.email}
            </a>
          </p>
        ) : null}
      </div>
    </CustomerLayout>
  );
};

export default CustomerContactPage;
