/**
 * Export Manifest Entries Tests (IMPLEMENTATION_PLAN.md section 1.8)
 *
 * SPEC refs: section 5.15, section 19, FR-C012, NFR-014.
 *
 * Acceptance criteria covered here:
 *   AC1: Each entry has all required section 5.15 fields. Schema assertion
 *        per entry. Note: IMPL plan section 1.8 AC1 says "six"; SPEC
 *        section 5.15 Required: line lists 7; sub-tasks enumerate 8
 *        (7 required + ecm:byteLength). This test asserts all 8 fields
 *        per the sub-tasks enumeration.
 *   AC2: ecm:isSerializationOf equals project root id. Unit test.
 *   AC3: ecm:contentHash for a known UTF-8 string equals "sha256-" + SHA-256
 *        hex of that string. Reference hash comparison.
 *   AC4: ecm:byteLength equals UTF-8 byte length of artifact content.
 *        Multi-byte character verified (caf\u00e9 = 5 UTF-8 bytes).
 *
 * Pattern: hand-rolled per tests/run-tests.ts; no framework; node:assert;
 * process.exit(1) on failure. Follows tests/iri-generation.test.ts.
 */

import { strictEqual, ok, notStrictEqual } from "node:assert";
import { createHash } from "node:crypto";
import {
  generateManifestEntries,
  type ArtifactInput,
} from "../src/manifest/index.js";

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

/** Minimal project root document with stable id. */
const PROJECT: Record<string, unknown> = {
  id: "urn:uuid:00000000-0000-0000-0000-000000000001",
  type: ["ecm:Project", "iao:OntologyDesignPattern"],
  "ecm:specVersion": "0.4",
};

/** Known ASCII-only content for reference hash comparison (AC3). */
const KNOWN_CONTENT = "The quick brown fox";

/**
 * Multi-byte UTF-8 content for byte-length test (AC4).
 * "caf\u00e9" = 4 chars, 5 UTF-8 bytes (e with acute accent = 2 bytes).
 */
const MULTIBYTE_CONTENT = "caf\u00e9";
const MULTIBYTE_BYTE_LENGTH = 5;

const ARTIFACT_TTL: ArtifactInput = {
  filename: "graph.ttl",
  contentBytes: KNOWN_CONTENT,
  format: "text/turtle",
  generatedAt: "2026-05-20T00:00:00Z",
};

const ARTIFACT_MULTIBYTE: ArtifactInput = {
  filename: "notes.md",
  contentBytes: MULTIBYTE_CONTENT,
  format: "text/markdown",
  generatedAt: "2026-05-20T00:00:00Z",
};

// Independent SHA-256 reference hash for AC3.
const EXPECTED_HEX: string = createHash("sha256")
  .update(Buffer.from(KNOWN_CONTENT, "utf8"))
  .digest("hex");
const EXPECTED_HASH = `sha256-${EXPECTED_HEX}`;

/** UUIDv4 urn:uuid: format regex per IMPLEMENTATION_PLAN.md section 1.6. */
const UUID_URN_RE =
  /^urn:uuid:[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;

/**
 * All 8 fields required per IMPL plan section 1.8 sub-tasks:
 * 7 Required from SPEC section 5.15 plus ecm:byteLength.
 */
const REQUIRED_FIELDS: readonly string[] = [
  "id",
  "type",
  "ecm:format",
  "ecm:filename",
  "ecm:contentHash",
  "ecm:byteLength",
  "ecm:generatedAt",
  "ecm:isSerializationOf",
];

// ---------------------------------------------------------------------------
// AC1: schema -- each entry has all 8 required fields with correct shapes
// (IMPLEMENTATION_PLAN.md section 1.8 AC1)
// ---------------------------------------------------------------------------
console.log("\nAC1: entry schema (SPEC section 5.15 fields)");

try {
  const entries = generateManifestEntries(PROJECT, [ARTIFACT_TTL, ARTIFACT_MULTIBYTE]);
  strictEqual(entries.length, 2, "Expected 2 entries for 2 artifacts");
  for (const entry of entries) {
    for (const field of REQUIRED_FIELDS) {
      if (!(field in entry)) {
        throw new Error("Entry missing required field: " + field + " (SPEC section 5.15)");
      }
    }
    strictEqual(entry.type, "ecm:Serialization", "type must be ecm:Serialization");
    ok(UUID_URN_RE.test(entry.id), "id must match UUIDv4 urn:uuid: format: " + entry.id);
    ok(
      entry["ecm:contentHash"].startsWith("sha256-"),
      "ecm:contentHash must start with sha256-",
    );
    ok(
      Number.isInteger(entry["ecm:byteLength"]) && entry["ecm:byteLength"] > 0,
      "ecm:byteLength must be a positive integer",
    );
  }
  pass("all 8 required fields present with correct shapes on both entries (AC1)");
} catch (e) {
  fail("entry schema: all required fields must be present with correct shapes (AC1)", e);
}

try {
  const entries = generateManifestEntries(PROJECT, []);
  strictEqual(entries.length, 0, "Expected 0 entries for empty artifacts");
  pass("empty artifacts array produces empty SerializationEntry[] (AC1 boundary)");
} catch (e) {
  fail("empty artifacts array must produce empty result (AC1 boundary)", e);
}

// ---------------------------------------------------------------------------
// AC2: ecm:isSerializationOf equals project root id
// (IMPLEMENTATION_PLAN.md section 1.8 AC2)
// ---------------------------------------------------------------------------
console.log("\nAC2: ecm:isSerializationOf equals project root id");

try {
  const entries = generateManifestEntries(PROJECT, [ARTIFACT_TTL, ARTIFACT_MULTIBYTE]);
  const projectId = PROJECT["id"] as string;
  for (const entry of entries) {
    strictEqual(
      entry["ecm:isSerializationOf"],
      projectId,
      "ecm:isSerializationOf must equal project.id",
    );
  }
  pass("ecm:isSerializationOf equals project id on all entries (AC2)");
} catch (e) {
  fail("ecm:isSerializationOf must equal project root id (AC2)", e);
}

try {
  const OTHER: Record<string, unknown> = {
    ...PROJECT,
    id: "urn:uuid:00000000-0000-0000-0000-000000000002",
  };
  const a = generateManifestEntries(PROJECT, [ARTIFACT_TTL]);
  const b = generateManifestEntries(OTHER, [ARTIFACT_TTL]);
  notStrictEqual(
    a[0]["ecm:isSerializationOf"],
    b[0]["ecm:isSerializationOf"],
    "Different project ids must produce different ecm:isSerializationOf",
  );
  pass("different project id produces different ecm:isSerializationOf (AC2 variant)");
} catch (e) {
  fail("different project id must produce different ecm:isSerializationOf (AC2 variant)", e);
}

try {
  let threw = false;
  try { generateManifestEntries({}, [ARTIFACT_TTL]); } catch { threw = true; }
  ok(threw, "generateManifestEntries must throw when project.id is absent");
  pass("absent project.id throws Error (AC2 guard)");
} catch (e) {
  fail("absent project.id must throw Error (AC2 guard)", e);
}

// ---------------------------------------------------------------------------
// AC3: ecm:contentHash = "sha256-" + SHA-256 hex of UTF-8 content bytes
// (IMPLEMENTATION_PLAN.md section 1.8 AC3; reference hash comparison)
// ---------------------------------------------------------------------------
console.log("\nAC3: ecm:contentHash reference hash comparison");

try {
  const entries = generateManifestEntries(PROJECT, [ARTIFACT_TTL]);
  strictEqual(
    entries[0]["ecm:contentHash"],
    EXPECTED_HASH,
    "ecm:contentHash must equal sha256-<hex>",
  );
  pass("ecm:contentHash for known UTF-8 string equals sha256- + SHA-256 hex (AC3)");
} catch (e) {
  fail("ecm:contentHash must equal sha256-<hex> for known UTF-8 string (AC3)", e);
}

try {
  const bufArtifact: ArtifactInput = {
    ...ARTIFACT_TTL,
    contentBytes: Buffer.from(KNOWN_CONTENT, "utf8"),
  };
  const strEntries = generateManifestEntries(PROJECT, [ARTIFACT_TTL]);
  const bufEntries = generateManifestEntries(PROJECT, [bufArtifact]);
  strictEqual(
    strEntries[0]["ecm:contentHash"],
    bufEntries[0]["ecm:contentHash"],
    "Buffer and string inputs with same bytes must produce identical ecm:contentHash",
  );
  pass("Buffer input produces same ecm:contentHash as equivalent string input (AC3 Buffer)");
} catch (e) {
  fail("Buffer and string inputs must produce identical ecm:contentHash (AC3 Buffer)", e);
}

// ---------------------------------------------------------------------------
// AC4: ecm:byteLength equals UTF-8 byte length of artifact content
// (IMPLEMENTATION_PLAN.md section 1.8 AC4; multi-byte character verified)
// ---------------------------------------------------------------------------
console.log("\nAC4: ecm:byteLength UTF-8 correctness");

try {
  const entries = generateManifestEntries(PROJECT, [ARTIFACT_MULTIBYTE]);
  strictEqual(
    entries[0]["ecm:byteLength"],
    MULTIBYTE_BYTE_LENGTH,
    "ecm:byteLength for multi-byte content must be 5 UTF-8 bytes",
  );
  pass("ecm:byteLength for multi-byte content is 5 UTF-8 bytes (AC4)");
} catch (e) {
  fail("ecm:byteLength must equal UTF-8 byte length for multi-byte content (AC4)", e);
}

try {
  const asciiArtifact: ArtifactInput = {
    filename: "out.txt",
    contentBytes: "hello",
    format: "text/plain",
    generatedAt: "2026-05-20T00:00:00Z",
  };
  const entries = generateManifestEntries(PROJECT, [asciiArtifact]);
  strictEqual(entries[0]["ecm:byteLength"], 5, "ASCII string byteLength must equal char count");
  pass("ecm:byteLength for ASCII string equals character count (AC4 ASCII)");
} catch (e) {
  fail("ecm:byteLength for ASCII string must equal character count (AC4 ASCII)", e);
}

try {
  const contentBuf = Buffer.from(MULTIBYTE_CONTENT, "utf8");
  const bufArtifact: ArtifactInput = {
    filename: "notes.md",
    contentBytes: contentBuf,
    format: "text/markdown",
    generatedAt: "2026-05-20T00:00:00Z",
  };
  const entries = generateManifestEntries(PROJECT, [bufArtifact]);
  strictEqual(
    entries[0]["ecm:byteLength"],
    contentBuf.length,
    "Buffer input byteLength must equal Buffer.length",
  );
  pass("ecm:byteLength for Buffer input equals Buffer.length (AC4 Buffer)");
} catch (e) {
  fail("ecm:byteLength for Buffer input must equal Buffer.length (AC4 Buffer)", e);
}

// ---------------------------------------------------------------------------
// Summary
// ---------------------------------------------------------------------------
console.log(`\n  ${passed} passed, ${failed} failed`);
if (failed > 0) process.exit(1);
