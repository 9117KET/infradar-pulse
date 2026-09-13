import { defineConfig } from "vite";
import react from "@vitejs/plugin-react-swc";
import { mcpPlugin } from "@lovable.dev/mcp-js/stacks/supabase/vite";
import path from "path";

// https://vitejs.dev/config/
export default defineConfig({
  server: {
    host: "localhost",
    port: 8080,
    hmr: {
      overlay: false,
    },
  },
  plugins: [react(), mcpPlugin()],
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
    dedupe: ["react", "react-dom", "react/jsx-runtime", "react/jsx-dev-runtime"],
  },
  build: {
    // Split heavy third-party libraries out of the entry chunk so the landing
    // page only downloads what it actually renders.
    rollupOptions: {
      output: {
        manualChunks: {
          react: ["react", "react-dom", "react-router-dom"],
          charts: ["recharts"],
          maps: ["leaflet", "react-leaflet"],
          motion: ["framer-motion"],
          query: ["@tanstack/react-query"],
        },
      },
    },
    chunkSizeWarningLimit: 900,
  },
});
