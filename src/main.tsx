import { createRoot } from "react-dom/client";
import App from "./App.tsx";
import "./index.css";

// Swallow known-benign third-party unmount errors that React can't catch with
// ErrorBoundaries (passive-effect cleanup). Without this, navigating away
// from the homepage globe occasionally triggers a full-page error screen.
if (typeof window !== "undefined") {
  const KNOWN_BENIGN = [
    "_destructor is not a function", // react-globe.gl unmount race
  ];
  const isBenign = (msg: string) =>
    KNOWN_BENIGN.some((s) => msg && msg.includes(s));

  window.addEventListener("error", (e) => {
    if (isBenign(e.message || "")) {
      e.preventDefault();
      e.stopImmediatePropagation();
      console.warn("[suppressed benign error]", e.message);
    }
  });
  window.addEventListener("unhandledrejection", (e) => {
    const msg = (e.reason && (e.reason.message || String(e.reason))) || "";
    if (isBenign(msg)) {
      e.preventDefault();
      console.warn("[suppressed benign rejection]", msg);
    }
  });
}

createRoot(document.getElementById("root")!).render(<App />);
