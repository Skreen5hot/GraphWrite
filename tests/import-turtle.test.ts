/**
 * Turtle Import Tests (IMPLEMENTATION_PLAN.md Â§3.1)
 *
 * SPEC refs: Â§14.1, Â§12.2, Â§5.6, FR-C011.
 *
 * Acceptance criteria covered:
 *   AC1: importOntology(small.ttl) produces >= 1 owl:Class term. Unit test.
 *   AC2: rdfs:Class in input -> owl:Class in output. Unit test.
 *   AC3: rdfs:subClassOf values preserved verbatim. Unit test.
 *   AC4: ecm:contentHash = "sha256-" + SHA-256 of input bytes. Unit test.
 *   AC5: 51 MB input returns error result without parsing. Unit test.
 *   AC6: owl:imports NOT followed; only supplied-file terms extracted. Unit test.
 *
 * Pattern: hand-rolled per tests/run-tests.ts; no framework; node:assert;
 * process.exit(1) on failure. Follows tests/manifest-entries.test.ts.
 */

import { ok, strictEqual } from "node:assert";
import { createHash } from "node:crypto";
import { importOntology } from "../src/import/index.js";

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

const PROJECT_ID = "urn:uuid:00000000-0000-0000-0000-000000000001";
const CREATED_AT = "2026-05-26T00:00:00Z";

/** Small valid ontology: two owl:Class terms, label, comment, subClassOf. */
const SMALL_TTL = [
  "@prefix owl:  <http://www.w3.org/2002/07/owl#> .",
  "@prefix rdfs: <http://www.w3.org/2000/01/rdf-schema#> .",
  "",
  "<https://example.org/Person> a owl:Class ;",
  "  rdfs:label \"Person\"@en ;",
  "  rdfs:comment \"A human being.\" ;",
  "  rdfs:subClassOf <https://example.org/Agent> .",
  "",
  "<https://example.org/Agent> a owl:Class .",
  "",
].join("\n");

/** Ontology using rdfs:Class â€” must be normalized to owl:Class. */
const RDFS_CLASS_TTL = [
  "@prefix rdfs: <http://www.w3.org/2000/01/rdf-schema#> .",
  "",
  "<https://example.org/LegacyThing> a rdfs:Class .",
  "",
].join("\n");

/** Ontology with owl:imports declaration â€” imports must NOT be followed. */
const OWL_IMPORTS_TTL = [
  "@prefix owl: <http://www.w3.org/2002/07/owl#> .",
  "",
  "<https://example.org/MyOntology> a owl:Ontology ;",
  "  owl:imports <https://example.org/ExternalOntology> .",
  "",
  "<https://example.org/LocalClass> a owl:Class .",
  "",
].join("\n");

/** Independent SHA-256 reference hash of SMALL_TTL for AC4. */
const AC4_EXPECTED_HASH =
  "sha256-" +
  createHash("sha256").update(Buffer.from(SMALL_TTL, "utf8")).digest("hex");

// ---------------------------------------------------------------------------
// AC1: importOntology(small.ttl) produces >= 1 owl:Class term
// (IMPLEMENTATION_PLAN Â§3.1 AC1)
// ---------------------------------------------------------------------------
console.log("\nAC1: small ontology produces >= 1 owl:Class term");

try {
  const result = importOntology(SMALL_TTL, "small.ttl", PROJECT_ID, CREATED_AT);
  ok(result.ok, "importOntology must succeed on valid Turtle");
  if (!result.ok) throw new Error("result.ok is false");
  const classes = result.terms.filter((t) => t.type === "owl:Class");
  ok(classes.length >= 1, `Expected >= 1 owl:Class term; got ${classes.length}`);
  pass("small ontology produces >= 1 owl:Class term (AC1)");
} catch (e) {
  fail("small ontology must produce >= 1 owl:Class term (AC1)", e);
}

// ---------------------------------------------------------------------------
// AC2: rdfs:Class in input -> owl:Class in output
// (IMPLEMENTATION_PLAN Â§3.1 AC2)
// ---------------------------------------------------------------------------
console.log("\nAC2: rdfs:Class normalized to owl:Class");

try {
  const result = importOntology(RDFS_CLASS_TTL, "legacy.ttl", PROJECT_ID, CREATED_AT);
  ok(result.ok, "importOntology must succeed");
  if (!result.ok) throw new Error("result.ok is false");
  strictEqual(result.terms.length, 1, "Expected exactly 1 term from rdfs:Class ontology");
  strictEqual(
    result.terms[0].id,
    "https://example.org/LegacyThing",
    "Term id must be the rdfs:Class subject IRI",
  );
  strictEqual(
    result.terms[0].type,
    "owl:Class",
    "rdfs:Class must be normalized to owl:Class on import (Â§5.7, Â§14.1)",
  );
  pass("rdfs:Class in input produces owl:Class in output (AC2)");
} catch (e) {
  fail("rdfs:Class must be normalized to owl:Class on import (AC2)", e);
}

// ---------------------------------------------------------------------------
// AC3: rdfs:subClassOf values preserved verbatim
// (IMPLEMENTATION_PLAN Â§3.1 AC3)
// ---------------------------------------------------------------------------
console.log("\nAC3: rdfs:subClassOf preserved verbatim");

try {
  const result = importOntology(SMALL_TTL, "small.ttl", PROJECT_ID, CREATED_AT);
  ok(result.ok, "importOntology must succeed");
  if (!result.ok) throw new Error("result.ok is false");
  const person = result.terms.find((t) => t.id === "https://example.org/Person");
  ok(person !== undefined, "Person term must be present");
  ok(
    Array.isArray(person["rdfs:subClassOf"]) &&
      (person["rdfs:subClassOf"] as string[]).length > 0,
    "Person must have rdfs:subClassOf entries",
  );
  ok(
    (person["rdfs:subClassOf"] as string[]).includes("https://example.org/Agent"),
    "rdfs:subClassOf must contain Agent IRI verbatim (AC3)",
  );
  pass("rdfs:subClassOf preserved verbatim as named-node IRI (AC3)");
} catch (e) {
  fail("rdfs:subClassOf must be preserved verbatim (AC3)", e);
}

// ---------------------------------------------------------------------------
// AC4: ecm:contentHash = "sha256-" + SHA-256 of input bytes
// (IMPLEMENTATION_PLAN Â§3.1 AC4)
// ---------------------------------------------------------------------------
console.log("\nAC4: ecm:contentHash reference comparison");

try {
  const result = importOntology(SMALL_TTL, "small.ttl", PROJECT_ID, CREATED_AT);
  ok(result.ok, "importOntology must succeed");
  if (!result.ok) throw new Error("result.ok is false");
  strictEqual(
    result.ontology["ecm:contentHash"],
    AC4_EXPECTED_HASH,
    `ecm:contentHash must equal sha256-<SHA-256 hex>; got ${result.ontology["ecm:contentHash"]}`,
  );
  pass('ecm:contentHash = "sha256-" + SHA-256 of input bytes (AC4)');
} catch (e) {
  fail('ecm:contentHash must equal "sha256-" + SHA-256 hex (AC4)', e);
}

// ---------------------------------------------------------------------------
// AC5: 51 MB input returns error result without parsing
// (IMPLEMENTATION_PLAN Â§3.1 AC5)
// ---------------------------------------------------------------------------
console.log("\nAC5: 51 MB input rejected before parsing");

try {
  const oversized = "a".repeat(51 * 1024 * 1024); // 51 MB ASCII (1 byte per char)
  const result = importOntology(oversized, "big.ttl", PROJECT_ID, CREATED_AT);
  ok(!result.ok, "importOntology must return ok:false for oversized input");
  if (result.ok) throw new Error("result.ok is true â€” size check did not fire");
  strictEqual(result.code, "SIZE_EXCEEDED", "error code must be SIZE_EXCEEDED");
  pass("51 MB input returns ok:false with code SIZE_EXCEEDED before parsing (AC5)");
} catch (e) {
  fail("51 MB input must return error result without parsing (AC5)", e);
}

// ---------------------------------------------------------------------------
// AC6: owl:imports NOT followed; only supplied-file terms extracted
// (IMPLEMENTATION_PLAN Â§3.1 AC6)
// ---------------------------------------------------------------------------
console.log("\nAC6: owl:imports not followed");

try {
  const result = importOntology(OWL_IMPORTS_TTL, "mine.ttl", PROJECT_ID, CREATED_AT);
  ok(result.ok, "importOntology must succeed on valid Turtle with owl:imports");
  if (!result.ok) throw new Error("result.ok is false");
  const iris = result.terms.map((t) => t.id);
  ok(
    iris.includes("https://example.org/LocalClass"),
    "LocalClass must be extracted from supplied file",
  );
  ok(
    !iris.includes("https://example.org/ExternalOntology"),
    "ExternalOntology IRI must NOT appear as a term (owl:imports not followed)",
  );
  ok(
    !iris.includes("https://example.org/MyOntology"),
    "MyOntology (owl:Ontology typed) must NOT appear as an extracted term",
  );
  pass("owl:imports not followed; only supplied-file terms extracted (AC6)");
} catch (e) {
  fail("owl:imports must not be followed; only supplied-file terms extracted (AC6)", e);
}

// ---------------------------------------------------------------------------
// Summary
// ---------------------------------------------------------------------------
console.log(`\n  ${passed} passed, ${failed} failed`);
if (failed > 0) process.exit(1);
