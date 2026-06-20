import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// The site is served at the root of its Cloudflare Pages domain (or a custom
// subdomain). If you instead serve it under a sub-path of cortech.online
// (e.g. cortech.online/triangle/), set `base` to that path.
//
// Build output goes to the repo-root `public/` dir, which Cloudflare Pages
// serves. The pipeline runs `vite build` first (emptying public/), then copies
// events.json/itineraries.json and writes events.ics into it.
export default defineConfig({
  plugins: [react()],
  base: "/",
  build: {
    outDir: "../public",
    emptyOutDir: true,
  },
});
