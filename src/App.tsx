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
import Insights from "./pages/Insights";
import Services from "./pages/Services";
import Pricing from "./pages/Pricing";
import About from "./pages/About";
import Contact from "./pages/Contact";
import Explore from "./pages/Explore";

import Terms from "./pages/Terms";
import Privacy from "./pages/Privacy";
import Refund from "./pages/Refund";
import DataProtection from "./pages/DataProtection";
import Careers from "./pages/Careers";
import Press from "./pages/Press";
import FeedbackPage from "./pages/Feedback";
import FeedbackInbox from "./pages/dashboard/FeedbackInbox";
import Unsubscribe from "./pages/Unsubscribe";
import Login from "./pages/Login";
import ForgotPassword from "./pages/auth/ForgotPassword";
import ResetPassword from "./pages/auth/ResetPassword";
import AuthCallback from "./pages/auth/AuthCallback";
import Onboarding from "./pages/Onboarding";
import DashboardOverview from "./pages/dashboard/Overview";
import Projects from "./pages/dashboard/Projects";
import ProjectDetail from "./pages/dashboard/ProjectDetail";
import ProjectEditor from "./pages/dashboard/ProjectEditor";
import Alerts from "./pages/dashboard/Alerts";
import UsersPage from "./pages/dashboard/Users";
import SettingsPage from "./pages/dashboard/Settings";
import { RoleGuard } from "./components/RoleGuard";
import { FeatureGate } from "./components/billing/FeatureGate";
import ReviewQueue from "./pages/dashboard/ReviewQueue";
import SubscriberManagement from "./pages/dashboard/SubscriberManagement";
import InsightDetail from "./pages/InsightDetail";
import InsightsManagement from "./pages/dashboard/InsightsManagement";
import GeoIntelligence from "./pages/dashboard/GeoIntelligence";
import EvidenceVerification from "./pages/dashboard/EvidenceVerification";
import AnalyticsReports from "./pages/dashboard/AnalyticsReports";
import RealTimeMonitoring from "./pages/dashboard/RealTimeMonitoring";
import RiskAnomalySignals from "./pages/dashboard/RiskAnomalySignals";
import AgentMonitoring from "./pages/dashboard/AgentMonitoring";
import Research from "./pages/dashboard/Research";
import Digests from "./pages/dashboard/Digests";
import Datasets from "./pages/dashboard/Datasets";
import Reports from "./pages/dashboard/Reports";
import Portfolio from "./pages/dashboard/Portfolio";
import IntelligenceSummaries from "./pages/dashboard/IntelligenceSummaries";
import Tenders from "./pages/dashboard/Tenders";
import Countries from "./pages/dashboard/Countries";
import CountryDetail from "./pages/dashboard/CountryDetail";
import Compare from "./pages/dashboard/Compare";
import Pipeline from "./pages/dashboard/Pipeline";
import TenderCalendar from "./pages/dashboard/TenderCalendar";
import PortfolioChat from "./pages/dashboard/PortfolioChat";
import StakeholderIntel from "./pages/dashboard/StakeholderIntel";
import BillingAuditLog from "./pages/dashboard/BillingAuditLog";
import Traction from "./pages/dashboard/Traction";
import BDPipeline from "./pages/dashboard/BDPipeline";
import Snapshot from "./pages/Snapshot";
import Ask from "./pages/dashboard/Ask";
import { Navigate } from "react-router-dom";
import { UtmCapture } from "./components/UtmCapture";
import { AnalyticsCapture } from "./components/AnalyticsCapture";

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
          <Routes>
            <Route element={<MarketingLayout />}>
              <Route path="/" element={<Index />} />
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
              <Route path="/careers" element={<Careers />} />
              <Route path="/press" element={<Press />} />
              <Route path="/unsubscribe" element={<Unsubscribe />} />
              <Route path="/feedback" element={<FeedbackPage />} />
            </Route>
            <Route path="/login" element={<Login />} />
            <Route path="/auth/forgot-password" element={<ForgotPassword />} />
            <Route path="/auth/reset-password" element={<ResetPassword />} />
            <Route path="/auth/callback" element={<AuthCallback />} />
            <Route path="/onboarding" element={<Onboarding />} />
            <Route element={<DashboardLayout />}>
              <Route path="/dashboard" element={<DashboardOverview />} />
              <Route path="/dashboard/ask" element={<Ask />} />
              <Route path="/dashboard/research" element={<RoleGuard requiredRole="researcher"><Research /></RoleGuard>} />
              <Route path="/dashboard/digests" element={<RoleGuard requiredRole="researcher"><Digests /></RoleGuard>} />
              <Route path="/dashboard/datasets" element={<RoleGuard requiredRole="admin"><Datasets /></RoleGuard>} />
              <Route path="/dashboard/reports" element={<RoleGuard requiredRole="researcher"><Reports /></RoleGuard>} />
              <Route path="/dashboard/projects" element={<Projects />} />
              <Route path="/dashboard/projects/new" element={<RoleGuard requiredRole="researcher"><ProjectEditor /></RoleGuard>} />
              <Route path="/dashboard/projects/:id/edit" element={<RoleGuard requiredRole="researcher"><ProjectEditor /></RoleGuard>} />
              <Route path="/dashboard/projects/:id" element={<ProjectDetail />} />
              <Route path="/dashboard/analytics-reports" element={<AnalyticsReports />} />
              <Route path="/dashboard/alerts" element={<Alerts />} />
              <Route path="/dashboard/users" element={<RoleGuard requiredRole="admin"><UsersPage /></RoleGuard>} />
              <Route path="/dashboard/settings" element={<SettingsPage />} />
              <Route path="/dashboard/review" element={<RoleGuard requiredRole="researcher"><ReviewQueue /></RoleGuard>} />
              <Route path="/dashboard/subscribers" element={<RoleGuard requiredRole="admin"><SubscriberManagement /></RoleGuard>} />
              <Route path="/dashboard/insights" element={<RoleGuard requiredRole="researcher"><InsightsManagement /></RoleGuard>} />
              <Route path="/dashboard/geo" element={<GeoIntelligence />} />
              <Route path="/dashboard/evidence" element={<EvidenceVerification />} />
              <Route path="/dashboard/monitoring" element={<Navigate to="/dashboard/agents" replace />} />
              <Route path="/dashboard/risk" element={<Navigate to="/dashboard/projects?tab=risk" replace />} />
              <Route path="/dashboard/agents" element={<RoleGuard requiredRole="researcher"><AgentMonitoring /></RoleGuard>} />
              {/* New pages */}
              <Route path="/dashboard/portfolio" element={<Portfolio />} />
              <Route path="/dashboard/intelligence-summaries" element={<RoleGuard requiredRole="researcher"><IntelligenceSummaries /></RoleGuard>} />
              <Route path="/dashboard/tenders" element={<FeatureGate feature="tender_intelligence"><Tenders /></FeatureGate>} />
              <Route path="/dashboard/countries" element={<FeatureGate feature="country_intelligence"><Countries /></FeatureGate>} />
              <Route path="/dashboard/countries/:country" element={<FeatureGate feature="country_intelligence"><CountryDetail /></FeatureGate>} />
              <Route path="/dashboard/compare" element={<FeatureGate feature="compare_projects"><Compare /></FeatureGate>} />
              <Route path="/dashboard/pipeline" element={<FeatureGate feature="pipeline_view"><Pipeline /></FeatureGate>} />
              <Route path="/dashboard/calendar" element={<FeatureGate feature="tender_calendar"><TenderCalendar /></FeatureGate>} />
              <Route path="/dashboard/chat" element={<FeatureGate feature="portfolio_chat"><PortfolioChat /></FeatureGate>} />
              <Route path="/dashboard/stakeholders" element={<FeatureGate feature="stakeholder_intel"><StakeholderIntel /></FeatureGate>} />
              <Route path="/dashboard/billing/audit" element={<BillingAuditLog />} />
              <Route path="/dashboard/traction" element={<RoleGuard requiredRole="admin"><Traction /></RoleGuard>} />
              <Route path="/dashboard/bd-pipeline" element={<RoleGuard requiredRole="admin"><BDPipeline /></RoleGuard>} />
              <Route path="/dashboard/feedback" element={<RoleGuard requiredRole="admin"><FeedbackInbox /></RoleGuard>} />
              {/* Redirects for consolidated/old routes */}
              <Route path="/dashboard/analytics-reports" element={<Navigate to="/dashboard/projects?tab=analytics" replace />} />
              <Route path="/dashboard/digests" element={<Navigate to="/dashboard/intelligence-summaries" replace />} />
              <Route path="/dashboard/reports" element={<Navigate to="/dashboard/intelligence-summaries" replace />} />
              <Route path="/dashboard/analytics" element={<Navigate to="/dashboard/projects?tab=analytics" replace />} />
              <Route path="/dashboard/reporting" element={<Navigate to="/dashboard/projects?tab=analytics" replace />} />
              <Route path="/dashboard/satellite" element={<Navigate to="/dashboard/evidence" replace />} />
              <Route path="/dashboard/validation" element={<Navigate to="/dashboard/evidence" replace />} />
            </Route>
            <Route path="*" element={<NotFound />} />
          </Routes>
        </BrowserRouter>
      </AuthProvider>
    </TooltipProvider>
  </QueryClientProvider>
);

export default App;
