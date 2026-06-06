/**
 * Manifest JSON-LD Tests (IMPLEMENTATION_PLAN.md section 4.5)
 *
 * SPEC refs: section 19, section 5.15, NFR-014.
 * ADR refs: ADR-010.
 *
 * Acceptance criteria:
 *   AC1: buildManifestJsonLd output is valid JSON (parses with JSON.parse). Test.
 *   AC2: Project node type array contains "ecm:Project" and
 *        "ecm:OntologyDesignPattern". Parse assertion.
 *   AC3: @graph contains 5 TBox nodes (SPEC section 5.14 entity set). Count.
 *   AC4: One ecm:Serialization node per artifact. Count assertion.
 *   AC5: Each ecm:isSerializationOf equals project root id. Assertion.
 *   AC6: Empty-artifacts golden-file byte comparison (deterministic output;
 *        serialization entry ids are UUIDs and therefore non-deterministic).
 *
 * Pattern: hand-rolled per tests/run-tests.ts; node:assert; process.exit(1)
 * on failure.
 */

import { strictEqual, ok, deepStrictEqual } from "node:assert";
import { readFile } from "node:fs/promises";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { buildManifestJsonLd } from "../src/manifest/build.js";
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
// Fixtures
// ---------------------------------------------------------------------------

const PROJECT_SIMPLE: Record<string, unknown> = {
  id: "urn:uuid:00000000-0000-0000-0000-000000000001",
  type: ["ecm:OntologyDesignPattern", "ecm:Project"],
  "ecm:specVersion": "0.4",
  "ecm:name": "Test Manifest Project",
  "iao:isAbout": ["https://example.org/subjects/Test"],
};

const ARTIFACT_TTL: ArtifactInput = {
  filename: "graph.ttl",
  contentBytes: "@prefix ecm: <https://edgecanonical.org/ns/modeler#> .\n",
  format: "text/turtle",
  generatedAt: "2026-01-01T00:00:00Z",
};

const ARTIFACT_JSONLD: ArtifactInput = {
  filename: "graph.jsonld",
  contentBytes: '{"@context": {}, "@graph": []}',
  format: "application/ld+json",
  generatedAt: "2026-01-01T00:00:00Z",
};

// ---------------------------------------------------------------------------
// AC1: output is valid JSON
// ---------------------------------------------------------------------------
console.log("\nAC1: buildManifestJsonLd output is valid JSON");

try {
  const result = buildManifestJsonLd(PROJECT_SIMPLE, [ARTIFACT_TTL]);
  const parsed = JSON.parse(result) as Record<string, unknown>;
  ok(
    parsed !== null && typeof parsed === "object",
    "result must parse as a JSON object",
  );
  ok("@context" in parsed, "parsed document must have @context");
  ok("@graph" in parsed, "parsed document must have @graph");
  pass("AC1: output is valid JSON with @context and @graph (AC1)");
} catch (e) {
  fail("AC1: output must be valid JSON with @context and @graph", e);
}

try {
  buildManifestJsonLd({}, []);
  fail("AC1 guard: absent project.id must throw");
} catch {
  pass("AC1 guard: absent project.id throws Error");
}

// ---------------------------------------------------------------------------
// AC2: Project node type contains ecm:Project + ecm:OntologyDesignPattern
// ---------------------------------------------------------------------------
console.log("\nAC2: project node type assertions");

try {
  const result = buildManifestJsonLd(PROJECT_SIMPLE, []);
  const doc = JSON.parse(result) as { "@graph": Record<string, unknown>[] };
  const projectNode = doc["@graph"].find(
    (n) => n["id"] === PROJECT_SIMPLE["id"],
  );
  ok(projectNode !== undefined, "project node must be in @graph");
  const types = projectNode!["type"] as string[];
  ok(Array.isArray(types), "type must be an array");
  ok(types.includes("ecm:Project"), "type must include ecm:Project");
  ok(
    types.includes("ecm:OntologyDesignPattern"),
    "type must include ecm:OntologyDesignPattern (SPEC section 19)",
  );
  deepStrictEqual(
    [...types].sort(),
    ["ecm:OntologyDesignPattern", "ecm:Project"],
    "type array must be sorted and contain exactly ecm:Project + ecm:OntologyDesignPattern",
  );
  pass("AC2: project node type contains ecm:Project + ecm:OntologyDesignPattern");
} catch (e) {
  fail("AC2: project node type assertions", e);
}

// ---------------------------------------------------------------------------
// AC3: @graph contains 5 TBox nodes (SPEC section 5.14)
// ---------------------------------------------------------------------------
console.log("\nAC3: TBox node count in @graph");

try {
  const result = buildManifestJsonLd(PROJECT_SIMPLE, []);
  const doc = JSON.parse(result) as { "@graph": Record<string, unknown>[] };
  const tboxIds = new Set([
    "ecm:OntologyDesignPattern",
    "ecm:Project",
    "ecm:Serialization",
    "ecm:UnspecifiedSubjectMatter",
    "ecm:isSerializationOf",
  ]);
  const tboxNodes = doc["@graph"].filter((n) => tboxIds.has(String(n["id"])));
  strictEqual(tboxNodes.length, 5, "@graph must contain exactly 5 TBox nodes");
  pass("AC3: @graph contains exactly 5 TBox nodes from SPEC section 5.14");
} catch (e) {
  fail("AC3: @graph must contain exactly 5 TBox nodes", e);
}

// ---------------------------------------------------------------------------
// AC4: one ecm:Serialization node per artifact
// ---------------------------------------------------------------------------
console.log("\nAC4: serialization entry count");

try {
  const result0 = buildManifestJsonLd(PROJECT_SIMPLE, []);
  const doc0 = JSON.parse(result0) as { "@graph": Record<string, unknown>[] };
  const serCount0 = doc0["@graph"].filter(
    (n) => n["type"] === "ecm:Serialization",
  ).length;
  strictEqual(serCount0, 0, "0 artifacts must produce 0 ecm:Serialization nodes");
  pass("AC4: 0 artifacts -> 0 ecm:Serialization nodes");
} catch (e) {
  fail("AC4: 0 artifacts must produce 0 ecm:Serialization nodes", e);
}

try {
  const result2 = buildManifestJsonLd(PROJECT_SIMPLE, [ARTIFACT_TTL, ARTIFACT_JSONLD]);
  const doc2 = JSON.parse(result2) as { "@graph": Record<string, unknown>[] };
  const serCount2 = doc2["@graph"].filter(
    (n) => n["type"] === "ecm:Serialization",
  ).length;
  strictEqual(serCount2, 2, "2 artifacts must produce 2 ecm:Serialization nodes");
  pass("AC4: 2 artifacts -> 2 ecm:Serialization nodes");
} catch (e) {
  fail("AC4: 2 artifacts must produce 2 ecm:Serialization nodes", e);
}

// ---------------------------------------------------------------------------
// AC5: ecm:isSerializationOf equals project root id on all Serialization nodes
// ---------------------------------------------------------------------------
console.log("\nAC5: ecm:isSerializationOf linkage");

try {
  const result = buildManifestJsonLd(PROJECT_SIMPLE, [ARTIFACT_TTL, ARTIFACT_JSONLD]);
  const doc = JSON.parse(result) as { "@graph": Record<string, unknown>[] };
  const serNodes = doc["@graph"].filter(
    (n) => n["type"] === "ecm:Serialization",
  );
  for (const node of serNodes) {
    strictEqual(
      node["ecm:isSerializationOf"],
      PROJECT_SIMPLE["id"],
      `ecm:isSerializationOf must equal project id on node ${String(node["id"])}`,
    );
  }
  pass("AC5: all ecm:isSerializationOf values equal project root id");
} catch (e) {
  fail("AC5: ecm:isSerializationOf must equal project root id", e);
}

// ---------------------------------------------------------------------------
// AC6: golden-file byte comparison (no artifacts; deterministic)
// ---------------------------------------------------------------------------
console.log("\nAC6: golden-file byte comparison");

try {
  // Load the canonical-v0.4/minimal.jsonld fixture (ADR-010 designated input).
  const fixturePath = join(
    __dirname, "..", "..", "test", "fixtures", "canonical-v0.4", "minimal.jsonld",
  );
  const fixtureRaw = await readFile(fixturePath, "utf-8");
  const fixtureProject = JSON.parse(fixtureRaw) as Record<string, unknown>;

  // Generate manifest with no artifacts (empty artifacts -> no UUIDs -> deterministic).
  const actual = buildManifestJsonLd(fixtureProject, []);

  // Compare to committed golden file.
  const goldenPath = join(__dirname, "..", "..", "test", "golden", "manifest.jsonld");
  let golden: string;
  try {
    golden = await readFile(goldenPath, "utf-8");
  } catch {
    fail(
      "AC6: test/golden/manifest.jsonld not found -- commit the golden file " +
        "(run the test once to verify output, then commit test/golden/manifest.jsonld)",
    );
    console.log(`\n  ${passed} passed, ${failed} failed`);
    if (failed > 0) process.exit(1);
    process.exit(0);
  }

  strictEqual(actual, golden, "manifest output must be byte-identical to test/golden/manifest.jsonld");
  pass("AC6: manifest output is byte-identical to test/golden/manifest.jsonld");
} catch (e) {
  fail("AC6: golden-file byte comparison", e);
}

// ---------------------------------------------------------------------------
// Summary
// ---------------------------------------------------------------------------
console.log(`\n  ${passed} passed, ${failed} failed`);
if (failed > 0) process.exit(1);
