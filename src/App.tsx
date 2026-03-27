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
import Waitlist from "./pages/Waitlist";
import Terms from "./pages/Terms";
import Privacy from "./pages/Privacy";
import DataProtection from "./pages/DataProtection";
import Careers from "./pages/Careers";
import Press from "./pages/Press";
import Login from "./pages/Login";
import DashboardOverview from "./pages/dashboard/Overview";
import Projects from "./pages/dashboard/Projects";
import ProjectDetail from "./pages/dashboard/ProjectDetail";
import Analytics from "./pages/dashboard/Analytics";
import Alerts from "./pages/dashboard/Alerts";
import UsersPage from "./pages/dashboard/Users";
import SettingsPage from "./pages/dashboard/Settings";
import ReviewQueue from "./pages/dashboard/ReviewQueue";
import WaitlistSubmissions from "./pages/dashboard/WaitlistSubmissions";
import InsightDetail from "./pages/InsightDetail";
import InsightsManagement from "./pages/dashboard/InsightsManagement";
import GeoIntelligence from "./pages/dashboard/GeoIntelligence";
import Reporting from "./pages/dashboard/Reporting";
import SatelliteVerification from "./pages/dashboard/SatelliteVerification";
import RealTimeMonitoring from "./pages/dashboard/RealTimeMonitoring";
import MultiSourceValidation from "./pages/dashboard/MultiSourceValidation";
import RiskAnomalySignals from "./pages/dashboard/RiskAnomalySignals";

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
            <Route element={<DashboardLayout />}>
              <Route path="/dashboard" element={<DashboardOverview />} />
              <Route path="/dashboard/projects" element={<Projects />} />
              <Route path="/dashboard/projects/:id" element={<ProjectDetail />} />
              <Route path="/dashboard/analytics" element={<Analytics />} />
              <Route path="/dashboard/alerts" element={<Alerts />} />
              <Route path="/dashboard/users" element={<UsersPage />} />
              <Route path="/dashboard/settings" element={<SettingsPage />} />
              <Route path="/dashboard/review" element={<ReviewQueue />} />
              <Route path="/dashboard/waitlist" element={<WaitlistSubmissions />} />
              <Route path="/dashboard/insights" element={<InsightsManagement />} />
            </Route>
            <Route path="*" element={<NotFound />} />
          </Routes>
        </BrowserRouter>
      </AuthProvider>
    </TooltipProvider>
  </QueryClientProvider>
);

export default App;
