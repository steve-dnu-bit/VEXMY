import { lazy, Suspense } from "react";
import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route, Navigate, useLocation } from "react-router-dom";
import { AuthProvider, useAuth } from "@/hooks/useAuth";
import { ThemeProvider } from "@/components/theme/ThemeProvider";
import { Loader2 } from "lucide-react";
import StaffRoute from "./components/StaffRoute";
import AuthHomeRedirect from "./components/AuthHomeRedirect";
import CookieConsentBanner from "./components/CookieConsentBanner";

const AuthPage = lazy(() => import("./pages/AuthPage"));
const LandingPage = lazy(() => import("./pages/marketing/LandingPage"));
const PricingPage = lazy(() => import("./pages/marketing/PricingPage"));
const SubscribePage = lazy(() => import("./pages/marketing/SubscribePage"));
const SubscribeSuccessPage = lazy(() => import("./pages/marketing/SubscribeSuccessPage"));
const ContactPage = lazy(() => import("./pages/marketing/ContactPage"));
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
const SettingsPage = lazy(() => import("./pages/SettingsPage"));
const ArtistProfileSettingsPage = lazy(() => import("./pages/ArtistProfileSettingsPage"));
const CustomerProfileSetupPage = lazy(() => import("./pages/CustomerProfileSetupPage"));
const CustomerSecurityPage = lazy(() => import("./pages/CustomerSecurityPage"));
const NotFound = lazy(() => import("./pages/NotFound"));
const ConsentPage = lazy(() => import("./pages/ConsentPage"));
const CustomerAccountPage = lazy(() => import("./pages/CustomerAccountPage"));
const CustomerChatsPage = lazy(() => import("./pages/CustomerChatsPage"));
const DepositCheckoutPage = lazy(() => import("./pages/DepositCheckoutPage"));
const CustomerDepositsPage = lazy(() => import("./pages/CustomerDepositsPage"));
const TermsPage = lazy(() => import("./pages/TermsPage"));
const PrivacyPage = lazy(() => import("./pages/PrivacyPage"));
const CookiePolicyPage = lazy(() => import("./pages/CookiePolicyPage"));

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 30_000,
      refetchOnWindowFocus: false,
    },
  },
});

const PageFallback = () => (
  <div className="flex h-screen items-center justify-center bg-background">
    <Loader2 className="h-6 w-6 animate-spin text-primary" />
  </div>
);

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
      <ThemeProvider>
        <TooltipProvider>
          <Toaster />
          <Sonner />
          <BrowserRouter>
            <Suspense fallback={<PageFallback />}>
              <Routes>
                <Route path="/" element={<LandingPage />} />
                <Route path="/pricing" element={<PricingPage />} />
                <Route path="/subscribe" element={<SubscribePage />} />
                <Route path="/subscribe/success" element={<SubscribeSuccessPage />} />
                <Route path="/contact" element={<ContactPage />} />
                <Route path="/docs" element={<DocsPage />} />
                <Route path="/docs/:slug" element={<DocsPage />} />
                <Route path="/terms" element={<TermsPage />} />
                <Route path="/privacy" element={<PrivacyPage />} />
                <Route path="/cookies" element={<CookiePolicyPage />} />
                <Route path="/consent" element={<ConsentPage />} />
                <Route path="/auth" element={<AuthRoute><AuthPage /></AuthRoute>} />
                <Route path="/account" element={<ProtectedRoute><CustomerAccountPage /></ProtectedRoute>} />
                <Route path="/account/security" element={<ProtectedRoute><CustomerSecurityPage /></ProtectedRoute>} />
                <Route path="/account/chats" element={<ProtectedRoute><CustomerChatsPage /></ProtectedRoute>} />
                <Route path="/deposit-payment" element={<ProtectedRoute><CustomerDepositsPage /></ProtectedRoute>} />
                <Route path="/deposit-payment/checkout" element={<ProtectedRoute><DepositCheckoutPage /></ProtectedRoute>} />
                <Route path="/deposit-checkout" element={<ProtectedRoute><LegacyDepositCheckoutRedirect /></ProtectedRoute>} />
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
                <Route path="/customer-profile-setup" element={<ProtectedRoute><CustomerProfileSetupPage /></ProtectedRoute>} />
                <Route path="/dashboard" element={<ProtectedRoute><StaffRoute><DashboardPage /></StaffRoute></ProtectedRoute>} />
                <Route path="*" element={<NotFound />} />
              </Routes>
            </Suspense>
            <CookieConsentBanner />
          </BrowserRouter>
        </TooltipProvider>
      </ThemeProvider>
    </AuthProvider>
  </QueryClientProvider>
);

export default App;
