/**
 * ZIP Layout Golden Tests (IMPLEMENTATION_PLAN.md §4.8, Phase 4, ADR-010)
 *
 * SPEC refs: §19, §21.1, ADR-010.
 *
 * Verifies that packageZip produces a ZIP conforming to the §19 layout contract.
 * Uses the canonical-v0.4/minimal.jsonld fixture as the project input (ADR-010
 * designated input, grounded in the committed canonical fixture).
 *
 * Acceptance criteria:
 *   AC1: ZIP entry file list matches test/golden/zip-layout.json "files" array
 *        (golden file list-equality; guards §19 layout path regressions).
 *   AC2: Each non-manifest ZIP entry is byte-identical to the expected bytes
 *        computed from the canonical source used by packageZip itself (runtime-
 *        pinned byte equality; covers serializations/*, tbox/project-tbox.ttl,
 *        contexts/project-context.jsonld).
 *   AC3: §19 layout structural invariants: manifest.jsonld present; one
 *        serializations/* entry per artifact; tbox/project-tbox.ttl present;
 *        contexts/project-context.jsonld present.
 *   AC4: manifest.jsonld structural invariants: valid JSON-LD; @context + @graph
 *        present; 5 TBox nodes in @graph (§5.14); ecm:Serialization count equals
 *        artifact count.
 *
 * manifest.jsonld is excluded from AC2 byte-equality because it contains
 * UUID-based ecm:Serialization entry IDs (non-deterministic until persisted;
 * SPEC §9.2, ADR-010). Structural invariants are verified in AC4.
 *
 * Verification of ROADMAP §21.1 golden-file governance: Phase 4
 * TBox-in-packaging does NOT alter Phase 1 emitter output shapes.
 * emitTurtle() already prepends getProjectTBoxTurtle() (chain 1, §6.3 step 5);
 * the TBox bundled in the ZIP is the identical static constant from
 * src/tbox/index.ts. No Phase 1 emitter goldens (tbox-bundle.test.ts AC3,
 * emitters.test.ts AC3) require updating as a result of Phase 4 changes.
 * Those stubs remain deferred pass() stubs gated on OED-306.
 *
 * Pattern: hand-rolled per tests/run-tests.ts; node:assert; process.exit(1)
 * on failure.
 */

import { strictEqual, ok, deepStrictEqual } from "node:assert";
import { readFile, writeFile, mkdir } from "node:fs/promises";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { packageZip } from "../src/adapters/zip.js";
import { getProjectTBoxTurtle } from "../src/tbox/index.js";
import { stableStringify, VMP_CONTEXT } from "../src/kernel/canonicalize.js";
import type { ArtifactInput } from "../src/manifest/index.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

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
 * Reads a STORE-mode ZIP buffer; returns a Map of filename -> content Buffer.
 * Throws for any non-STORE (compressed) entry.
 */
function readStoreZip(buf: Buffer): Map<string, Buffer> {
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
    const name        = buf.slice(pos + 46, pos + 46 + nameLen).toString("utf8");

    if (comprMethod !== 0) {
      throw new Error(`Entry "${name}" uses compression ${comprMethod}; expected STORE (0)`);
    }
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

// Load canonical-v0.4/minimal.jsonld (ADR-010 designated input).
const fixturePath = join(
  __dirname, "..", "..", "test", "fixtures", "canonical-v0.4", "minimal.jsonld",
);
const fixtureRaw = await readFile(fixturePath, "utf-8");
const FIXTURE_PROJECT = JSON.parse(fixtureRaw) as Record<string, unknown>;

// Representative §19 v0.4 artifact set (fixed deterministic content).
const ARTIFACTS: ArtifactInput[] = [
  { filename: "graph.ttl",        contentBytes: "@prefix ecm: <test> .\n",  format: "text/turtle",           generatedAt: "2026-01-01T00:00:00Z" },
  { filename: "graph.nt",         contentBytes: "<a> <b> <c> .\n",          format: "application/n-triples", generatedAt: "2026-01-01T00:00:00Z" },
  { filename: "graph.jsonld",     contentBytes: '{"@graph": []}',            format: "application/ld+json",   generatedAt: "2026-01-01T00:00:00Z" },
  { filename: "default.mmd",      contentBytes: "flowchart TD\n",           format: "text/x-mermaid",        generatedAt: "2026-01-01T00:00:00Z" },
  { filename: "model-summary.md", contentBytes: "# Test\n",                 format: "text/markdown",         generatedAt: "2026-01-01T00:00:00Z" },
];

// Runtime-pinned expected content for deterministic non-manifest ZIP entries.
// These buffers are derived from the same canonical sources that packageZip
// uses, so byte equality is guaranteed when the implementation is correct (AC2).
const EXPECTED_CONTENT = new Map<string, Buffer>([
  ["serializations/graph.ttl",        Buffer.from("@prefix ecm: <test> .\n",                 "utf8")],
  ["serializations/graph.nt",         Buffer.from("<a> <b> <c> .\n",                         "utf8")],
  ["serializations/graph.jsonld",     Buffer.from('{"@graph": []}',                           "utf8")],
  ["serializations/default.mmd",      Buffer.from("flowchart TD\n",                          "utf8")],
  ["serializations/model-summary.md", Buffer.from("# Test\n",                                "utf8")],
  ["tbox/project-tbox.ttl",           Buffer.from(getProjectTBoxTurtle(),                     "utf8")],
  ["contexts/project-context.jsonld", Buffer.from(stableStringify(VMP_CONTEXT, true) + "\n", "utf8")],
]);

// ---------------------------------------------------------------------------
// ZIP generation
// ---------------------------------------------------------------------------

let zipEntries: Map<string, Buffer>;
let setupOk = false;

try {
  const zipBuf = packageZip(FIXTURE_PROJECT, ARTIFACTS);
  zipEntries = readStoreZip(zipBuf);
  setupOk = true;
  pass("setup: packageZip produced a parseable STORE-mode ZIP");
} catch (e) {
  fail("setup: packageZip or ZIP parse failed; remaining tests will report failures", e);
  zipEntries = new Map();
}

// ---------------------------------------------------------------------------
// Golden load (with bootstrap: write file list if golden is missing)
// ---------------------------------------------------------------------------

interface ZipLayoutGolden {
  description: string;
  fixture: string;
  files: string[];
}

const goldenPath = join(__dirname, "..", "..", "test", "golden", "zip-layout.json");

let golden: ZipLayoutGolden;
try {
  const goldenRaw = await readFile(goldenPath, "utf-8");
  golden = JSON.parse(goldenRaw) as ZipLayoutGolden;
} catch {
  if (!setupOk) {
    fail(
      "AC1: golden bootstrap skipped because setup failed; fix packageZip first, " +
      "then re-run to generate test/golden/zip-layout.json",
    );
    console.log(`\n  ${passed} passed, ${failed} failed`);
    process.exit(1);
  }
  const generated: ZipLayoutGolden = {
    description:
      "Phase 4 ADR-010 ZIP layout golden. File-list equality check (AC1). " +
      "Non-manifest entry content verified via runtime-pinned byte equality in " +
      "the test (AC2). manifest.jsonld excluded from AC2 due to UUID non-determinism " +
      "(SPEC \u00a79.2).",
    fixture: "test/fixtures/canonical-v0.4/minimal.jsonld",
    files: [...zipEntries.keys()].sort(),
  };
  await mkdir(join(__dirname, "..", "..", "test", "golden"), { recursive: true });
  await writeFile(goldenPath, JSON.stringify(generated, null, 2) + "\n", "utf-8");
  console.log(
    "\n  Golden generated: test/golden/zip-layout.json\n" +
    "  Please commit this file and re-run the tests.\n",
  );
  console.log(`\n  ${passed} passed, ${failed} failed`);
  process.exit(1);
}

// ---------------------------------------------------------------------------
// AC1: ZIP file list matches golden
// ---------------------------------------------------------------------------
console.log("\nAC1: ZIP file list matches golden");

try {
  const actualFiles = [...zipEntries.keys()].sort();
  deepStrictEqual(
    actualFiles,
    golden.files,
    "ZIP file list must match test/golden/zip-layout.json 'files' array (\u00a719 layout, AC1)",
  );
  pass(`AC1: ZIP file list matches golden (${actualFiles.length} entries, \u00a719 layout)`);
} catch (e) {
  fail("AC1: ZIP file list must match golden 'files' array", e);
}

// ---------------------------------------------------------------------------
// AC2: Non-manifest entry content (runtime-pinned byte equality)
// ---------------------------------------------------------------------------
console.log("\nAC2: Non-manifest entry content (runtime-pinned byte equality)");

for (const [name, expectedBuf] of EXPECTED_CONTENT) {
  try {
    const actualBuf = zipEntries.get(name);
    ok(actualBuf !== undefined, `ZIP entry "${name}" must be present`);
    ok(
      actualBuf!.equals(expectedBuf),
      `ZIP entry "${name}" content must be byte-identical to canonical source ` +
      `(actual ${actualBuf?.length ?? 0} bytes vs expected ${expectedBuf.length} bytes)`,
    );
    pass(`AC2: ${name} byte-identical to canonical source`);
  } catch (e) {
    fail(`AC2: ${name} content`, e);
  }
}

// ---------------------------------------------------------------------------
// AC3: \u00a719 layout structural invariants
// ---------------------------------------------------------------------------
console.log("\nAC3: \u00a719 layout structural invariants");

try {
  ok(zipEntries.has("manifest.jsonld"), "\u00a719: manifest.jsonld must be present in ZIP");
  pass("AC3: manifest.jsonld present (\u00a719)");
} catch (e) {
  fail("AC3: manifest.jsonld must be present (\u00a719)", e);
}

try {
  const serKeys = [...zipEntries.keys()].filter((k) => k.startsWith("serializations/"));
  strictEqual(
    serKeys.length,
    ARTIFACTS.length,
    `\u00a719: serializations/ must contain exactly ${ARTIFACTS.length} entries (one per artifact)`,
  );
  for (const artifact of ARTIFACTS) {
    ok(
      zipEntries.has(`serializations/${artifact.filename}`),
      `\u00a719: serializations/${artifact.filename} must be present`,
    );
  }
  pass(`AC3: serializations/ contains ${ARTIFACTS.length} artifact entries (\u00a719)`);
} catch (e) {
  fail("AC3: serializations/ entries must match artifact set (\u00a719)", e);
}

try {
  ok(zipEntries.has("tbox/project-tbox.ttl"), "\u00a719: tbox/project-tbox.ttl must be present");
  pass("AC3: tbox/project-tbox.ttl present (\u00a719)");
} catch (e) {
  fail("AC3: tbox/project-tbox.ttl must be present (\u00a719)", e);
}

try {
  ok(
    zipEntries.has("contexts/project-context.jsonld"),
    "\u00a719: contexts/project-context.jsonld must be present",
  );
  pass("AC3: contexts/project-context.jsonld present (\u00a719)");
} catch (e) {
  fail("AC3: contexts/project-context.jsonld must be present (\u00a719)", e);
}

// ---------------------------------------------------------------------------
// AC4: manifest.jsonld structural invariants
// ---------------------------------------------------------------------------
console.log("\nAC4: manifest.jsonld structural invariants");

let manifestDoc: Record<string, unknown> | null = null;
try {
  const manifestBuf = zipEntries.get("manifest.jsonld");
  ok(manifestBuf !== undefined, "manifest.jsonld must exist in ZIP");
  const manifestText = manifestBuf!.toString("utf8");
  manifestDoc = JSON.parse(manifestText) as Record<string, unknown>;
  ok("@context" in manifestDoc, "manifest.jsonld must have @context");
  ok("@graph" in manifestDoc, "manifest.jsonld must have @graph");
  ok(Array.isArray(manifestDoc["@graph"]), "manifest.jsonld @graph must be an array");
  pass("AC4: manifest.jsonld is valid JSON-LD with @context and @graph");
} catch (e) {
  fail("AC4: manifest.jsonld must be valid JSON-LD with @context and @graph", e);
}

try {
  if (manifestDoc !== null) {
    const graph = manifestDoc["@graph"] as Record<string, unknown>[];
    const tboxIds = new Set([
      "ecm:OntologyDesignPattern",
      "ecm:Project",
      "ecm:Serialization",
      "ecm:UnspecifiedSubjectMatter",
      "ecm:isSerializationOf",
    ]);
    const tboxNodes = graph.filter((n) => tboxIds.has(String(n["id"])));
    strictEqual(
      tboxNodes.length,
      5,
      "manifest.jsonld @graph must contain exactly 5 TBox nodes (\u00a75.14)",
    );
    pass("AC4: manifest.jsonld @graph contains exactly 5 TBox nodes (\u00a75.14)");
  } else {
    fail("AC4: TBox node count check skipped (manifest.jsonld parse failed above)");
  }
} catch (e) {
  fail("AC4: manifest.jsonld TBox node count must be 5 (\u00a75.14)", e);
}

try {
  if (manifestDoc !== null) {
    const graph = manifestDoc["@graph"] as Record<string, unknown>[];
    const serNodes = graph.filter((n) => n["type"] === "ecm:Serialization");
    strictEqual(
      serNodes.length,
      ARTIFACTS.length,
      `manifest.jsonld must contain ${ARTIFACTS.length} ecm:Serialization nodes (one per artifact)`,
    );
    pass(
      `AC4: manifest.jsonld contains ${ARTIFACTS.length} ecm:Serialization nodes ` +
      "(equals artifact count)",
    );
  } else {
    fail("AC4: ecm:Serialization count check skipped (manifest.jsonld parse failed above)");
  }
} catch (e) {
  fail("AC4: manifest.jsonld ecm:Serialization count must equal artifact count", e);
}

// ---------------------------------------------------------------------------
// Summary
// ---------------------------------------------------------------------------
console.log(`\n  ${passed} passed, ${failed} failed`);
if (failed > 0) process.exit(1);
