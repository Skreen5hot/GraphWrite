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
 *   AC6: export --format zip exits 2; stderr contains "not yet implemented; available in Phase 4".
 *   AC7: import-ontology exits 2; stderr contains "not yet implemented; available in Phase 3".
 *   AC8: migrate v0.2 document exits 0; stdout contains "ecm:specVersion".
 *
 * Deferred (pending OED-306 + OED-313):
 *   - Golden-file byte-identical turtle/n-triples export.
 *   - Deterministic --seed/--clock export golden.
 *
 * Pattern: hand-rolled per tests/run-tests.ts; node:assert; process.exit(1) on failure.
 */

import { strictEqual, ok } from "node:assert";
import { spawn } from "node:child_process";
import { writeFile, rm, mkdir } from "node:fs/promises";
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
  type: ["ecm:Project", "iao:OntologyDesignPattern"],
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

async function testExportZipStub(): Promise<void> {
  const r = await runCli([
    "export",
    join(FIXTURE_DIR, "valid-v0.4.jsonld"),
    "--format",
    "zip",
  ]);
  try {
    strictEqual(r.exitCode, 2, `expected exit 2, got ${r.exitCode}`);
    ok(
      r.stderr.includes("not yet implemented; available in Phase 4"),
      "expected Phase 4 stub message in stderr",
    );
    pass("AC6: export --format zip exits 2 with Phase 4 stub message");
  } catch (e) {
    fail("AC6: export --format zip exits 2 with Phase 4 stub message", e);
  }
}

async function testImportOntologyStub(): Promise<void> {
  const r = await runCli(["import-ontology", "project.jsonld", "ontology.ttl"]);
  try {
    strictEqual(r.exitCode, 2, `expected exit 2, got ${r.exitCode}`);
    ok(
      r.stderr.includes("not yet implemented; available in Phase 3"),
      "expected Phase 3 stub message in stderr",
    );
    pass("AC7: import-ontology exits 2 with Phase 3 stub message");
  } catch (e) {
    fail("AC7: import-ontology exits 2 with Phase 3 stub message", e);
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
    await testPathContainment();
    await testExportZipStub();
    await testImportOntologyStub();
    await testMigrate();
  } finally {
    await teardown();
  }

  console.log(`\n  Results: ${passed} passed, ${failed} failed`);
  if (failed > 0) {
    process.exit(1);
  }
}

main();
