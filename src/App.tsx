import { lazy, Suspense } from "react";
import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route, Navigate, useLocation, Outlet } from "react-router-dom";
import { AuthProvider, useAuth } from "@/hooks/useAuth";
import { ThemeProvider } from "@/components/theme/ThemeProvider";
import { LanguageProvider } from "@/components/i18n/LanguageProvider";
import { useTranslation } from "react-i18next";
import { Loader2 } from "lucide-react";
import StaffRoute from "./components/StaffRoute";
import PlatformAdminRoute from "./components/PlatformAdminRoute";
import AuthHomeRedirect from "./components/AuthHomeRedirect";
import CookieConsentBanner from "./components/CookieConsentBanner";
import RouteErrorBoundary from "./components/RouteErrorBoundary";
import { CustomerShopProvider } from "@/hooks/useCustomerShop";
import { isNativeApp } from "@/lib/platform";
import MobileAppRoutes from "./MobileAppRoutes";

const CustomerPortalShell = () => (
  <CustomerShopProvider>
    <Outlet />
  </CustomerShopProvider>
);

const LandingPage = lazy(() => import("./pages/marketing/LandingPage"));
const AuthPage = lazy(() => import("./pages/AuthPage"));
const PricingPage = lazy(() => import("./pages/marketing/PricingPage"));
const SubscribePage = lazy(() => import("./pages/marketing/SubscribePage"));
const SubscribeSuccessPage = lazy(() => import("./pages/marketing/SubscribeSuccessPage"));
const ContactPage = lazy(() => import("./pages/marketing/ContactPage"));
const DownloadPage = lazy(() => import("./pages/marketing/DownloadPage"));
const DocsPage = lazy(() => import("./pages/docs/DocsPage"));
const SchedulePage = lazy(() => import("./pages/SchedulePage"));
const InboxPage = lazy(() => import("./pages/InboxPage"));
const StencilPage = lazy(() => import("./pages/StencilPage"));
const ClientsPage = lazy(() => import("./pages/ClientsPage"));
const DashboardPage = lazy(() => import("./pages/DashboardPage"));
const ServicesPage = lazy(() => import("./pages/ServicesPage"));
const DepositsPage = lazy(() => import("./pages/DepositsPage"));
const BillingPage = lazy(() => import("./pages/BillingPage"));
const StockPage = lazy(() => import("./pages/StockPage"));
const AdminPage = lazy(() => import("./pages/AdminPage"));
const PlatformAdminPage = lazy(() => import("./pages/PlatformAdminPage"));
const SettingsPage = lazy(() => import("./pages/SettingsPage"));
const ArtistProfileSettingsPage = lazy(() => import("./pages/ArtistProfileSettingsPage"));
const ShopSetupWizardPage = lazy(() => import("./pages/ShopSetupWizardPage"));
const CustomerProfileSetupPage = lazy(() => import("./pages/CustomerProfileSetupPage"));
const CustomerSecurityPage = lazy(() => import("./pages/CustomerSecurityPage"));
const NotFound = lazy(() => import("./pages/NotFound"));
const ConsentPage = lazy(() => import("./pages/ConsentPage"));
const CustomerAccountPage = lazy(() => import("./pages/CustomerAccountPage"));
const CustomerTicketsPage = lazy(() => import("./pages/CustomerTicketsPage"));
const DepositCheckoutPage = lazy(() => import("./pages/DepositCheckoutPage"));
const CustomerDepositsPage = lazy(() => import("./pages/CustomerDepositsPage"));
const TermsPage = lazy(() => import("./pages/TermsPage"));
const PrivacyPage = lazy(() => import("./pages/PrivacyPage"));
const CookiePolicyPage = lazy(() => import("./pages/CookiePolicyPage"));
const CustomerEmbedLoginPage = lazy(() => import("./pages/CustomerEmbedLoginPage"));
const PosCheckoutPage = lazy(() => import("./pages/PosCheckoutPage"));

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 5 * 60_000,
      refetchOnWindowFocus: false,
      refetchOnReconnect: false,
    },
  },
});

const PageFallback = () => {
  const { t } = useTranslation();
  return (
    <div className="flex h-screen items-center justify-center bg-background">
      <Loader2 className="h-6 w-6 animate-spin text-primary" />
      <span className="sr-only">{t("common.loading")}</span>
    </div>
  );
};

const AppErrorBoundary = ({ children }: { children: React.ReactNode }) => {
  const { t } = useTranslation();
  return <RouteErrorBoundary label={t("common.appName")}>{children}</RouteErrorBoundary>;
};

const ProtectedRoute = ({ children }: { children: React.ReactNode }) => {
  const { user, loading } = useAuth();
  if (loading) return <PageFallback />;
  if (!user) return <Navigate to="/auth" replace />;
  return <>{children}</>;
};

const AuthRoute = ({ children }: { children: React.ReactNode }) => {
  const { user, loading } = useAuth();
  const location = useLocation();
  const isRecoveryFlow =
    new URLSearchParams(location.search).get("mode") === "recovery" ||
    (typeof window !== "undefined" && window.location.hash.includes("type=recovery"));
  if (loading) return <PageFallback />;
  if (user && !isRecoveryFlow) return <AuthHomeRedirect />;
  return <>{children}</>;
};

const LegacyDepositCheckoutRedirect = () => {
  const { search } = useLocation();
  return <Navigate to={`/deposit-payment/checkout${search}`} replace />;
};

const App = () => (
  <QueryClientProvider client={queryClient}>
    <AuthProvider>
      <LanguageProvider>
      <ThemeProvider>
        <TooltipProvider>
          <Toaster />
          <Sonner />
          <BrowserRouter>
            <AppErrorBoundary>
              <Suspense fallback={<PageFallback />}>
                {isNativeApp() ? (
                  <MobileAppRoutes />
                ) : (
                <Routes>
                <Route path="/" element={<LandingPage />} />
                <Route path="/pricing" element={<PricingPage />} />
                <Route path="/subscribe" element={<SubscribePage />} />
                <Route path="/subscribe/success" element={<SubscribeSuccessPage />} />
                <Route path="/contact" element={<ContactPage />} />
                <Route path="/download" element={<DownloadPage />} />
                <Route path="/docs" element={<DocsPage />} />
                <Route path="/docs/:slug" element={<DocsPage />} />
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
                <Route path="/auth" element={<AuthRoute><AuthPage /></AuthRoute>} />
                <Route path="/embed/customer-login" element={<CustomerEmbedLoginPage />} />
                <Route path="/deposit-checkout" element={<ProtectedRoute><LegacyDepositCheckoutRedirect /></ProtectedRoute>} />
                <Route path="/schedule" element={<ProtectedRoute><StaffRoute><SchedulePage /></StaffRoute></ProtectedRoute>} />
                <Route path="/inbox" element={<ProtectedRoute><StaffRoute><InboxPage /></StaffRoute></ProtectedRoute>} />
                <Route path="/stencil" element={<ProtectedRoute><StaffRoute><StencilPage /></StaffRoute></ProtectedRoute>} />
                <Route path="/clients" element={<ProtectedRoute><StaffRoute><ClientsPage /></StaffRoute></ProtectedRoute>} />
                <Route path="/services" element={<ProtectedRoute><StaffRoute><ServicesPage /></StaffRoute></ProtectedRoute>} />
                <Route path="/deposits" element={<ProtectedRoute><StaffRoute><DepositsPage /></StaffRoute></ProtectedRoute>} />
                <Route path="/billing" element={<ProtectedRoute><StaffRoute><BillingPage /></StaffRoute></ProtectedRoute>} />
                <Route path="/checkout" element={<ProtectedRoute><StaffRoute><PosCheckoutPage /></StaffRoute></ProtectedRoute>} />
                <Route path="/stock" element={<ProtectedRoute><StaffRoute><StockPage /></StaffRoute></ProtectedRoute>} />
                <Route path="/admin" element={<ProtectedRoute><StaffRoute><AdminPage /></StaffRoute></ProtectedRoute>} />
                <Route path="/platform" element={<ProtectedRoute><PlatformAdminRoute><PlatformAdminPage /></PlatformAdminRoute></ProtectedRoute>} />
                <Route path="/settings" element={<ProtectedRoute><SettingsPage /></ProtectedRoute>} />
                <Route path="/artist-profile-settings" element={<ProtectedRoute><ArtistProfileSettingsPage /></ProtectedRoute>} />
                <Route path="/shop-setup" element={<ProtectedRoute><ShopSetupWizardPage /></ProtectedRoute>} />
                <Route path="/customer-profile-setup" element={<ProtectedRoute><CustomerProfileSetupPage /></ProtectedRoute>} />
                <Route path="/dashboard" element={<ProtectedRoute><StaffRoute><DashboardPage /></StaffRoute></ProtectedRoute>} />
                <Route path="*" element={<NotFound />} />
              </Routes>
                )}
              </Suspense>
            </AppErrorBoundary>
            {!isNativeApp() ? <CookieConsentBanner /> : null}
          </BrowserRouter>
        </TooltipProvider>
      </ThemeProvider>
      </LanguageProvider>
    </AuthProvider>
  </QueryClientProvider>
);

export default App;
