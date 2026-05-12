import { createRoot } from "react-dom/client";
import App from "./App.tsx";
import "./index.css";
import { supabase } from "./integrations/supabase/client";

declare global {
  interface Window {
    supabase?: typeof supabase;
  }
}

window.supabase = supabase;

createRoot(document.getElementById("root")!).render(<App />);
