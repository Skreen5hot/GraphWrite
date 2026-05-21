import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// Pages deploys at https://skreen5hot.github.io/GraphWrite/ — assets need /GraphWrite/ prefix.
// Local dev (vite / vite preview) keeps root paths via the GITHUB_PAGES gate.
const base = process.env.GITHUB_PAGES === "true" ? "/GraphWrite/" : "/";

export default defineConfig({
  base,
  plugins: [react()],
  build: {
    outDir: "dist/ui",
    emptyOutDir: true,
  },
});
