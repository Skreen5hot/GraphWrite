/**
 * Browser shim for node:crypto.
 *
 * Vite's resolve.alias (vite.config.ts) redirects `import ... from "node:crypto"`
 * to this file in browser builds. Vite's default externalization of node:* modules
 * uses an empty stub (__vite-browser-external) that has no named exports, which
 * causes rollup to fail at build time with errors like:
 *   "randomUUID" is not exported by "__vite-browser-external"
 *
 * This shim exports the named symbols rollup expects, but throws at call time —
 * browser callers MUST inject `uuidFn` / `digestHexFn` parameters into the
 * functions that use node:crypto fallbacks. The injection pattern was
 * established by Chain 4 sub-task A (digestHexFn) and sub-task A2 (uuidFn);
 * this shim makes the static `import` statements at module top resolve cleanly
 * without dragging real node:crypto bytes into the bundle.
 *
 * Hotfix introduced 2026-06-02 after Pages deploy failed on commit 0b3a424.
 */

type HashUpdate = (data: Uint8Array | string) => Hash;
interface Hash {
  update: HashUpdate;
  digest: (encoding?: string) => any;
}

export function createHash(_algo: string): Hash {
  throw new Error(
    "node:crypto.createHash invoked in browser build. " +
    "Browser code paths must inject digestHexFn (see Chain 4 sub-task A). " +
    "This shim exists only to satisfy Vite's static import resolution.",
  );
}

export function randomUUID(): string {
  throw new Error(
    "node:crypto.randomUUID invoked in browser build. " +
    "Browser code paths must inject uuidFn = () => crypto.randomUUID() " +
    "from the Web Crypto API (see Chain 4 sub-task A2). " +
    "This shim exists only to satisfy Vite's static import resolution.",
  );
}

// Default export for compatibility with `import crypto from "node:crypto"` style.
export default { createHash, randomUUID };
