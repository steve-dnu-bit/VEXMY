import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import { useSearchParams } from "react-router-dom";
import { useAuth } from "@/hooks/useAuth";
import {
  type CustomerShop,
  loadCustomerShops,
  readStoredCustomerShopOrg,
  writeStoredCustomerShopOrg,
} from "@/lib/customerShops";

type CustomerShopContextValue = {
  shops: CustomerShop[];
  selectedOrgId: string | null;
  selectedShop: CustomerShop | null;
  hasMultipleShops: boolean;
  loading: boolean;
  setSelectedOrgId: (orgId: string) => void;
};

const CustomerShopContext = createContext<CustomerShopContextValue | undefined>(undefined);

export function CustomerShopProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth();
  const [searchParams, setSearchParams] = useSearchParams();
  const [shops, setShops] = useState<CustomerShop[]>([]);
  const [selectedOrgId, setSelectedOrgIdState] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!user) {
      setShops([]);
      setSelectedOrgIdState(null);
      setLoading(false);
      return;
    }

    let cancelled = false;
    setLoading(true);

    void loadCustomerShops(user.id, user.email).then((loaded) => {
      if (cancelled) return;

      setShops(loaded);

      const fromUrl = searchParams.get("shopOrg")?.trim() || null;
      const fromStorage = readStoredCustomerShopOrg();
      const embedShopName = searchParams.get("shop")?.trim().toLowerCase() || null;
      const fromEmbed =
        embedShopName != null
          ? loaded.find((s) => s.shopName.trim().toLowerCase() === embedShopName)?.organizationId ?? null
          : null;

      const pick =
        (fromUrl && loaded.some((s) => s.organizationId === fromUrl) ? fromUrl : null) ??
        (fromStorage && loaded.some((s) => s.organizationId === fromStorage) ? fromStorage : null) ??
        fromEmbed ??
        loaded[0]?.organizationId ??
        null;

      setSelectedOrgIdState(pick);
      if (pick) writeStoredCustomerShopOrg(pick);
      setLoading(false);
    });

    return () => {
      cancelled = true;
    };
  }, [user?.id, user?.email]);

  const setSelectedOrgId = useCallback(
    (orgId: string) => {
      if (!shops.some((s) => s.organizationId === orgId)) return;
      setSelectedOrgIdState(orgId);
      writeStoredCustomerShopOrg(orgId);
      setSearchParams(
        (prev) => {
          const next = new URLSearchParams(prev);
          next.set("shopOrg", orgId);
          return next;
        },
        { replace: true },
      );
    },
    [shops, setSearchParams],
  );

  const selectedShop = useMemo(
    () => shops.find((s) => s.organizationId === selectedOrgId) ?? shops[0] ?? null,
    [shops, selectedOrgId],
  );

  const value = useMemo(
    () => ({
      shops,
      selectedOrgId: selectedShop?.organizationId ?? null,
      selectedShop,
      hasMultipleShops: shops.length > 1,
      loading,
      setSelectedOrgId,
    }),
    [shops, selectedShop, loading, setSelectedOrgId],
  );

  return <CustomerShopContext.Provider value={value}>{children}</CustomerShopContext.Provider>;
}

export function useCustomerShop(): CustomerShopContextValue {
  const ctx = useContext(CustomerShopContext);
  if (!ctx) {
    return {
      shops: [],
      selectedOrgId: null,
      selectedShop: null,
      hasMultipleShops: false,
      loading: false,
      setSelectedOrgId: () => {},
    };
  }
  return ctx;
}
