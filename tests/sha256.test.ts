/**
 * SHA-256 Utilities Tests
 *
 * SPEC refs: §5.6 ecm:contentHash format, NFR-003 determinism.
 *
 * Acceptance criteria:
 *   AC1: sha256Hex(string) returns a 64-char lowercase hex digest.
 *   AC2: sha256Hex(string) matches the createHash reference hash.
 *   AC3: sha256Hex(Uint8Array) returns the same digest as sha256Hex(string).
 *   AC4: sha256HexAsync(string) returns the same digest as sha256Hex(string).
 *   AC5: sha256HexAsync(Uint8Array) returns the same digest as sha256Hex(string).
 *   AC6: Both functions produce the known SHA-256 of the empty string.
 *
 * Note: sha256HexAsync uses globalThis.crypto.subtle, which is available in
 * Node >= 19. Playwright tests in sub-task D verify the browser runtime.
 *
 * Pattern: hand-rolled per tests/run-tests.ts; node:assert; async main();
 * process.exit(1) on failure. Follows tests/cli-import-ontology.test.ts.
 */

import { strictEqual, ok } from "node:assert";
import { createHash } from "node:crypto";
import { sha256Hex, sha256HexAsync } from "../src/kernel/sha256.js";

let passed = 0;
let failed = 0;

function pass(msg: string): void {
  console.log(`  \u2713 PASS: ${msg}`);
  passed++;
}
function fail(msg: string, err?: unknown): void {
  console.error(`  \u2717 FAIL: ${msg}`);
  if (err !== undefined) {
    console.error("  ", err instanceof Error ? err.message : String(err));
  }
  failed++;
}

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

/** Sample input used across all tests. */
const SAMPLE = "Hello, SHA-256!\n";

/** Same bytes via TextEncoder (browser path equivalent). */
const SAMPLE_BYTES = new TextEncoder().encode(SAMPLE);

/**
 * Reference digest computed with node:crypto — ground truth for cross-checks.
 * Matches the pattern used in tests/import-turtle.test.ts AC4.
 */
const REFERENCE_HEX: string = createHash("sha256")
  .update(Buffer.from(SAMPLE, "utf8"))
  .digest("hex");

/**
 * Known SHA-256 of the empty string (FIPS 180-4 / RFC 6234 test vector).
 */
const EMPTY_HEX =
  "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855";

// ---------------------------------------------------------------------------
// Test functions
// ---------------------------------------------------------------------------

/** AC1 + AC2: sha256Hex(string) format and reference correctness. */
async function testSha256HexString(): Promise<void> {
  try {
    const result = sha256Hex(SAMPLE);
    ok(
      /^[0-9a-f]{64}$/.test(result),
      `sha256Hex must return 64-char lowercase hex; got: ${result}`,
    );
    strictEqual(
      result,
      REFERENCE_HEX,
      "sha256Hex(string) must match createHash reference",
    );
    pass("sha256Hex(string): 64-char lowercase hex matches reference (AC1, AC2)");
  } catch (e) {
    fail("sha256Hex(string): format and reference correctness (AC1, AC2)", e);
  }
}

/** AC3: sha256Hex(Uint8Array) returns the same digest as sha256Hex(string). */
async function testSha256HexUint8Array(): Promise<void> {
  try {
    const result = sha256Hex(SAMPLE_BYTES);
    strictEqual(
      result,
      REFERENCE_HEX,
      "sha256Hex(Uint8Array) must match sha256Hex(string)",
    );
    pass("sha256Hex(Uint8Array): matches sha256Hex(string) (AC3)");
  } catch (e) {
    fail("sha256Hex(Uint8Array): must match sha256Hex(string) (AC3)", e);
  }
}

/** AC4: sha256HexAsync(string) returns the same digest as sha256Hex(string). */
async function testSha256HexAsyncString(): Promise<void> {
  try {
    const result = await sha256HexAsync(SAMPLE);
    strictEqual(
      result,
      REFERENCE_HEX,
      "sha256HexAsync(string) must match sha256Hex(string)",
    );
    pass("sha256HexAsync(string): matches synchronous reference (AC4)");
  } catch (e) {
    fail("sha256HexAsync(string): must match sha256Hex(string) (AC4)", e);
  }
}

/** AC5: sha256HexAsync(Uint8Array) returns the same digest as sha256Hex(string). */
async function testSha256HexAsyncUint8Array(): Promise<void> {
  try {
    const result = await sha256HexAsync(SAMPLE_BYTES);
    strictEqual(
      result,
      REFERENCE_HEX,
      "sha256HexAsync(Uint8Array) must match sha256Hex(string)",
    );
    pass("sha256HexAsync(Uint8Array): matches synchronous reference (AC5)");
  } catch (e) {
    fail("sha256HexAsync(Uint8Array): must match sha256Hex(string) (AC5)", e);
  }
}

/** AC6: Both functions return the known SHA-256 of the empty string. */
async function testEmptyString(): Promise<void> {
  try {
    const syncResult = sha256Hex("");
    strictEqual(
      syncResult,
      EMPTY_HEX,
      `sha256Hex("") must equal the known empty-string SHA-256`,
    );
    const asyncResult = await sha256HexAsync("");
    strictEqual(
      asyncResult,
      EMPTY_HEX,
      `sha256HexAsync("") must equal the known empty-string SHA-256`,
    );
    pass("empty string: both functions return known SHA-256 of empty string (AC6)");
  } catch (e) {
    fail("empty string: sha256Hex and sha256HexAsync must agree (AC6)", e);
  }
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function main(): Promise<void> {
  console.log("\nSHA-256 utilities (src/kernel/sha256.ts)");

  await testSha256HexString();
  await testSha256HexUint8Array();
  await testSha256HexAsyncString();
  await testSha256HexAsyncUint8Array();
  await testEmptyString();

  console.log(`\n  ${passed} passed, ${failed} failed`);
  if (failed > 0) process.exit(1);
}

main();
