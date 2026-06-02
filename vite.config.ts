import { defineConfig } from "vite";
import { fileURLToPath, URL } from "node:url";
import react from "@vitejs/plugin-react";

// Pages deploys at https://skreen5hot.github.io/GraphWrite/ — assets need /GraphWrite/ prefix.
// Local dev (vite / vite preview) keeps root paths via the GITHUB_PAGES gate.
const base = process.env.GITHUB_PAGES === "true" ? "/GraphWrite/" : "/";

export default defineConfig({
  base,
  plugins: [react()],
  resolve: {
    alias: {
      // Hotfix per Pages deploy failure on commit 0b3a424 (2026-06-02):
      // Vite's default node:* externalization uses __vite-browser-external
      // which has no named exports, so static imports like
      // `import { randomUUID } from "node:crypto"` fail rollup with
      // "X is not exported". Redirect to a local shim that exports the
      // expected symbols (and throws on call — browser code never reaches
      // these because uuidFn / digestHexFn are injected per Chain 4
      // sub-tasks A and A2).
      "node:crypto": fileURLToPath(
        new URL("./src/_browser-shims/node-crypto.ts", import.meta.url),
      ),
    },
  },
  build: {
    outDir: "dist/ui",
    emptyOutDir: true,
  },
});
