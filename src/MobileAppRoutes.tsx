import { lazy } from "react";
import { Navigate, Route, Routes } from "react-router-dom";
import StaffRoute from "@/components/StaffRoute";
import AuthHomeRedirect from "@/components/AuthHomeRedirect";
import { useAuth } from "@/hooks/useAuth";
import { useTranslation } from "react-i18next";
import { Loader2 } from "lucide-react";
import { CustomerShopProvider } from "@/hooks/useCustomerShop";
import { Outlet } from "react-router-dom";

const AuthPage = lazy(() => import("@/pages/AuthPage"));
const SchedulePage = lazy(() => import("@/pages/SchedulePage"));
const InboxPage = lazy(() => import("@/pages/InboxPage"));
const StencilPage = lazy(() => import("@/pages/StencilPage"));
const ClientsPage = lazy(() => import("@/pages/ClientsPage"));
const ServicesPage = lazy(() => import("@/pages/ServicesPage"));
const DepositsPage = lazy(() => import("@/pages/DepositsPage"));
const BillingPage = lazy(() => import("@/pages/BillingPage"));
const StockPage = lazy(() => import("@/pages/StockPage"));
const AdminPage = lazy(() => import("@/pages/AdminPage"));
const SettingsPage = lazy(() => import("@/pages/SettingsPage"));
const ArtistProfileSettingsPage = lazy(() => import("@/pages/ArtistProfileSettingsPage"));
const ShopSetupWizardPage = lazy(() => import("@/pages/ShopSetupWizardPage"));
const CustomerProfileSetupPage = lazy(() => import("@/pages/CustomerProfileSetupPage"));
const CustomerAccountPage = lazy(() => import("@/pages/CustomerAccountPage"));
const CustomerSecurityPage = lazy(() => import("@/pages/CustomerSecurityPage"));
const CustomerTicketsPage = lazy(() => import("@/pages/CustomerTicketsPage"));
const CustomerDepositsPage = lazy(() => import("@/pages/CustomerDepositsPage"));
const DepositCheckoutPage = lazy(() => import("@/pages/DepositCheckoutPage"));
const ConsentPage = lazy(() => import("@/pages/ConsentPage"));
const TermsPage = lazy(() => import("@/pages/TermsPage"));
const PrivacyPage = lazy(() => import("@/pages/PrivacyPage"));
const CookiePolicyPage = lazy(() => import("@/pages/CookiePolicyPage"));
const CustomerEmbedLoginPage = lazy(() => import("@/pages/CustomerEmbedLoginPage"));
const DashboardPage = lazy(() => import("@/pages/DashboardPage"));
const PosCheckoutPage = lazy(() => import("@/pages/PosCheckoutPage"));
const NotFound = lazy(() => import("@/pages/NotFound"));

const PageFallback = () => {
  const { t } = useTranslation();
  return (
    <div className="flex h-screen items-center justify-center bg-background">
      <Loader2 className="h-6 w-6 animate-spin text-primary" />
      <span className="sr-only">{t("common.loading")}</span>
    </div>
  );
};

const ProtectedRoute = ({ children }: { children: React.ReactNode }) => {
  const { user, loading } = useAuth();
  if (loading) return <PageFallback />;
  if (!user) return <Navigate to="/auth" replace />;
  return <>{children}</>;
};

const AuthRoute = ({ children }: { children: React.ReactNode }) => {
  const { user, loading } = useAuth();
  const isRecoveryFlow =
    typeof window !== "undefined" && window.location.hash.includes("type=recovery");
  if (loading) return <PageFallback />;
  if (user && !isRecoveryFlow) return <AuthHomeRedirect />;
  return <>{children}</>;
};

const CustomerPortalShell = () => (
  <CustomerShopProvider>
    <Outlet />
  </CustomerShopProvider>
);

/** Staff-focused routes for the Capacitor shell (no marketing or platform admin). */
const MobileAppRoutes = () => (
  <Routes>
    <Route path="/" element={<Navigate to="/auth" replace />} />
    <Route path="/auth" element={<AuthRoute><AuthPage /></AuthRoute>} />
    <Route path="/embed/customer-login" element={<CustomerEmbedLoginPage />} />
    <Route path="/terms" element={<TermsPage />} />
    <Route path="/privacy" element={<PrivacyPage />} />
    <Route path="/cookies" element={<CookiePolicyPage />} />
    <Route element={<CustomerPortalShell />}>
      <Route path="/consent" element={<ConsentPage />} />
      <Route path="/account" element={<ProtectedRoute><CustomerAccountPage /></ProtectedRoute>} />
      <Route path="/account/security" element={<ProtectedRoute><CustomerSecurityPage /></ProtectedRoute>} />
      <Route path="/account/tickets" element={<ProtectedRoute><CustomerTicketsPage /></ProtectedRoute>} />
      <Route path="/account/contact" element={<Navigate to="/account/tickets" replace />} />
      <Route path="/account/chats" element={<Navigate to="/account/tickets" replace />} />
      <Route path="/deposit-payment" element={<ProtectedRoute><CustomerDepositsPage /></ProtectedRoute>} />
      <Route path="/deposit-payment/checkout" element={<ProtectedRoute><DepositCheckoutPage /></ProtectedRoute>} />
    </Route>
    <Route path="/checkout" element={<ProtectedRoute><StaffRoute><PosCheckoutPage /></StaffRoute></ProtectedRoute>} />
    <Route path="/schedule" element={<ProtectedRoute><StaffRoute><SchedulePage /></StaffRoute></ProtectedRoute>} />
    <Route path="/inbox" element={<ProtectedRoute><StaffRoute><InboxPage /></StaffRoute></ProtectedRoute>} />
    <Route path="/stencil" element={<ProtectedRoute><StaffRoute><StencilPage /></StaffRoute></ProtectedRoute>} />
    <Route path="/clients" element={<ProtectedRoute><StaffRoute><ClientsPage /></StaffRoute></ProtectedRoute>} />
    <Route path="/services" element={<ProtectedRoute><StaffRoute><ServicesPage /></StaffRoute></ProtectedRoute>} />
    <Route path="/deposits" element={<ProtectedRoute><StaffRoute><DepositsPage /></StaffRoute></ProtectedRoute>} />
    <Route path="/billing" element={<ProtectedRoute><StaffRoute><BillingPage /></StaffRoute></ProtectedRoute>} />
    <Route path="/stock" element={<ProtectedRoute><StaffRoute><StockPage /></StaffRoute></ProtectedRoute>} />
    <Route path="/admin" element={<ProtectedRoute><StaffRoute><AdminPage /></StaffRoute></ProtectedRoute>} />
    <Route path="/settings" element={<ProtectedRoute><SettingsPage /></ProtectedRoute>} />
    <Route path="/artist-profile-settings" element={<ProtectedRoute><ArtistProfileSettingsPage /></ProtectedRoute>} />
    <Route path="/shop-setup" element={<ProtectedRoute><ShopSetupWizardPage /></ProtectedRoute>} />
    <Route path="/customer-profile-setup" element={<ProtectedRoute><CustomerProfileSetupPage /></ProtectedRoute>} />
    <Route path="/dashboard" element={<ProtectedRoute><StaffRoute><DashboardPage /></StaffRoute></ProtectedRoute>} />
    {/* Marketing / platform / customer portal — not included in the mobile app shell */}
    <Route path="/pricing" element={<Navigate to="/auth" replace />} />
    <Route path="/subscribe" element={<Navigate to="/billing" replace />} />
    <Route path="/platform" element={<Navigate to="/admin" replace />} />
    <Route path="*" element={<NotFound />} />
  </Routes>
);

export default MobileAppRoutes;
