import { createRoot } from "react-dom/client";
import { HelmetProvider } from "react-helmet-async";
import App from "./App.tsx";
import "./index.css";
import { supabase } from "./integrations/supabase/client";

declare global {
  interface Window {
    supabase?: typeof supabase;
  }
}

window.supabase = supabase;

createRoot(document.getElementById("root")!).render(
  <HelmetProvider>
    <App />
  </HelmetProvider>
);
