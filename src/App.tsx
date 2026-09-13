import { lazy, Suspense } from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Route, Routes } from "react-router-dom";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { AuthProvider } from "@/contexts/AuthContext";
import MarketingLayout from "@/layouts/MarketingLayout";
import DashboardLayout from "@/layouts/DashboardLayout";
import Index from "./pages/Index";
import NotFound from "./pages/NotFound";
import { RoleGuard } from "./components/RoleGuard";
import { FeatureGate } from "./components/billing/FeatureGate";

// Everything except the landing page is code-split so the first visit only
// downloads what it needs.
const AskDemo = lazy(() => import("./pages/AskDemo"));
const Insights = lazy(() => import("./pages/Insights"));
const Services = lazy(() => import("./pages/Services"));
const Pricing = lazy(() => import("./pages/Pricing"));
const About = lazy(() => import("./pages/About"));
const Contact = lazy(() => import("./pages/Contact"));
const Explore = lazy(() => import("./pages/Explore"));
const Terms = lazy(() => import("./pages/Terms"));
const Privacy = lazy(() => import("./pages/Privacy"));
const Refund = lazy(() => import("./pages/Refund"));
const DataProtection = lazy(() => import("./pages/DataProtection"));
const FeedbackPage = lazy(() => import("./pages/Feedback"));
const FeedbackInbox = lazy(() => import("./pages/dashboard/FeedbackInbox"));
const Unsubscribe = lazy(() => import("./pages/Unsubscribe"));
const Login = lazy(() => import("./pages/Login"));
const ForgotPassword = lazy(() => import("./pages/auth/ForgotPassword"));
const ResetPassword = lazy(() => import("./pages/auth/ResetPassword"));
const AuthCallback = lazy(() => import("./pages/auth/AuthCallback"));
const OAuthConsent = lazy(() => import("./pages/auth/OAuthConsent"));
const Onboarding = lazy(() => import("./pages/Onboarding"));
const SharedReport = lazy(() => import("./pages/SharedReport"));
const DashboardOverview = lazy(() => import("./pages/dashboard/Overview"));
const Projects = lazy(() => import("./pages/dashboard/Projects"));
const ProjectDetail = lazy(() => import("./pages/dashboard/ProjectDetail"));
const ProjectEditor = lazy(() => import("./pages/dashboard/ProjectEditor"));
const Alerts = lazy(() => import("./pages/dashboard/Alerts"));
const UsersPage = lazy(() => import("./pages/dashboard/Users"));
const SettingsPage = lazy(() => import("./pages/dashboard/Settings"));
const ReviewQueue = lazy(() => import("./pages/dashboard/ReviewQueue"));
const SubscriberManagement = lazy(() => import("./pages/dashboard/SubscriberManagement"));
const InsightDetail = lazy(() => import("./pages/InsightDetail"));
const InsightsManagement = lazy(() => import("./pages/dashboard/InsightsManagement"));
const GeoIntelligence = lazy(() => import("./pages/dashboard/GeoIntelligence"));
const EvidenceVerification = lazy(() => import("./pages/dashboard/EvidenceVerification"));
const AnalyticsReports = lazy(() => import("./pages/dashboard/AnalyticsReports"));
const RiskAnomalySignals = lazy(() => import("./pages/dashboard/RiskAnomalySignals"));
const AgentsHub = lazy(() => import("./pages/dashboard/AgentsHub"));
const Research = lazy(() => import("./pages/dashboard/Research"));
const Datasets = lazy(() => import("./pages/dashboard/Datasets"));
const Reports = lazy(() => import("./pages/dashboard/Reports"));
const Portfolio = lazy(() => import("./pages/dashboard/Portfolio"));
const IntelligenceSummaries = lazy(() => import("./pages/dashboard/IntelligenceSummaries"));
const Tenders = lazy(() => import("./pages/dashboard/Tenders"));
const CountryDetail = lazy(() => import("./pages/dashboard/CountryDetail"));
const TenderCalendar = lazy(() => import("./pages/dashboard/TenderCalendar"));
const PortfolioChat = lazy(() => import("./pages/dashboard/PortfolioChat"));
const StakeholderIntel = lazy(() => import("./pages/dashboard/StakeholderIntel"));
const Contractors = lazy(() => import("./pages/dashboard/Contractors"));
const BillingAuditLog = lazy(() => import("./pages/dashboard/BillingAuditLog"));
const Traction = lazy(() => import("./pages/dashboard/Traction"));
const BDPipeline = lazy(() => import("./pages/dashboard/BDPipeline"));
const Outreach = lazy(() => import("./pages/dashboard/Outreach"));
const Snapshot = lazy(() => import("./pages/Snapshot"));
const Ask = lazy(() => import("./pages/dashboard/Ask"));
import { Navigate } from "react-router-dom";
import { UtmCapture } from "./components/UtmCapture";
import { AnalyticsCapture } from "./components/AnalyticsCapture";
import { FoundingAccessProvider } from "./components/billing/FoundingAccessProvider";

const queryClient = new QueryClient();

const App = () => (
  <QueryClientProvider client={queryClient}>
    <TooltipProvider>
      <AuthProvider>
        <Toaster />
        <Sonner />
        <BrowserRouter>
          <UtmCapture />
          <AnalyticsCapture />
          <FoundingAccessProvider>
          <Suspense fallback={<div className="min-h-screen flex items-center justify-center text-sm text-muted-foreground">Loading…</div>}>
          <Routes>
            <Route element={<MarketingLayout />}>
              <Route path="/" element={<Index />} />
              <Route path="/ask-demo" element={<AskDemo />} />
              <Route path="/snapshot" element={<Snapshot />} />
              <Route path="/explore" element={<Explore />} />
              <Route path="/insights" element={<Insights />} />
              <Route path="/insights/:slug" element={<InsightDetail />} />
              <Route path="/services" element={<Services />} />
              <Route path="/pricing" element={<Pricing />} />
              <Route path="/about" element={<About />} />
              <Route path="/contact" element={<Contact />} />
              
              <Route path="/terms" element={<Terms />} />
              <Route path="/privacy" element={<Privacy />} />
              <Route path="/refund" element={<Refund />} />
              <Route path="/refund-policy" element={<Refund />} />
              <Route path="/data-protection" element={<DataProtection />} />
              <Route path="/unsubscribe" element={<Unsubscribe />} />
              <Route path="/feedback" element={<FeedbackPage />} />
            </Route>
            <Route path="/login" element={<Login />} />
            <Route path="/auth/forgot-password" element={<ForgotPassword />} />
            <Route path="/auth/reset-password" element={<ResetPassword />} />
            <Route path="/auth/callback" element={<AuthCallback />} />
            <Route path="/.lovable/oauth/consent" element={<OAuthConsent />} />
            <Route path="/onboarding" element={<Onboarding />} />
            {/* Public read-only shared report (no auth) */}
            <Route path="/r/:token" element={<SharedReport />} />
            <Route element={<DashboardLayout />}>
              <Route path="/dashboard" element={<DashboardOverview />} />
              <Route path="/dashboard/ask" element={<Ask />} />
              <Route path="/dashboard/research" element={<RoleGuard requiredRole="researcher"><Research /></RoleGuard>} />
              <Route path="/dashboard/datasets" element={<RoleGuard requiredRole="admin"><Datasets /></RoleGuard>} />
              <Route path="/dashboard/projects" element={<Projects />} />
              <Route path="/dashboard/projects/new" element={<RoleGuard requiredRole="researcher"><ProjectEditor /></RoleGuard>} />
              <Route path="/dashboard/projects/:id/edit" element={<RoleGuard requiredRole="researcher"><ProjectEditor /></RoleGuard>} />
              <Route path="/dashboard/projects/:id" element={<ProjectDetail />} />
              <Route path="/dashboard/analytics-reports" element={<FeatureGate feature="intelligence_summaries"><AnalyticsReports /></FeatureGate>} />
              <Route path="/dashboard/alerts" element={<Alerts />} />
              <Route path="/dashboard/users" element={<RoleGuard requiredRole="admin"><UsersPage /></RoleGuard>} />
              <Route path="/dashboard/settings" element={<SettingsPage />} />
              <Route path="/dashboard/review" element={<RoleGuard requiredRole="researcher"><ReviewQueue /></RoleGuard>} />
              {/* Source Health is now a Review Queue tab. Redirect keeps old links and bookmarks working. */}
              <Route path="/dashboard/source-health" element={<Navigate to="/dashboard/review?tab=source-health" replace />} />
              <Route path="/dashboard/subscribers" element={<RoleGuard requiredRole="admin"><SubscriberManagement /></RoleGuard>} />
              <Route path="/dashboard/insights" element={<RoleGuard requiredRole="researcher"><InsightsManagement /></RoleGuard>} />
              <Route path="/dashboard/geo" element={<GeoIntelligence />} />
              <Route path="/dashboard/evidence" element={<EvidenceVerification />} />
              <Route path="/dashboard/monitoring" element={<Navigate to="/dashboard/agents" replace />} />
              <Route path="/dashboard/risk" element={<Navigate to="/dashboard/projects?tab=risk" replace />} />
              <Route path="/dashboard/agents" element={<RoleGuard requiredRole="researcher"><AgentsHub /></RoleGuard>} />
              <Route path="/dashboard/agent-health" element={<Navigate to="/dashboard/agents?tab=health" replace />} />
              {/* New pages */}
              <Route path="/dashboard/portfolio" element={<Portfolio />} />
              <Route path="/dashboard/intelligence-summaries" element={<FeatureGate feature="intelligence_summaries"><IntelligenceSummaries /></FeatureGate>} />
              <Route path="/dashboard/tenders" element={<Tenders />} />
              {/* Pipeline, Compare and Countries are now Projects tabs. Redirects keep old links working. */}
              <Route path="/dashboard/countries" element={<Navigate to="/dashboard/projects?tab=countries" replace />} />
              <Route path="/dashboard/countries/:country" element={<CountryDetail />} />
              <Route path="/dashboard/compare" element={<Navigate to="/dashboard/projects?tab=compare" replace />} />
              <Route path="/dashboard/pipeline" element={<Navigate to="/dashboard/projects?tab=pipeline" replace />} />
              <Route path="/dashboard/calendar" element={<TenderCalendar />} />
              <Route path="/dashboard/chat" element={<FeatureGate feature="portfolio_chat"><PortfolioChat /></FeatureGate>} />
              <Route path="/dashboard/stakeholders" element={<StakeholderIntel />} />
              <Route path="/dashboard/contractors" element={<Contractors />} />
              <Route path="/dashboard/billing/audit" element={<BillingAuditLog />} />
              <Route path="/dashboard/traction" element={<RoleGuard requiredRole="admin"><Traction /></RoleGuard>} />
              <Route path="/dashboard/bd-pipeline" element={<RoleGuard requiredRole="admin"><BDPipeline /></RoleGuard>} />
              <Route path="/dashboard/outreach" element={<RoleGuard requiredRole="admin"><Outreach /></RoleGuard>} />
              <Route path="/dashboard/feedback" element={<RoleGuard requiredRole="admin"><FeedbackInbox /></RoleGuard>} />
              {/* Redirects for consolidated/old routes */}
              <Route path="/dashboard/digests" element={<Navigate to="/dashboard/intelligence-summaries" replace />} />
              <Route path="/dashboard/reports" element={<Reports />} />
              <Route path="/dashboard/analytics" element={<Navigate to="/dashboard/projects?tab=analytics" replace />} />
              <Route path="/dashboard/reporting" element={<Navigate to="/dashboard/projects?tab=analytics" replace />} />
              <Route path="/dashboard/satellite" element={<Navigate to="/dashboard/evidence" replace />} />
              <Route path="/dashboard/validation" element={<Navigate to="/dashboard/evidence" replace />} />
            </Route>
            <Route path="*" element={<NotFound />} />
          </Routes>
          </Suspense>
          </FoundingAccessProvider>
        </BrowserRouter>
      </AuthProvider>
    </TooltipProvider>
  </QueryClientProvider>
);

export default App;
