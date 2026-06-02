/**
 * CLI Import-Ontology Integration Tests (IMPLEMENTATION_PLAN.md \u00a73.5)
 *
 * Tests the compiled GraphWrite CLI (dist-tests/src/cli/index.js) via
 * child_process.spawn, per the established pattern in tests/cli-integration.test.ts.
 *
 * Acceptance criteria covered (IMPLEMENTATION_PLAN.md \u00a73.5):
 *   AC1: Valid Turtle input produces updated project that passes `validate` with
 *        zero errors. CLI integration test.
 *   AC2: 51 MB input file exits 2 with clear message. CLI integration test.
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

// Separate fixture directory to avoid collisions with cli-integration.test.ts.
const FIXTURE_DIR = join(__dirname, "..", "..", ".cli-import-test-fixtures");

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

/** Minimal valid v0.4 project document. */
const VALID_V04: Record<string, unknown> = {
  id: "urn:uuid:10000000-0000-0000-0000-000000000001",
  type: ["ecm:Project", "ecm:OntologyDesignPattern"],
  "ecm:specVersion": "0.4",
  "ecm:name": "Import Test Project",
  "ecm:createdAt": "2026-05-26T00:00:00Z",
  "ecm:updatedAt": "2026-05-26T00:00:00Z",
  "iao:isAbout": ["https://example.org/subjects/ImportTest"],
  "ecm:ontologies": [],
  "ecm:terms": [],
  "ecm:instances": [],
  "ecm:relations": [],
  "ecm:literalAssertions": [],
  "ecm:layouts": [],
  "ecm:snapshots": [],
  "ecm:serializations": [],
};

/** Small valid Turtle ontology with one owl:Class term. */
const VALID_TTL = [
  "@prefix owl:  <http://www.w3.org/2002/07/owl#> .",
  "@prefix rdfs: <http://www.w3.org/2000/01/rdf-schema#> .",
  "",
  "<https://example.org/TestClass> a owl:Class ;",
  "  rdfs:label \"Test Class\"@en .",
  "",
].join("\n");

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
    join(FIXTURE_DIR, "project.jsonld"),
    JSON.stringify(VALID_V04, null, 2),
    "utf-8",
  );
  await writeFile(
    join(FIXTURE_DIR, "ontology.ttl"),
    VALID_TTL,
    "utf-8",
  );
}

async function teardown(): Promise<void> {
  await rm(FIXTURE_DIR, { recursive: true, force: true });
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

/**
 * AC1: Valid Turtle input produces updated project that passes `validate`
 * with zero errors. (IMPLEMENTATION_PLAN \u00a73.5 AC1)
 *
 * Two-step test: (a) import-ontology exits 0; (b) validate on the output exits 0.
 */
async function testValidTurtleProducesValidProject(): Promise<void> {
  const projectPath = join(FIXTURE_DIR, "project.jsonld");
  const ontologyPath = join(FIXTURE_DIR, "ontology.ttl");
  const outPath = join(FIXTURE_DIR, "merged.jsonld");

  const r = await runCli([
    "import-ontology",
    projectPath,
    ontologyPath,
    "--out",
    outPath,
    "--clock",
    "2026-05-26T00:00:00Z",
  ]);
  try {
    strictEqual(
      r.exitCode,
      0,
      `import-ontology exited ${r.exitCode}; stderr: ${r.stderr}`,
    );
    pass("AC1(a): valid Turtle import exits 0");
  } catch (e) {
    fail("AC1(a): valid Turtle import must exit 0", e);
    // Cannot run validate step if import failed.
    return;
  }

  const v = await runCli(["validate", outPath]);
  try {
    strictEqual(
      v.exitCode,
      0,
      `validate exited ${v.exitCode}; stdout: ${v.stdout}; stderr: ${v.stderr}`,
    );
    ok(
      !v.stdout.includes('"ecm:error"'),
      "merged project must contain zero ecm:error findings",
    );
    pass("AC1(b): merged project passes validate with zero errors");
  } catch (e) {
    fail("AC1(b): merged project must pass validate with zero errors", e);
  }
}

/**
 * AC2: 51 MB input file exits 2 with clear message.
 * (IMPLEMENTATION_PLAN \u00a73.5 AC2)
 *
 * Writes 51 MB of ASCII content (exceeds the 50 MB hard limit in Â§12.2),
 * runs import-ontology, and asserts exit 2 with a non-empty stderr message.
 */
async function testOversizedInputExits2(): Promise<void> {
  const projectPath = join(FIXTURE_DIR, "project.jsonld");
  const bigPath = join(FIXTURE_DIR, "big.ttl");
  const outPath = join(FIXTURE_DIR, "big-merged.jsonld");

  // 51 MB of ASCII (1 byte per char in UTF-8) â€” exceeds 50 * 1024 * 1024 limit.
  const oversized = "a".repeat(51 * 1024 * 1024);
  await writeFile(bigPath, oversized, "utf-8");

  const r = await runCli([
    "import-ontology",
    projectPath,
    bigPath,
    "--out",
    outPath,
    "--clock",
    "2026-05-26T00:00:00Z",
  ]);
  try {
    strictEqual(
      r.exitCode,
      2,
      `expected exit 2, got ${r.exitCode}; stderr: ${r.stderr}`,
    );
    ok(
      r.stderr.length > 0,
      "expected non-empty stderr error message for oversized input",
    );
    pass("AC2: 51 MB input exits 2 with clear message");
  } catch (e) {
    fail("AC2: 51 MB input must exit 2 with clear message", e);
  }
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function main(): Promise<void> {
  await setup();
  try {
    await testValidTurtleProducesValidProject();
    await testOversizedInputExits2();
  } finally {
    await teardown();
  }

  console.log(`\n  Results: ${passed} passed, ${failed} failed`);
  if (failed > 0) {
    process.exit(1);
  }
}

main();
