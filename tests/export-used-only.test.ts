/**
 * Export Used-Only Filter Tests (Sub-task B)
 *
 * Coverage:
 *   FLT1: mode='all' returns the exact same project reference (identity).
 *   FLT2: mode='iris-used' reduces ecm:terms to [Person, has-interest-in]
 *         (Unused Class + unused datatype property dropped).
 *   FLT3: mode='closure' pulls transitive rdfs:subClassOf ancestor A when
 *         only B (which subClassOf A) is directly used.
 *   FLT4: byte-equality -- emitTurtle(filterProjectByMode(fixture,'iris-used'))
 *         === contents of test/golden/export-used-only-mini.ttl.
 *         Path resolved via process.cwd() per the pattern in emitters.test.ts.
 *
 * Pattern: hand-rolled per tests/run-tests.ts; node:assert; process.exit(1)
 * on failure. Top-level await for FLT4 file read (ES2022 module; NodeNext).
 */

import { strictEqual, ok } from "node:assert";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { filterProjectByMode } from "../src/export/used-only-filter.js";
import { emitTurtle } from "../src/emit/turtle.js";

let passed = 0;
let failed = 0;

function pass(msg: string): void { console.log(`  \u2713 PASS: ${msg}`); passed++; }
function fail(msg: string, err?: unknown): void {
  console.error(`  \u2717 FAIL: ${msg}`);
  if (err !== undefined) console.error("  ", err instanceof Error ? err.message : String(err));
  failed++;
}

// ---------------------------------------------------------------------------
// IRI constants -- match _gen_golden.mjs exactly for byte-equality (FLT4)
// ---------------------------------------------------------------------------

const PROJ_IRI      = "https://example.com/project/0";
const PERSON_IRI    = "https://www.commoncoreontologies.org/ont00001262";
const INTEREST_IRI  = "https://www.commoncoreontologies.org/ont00001984";
const UNUSED_CLASS_IRI = "https://www.commoncoreontologies.org/ont00009999";
const UNUSED_PROP_IRI  = "https://www.commoncoreontologies.org/ont00009998";
const MAMA_IRI      = "https://example.com/project/0-mama";
const BABY_IRI      = "https://example.com/project/1-baby";
const T             = "2026-05-20T00:00:00Z";

// ---------------------------------------------------------------------------
// FULL_FIXTURE: four terms (two used, two unused), two instances, one relation.
//
// Root-level fields intentionally match _gen_golden.mjs FILTERED_FIXTURE so
// that { ...FULL_FIXTURE, 'ecm:terms': filteredTerms } is semantically
// identical to FILTERED_FIXTURE after emitTurtle's projectSemantic pass.
//
// NOTE: has-interest-in (INTEREST_IRI) does NOT carry rdfs:comment because the
// committed golden file was generated from a fixture that omitted it on that
// term; adding it would break FLT4 byte-equality.
// ---------------------------------------------------------------------------

const FULL_FIXTURE: Record<string, unknown> = {
  id: PROJ_IRI,
  type: ["ecm:Project", "ecm:OntologyDesignPattern"],
  "ecm:specVersion": "0.4",
  "ecm:name": "Export-Filter Test Project",
  "ecm:createdAt": T,
  "ecm:updatedAt": T,
  "iao:isAbout": ["ecm:UnspecifiedSubjectMatter"],
  "ecm:exportFilterMode": "iris-used",
  "ecm:terms": [
    // Used by instances (ecm:classIris)
    {
      id: PERSON_IRI, type: "owl:Class",
      "rdfs:label": "Person",
      "skos:definition": "A human being.",
      "rdfs:comment": "Generic human individual.",
      "ecm:createdAt": T, "ecm:updatedAt": T,
    },
    // Used by relation (ecm:predicateIri); no rdfs:comment -- matches golden
    {
      id: INTEREST_IRI, type: "owl:ObjectProperty",
      "rdfs:label": "has interest in",
      "skos:definition": "A relation expressing one party's interest in another.",
      "rdfs:domain": [PERSON_IRI],
      "rdfs:range": [PERSON_IRI],
      "ecm:createdAt": T, "ecm:updatedAt": T,
    },
    // Not referenced by any instance / relation / literal assertion
    {
      id: UNUSED_CLASS_IRI, type: "owl:Class",
      "rdfs:label": "Unused Class",
      "skos:definition": "A class not referenced by any instance.",
      "rdfs:comment": "Unused in this project.",
      "ecm:createdAt": T, "ecm:updatedAt": T,
    },
    {
      id: UNUSED_PROP_IRI, type: "owl:DatatypeProperty",
      "rdfs:label": "unused datatype property",
      "skos:definition": "A property not referenced by any assertion.",
      "rdfs:comment": "No literal assertions use this property.",
      "ecm:createdAt": T, "ecm:updatedAt": T,
    },
  ],
  "ecm:instances": [
    {
      id: MAMA_IRI, type: "ecm:Instance", "rdfs:label": "mama",
      "ecm:classIris": [PERSON_IRI],
      "ecm:createdAt": T, "ecm:updatedAt": T,
    },
    {
      id: BABY_IRI, type: "ecm:Instance", "rdfs:label": "baby",
      "ecm:classIris": [PERSON_IRI],
      "ecm:createdAt": T, "ecm:updatedAt": T,
    },
  ],
  "ecm:relations": [{
    id: "urn:uuid:00000000-0000-0000-0000-000000000040",
    type: "ecm:RelationAssertion",
    "ecm:subjectIri": MAMA_IRI,
    "ecm:predicateIri": INTEREST_IRI,
    "ecm:objectIri": BABY_IRI,
    "rdfs:label": "has interest in",
    "ecm:createdAt": T, "ecm:updatedAt": T,
  }],
  "ecm:literalAssertions": [],
  "ecm:ontologies": [], "ecm:layouts": [],
  "ecm:snapshots": [], "ecm:serializations": [],
};

// ---------------------------------------------------------------------------
// CLOSURE_FIXTURE: synthetic subClassOf chain for FLT3.
// B subClassOf A; only B is used by an instance; closure must pull in A.
// ---------------------------------------------------------------------------

const CLOSURE_A_IRI   = "https://example.com/ont/ClassA";
const CLOSURE_B_IRI   = "https://example.com/ont/ClassB";
const CLOSURE_INST_IRI = "https://example.com/inst/x";

const CLOSURE_FIXTURE: Record<string, unknown> = {
  id: "https://example.com/closure-project",
  type: ["ecm:Project", "ecm:OntologyDesignPattern"],
  "ecm:specVersion": "0.4",
  "ecm:name": "Closure Test Project",
  "ecm:createdAt": T, "ecm:updatedAt": T,
  "iao:isAbout": ["ecm:UnspecifiedSubjectMatter"],
  "ecm:terms": [
    {
      id: CLOSURE_A_IRI, type: "owl:Class", "rdfs:label": "A",
      "ecm:createdAt": T, "ecm:updatedAt": T,
    },
    {
      id: CLOSURE_B_IRI, type: "owl:Class", "rdfs:label": "B",
      "rdfs:subClassOf": [CLOSURE_A_IRI],
      "ecm:createdAt": T, "ecm:updatedAt": T,
    },
  ],
  "ecm:instances": [{
    id: CLOSURE_INST_IRI, type: "ecm:Instance", "rdfs:label": "x",
    "ecm:classIris": [CLOSURE_B_IRI],
    "ecm:createdAt": T, "ecm:updatedAt": T,
  }],
  "ecm:relations": [],
  "ecm:literalAssertions": [],
  "ecm:ontologies": [], "ecm:layouts": [],
  "ecm:snapshots": [], "ecm:serializations": [],
};

// ---------------------------------------------------------------------------
// FLT1: mode='all' returns the exact same reference (identity)
// ---------------------------------------------------------------------------
console.log("\nFLT1: filterProjectByMode mode='all' identity");
try {
  const resultAll = filterProjectByMode(FULL_FIXTURE, "all");
  strictEqual(
    resultAll,
    FULL_FIXTURE,
    "mode='all' must return the exact same project reference (identity function)",
  );
  pass("mode='all' returns exact same reference as input (FLT1)");
} catch (e) { fail("mode='all' identity (FLT1)", e); }

// ---------------------------------------------------------------------------
// FLT2: mode='iris-used' reduces ecm:terms to [Person, has-interest-in]
// ---------------------------------------------------------------------------
console.log("\nFLT2: filterProjectByMode mode='iris-used' term reduction");
try {
  const resultUsed = filterProjectByMode(FULL_FIXTURE, "iris-used");

  // Must not be the same reference (filter produced a new object)
  ok(
    resultUsed !== FULL_FIXTURE,
    "iris-used result must be a new object, not the original project",
  );

  const terms = resultUsed["ecm:terms"] as Array<Record<string, unknown>>;
  strictEqual(
    terms.length,
    2,
    "iris-used: ecm:terms must have exactly 2 entries (Person + has-interest-in)",
  );
  strictEqual(
    terms[0]["id"],
    PERSON_IRI,
    "iris-used: first retained term must be Person (ont00001262)",
  );
  strictEqual(
    terms[1]["id"],
    INTEREST_IRI,
    "iris-used: second retained term must be has-interest-in (ont00001984)",
  );

  // Verify unused terms are absent
  ok(
    !terms.some((t) => t["id"] === UNUSED_CLASS_IRI),
    "iris-used: Unused Class (ont00009999) must be absent from filtered terms",
  );
  ok(
    !terms.some((t) => t["id"] === UNUSED_PROP_IRI),
    "iris-used: unused datatype property (ont00009998) must be absent from filtered terms",
  );

  // Verify rdfs:domain / rdfs:range unconditionally retained on has-interest-in
  ok(
    Array.isArray(terms[1]["rdfs:domain"]),
    "iris-used: rdfs:domain must be retained on has-interest-in regardless of keptAnnotationPredicates",
  );
  ok(
    Array.isArray(terms[1]["rdfs:range"]),
    "iris-used: rdfs:range must be retained on has-interest-in regardless of keptAnnotationPredicates",
  );

  // Verify annotation predicates retained on Person
  strictEqual(
    terms[0]["rdfs:label"],
    "Person",
    "iris-used: rdfs:label retained on Person (in default kept list)",
  );
  strictEqual(
    terms[0]["skos:definition"],
    "A human being.",
    "iris-used: skos:definition retained on Person (in default kept list)",
  );
  strictEqual(
    terms[0]["rdfs:comment"],
    "Generic human individual.",
    "iris-used: rdfs:comment retained on Person (in default kept list)",
  );

  pass(
    "mode='iris-used' reduces ecm:terms to [Person, has-interest-in]; " +
    "unused terms dropped; rdfs:domain/range unconditionally retained; " +
    "annotation predicates kept per default list (FLT2)",
  );
} catch (e) { fail("mode='iris-used' term reduction (FLT2)", e); }

// ---------------------------------------------------------------------------
// FLT3: mode='closure' pulls transitive rdfs:subClassOf ancestor
// ---------------------------------------------------------------------------
console.log("\nFLT3: filterProjectByMode mode='closure' transitive ancestor");
try {
  // iris-used alone: only B is directly used by the instance
  const resultUsedOnly = filterProjectByMode(CLOSURE_FIXTURE, "iris-used");
  const usedTerms = resultUsedOnly["ecm:terms"] as Array<Record<string, unknown>>;
  strictEqual(
    usedTerms.length,
    1,
    "iris-used on closure fixture: only B (directly used) should appear",
  );
  strictEqual(
    usedTerms[0]["id"],
    CLOSURE_B_IRI,
    "iris-used on closure fixture: the one retained term must be B",
  );

  // closure: both B and its ancestor A must be present
  const resultClosure = filterProjectByMode(CLOSURE_FIXTURE, "closure");
  const closureTerms = resultClosure["ecm:terms"] as Array<Record<string, unknown>>;
  strictEqual(
    closureTerms.length,
    2,
    "closure: must include B (directly used) + A (transitive ancestor via rdfs:subClassOf)",
  );
  ok(
    closureTerms.some((t) => t["id"] === CLOSURE_B_IRI),
    "closure: B must be present (directly used)",
  );
  ok(
    closureTerms.some((t) => t["id"] === CLOSURE_A_IRI),
    "closure: A must be present (pulled in as rdfs:subClassOf ancestor of B)",
  );

  pass(
    "mode='closure' includes B (direct use) + A (transitive rdfs:subClassOf ancestor); " +
    "iris-used alone includes only B (FLT3)",
  );
} catch (e) { fail("mode='closure' transitive ancestor (FLT3)", e); }

// ---------------------------------------------------------------------------
// FLT4: byte-equality vs test/golden/export-used-only-mini.ttl
// Top-level await; path resolved via process.cwd() per emitters.test.ts F10.
// ---------------------------------------------------------------------------
console.log("\nFLT4: byte-equality vs test/golden/export-used-only-mini.ttl");
try {
  const filtered = filterProjectByMode(FULL_FIXTURE, "iris-used");
  const actual = emitTurtle(filtered);

  // Resolve from cwd (project root when running npm test); test file runs from
  // dist-tests/ after tsc, so import.meta.url-based paths misalign with fixtures.
  const goldenPath = resolve(process.cwd(), "test", "golden", "export-used-only-mini.ttl");
  const expected = await readFile(goldenPath, "utf-8");

  strictEqual(
    actual,
    expected,
    "emitTurtle(filterProjectByMode(fixture,'iris-used')) must be byte-identical " +
    "to test/golden/export-used-only-mini.ttl (operator-ratified golden)",
  );
  pass(
    "byte-equality: emitTurtle(filterProjectByMode(FULL_FIXTURE,'iris-used')) " +
    "=== test/golden/export-used-only-mini.ttl (FLT4)",
  );
} catch (e) { fail("byte-equality vs golden file (FLT4)", e); }

// ---------------------------------------------------------------------------
// Summary
// ---------------------------------------------------------------------------
console.log(`\n  ${passed} passed, ${failed} failed`);
if (failed > 0) process.exit(1);
