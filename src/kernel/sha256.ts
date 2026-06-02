/**
 * SHA-256 utilities — two runtimes, two functions.
 *
 * sha256Hex      – synchronous; Node path (node:crypto.createHash).
 *                  Import this in Node-only CLI / server code.
 * sha256HexAsync – async; browser-safe path (globalThis.crypto.subtle).
 *                  Import this in browser / Vite bundles where node:crypto
 *                  is unavailable.
 *
 * Both accept a Uint8Array or a string (UTF-8 encoded before hashing) and
 * return a lowercase 64-character hex digest — the value placed after the
 * "sha256-" prefix in ecm:contentHash (SPEC §5.6, NFR-003).
 *
 * Layer boundary: MUST NOT import from src/adapters/ or src/composition/.
 * sha256Hex depends on node:crypto (Node-only runtime).
 * sha256HexAsync uses globalThis.crypto.subtle (available in Node >= 19
 * and all modern browsers; no import required).
 */

import { createHash } from "node:crypto";

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Compute a SHA-256 hex digest synchronously using node:crypto.
 *
 * Node-only. Do NOT bundle into browser / Vite builds.
 *
 * @param input - Raw bytes or a UTF-8 string (encoded with Buffer.from before hashing).
 * @returns Lowercase 64-character hex string.
 */
export function sha256Hex(input: Uint8Array | string): string {
  const bytes =
    typeof input === "string" ? Buffer.from(input, "utf8") : input;
  return createHash("sha256").update(bytes).digest("hex");
}

/**
 * Compute a SHA-256 hex digest asynchronously using the Web Crypto API.
 *
 * Browser-safe (uses globalThis.crypto.subtle — no import required).
 * Also available in Node >= 19 without additional imports.
 *
 * @param input - Raw bytes or a UTF-8 string (encoded with TextEncoder before hashing).
 * @returns Promise resolving to a lowercase 64-character hex string.
 */
export async function sha256HexAsync(
  input: Uint8Array | string,
): Promise<string> {
  const bytes =
    typeof input === "string"
      ? new TextEncoder().encode(input)
      : input;
  const buffer = await globalThis.crypto.subtle.digest("SHA-256", bytes);
  return Array.from(new Uint8Array(buffer))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}
