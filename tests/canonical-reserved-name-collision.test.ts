/**
 * Canonical Reserved Name Collision Tests (SPEC section 5.7.1, section 17.2)
 *
 * Validator: CANONICAL_RESERVED_NAME_COLLISION (severity: ecm:error)
 * Acceptance criteria:
 *   AC1: project-created term + canonical IRI -> emits CANONICAL_RESERVED_NAME_COLLISION (ecm:error)
 *   AC2: imported-ontology term + canonical IRI -> no finding (exempt per section 5.7.1)
 *   AC3: project-created term + non-canonical IRI -> no finding
 *   AC4: empty ecm:terms -> no finding
 *   AC5: ecm:target = colliding term id; ecm:message includes label and IRI
 *   AC6: all 8 IRIs in RESERVED_CANONICAL_IRIS trigger the finding
 *
 * Pattern: hand-rolled per tests/run-tests.ts; node:assert; process.exit(1) on failure.
 */

import { strictEqual, ok } from "node:assert";
import { validate, type ValidationFinding } from "../src/validate/index.js";
import { RESERVED_CANONICAL_IRIS } from "../src/validate/reserved-names.js";

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

/** Minimal fully valid v0.4 project document (no findings expected). */
const BASE: Record<string, unknown> = {
  id: "urn:uuid:00000000-0000-0000-0000-000000000101",
  type: ["ecm:Project", "ecm:OntologyDesignPattern"],
  "ecm:specVersion": "0.4",
  "ecm:name": "J1 Canonical Reserved Name Test Project",
  "ecm:createdAt": "2026-05-21T00:00:00Z",
  "ecm:updatedAt": "2026-05-21T00:00:00Z",
  "iao:isAbout": ["https://example.org/subjects/J1Test"],
  "ecm:ontologies": [],
  "ecm:terms": [],
  "ecm:instances": [],
  "ecm:relations": [],
  "ecm:literalAssertions": [],
  "ecm:layouts": [],
  "ecm:snapshots": [],
  "ecm:serializations": [],
};

// Representative canonical IRI for single-entry tests (rdfs:label full IRI)
const CANONICAL_IRI = RESERVED_CANONICAL_IRIS[0];

function makeProjectCreatedTerm(id: string): Record<string, unknown> {
  return {
    id,
    type: "owl:Class",
    "rdfs:label": "test-label",
    "ecm:source": "ecm:project-created",
    "ecm:createdAt": "2026-05-21T00:00:00Z",
    "ecm:updatedAt": "2026-05-21T00:00:00Z",
    "ecm:ontologyId": null,
  };
}

function makeImportedTerm(id: string): Record<string, unknown> {
  return { ...makeProjectCreatedTerm(id), "ecm:source": "ecm:imported-ontology" };
}

function findingsByCode(
  project: Record<string, unknown>,
  code: string,
): ValidationFinding[] {
  const report = validate(project);
  return (report["ecm:findings"] as ValidationFinding[]).filter(
    (f) => f["ecm:code"] === code,
  );
}

const CODE = "CANONICAL_RESERVED_NAME_COLLISION";

// ---------------------------------------------------------------------------
// AC1: project-created + canonical IRI -> emits error
// ---------------------------------------------------------------------------
console.log("\nAC1: project-created + canonical IRI -> CANONICAL_RESERVED_NAME_COLLISION");

try {
  const project = { ...BASE, "ecm:terms": [makeProjectCreatedTerm(CANONICAL_IRI)] };
  const hits = findingsByCode(project, CODE);
  strictEqual(hits.length, 1, `Expected 1 ${CODE}; got ${hits.length}`);
  strictEqual(hits[0]["ecm:severity"], "ecm:error", "severity must be ecm:error");
  pass("project-created + canonical IRI emits CANONICAL_RESERVED_NAME_COLLISION (AC1)");
} catch (e) {
  fail("AC1: project-created + canonical IRI must emit error", e);
}

// ---------------------------------------------------------------------------
// AC2: imported-ontology + canonical IRI -> no finding (exempt)
// ---------------------------------------------------------------------------
console.log("\nAC2: imported-ontology + canonical IRI -> exempt (no finding)");

try {
  const project = { ...BASE, "ecm:terms": [makeImportedTerm(CANONICAL_IRI)] };
  const hits = findingsByCode(project, CODE);
  strictEqual(hits.length, 0, `Expected 0 findings for imported-ontology; got ${hits.length}`);
  pass("imported-ontology + canonical IRI is exempt (no finding) (AC2)");
} catch (e) {
  fail("AC2: imported-ontology + canonical IRI must be exempt", e);
}

// ---------------------------------------------------------------------------
// AC3: project-created + non-canonical IRI -> no finding
// ---------------------------------------------------------------------------
console.log("\nAC3: project-created + non-canonical IRI -> no finding");

try {
  const project = {
    ...BASE,
    "ecm:terms": [makeProjectCreatedTerm("https://example.org/ns/MyClass")],
  };
  const hits = findingsByCode(project, CODE);
  strictEqual(hits.length, 0, `Expected 0 findings for non-canonical IRI; got ${hits.length}`);
  pass("project-created + non-canonical IRI produces no finding (AC3)");
} catch (e) {
  fail("AC3: project-created + non-canonical IRI must produce no finding", e);
}

// ---------------------------------------------------------------------------
// AC4: empty ecm:terms -> no finding
// ---------------------------------------------------------------------------
console.log("\nAC4: empty ecm:terms -> no finding");

try {
  const hits = findingsByCode(BASE, CODE);
  strictEqual(hits.length, 0, `Expected 0 findings for empty ecm:terms; got ${hits.length}`);
  pass("empty ecm:terms produces no CANONICAL_RESERVED_NAME_COLLISION (AC4)");
} catch (e) {
  fail("AC4: empty ecm:terms must produce no finding", e);
}

// ---------------------------------------------------------------------------
// AC5: ecm:target = colliding term id; ecm:message contains label and IRI
// ---------------------------------------------------------------------------
console.log("\nAC5: ecm:target = term id; ecm:message includes label and IRI");

try {
  const project = { ...BASE, "ecm:terms": [makeProjectCreatedTerm(CANONICAL_IRI)] };
  const hits = findingsByCode(project, CODE);
  strictEqual(hits.length, 1);
  strictEqual(
    hits[0]["ecm:target"],
    CANONICAL_IRI,
    `ecm:target must equal the colliding term id "${CANONICAL_IRI}"`,
  );
  ok(
    (hits[0]["ecm:message"] as string).includes("test-label"),
    "ecm:message must include the term label",
  );
  ok(
    (hits[0]["ecm:message"] as string).includes(CANONICAL_IRI),
    "ecm:message must include the canonical IRI",
  );
  pass("ecm:target = term id; ecm:message contains label and IRI (AC5)");
} catch (e) {
  fail("AC5: ecm:target and ecm:message content", e);
}

// ---------------------------------------------------------------------------
// AC6: all 8 IRIs in RESERVED_CANONICAL_IRIS trigger the finding
// ---------------------------------------------------------------------------
console.log("\nAC6: all 8 canonical IRIs trigger CANONICAL_RESERVED_NAME_COLLISION");

try {
  strictEqual(
    RESERVED_CANONICAL_IRIS.length,
    8,
    "RESERVED_CANONICAL_IRIS must have exactly 8 entries per SPEC section 5.7.1",
  );
  for (const iri of RESERVED_CANONICAL_IRIS) {
    const project = { ...BASE, "ecm:terms": [makeProjectCreatedTerm(iri)] };
    const hits = findingsByCode(project, CODE);
    if (hits.length !== 1) {
      throw new Error(`IRI "${iri}" did not trigger ${CODE} (got ${hits.length} findings)`);
    }
  }
  pass(`all ${RESERVED_CANONICAL_IRIS.length} canonical IRIs trigger ${CODE} (AC6)`);
} catch (e) {
  fail("AC6: all 8 canonical IRIs must trigger CANONICAL_RESERVED_NAME_COLLISION", e);
}

// ---------------------------------------------------------------------------
// Summary
// ---------------------------------------------------------------------------
console.log(`\n  ${passed} passed, ${failed} failed`);
if (failed > 0) process.exit(1);
