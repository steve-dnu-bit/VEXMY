import { lazy } from "react";
import { Navigate, Route, Routes, Outlet } from "react-router-dom";
import StaffRoute from "@/components/StaffRoute";
import AppLayout from "@/components/AppLayout";
import AuthHomeRedirect from "@/components/AuthHomeRedirect";
import { useAuth } from "@/hooks/useAuth";
import { useTranslation } from "react-i18next";
import { Loader2 } from "lucide-react";
import { CustomerShopProvider } from "@/hooks/useCustomerShop";

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
const AccountDeletionPage = lazy(() => import("@/pages/AccountDeletionPage"));
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
  const { user, loading, mfaVerificationRequired } = useAuth();
  if (loading) return <PageFallback />;
  if (!user) return <Navigate to="/auth" replace />;
  if (mfaVerificationRequired) return <Navigate to="/auth" replace />;
  return <>{children}</>;
};

const ProtectedAppShell = () => (
  <ProtectedRoute>
    <AppLayout />
  </ProtectedRoute>
);

const AuthRoute = ({ children }: { children: React.ReactNode }) => {
  const { user, loading, mfaVerificationRequired } = useAuth();
  const isRecoveryFlow =
    typeof window !== "undefined" && window.location.hash.includes("type=recovery");
  if (loading) return <PageFallback />;
  if (user && !isRecoveryFlow && !mfaVerificationRequired) return <AuthHomeRedirect />;
  return <>{children}</>;
};

const CustomerPortalShell = () => (
  <CustomerShopProvider>
    <Outlet />
  </CustomerShopProvider>
);

const MobileRootRedirect = () => {
  const { user, loading, mfaVerificationRequired } = useAuth();
  if (loading) return <PageFallback />;
  if (user && mfaVerificationRequired) return <Navigate to="/auth" replace />;
  if (user) return <AuthHomeRedirect />;
  return <Navigate to="/auth" replace />;
};

/** Staff-focused routes for the Capacitor shell (no marketing or platform admin). */
const MobileAppRoutes = () => (
  <Routes>
    <Route path="/" element={<MobileRootRedirect />} />
    <Route path="/auth" element={<AuthRoute><AuthPage /></AuthRoute>} />
    <Route path="/embed/customer-login" element={<CustomerEmbedLoginPage />} />
    <Route path="/terms" element={<TermsPage />} />
    <Route path="/privacy" element={<PrivacyPage />} />
    <Route path="/account-deletion" element={<AccountDeletionPage />} />
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
    <Route element={<ProtectedAppShell />}>
      <Route path="/settings" element={<SettingsPage />} />
      <Route path="/artist-profile-settings" element={<ArtistProfileSettingsPage />} />
      <Route path="/checkout" element={<StaffRoute><PosCheckoutPage /></StaffRoute>} />
      <Route path="/schedule" element={<StaffRoute><SchedulePage /></StaffRoute>} />
      <Route path="/inbox" element={<StaffRoute><InboxPage /></StaffRoute>} />
      <Route path="/stencil" element={<StaffRoute><StencilPage /></StaffRoute>} />
      <Route path="/clients" element={<StaffRoute><ClientsPage /></StaffRoute>} />
      <Route path="/services" element={<StaffRoute><ServicesPage /></StaffRoute>} />
      <Route path="/deposits" element={<StaffRoute><DepositsPage /></StaffRoute>} />
      <Route path="/billing" element={<StaffRoute><BillingPage /></StaffRoute>} />
      <Route path="/stock" element={<StaffRoute><StockPage /></StaffRoute>} />
      <Route path="/admin" element={<StaffRoute><AdminPage /></StaffRoute>} />
      <Route path="/dashboard" element={<StaffRoute><DashboardPage /></StaffRoute>} />
    </Route>
    <Route path="/shop-setup" element={<ProtectedRoute><ShopSetupWizardPage /></ProtectedRoute>} />
    <Route path="/customer-profile-setup" element={<ProtectedRoute><CustomerProfileSetupPage /></ProtectedRoute>} />
    {/* Marketing / platform / customer portal — not included in the mobile app shell */}
    <Route path="/pricing" element={<Navigate to="/auth" replace />} />
    <Route path="/subscribe" element={<Navigate to="/billing" replace />} />
    <Route path="/platform" element={<Navigate to="/admin" replace />} />
    <Route path="*" element={<NotFound />} />
  </Routes>
);

export default MobileAppRoutes;
