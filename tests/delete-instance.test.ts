/**
 * Delete Instance Tests (FR-U032, SPEC section 18.2)
 *
 * Acceptance criteria covered:
 *   AC1: 4-fold cascade -- instance removed from ecm:instances; canvas node removed
 *        from ecm:layouts[*].ecm:nodes (ecm:instanceIri match); literal assertions
 *        with ecm:subjectIri match removed; relations with ecm:subjectIri OR
 *        ecm:objectIri match removed.
 *   AC2: cascadeSummary counts match actual removals.
 *   AC3: Unrelated entries in all four arrays are preserved.
 *   AC4: Idempotency -- second deleteInstance call on result produces zero counts.
 *        Also covers nonexistent instanceIri no-op.
 *   AC5: Input document is not mutated.
 *
 * Pattern: hand-rolled per tests/run-tests.ts; no framework; node:assert;
 * process.exit(1) on failure. Follows tests/iri-refactor.test.ts.
 */

import { strictEqual, deepStrictEqual, ok } from "node:assert";
import { deleteInstance } from "../src/kernel/delete-instance.js";

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

const INSTANCE_A = "urn:test:inst:A";
const INSTANCE_B = "urn:test:inst:B";
const INSTANCE_C = "urn:test:inst:C";
const RELATION_1 = "urn:test:rel:1"; // subject=A, object=B
const RELATION_2 = "urn:test:rel:2"; // subject=B, object=C (unrelated to A)
const RELATION_3 = "urn:test:rel:3"; // subject=C, object=A (object match)
const LITERAL_1  = "urn:test:lit:1"; // subjectIri=A
const LITERAL_2  = "urn:test:lit:2"; // subjectIri=B (unrelated to A)

/**
 * Full-spectrum fixture: 3 instances, 3 relations (A->B, B->C, C->A),
 * 2 literal assertions (A and B), 1 layout with 3 canvas nodes.
 * Canvas node field confirmed from fixture evidence (F4): ecm:instanceIri.
 */
const BASE_PROJECT: Record<string, unknown> = {
  "@context": { ecm: "https://edgecanonical.org/ns/modeler#" },
  id: "urn:test:project:1",
  type: ["ecm:Project"],
  "ecm:specVersion": "0.4",
  "ecm:instances": [
    { id: INSTANCE_A, type: "ecm:Instance", "ecm:classIris": [] },
    { id: INSTANCE_B, type: "ecm:Instance", "ecm:classIris": [] },
    { id: INSTANCE_C, type: "ecm:Instance", "ecm:classIris": [] },
  ],
  "ecm:layouts": [
    {
      id: "urn:test:layout:1",
      type: "ecm:CanvasLayout",
      "ecm:nodes": [
        { type: "ecm:CanvasNode", "ecm:instanceIri": INSTANCE_A, "ecm:x": 0,   "ecm:y": 0 },
        { type: "ecm:CanvasNode", "ecm:instanceIri": INSTANCE_B, "ecm:x": 200, "ecm:y": 0 },
        { type: "ecm:CanvasNode", "ecm:instanceIri": INSTANCE_C, "ecm:x": 400, "ecm:y": 0 },
      ],
    },
  ],
  "ecm:literalAssertions": [
    {
      id: LITERAL_1,
      type: "ecm:LiteralAssertion",
      "ecm:subjectIri": INSTANCE_A,
      "ecm:predicateIri": "urn:test:pred:name",
      "ecm:value": "Alice",
      "ecm:datatype": "xsd:string",
      "ecm:language": null,
    },
    {
      id: LITERAL_2,
      type: "ecm:LiteralAssertion",
      "ecm:subjectIri": INSTANCE_B,
      "ecm:predicateIri": "urn:test:pred:name",
      "ecm:value": "Bob",
      "ecm:datatype": "xsd:string",
      "ecm:language": null,
    },
  ],
  "ecm:relations": [
    {
      id: RELATION_1,
      type: "ecm:RelationAssertion",
      "ecm:subjectIri": INSTANCE_A,
      "ecm:predicateIri": "urn:test:pred:rel",
      "ecm:objectIri": INSTANCE_B,
    },
    {
      id: RELATION_2,
      type: "ecm:RelationAssertion",
      "ecm:subjectIri": INSTANCE_B,
      "ecm:predicateIri": "urn:test:pred:rel",
      "ecm:objectIri": INSTANCE_C,
    },
    {
      id: RELATION_3,
      type: "ecm:RelationAssertion",
      "ecm:subjectIri": INSTANCE_C,
      "ecm:predicateIri": "urn:test:pred:rel",
      "ecm:objectIri": INSTANCE_A,
    },
  ],
  "ecm:snapshots": [{ id: "urn:test:snap:1", type: "ecm:Snapshot" }],
  "ecm:terms": [],
};

// ---------------------------------------------------------------------------
// AC1 + AC2: Basic 4-fold cascade and cascadeSummary counts (delete INSTANCE_A)
// ---------------------------------------------------------------------------

console.log("\nAC1 + AC2: basic 4-fold cascade (delete INSTANCE_A)");

try {
  const result = deleteInstance(BASE_PROJECT, INSTANCE_A);
  const doc = result.document;
  const summary = result.cascadeSummary;

  // ecm:instances: A removed; B and C remain
  const instances = doc["ecm:instances"] as Record<string, unknown>[];
  ok(Array.isArray(instances), "ecm:instances is array");
  strictEqual(instances.length, 2, "2 instances remain after deleting A");
  ok(!instances.some((i) => i["id"] === INSTANCE_A), "A removed from ecm:instances");
  ok(instances.some((i) => i["id"] === INSTANCE_B), "B preserved in ecm:instances");
  ok(instances.some((i) => i["id"] === INSTANCE_C), "C preserved in ecm:instances");
  pass("AC1: ecm:instances correctly filtered");

  // ecm:layouts[0].ecm:nodes: A's node removed; B and C nodes remain
  const layouts = doc["ecm:layouts"] as Record<string, unknown>[];
  ok(Array.isArray(layouts), "ecm:layouts is array");
  strictEqual(layouts.length, 1, "layout count unchanged");
  const nodes = layouts[0]["ecm:nodes"] as Record<string, unknown>[];
  ok(Array.isArray(nodes), "ecm:nodes is array");
  strictEqual(nodes.length, 2, "2 canvas nodes remain after deleting A");
  ok(!nodes.some((n) => n["ecm:instanceIri"] === INSTANCE_A), "A's canvas node removed");
  ok(nodes.some((n) => n["ecm:instanceIri"] === INSTANCE_B), "B's canvas node preserved");
  ok(nodes.some((n) => n["ecm:instanceIri"] === INSTANCE_C), "C's canvas node preserved");
  pass("AC1: ecm:layouts[*].ecm:nodes correctly filtered");

  // ecm:literalAssertions: A's literal removed; B's literal remains
  const literals = doc["ecm:literalAssertions"] as Record<string, unknown>[];
  ok(Array.isArray(literals), "ecm:literalAssertions is array");
  strictEqual(literals.length, 1, "1 literal assertion remains");
  strictEqual(literals[0]["id"], LITERAL_2, "only B's literal remains");
  pass("AC1: ecm:literalAssertions correctly filtered (subjectIri match)");

  // ecm:relations: RELATION_1 (subj=A) and RELATION_3 (obj=A) removed; RELATION_2 (B->C) remains
  const relations = doc["ecm:relations"] as Record<string, unknown>[];
  ok(Array.isArray(relations), "ecm:relations is array");
  strictEqual(relations.length, 1, "1 relation remains after deleting A");
  strictEqual(relations[0]["id"], RELATION_2, "only B->C relation remains");
  pass("AC1: ecm:relations correctly filtered (subjectIri AND objectIri match)");

  // cascadeSummary
  strictEqual(summary.canvasNodesRemoved, 1, "cascadeSummary.canvasNodesRemoved === 1");
  strictEqual(summary.literalAssertionsRemoved, 1, "cascadeSummary.literalAssertionsRemoved === 1");
  strictEqual(summary.relationsRemoved, 2, "cascadeSummary.relationsRemoved === 2");
  pass("AC2: cascadeSummary counts correct");

  // ecm:snapshots untouched
  deepStrictEqual(
    doc["ecm:snapshots"],
    BASE_PROJECT["ecm:snapshots"],
    "ecm:snapshots not modified",
  );
  pass("AC1: ecm:snapshots untouched");

} catch (err) {
  fail("AC1+AC2: basic 4-fold cascade", err);
}

// ---------------------------------------------------------------------------
// AC3: Unrelated entries preserved (delete INSTANCE_B)
// ---------------------------------------------------------------------------

console.log("\nAC3: unrelated entries preserved (delete INSTANCE_B)");

try {
  const result = deleteInstance(BASE_PROJECT, INSTANCE_B);
  const doc = result.document;

  // A and C instances preserved
  const instances = doc["ecm:instances"] as Record<string, unknown>[];
  ok(!instances.some((i) => i["id"] === INSTANCE_B), "B removed from ecm:instances");
  ok(instances.some((i) => i["id"] === INSTANCE_A), "A preserved");
  ok(instances.some((i) => i["id"] === INSTANCE_C), "C preserved");
  pass("AC3: A and C instances preserved after deleting B");

  // Relations: B appears as subjectIri in RELATION_2 and objectIri in RELATION_1
  // RELATION_3 (C->A) is unrelated to B and must be preserved
  const relations = doc["ecm:relations"] as Record<string, unknown>[];
  strictEqual(relations.length, 1, "1 relation survives after deleting B");
  strictEqual(relations[0]["id"], RELATION_3, "C->A relation preserved");
  pass("AC3: only B-involving relations removed; C->A preserved");

  // Literals: A's literal preserved; B's literal removed
  const literals = doc["ecm:literalAssertions"] as Record<string, unknown>[];
  strictEqual(literals.length, 1, "A's literal preserved");
  strictEqual(literals[0]["id"], LITERAL_1, "A's literal is the surviving one");
  pass("AC3: A's literal assertion preserved");

  // cascadeSummary for B
  strictEqual(result.cascadeSummary.canvasNodesRemoved, 1, "1 canvas node removed for B");
  strictEqual(result.cascadeSummary.literalAssertionsRemoved, 1, "1 literal removed for B");
  strictEqual(result.cascadeSummary.relationsRemoved, 2, "2 relations removed for B (subject + object)");
  pass("AC3: cascadeSummary correct for B deletion");

} catch (err) {
  fail("AC3: unrelated entries preservation", err);
}

// ---------------------------------------------------------------------------
// AC4: Idempotency -- delete-then-delete produces zero counts on second call
// ---------------------------------------------------------------------------

console.log("\nAC4: idempotency (delete INSTANCE_A twice)");

try {
  const first = deleteInstance(BASE_PROJECT, INSTANCE_A);
  const second = deleteInstance(first.document, INSTANCE_A);

  strictEqual(second.cascadeSummary.canvasNodesRemoved, 0, "idempotent: canvasNodesRemoved === 0");
  strictEqual(second.cascadeSummary.literalAssertionsRemoved, 0, "idempotent: literalAssertionsRemoved === 0");
  strictEqual(second.cascadeSummary.relationsRemoved, 0, "idempotent: relationsRemoved === 0");
  pass("AC4: second delete call returns zero counts (no-op)");

  const firstLen = (first.document["ecm:instances"] as unknown[]).length;
  const secondLen = (second.document["ecm:instances"] as unknown[]).length;
  strictEqual(firstLen, secondLen, "idempotent: ecm:instances count unchanged on second call");
  pass("AC4: second call document unchanged relative to first call result");

} catch (err) {
  fail("AC4: idempotency", err);
}

// ---------------------------------------------------------------------------
// AC4b: Nonexistent instanceIri -- no-op, all counts zero
// ---------------------------------------------------------------------------

console.log("\nAC4b: nonexistent instanceIri is a no-op");

try {
  const result = deleteInstance(BASE_PROJECT, "urn:test:inst:NONEXISTENT");
  strictEqual(result.cascadeSummary.canvasNodesRemoved, 0, "no-op: canvasNodesRemoved === 0");
  strictEqual(result.cascadeSummary.literalAssertionsRemoved, 0, "no-op: literalAssertionsRemoved === 0");
  strictEqual(result.cascadeSummary.relationsRemoved, 0, "no-op: relationsRemoved === 0");
  const instances = result.document["ecm:instances"] as unknown[];
  strictEqual(instances.length, 3, "no-op: all 3 instances preserved");
  pass("AC4b: nonexistent IRI produces all-zero cascadeSummary");
} catch (err) {
  fail("AC4b: nonexistent IRI no-op", err);
}

// ---------------------------------------------------------------------------
// AC5: Input document not mutated
// ---------------------------------------------------------------------------

console.log("\nAC5: input immutability");

try {
  const projectCopy = JSON.parse(JSON.stringify(BASE_PROJECT)) as Record<string, unknown>;
  deleteInstance(projectCopy, INSTANCE_A);
  deepStrictEqual(
    projectCopy,
    BASE_PROJECT,
    "input document must not be mutated by deleteInstance",
  );
  pass("AC5: input document not mutated");
} catch (err) {
  fail("AC5: input immutability", err);
}

// ---------------------------------------------------------------------------
// Summary
// ---------------------------------------------------------------------------

console.log(`\n  ${passed} passed, ${failed} failed`);
if (failed > 0) process.exit(1);
