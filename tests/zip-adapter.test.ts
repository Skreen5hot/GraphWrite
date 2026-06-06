/**
 * ZIP Adapter Tests (IMPLEMENTATION_PLAN.md section 4.4)
 *
 * SPEC refs: section 19, FR-E007, FR-S005.
 *
 * Acceptance criteria:
 *   AC1: packageZip returns a Buffer starting with ZIP magic PK\x03\x04.
 *   AC2: ZIP contains exactly the expected Â§19 v0.4 layout files.
 *   AC3: tbox/project-tbox.ttl content matches getProjectTBoxTurtle().
 *   AC4: manifest.jsonld in ZIP is valid JSON with @context and @graph.
 *   AC5: contexts/project-context.jsonld in ZIP is valid JSON.
 *   AC6: Serialization count in manifest @graph equals artifact count.
 *
 * Pattern: hand-rolled per tests/run-tests.ts; node:assert; process.exit(1)
 * on failure.
 */

import { strictEqual, ok, deepStrictEqual } from "node:assert";
import { packageZip } from "../src/adapters/zip.js";
import { getProjectTBoxTurtle } from "../src/tbox/index.js";
import type { ArtifactInput } from "../src/manifest/index.js";

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
// Minimal STORE-mode ZIP reader (for test verification only)
// ---------------------------------------------------------------------------

const LOCAL_SIG   = 0x04034b50;
const CENTRAL_SIG = 0x02014b50;
const EOCD_SIG    = 0x06054b50;

/**
 * Reads a STORE-mode ZIP buffer and returns a Map of filename -> content Buffer.
 * Throws for any non-STORE (compressed) entry.
 */
function readStoreZip(buf: Buffer): Map<string, Buffer> {
  // Find the End of Central Directory by scanning backwards
  let eocdPos = -1;
  for (let i = buf.length - 22; i >= 0; i--) {
    if (buf.readUInt32LE(i) === EOCD_SIG) { eocdPos = i; break; }
  }
  if (eocdPos < 0) throw new Error("EOCD signature not found");

  const numEntries = buf.readUInt16LE(eocdPos + 10);
  const cdOffset   = buf.readUInt32LE(eocdPos + 16);

  const files = new Map<string, Buffer>();
  let pos = cdOffset;

  for (let i = 0; i < numEntries; i++) {
    if (buf.readUInt32LE(pos) !== CENTRAL_SIG) {
      throw new Error(`Expected central dir signature at offset ${pos}`);
    }
    const comprMethod = buf.readUInt16LE(pos + 10);
    const uncompSize  = buf.readUInt32LE(pos + 24);
    const nameLen     = buf.readUInt16LE(pos + 28);
    const extraLen    = buf.readUInt16LE(pos + 30);
    const commentLen  = buf.readUInt16LE(pos + 32);
    const lhOffset    = buf.readUInt32LE(pos + 42);
    const name = buf.slice(pos + 46, pos + 46 + nameLen).toString("utf8");

    if (comprMethod !== 0) {
      throw new Error(`Entry "${name}" uses compression ${comprMethod}; expected STORE (0)`);
    }

    // Read file data from local file header
    if (buf.readUInt32LE(lhOffset) !== LOCAL_SIG) {
      throw new Error(`Local header signature missing at offset ${lhOffset}`);
    }
    const lhNameLen  = buf.readUInt16LE(lhOffset + 26);
    const lhExtraLen = buf.readUInt16LE(lhOffset + 28);
    const dataStart  = lhOffset + 30 + lhNameLen + lhExtraLen;

    files.set(name, buf.slice(dataStart, dataStart + uncompSize));
    pos += 46 + nameLen + extraLen + commentLen;
  }

  return files;
}

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const PROJECT: Record<string, unknown> = {
  id: "urn:uuid:00000000-0000-0000-0000-000000000042",
  type: ["ecm:OntologyDesignPattern", "ecm:Project"],
  "ecm:specVersion": "0.4",
  "ecm:name": "ZIP Test Project",
  "iao:isAbout": ["https://example.org/subjects/ZipTest"],
  "ecm:terms": [],
  "ecm:instances": [],
  "ecm:relations": [],
  "ecm:literalAssertions": [],
  "ecm:ontologies": [],
  "ecm:layouts": [],
  "ecm:snapshots": [],
  "ecm:serializations": [],
};

const ARTIFACTS: ArtifactInput[] = [
  { filename: "graph.ttl",        contentBytes: "@prefix ecm: <test> .\n", format: "text/turtle",           generatedAt: "2026-01-01T00:00:00Z" },
  { filename: "graph.nt",         contentBytes: "<a> <b> <c> .\n",        format: "application/n-triples", generatedAt: "2026-01-01T00:00:00Z" },
  { filename: "graph.jsonld",     contentBytes: "{\"@graph\": []}",        format: "application/ld+json",   generatedAt: "2026-01-01T00:00:00Z" },
  { filename: "default.mmd",      contentBytes: "flowchart TD\n",         format: "text/x-mermaid",        generatedAt: "2026-01-01T00:00:00Z" },
  { filename: "model-summary.md", contentBytes: "# Test\n",              format: "text/markdown",         generatedAt: "2026-01-01T00:00:00Z" },
];

const ZIP_BUF = packageZip(PROJECT, ARTIFACTS);

// ---------------------------------------------------------------------------
// AC1: ZIP magic bytes
// ---------------------------------------------------------------------------
console.log("\nAC1: ZIP magic bytes (PK\\x03\\x04)");

try {
  ok(Buffer.isBuffer(ZIP_BUF), "packageZip must return a Buffer");
  ok(ZIP_BUF.length > 22, "ZIP buffer must be larger than EOCD record (22 bytes)");
  // ZIP local file header signature: 0x04034b50 = bytes PK\x03\x04
  strictEqual(ZIP_BUF[0], 0x50, "byte 0 must be 0x50 (P)");
  strictEqual(ZIP_BUF[1], 0x4b, "byte 1 must be 0x4b (K)");
  strictEqual(ZIP_BUF[2], 0x03, "byte 2 must be 0x03");
  strictEqual(ZIP_BUF[3], 0x04, "byte 3 must be 0x04");
  pass("AC1: ZIP buffer starts with PK\\x03\\x04 magic");
} catch (e) {
  fail("AC1: ZIP buffer must start with PK\\x03\\x04 magic", e);
}

// ---------------------------------------------------------------------------
// AC2: ZIP file list matches expected Â§19 v0.4 layout
// ---------------------------------------------------------------------------
console.log("\nAC2: ZIP file list");

let zipEntries: Map<string, Buffer>;
try {
  zipEntries = readStoreZip(ZIP_BUF);
  pass("AC2 setup: ZIP parses without error");
} catch (e) {
  fail("AC2 setup: ZIP must parse without error", e);
  zipEntries = new Map();
}

try {
  const expectedFiles = [
    "manifest.jsonld",
    "serializations/graph.ttl",
    "serializations/graph.nt",
    "serializations/graph.jsonld",
    "serializations/default.mmd",
    "serializations/model-summary.md",
    "tbox/project-tbox.ttl",
    "contexts/project-context.jsonld",
  ];
  const actualFiles = [...zipEntries.keys()].sort();
  deepStrictEqual(
    actualFiles,
    [...expectedFiles].sort(),
    "ZIP must contain exactly the expected Â§19 v0.4 files",
  );
  pass("AC2: ZIP contains exactly the expected Â§19 v0.4 file list");
} catch (e) {
  fail("AC2: ZIP file list must match Â§19 v0.4 layout", e);
}

// ---------------------------------------------------------------------------
// AC3: tbox/project-tbox.ttl content matches getProjectTBoxTurtle()
// ---------------------------------------------------------------------------
console.log("\nAC3: tbox/project-tbox.ttl content");

try {
  const tboxEntry = zipEntries.get("tbox/project-tbox.ttl");
  ok(tboxEntry !== undefined, "tbox/project-tbox.ttl must exist in ZIP");
  const tboxText = tboxEntry!.toString("utf8");
  strictEqual(
    tboxText,
    getProjectTBoxTurtle(),
    "tbox/project-tbox.ttl must match getProjectTBoxTurtle() output",
  );
  pass("AC3: tbox/project-tbox.ttl matches getProjectTBoxTurtle()");
} catch (e) {
  fail("AC3: tbox/project-tbox.ttl must match getProjectTBoxTurtle()", e);
}

// ---------------------------------------------------------------------------
// AC4: manifest.jsonld is valid JSON with @context and @graph
// ---------------------------------------------------------------------------
console.log("\nAC4: manifest.jsonld validity");

try {
  const manifestEntry = zipEntries.get("manifest.jsonld");
  ok(manifestEntry !== undefined, "manifest.jsonld must exist in ZIP");
  const manifestText = manifestEntry!.toString("utf8");
  const manifestDoc = JSON.parse(manifestText) as Record<string, unknown>;
  ok("@context" in manifestDoc, "manifest.jsonld must have @context");
  ok("@graph" in manifestDoc, "manifest.jsonld must have @graph");
  ok(
    Array.isArray(manifestDoc["@graph"]),
    "manifest.jsonld @graph must be an array",
  );
  pass("AC4: manifest.jsonld is valid JSON with @context and @graph");
} catch (e) {
  fail("AC4: manifest.jsonld must be valid JSON with @context and @graph", e);
}

// ---------------------------------------------------------------------------
// AC5: contexts/project-context.jsonld is valid JSON
// ---------------------------------------------------------------------------
console.log("\nAC5: contexts/project-context.jsonld validity");

try {
  const ctxEntry = zipEntries.get("contexts/project-context.jsonld");
  ok(ctxEntry !== undefined, "contexts/project-context.jsonld must exist in ZIP");
  const ctxText = ctxEntry!.toString("utf8");
  const ctxDoc = JSON.parse(ctxText) as Record<string, unknown>;
  ok(typeof ctxDoc === "object" && ctxDoc !== null, "context must be a JSON object");
  ok("ecm" in ctxDoc, "context must contain ecm: prefix mapping");
  pass("AC5: contexts/project-context.jsonld is valid JSON with ecm prefix");
} catch (e) {
  fail("AC5: contexts/project-context.jsonld must be valid JSON", e);
}

// ---------------------------------------------------------------------------
// AC6: serialization count in manifest @graph equals artifact count
// ---------------------------------------------------------------------------
console.log("\nAC6: manifest serialization node count");

try {
  const manifestEntry = zipEntries.get("manifest.jsonld");
  const manifestText = manifestEntry!.toString("utf8");
  const manifestDoc = JSON.parse(manifestText) as { "@graph": Record<string, unknown>[] };
  const serNodes = manifestDoc["@graph"].filter(
    (n) => n["type"] === "ecm:Serialization",
  );
  strictEqual(
    serNodes.length,
    ARTIFACTS.length,
    `manifest must have ${ARTIFACTS.length} ecm:Serialization nodes`,
  );
  pass(`AC6: manifest contains ${ARTIFACTS.length} ecm:Serialization nodes matching artifact count`);
} catch (e) {
  fail("AC6: manifest serialization count must equal artifact count", e);
}

// ---------------------------------------------------------------------------
// Summary
// ---------------------------------------------------------------------------
console.log(`\n  ${passed} passed, ${failed} failed`);
if (failed > 0) process.exit(1);
