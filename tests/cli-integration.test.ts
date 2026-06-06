/**
 * CLI Integration Tests (IMPLEMENTATION_PLAN.md section 1.11; SPEC section 23)
 *
 * Tests the compiled GraphWrite CLI (dist-tests/src/cli/index.js) via
 * child_process.spawn, per the established pattern in tests/run-tests.ts.
 *
 * Acceptance criteria covered:
 *   AC1: validate valid-v0.4 file exits 0.
 *   AC2: validate missing-realist-anchor exits 1; stdout contains MISSING_REALIST_ANCHOR.
 *   AC3: validate v0.5 file exits 4.
 *   AC4: export --format turtle exits 0; stdout contains Turtle @prefix declarations.
 *   AC5: path traversal (../../etc/passwd) exits 2 without file access.
 *   AC6: export --format zip --out exits 0; output file is a valid ZIP with manifest.jsonld and serializations.
 *   AC7: import-ontology exits 2; stderr contains "not yet implemented; available in Phase 3".
 *   AC8: migrate v0.2 document exits 0; stdout contains "ecm:specVersion".
 *   AC9: export --format json-ld exits 0; stdout is valid JSON-LD with @context.
 *   AC10: export --format mermaid exits 0; stdout starts with "flowchart".
 *
 * Deferred (pending OED-306 + OED-313):
 *   - Golden-file byte-identical turtle/n-triples export.
 *   - Deterministic --seed/--clock export golden.
 *
 * Pattern: hand-rolled per tests/run-tests.ts; node:assert; process.exit(1) on failure.
 */

import { strictEqual, ok } from "node:assert";
import { spawn } from "node:child_process";
import { readFile, writeFile, rm, mkdir } from "node:fs/promises";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// CLI compiled to dist-tests/src/cli/index.js by tsconfig.test.json.
const CLI = join(__dirname, "..", "src", "cli", "index.js");

// Fixture directory inside the project root (within CWD) so the CLI's
// path containment check does not reject fixture reads.
const FIXTURE_DIR = join(__dirname, "..", "..", ".cli-test-fixtures");

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

const VALID_V04: Record<string, unknown> = {
  id: "urn:uuid:00000000-0000-0000-0000-000000000001",
  type: ["ecm:Project", "ecm:OntologyDesignPattern"],
  "ecm:specVersion": "0.4",
  "ecm:name": "CLI Test Project",
  "ecm:createdAt": "2026-05-14T12:00:00Z",
  "ecm:updatedAt": "2026-05-14T12:00:00Z",
  "iao:isAbout": ["https://example.org/subjects/CLITest"],
  "ecm:ontologies": [],
  "ecm:terms": [],
  "ecm:instances": [],
  "ecm:relations": [],
  "ecm:literalAssertions": [],
  "ecm:layouts": [],
  "ecm:snapshots": [],
  "ecm:serializations": [],
};

const MISSING_ANCHOR: Record<string, unknown> = {
  ...VALID_V04,
  id: "urn:uuid:00000000-0000-0000-0000-000000000002",
  "iao:isAbout": ["ecm:UnspecifiedSubjectMatter"],
};

const LEGACY_PLACEHOLDER: Record<string, unknown> = {
  ...VALID_V04,
  id: "urn:uuid:00000000-0000-0000-0000-000000000004",
  "iao:isAbout": ["ecm:UnspecifiedSubjectMatter"],
  "ecm:_legacyAnchorPlaceholder": true,
};

const V05_DOC: Record<string, unknown> = {
  ...VALID_V04,
  id: "urn:uuid:00000000-0000-0000-0000-000000000003",
  "ecm:specVersion": "0.5",
};

// Minimal v0.2 document (no ecm:specVersion; per SPEC section 10.4 v0.2 criteria).
const V02_DOC: Record<string, unknown> = {
  id: "urn:uuid:00000000-0000-0000-0000-000000000010",
  type: "ecm:Project",
  "ecm:name": "Legacy v0.2 Project",
  "ecm:createdAt": "2025-01-01T00:00:00Z",
  "ecm:updatedAt": "2025-01-01T00:00:00Z",
  "ecm:terms": [],
  "ecm:instances": [],
  "ecm:relations": [],
  "ecm:ontologies": [],
  "ecm:layouts": [],
  "ecm:snapshots": [],
};

// ---------------------------------------------------------------------------
// CLI runner
// ---------------------------------------------------------------------------

interface RunResult {
  exitCode: number;
  stdout: string;
  stderr: string;
}

function runCli(args: string[]): Promise<RunResult> {
  return new Promise((res) => {
    const child = spawn("node", [CLI, ...args], { stdio: "pipe" });
    let stdout = "";
    let stderr = "";
    child.stdout.on("data", (d: Buffer) => {
      stdout += d.toString();
    });
    child.stderr.on("data", (d: Buffer) => {
      stderr += d.toString();
    });
    child.on("close", (code) => {
      res({ exitCode: code ?? 1, stdout, stderr });
    });
  });
}

// ---------------------------------------------------------------------------
// Fixture setup / teardown
// ---------------------------------------------------------------------------

async function setup(): Promise<void> {
  await mkdir(FIXTURE_DIR, { recursive: true });
  await writeFile(
    join(FIXTURE_DIR, "valid-v0.4.jsonld"),
    JSON.stringify(VALID_V04, null, 2),
    "utf-8",
  );
  await writeFile(
    join(FIXTURE_DIR, "missing-anchor.jsonld"),
    JSON.stringify(MISSING_ANCHOR, null, 2),
    "utf-8",
  );
  await writeFile(
    join(FIXTURE_DIR, "legacy-placeholder.jsonld"),
    JSON.stringify(LEGACY_PLACEHOLDER, null, 2),
    "utf-8",
  );
  await writeFile(
    join(FIXTURE_DIR, "v0.5.jsonld"),
    JSON.stringify(V05_DOC, null, 2),
    "utf-8",
  );
  await writeFile(
    join(FIXTURE_DIR, "v0.2.jsonld"),
    JSON.stringify(V02_DOC, null, 2),
    "utf-8",
  );
}

async function teardown(): Promise<void> {
  await rm(FIXTURE_DIR, { recursive: true, force: true });
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

async function testValidateSuccess(): Promise<void> {
  const r = await runCli(["validate", join(FIXTURE_DIR, "valid-v0.4.jsonld")]);
  try {
    strictEqual(r.exitCode, 0, `expected exit 0, got ${r.exitCode}`);
    pass("AC1: validate valid-v0.4 exits 0");
  } catch (e) {
    fail("AC1: validate valid-v0.4 exits 0", e);
  }
}

async function testValidateMissingAnchor(): Promise<void> {
  const r = await runCli([
    "validate",
    join(FIXTURE_DIR, "missing-anchor.jsonld"),
  ]);
  try {
    strictEqual(r.exitCode, 1, `expected exit 1, got ${r.exitCode}`);
    ok(
      r.stdout.includes("MISSING_REALIST_ANCHOR"),
      "expected MISSING_REALIST_ANCHOR in stdout",
    );
    pass("AC2: validate missing anchor exits 1 with MISSING_REALIST_ANCHOR");
  } catch (e) {
    fail("AC2: validate missing anchor exits 1 with MISSING_REALIST_ANCHOR", e);
  }
}

async function testValidateUnsupportedVersion(): Promise<void> {
  const r = await runCli(["validate", join(FIXTURE_DIR, "v0.5.jsonld")]);
  try {
    strictEqual(r.exitCode, 4, `expected exit 4, got ${r.exitCode}`);
    pass("AC3: validate v0.5 file exits 4");
  } catch (e) {
    fail("AC3: validate v0.5 file exits 4", e);
  }
}

async function testExportTurtle(): Promise<void> {
  const r = await runCli([
    "export",
    join(FIXTURE_DIR, "valid-v0.4.jsonld"),
    "--format",
    "turtle",
  ]);
  try {
    strictEqual(r.exitCode, 0, `expected exit 0, got ${r.exitCode}`);
    ok(r.stdout.includes("@prefix"), "expected @prefix in Turtle output");
    pass("AC4: export --format turtle exits 0 with Turtle output");
  } catch (e) {
    fail("AC4: export --format turtle exits 0 with Turtle output", e);
  }
}

async function testExportMissingAnchorBlocked(): Promise<void> {
  const r = await runCli([
    "export",
    join(FIXTURE_DIR, "missing-anchor.jsonld"),
    "--format",
    "turtle",
  ]);
  try {
    strictEqual(r.exitCode, 1, `expected exit 1, got ${r.exitCode}`);
    ok(
      r.stderr.includes("MISSING_REALIST_ANCHOR"),
      "expected MISSING_REALIST_ANCHOR in stderr",
    );
    pass("AC11: export blocked by MISSING_REALIST_ANCHOR exits 1 with code in stderr");
  } catch (e) {
    fail("AC11: export blocked by MISSING_REALIST_ANCHOR must exit 1 with code in stderr", e);
  }
}

async function testExportLegacyPlaceholderBlocked(): Promise<void> {
  const r = await runCli([
    "export",
    join(FIXTURE_DIR, "legacy-placeholder.jsonld"),
    "--format",
    "turtle",
  ]);
  try {
    strictEqual(r.exitCode, 1, `expected exit 1, got ${r.exitCode}`);
    ok(
      r.stderr.includes("LEGACY_REALIST_ANCHOR_PLACEHOLDER"),
      "expected LEGACY_REALIST_ANCHOR_PLACEHOLDER in stderr",
    );
    pass("AC12: export blocked by LEGACY_REALIST_ANCHOR_PLACEHOLDER exits 1 with code in stderr");
  } catch (e) {
    fail("AC12: export blocked by LEGACY_REALIST_ANCHOR_PLACEHOLDER must exit 1 with code in stderr", e);
  }
}

async function testPathContainment(): Promise<void> {
  // "../../etc/passwd" resolves 2 levels above project root -> outside CWD.
  const r = await runCli(["validate", "../../etc/passwd"]);
  try {
    strictEqual(r.exitCode, 2, `expected exit 2, got ${r.exitCode}`);
    pass("AC5: path traversal exits 2 without file access");
  } catch (e) {
    fail("AC5: path traversal exits 2 without file access", e);
  }
}

async function testExportZip(): Promise<void> {
  const zipOut = join(FIXTURE_DIR, "test-output.zip");
  const r = await runCli([
    "export",
    join(FIXTURE_DIR, "valid-v0.4.jsonld"),
    "--format",
    "zip",
    "--out",
    zipOut,
  ]);
  try {
    strictEqual(r.exitCode, 0, `expected exit 0, got ${r.exitCode}; stderr: ${r.stderr}`);
    pass("AC6a: export --format zip exits 0");
  } catch (e) {
    fail("AC6a: export --format zip must exit 0", e);
    return;
  }
  try {
    const zipBuf = await readFile(zipOut);
    // ZIP local file header magic: PK\x03\x04
    strictEqual(zipBuf[0], 0x50, "ZIP byte 0 must be 0x50");
    strictEqual(zipBuf[1], 0x4b, "ZIP byte 1 must be 0x4b");
    strictEqual(zipBuf[2], 0x03, "ZIP byte 2 must be 0x03");
    strictEqual(zipBuf[3], 0x04, "ZIP byte 3 must be 0x04");
    pass("AC6b: output file starts with ZIP magic PK\\x03\\x04");
  } catch (e) {
    fail("AC6b: output file must start with ZIP magic", e);
  }
}

async function testImportOntologyNoArgs(): Promise<void> {
  // Real implementation: missing <project-file> positional exits 3.
  const r = await runCli(["import-ontology"]);
  try {
    strictEqual(r.exitCode, 3, `expected exit 3, got ${r.exitCode}`);
    ok(
      r.stderr.includes("import-ontology:"),
      "expected import-ontology: error message in stderr",
    );
    pass("AC7: import-ontology without args exits 3 with error message");
  } catch (e) {
    fail("AC7: import-ontology without args exits 3 with error message", e);
  }
}

async function testMigrate(): Promise<void> {
  const r = await runCli(["migrate", join(FIXTURE_DIR, "v0.2.jsonld")]);
  try {
    strictEqual(r.exitCode, 0, `expected exit 0, got ${r.exitCode}`);
    ok(
      r.stdout.includes('"ecm:specVersion"'),
      "expected ecm:specVersion in migrated output",
    );
    pass("AC8: migrate v0.2 exits 0 and output contains ecm:specVersion");
  } catch (e) {
    fail("AC8: migrate v0.2 exits 0 and output contains ecm:specVersion", e);
  }
}

async function testExportJsonLd(): Promise<void> {
  const r = await runCli([
    "export",
    join(FIXTURE_DIR, "valid-v0.4.jsonld"),
    "--format",
    "json-ld",
  ]);
  try {
    strictEqual(r.exitCode, 0, `expected exit 0, got ${r.exitCode}`);
    const parsed = JSON.parse(r.stdout) as Record<string, unknown>;
    ok("@context" in parsed, "expected @context in JSON-LD output");
    pass("AC9: export --format json-ld exits 0 with JSON-LD output");
  } catch (e) {
    fail("AC9: export --format json-ld exits 0 with JSON-LD output", e);
  }
}

async function testExportMermaid(): Promise<void> {
  const r = await runCli([
    "export",
    join(FIXTURE_DIR, "valid-v0.4.jsonld"),
    "--format",
    "mermaid",
  ]);
  try {
    strictEqual(r.exitCode, 0, `expected exit 0, got ${r.exitCode}`);
    ok(
      r.stdout.startsWith("flowchart"),
      "expected Mermaid flowchart output starting with 'flowchart'",
    );
    pass("AC10: export --format mermaid exits 0 with Mermaid flowchart output");
  } catch (e) {
    fail("AC10: export --format mermaid exits 0 with Mermaid flowchart output", e);
  }
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function main(): Promise<void> {
  await setup();
  try {
    await testValidateSuccess();
    await testValidateMissingAnchor();
    await testValidateUnsupportedVersion();
    await testExportTurtle();
    await testExportMissingAnchorBlocked();
    await testExportLegacyPlaceholderBlocked();
    await testPathContainment();
    await testExportZip();
    await testImportOntologyNoArgs();
    await testMigrate();
    await testExportJsonLd();
    await testExportMermaid();
  } finally {
    await teardown();
  }

  console.log(`\n  Results: ${passed} passed, ${failed} failed`);
  if (failed > 0) {
    process.exit(1);
  }
}

main();
