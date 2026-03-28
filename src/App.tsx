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

import Terms from "./pages/Terms";
import Privacy from "./pages/Privacy";
import DataProtection from "./pages/DataProtection";
import Careers from "./pages/Careers";
import Press from "./pages/Press";
import Login from "./pages/Login";
import Onboarding from "./pages/Onboarding";
import DashboardOverview from "./pages/dashboard/Overview";
import Projects from "./pages/dashboard/Projects";
import ProjectDetail from "./pages/dashboard/ProjectDetail";
import ProjectEditor from "./pages/dashboard/ProjectEditor";
import Alerts from "./pages/dashboard/Alerts";
import UsersPage from "./pages/dashboard/Users";
import SettingsPage from "./pages/dashboard/Settings";
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
import { Navigate } from "react-router-dom";

const queryClient = new QueryClient();

const App = () => (
  <QueryClientProvider client={queryClient}>
    <TooltipProvider>
      <AuthProvider>
        <Toaster />
        <Sonner />
        <BrowserRouter>
          <Routes>
            <Route element={<MarketingLayout />}>
              <Route path="/" element={<Index />} />
              <Route path="/insights" element={<Insights />} />
              <Route path="/insights/:slug" element={<InsightDetail />} />
              <Route path="/services" element={<Services />} />
              <Route path="/pricing" element={<Pricing />} />
              <Route path="/about" element={<About />} />
              <Route path="/contact" element={<Contact />} />
              <Route path="/waitlist" element={<Waitlist />} />
              <Route path="/terms" element={<Terms />} />
              <Route path="/privacy" element={<Privacy />} />
              <Route path="/data-protection" element={<DataProtection />} />
              <Route path="/careers" element={<Careers />} />
              <Route path="/press" element={<Press />} />
            </Route>
            <Route path="/login" element={<Login />} />
            <Route path="/onboarding" element={<Onboarding />} />
            <Route element={<DashboardLayout />}>
              <Route path="/dashboard" element={<DashboardOverview />} />
              <Route path="/dashboard/research" element={<Research />} />
              <Route path="/dashboard/projects" element={<Projects />} />
              <Route path="/dashboard/projects/new" element={<ProjectEditor />} />
              <Route path="/dashboard/projects/:id/edit" element={<ProjectEditor />} />
              <Route path="/dashboard/projects/:id" element={<ProjectDetail />} />
              <Route path="/dashboard/analytics-reports" element={<AnalyticsReports />} />
              <Route path="/dashboard/alerts" element={<Alerts />} />
              <Route path="/dashboard/users" element={<UsersPage />} />
              <Route path="/dashboard/settings" element={<SettingsPage />} />
              <Route path="/dashboard/review" element={<ReviewQueue />} />
              <Route path="/dashboard/waitlist" element={<WaitlistSubmissions />} />
              <Route path="/dashboard/insights" element={<InsightsManagement />} />
              <Route path="/dashboard/geo" element={<GeoIntelligence />} />
              <Route path="/dashboard/evidence" element={<EvidenceVerification />} />
              <Route path="/dashboard/monitoring" element={<RealTimeMonitoring />} />
              <Route path="/dashboard/risk" element={<RiskAnomalySignals />} />
              <Route path="/dashboard/agents" element={<AgentMonitoring />} />
              {/* Redirects for old routes */}
              <Route path="/dashboard/analytics" element={<Navigate to="/dashboard/analytics-reports" replace />} />
              <Route path="/dashboard/reporting" element={<Navigate to="/dashboard/analytics-reports" replace />} />
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
