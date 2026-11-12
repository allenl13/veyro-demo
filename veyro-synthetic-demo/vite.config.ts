import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
// Offline demo only: no Cloudflare, D1, provider, owner environment, or scheduler.
export default defineConfig({
  envDir: false,
  plugins: [react()],
  server: { host: "127.0.0.1", port: 4173, strictPort: true, watch: { useFsEvents: false, usePolling: true },
    headers: { "Content-Security-Policy": "default-src 'self'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; connect-src 'self' ws://127.0.0.1:4173; object-src 'none'; base-uri 'self'; frame-ancestors 'none'" } },
  preview: { host: "127.0.0.1", port: 4173, strictPort: true,
    headers: { "Content-Security-Policy": "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; connect-src 'self'; object-src 'none'; base-uri 'self'; frame-ancestors 'none'" } },
  build: { sourcemap: false },
});
