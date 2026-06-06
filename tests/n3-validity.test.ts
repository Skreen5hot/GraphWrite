/**
 * N3 Validity Tests -- Chain 4 (IMPLEMENTATION_PLAN.md section 4.7)
 *
 * SPEC refs: section 17.6.
 *
 * Coverage:
 *   NV1: emitTurtle on MINIMAL_PROJECT parses cleanly under N3.js (section 17.6).
 *   NV2: emitNTriples on MINIMAL_PROJECT parses cleanly under N3.js (section 17.6).
 *   NV3: emitTurtle on NON_TRIVIAL_PROJECT parses cleanly under N3.js (section 17.6).
 *   NV4: emitNTriples on NON_TRIVIAL_PROJECT parses cleanly under N3.js (section 17.6).
 *   NV5: Golden-file scan: all *.ttl files in test/golden/ parse cleanly (section 4.7).
 *        Passes vacuously when no *.ttl files are present.
 *   NV6: Golden-file scan: all *.nt files in test/golden/ parse cleanly (section 4.7).
 *        Passes vacuously when no *.nt files are present.
 *
 * Pattern: hand-rolled per tests/run-tests.ts; node:assert; process.exit(1) on failure.
 * Duck-type RdfTerm/RdfQuad (avoids N3 type-resolution issues under NodeNext, per F9).
 * Golden-file scan uses top-level await (ES2022 module; tsconfig target ES2022).
 */

import { ok } from "node:assert";
import { readdir, readFile } from "node:fs/promises";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { Parser } from "n3";
import { emitTurtle }   from "../src/emit/turtle.js";
import { emitNTriples } from "../src/emit/n-triples.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname  = dirname(__filename);

let passed = 0;
let failed = 0;

function pass(msg: string): void { console.log(`  \u2713 PASS: ${msg}`); passed++; }
function fail(msg: string, err?: unknown): void {
  console.error(`  \u2717 FAIL: ${msg}`);
  if (err !== undefined) console.error("  ", err instanceof Error ? err.message : String(err));
  failed++;
}

// ---------------------------------------------------------------------------
// Duck-type RDF interfaces (avoids N3 type-resolution issues under NodeNext)
// ---------------------------------------------------------------------------

interface RdfTerm { value: string; }
interface RdfQuad { subject: RdfTerm; predicate: RdfTerm; object: RdfTerm; }

// ---------------------------------------------------------------------------
// Fixture: minimal VMP project
// Matches MINIMAL_PROJECT in tests/emitters.test.ts (same IRIs and shape).
// ---------------------------------------------------------------------------

const PROJ_IRI   = "urn:uuid:00000000-0000-0000-0000-000000000001";
const TERM_IRI   = "urn:uuid:00000000-0000-0000-0000-000000000010";
const INST_A_IRI = "urn:uuid:00000000-0000-0000-0000-000000000020";
const INST_B_IRI = "urn:uuid:00000000-0000-0000-0000-000000000021";
const PRED_IRI   = "urn:uuid:00000000-0000-0000-0000-000000000030";
const LIT_PRED   = "urn:uuid:00000000-0000-0000-0000-000000000031";

const MINIMAL_PROJECT: Record<string, unknown> = {
  id: PROJ_IRI,
  type: ["ecm:Project", "ecm:OntologyDesignPattern"],
  "ecm:specVersion": "0.4",
  "ecm:name": "Emitter Test Project",
  "ecm:createdAt": "2026-05-20T00:00:00Z",
  "ecm:updatedAt": "2026-05-20T00:00:00Z",
  "iao:isAbout": ["ecm:UnspecifiedSubjectMatter"],
  "ecm:terms": [{
    id: TERM_IRI, type: "owl:Class", "rdfs:label": "TestTerm",
    "ecm:createdAt": "2026-05-20T00:00:00Z", "ecm:updatedAt": "2026-05-20T00:00:00Z",
  }],
  "ecm:instances": [
    {
      id: INST_A_IRI, type: "ecm:Instance", "rdfs:label": "Alice",
      "ecm:classIris": [TERM_IRI],
      "ecm:createdAt": "2026-05-20T00:00:00Z", "ecm:updatedAt": "2026-05-20T00:00:00Z",
    },
    {
      id: INST_B_IRI, type: "ecm:Instance", "rdfs:label": "Bob",
      "ecm:classIris": [TERM_IRI],
      "ecm:createdAt": "2026-05-20T00:00:00Z", "ecm:updatedAt": "2026-05-20T00:00:00Z",
    },
  ],
  "ecm:relations": [{
    id: "urn:uuid:00000000-0000-0000-0000-000000000040",
    type: "ecm:RelationAssertion",
    "ecm:subjectIri": INST_A_IRI, "ecm:predicateIri": PRED_IRI, "ecm:objectIri": INST_B_IRI,
    "rdfs:label": "knows",
    "ecm:createdAt": "2026-05-20T00:00:00Z", "ecm:updatedAt": "2026-05-20T00:00:00Z",
  }],
  "ecm:literalAssertions": [{
    id: "urn:uuid:00000000-0000-0000-0000-000000000050",
    type: "ecm:LiteralAssertion",
    "ecm:subjectIri": INST_A_IRI, "ecm:predicateIri": LIT_PRED,
    "ecm:value": "Alice Smith", "ecm:datatype": "xsd:string", "ecm:language": null,
    "ecm:createdAt": "2026-05-20T00:00:00Z", "ecm:updatedAt": "2026-05-20T00:00:00Z",
  }],
  "ecm:ontologies": [], "ecm:layouts": [], "ecm:snapshots": [], "ecm:serializations": [],
};

// ---------------------------------------------------------------------------
// Fixture: non-trivial VMP project
// Exercises: multiple owl:Class terms, rdfs:subClassOf (section 5.8), rdfs:comment,
// multiple ecm:classIris per instance (section 5.8), xsd:integer literal (section 5.10).
// IRIs use "aaaa0000" prefix to distinguish from MINIMAL_PROJECT "00000000" IRIs.
// ---------------------------------------------------------------------------

const NT_PROJ_IRI  = "urn:uuid:aaaa0000-0000-0000-0000-000000000001";
const NT_TERM1_IRI = "urn:uuid:aaaa0000-0000-0000-0000-000000000010";  // Person (owl:Class)
const NT_TERM2_IRI = "urn:uuid:aaaa0000-0000-0000-0000-000000000011";  // Employee (owl:Class, subClassOf Person)
const NT_TERM3_IRI = "urn:uuid:aaaa0000-0000-0000-0000-000000000012";  // worksFor (owl:ObjectProperty)
const NT_INST1_IRI = "urn:uuid:aaaa0000-0000-0000-0000-000000000020";  // Carol (Person + Employee)
const NT_INST2_IRI = "urn:uuid:aaaa0000-0000-0000-0000-000000000021";  // Dave (Person)
const NT_LIT_PRED  = "urn:uuid:aaaa0000-0000-0000-0000-000000000050";

const NON_TRIVIAL_PROJECT: Record<string, unknown> = {
  id: NT_PROJ_IRI,
  type: ["ecm:Project", "ecm:OntologyDesignPattern"],
  "ecm:specVersion": "0.4",
  "ecm:name": "Non-Trivial N3 Validity Test Project",
  "ecm:createdAt": "2026-06-01T00:00:00Z",
  "ecm:updatedAt": "2026-06-01T00:00:00Z",
  "iao:isAbout": ["https://example.org/subjects/ValidityTest"],
  "ecm:terms": [
    {
      id: NT_TERM1_IRI, type: "owl:Class",
      "rdfs:label": "Person", "rdfs:comment": "A human being.",
      "ecm:createdAt": "2026-06-01T00:00:00Z", "ecm:updatedAt": "2026-06-01T00:00:00Z",
    },
    {
      id: NT_TERM2_IRI, type: "owl:Class",
      "rdfs:label": "Employee", "rdfs:subClassOf": NT_TERM1_IRI,
      "ecm:createdAt": "2026-06-01T00:00:00Z", "ecm:updatedAt": "2026-06-01T00:00:00Z",
    },
    {
      id: NT_TERM3_IRI, type: "owl:ObjectProperty",
      "rdfs:label": "worksFor",
      "ecm:createdAt": "2026-06-01T00:00:00Z", "ecm:updatedAt": "2026-06-01T00:00:00Z",
    },
  ],
  "ecm:instances": [
    {
      id: NT_INST1_IRI, type: "ecm:Instance",
      "ecm:classIris": [NT_TERM1_IRI, NT_TERM2_IRI],
      "rdfs:label": "Carol",
      "ecm:createdAt": "2026-06-01T00:00:00Z", "ecm:updatedAt": "2026-06-01T00:00:00Z",
    },
    {
      id: NT_INST2_IRI, type: "ecm:Instance",
      "ecm:classIris": [NT_TERM1_IRI],
      "rdfs:label": "Dave",
      "ecm:createdAt": "2026-06-01T00:00:00Z", "ecm:updatedAt": "2026-06-01T00:00:00Z",
    },
  ],
  "ecm:relations": [{
    id: "urn:uuid:aaaa0000-0000-0000-0000-000000000030",
    type: "ecm:RelationAssertion",
    "ecm:subjectIri": NT_INST1_IRI, "ecm:predicateIri": NT_TERM3_IRI, "ecm:objectIri": NT_INST2_IRI,
    "rdfs:label": "Carol worksFor Dave",
    "ecm:createdAt": "2026-06-01T00:00:00Z", "ecm:updatedAt": "2026-06-01T00:00:00Z",
  }],
  "ecm:literalAssertions": [{
    id: "urn:uuid:aaaa0000-0000-0000-0000-000000000040",
    type: "ecm:LiteralAssertion",
    "ecm:subjectIri": NT_INST1_IRI, "ecm:predicateIri": NT_LIT_PRED,
    "ecm:value": "42", "ecm:datatype": "xsd:integer", "ecm:language": null,
    "ecm:createdAt": "2026-06-01T00:00:00Z", "ecm:updatedAt": "2026-06-01T00:00:00Z",
  }],
  "ecm:ontologies": [], "ecm:layouts": [], "ecm:snapshots": [], "ecm:serializations": [],
};

// Minimum quad count thresholds (conservative lower bounds; actual counts will be higher).
// Basis: TBox alone contributes 10 triples (verified by tbox-bundle.test.ts AC1);
// MINIMAL adds ~11 non-TBox triples; NON_TRIVIAL adds ~18 non-TBox triples.
// Run `npm test` and observe the PASS messages to confirm exact counts.
const MINIMAL_TURTLE_MIN    = 10;
const MINIMAL_NT_MIN        = 10;
const NONTRIVIAL_TURTLE_MIN = 15;
const NONTRIVIAL_NT_MIN     = 15;

// ---------------------------------------------------------------------------
// NV1: emitTurtle MINIMAL_PROJECT (section 17.6, FR-C003)
// ---------------------------------------------------------------------------
console.log("\nNV1: emitTurtle MINIMAL_PROJECT (section 17.6, FR-C003)");
try {
  const out = emitTurtle(MINIMAL_PROJECT);
  ok(typeof out === "string" && out.length > 0, "emitTurtle must return a non-empty string");
  const quads = (new Parser()).parse(out) as RdfQuad[];
  ok(
    quads.length >= MINIMAL_TURTLE_MIN,
    `Turtle must yield at least ${MINIMAL_TURTLE_MIN} quads; got ${quads.length}`,
  );
  pass(`NV1: emitTurtle MINIMAL_PROJECT parses cleanly: ${quads.length} quads, zero errors`);
} catch (e) { fail("NV1: emitTurtle MINIMAL_PROJECT N3.js parse (section 17.6)", e); }

// ---------------------------------------------------------------------------
// NV2: emitNTriples MINIMAL_PROJECT (section 17.6, FR-C004)
// ---------------------------------------------------------------------------
console.log("\nNV2: emitNTriples MINIMAL_PROJECT (section 17.6, FR-C004)");
try {
  const out = emitNTriples(MINIMAL_PROJECT);
  ok(typeof out === "string" && out.length > 0, "emitNTriples must return a non-empty string");
  const quads = (new Parser({ format: "N-Triples" })).parse(out) as RdfQuad[];
  ok(
    quads.length >= MINIMAL_NT_MIN,
    `N-Triples must yield at least ${MINIMAL_NT_MIN} quads; got ${quads.length}`,
  );
  pass(`NV2: emitNTriples MINIMAL_PROJECT parses cleanly: ${quads.length} quads, zero errors`);
} catch (e) { fail("NV2: emitNTriples MINIMAL_PROJECT N3.js parse (section 17.6)", e); }

// ---------------------------------------------------------------------------
// NV3: emitTurtle NON_TRIVIAL_PROJECT (section 17.6, FR-C003)
// ---------------------------------------------------------------------------
console.log("\nNV3: emitTurtle NON_TRIVIAL_PROJECT (section 17.6, FR-C003)");
try {
  const out = emitTurtle(NON_TRIVIAL_PROJECT);
  ok(typeof out === "string" && out.length > 0, "emitTurtle must return a non-empty string");
  const quads = (new Parser()).parse(out) as RdfQuad[];
  ok(
    quads.length >= NONTRIVIAL_TURTLE_MIN,
    `Turtle must yield at least ${NONTRIVIAL_TURTLE_MIN} quads; got ${quads.length}`,
  );
  pass(`NV3: emitTurtle NON_TRIVIAL_PROJECT parses cleanly: ${quads.length} quads, zero errors`);
} catch (e) { fail("NV3: emitTurtle NON_TRIVIAL_PROJECT N3.js parse (section 17.6)", e); }

// ---------------------------------------------------------------------------
// NV4: emitNTriples NON_TRIVIAL_PROJECT (section 17.6, FR-C004)
// ---------------------------------------------------------------------------
console.log("\nNV4: emitNTriples NON_TRIVIAL_PROJECT (section 17.6, FR-C004)");
try {
  const out = emitNTriples(NON_TRIVIAL_PROJECT);
  ok(typeof out === "string" && out.length > 0, "emitNTriples must return a non-empty string");
  const quads = (new Parser({ format: "N-Triples" })).parse(out) as RdfQuad[];
  ok(
    quads.length >= NONTRIVIAL_NT_MIN,
    `N-Triples must yield at least ${NONTRIVIAL_NT_MIN} quads; got ${quads.length}`,
  );
  pass(`NV4: emitNTriples NON_TRIVIAL_PROJECT parses cleanly: ${quads.length} quads, zero errors`);
} catch (e) { fail("NV4: emitNTriples NON_TRIVIAL_PROJECT N3.js parse (section 17.6)", e); }

// ---------------------------------------------------------------------------
// NV5 + NV6: Golden-file scan (IMPLEMENTATION_PLAN.md section 4.7)
// Reads test/golden/; parses every *.ttl and *.nt file with N3.js.
// Passes vacuously when no matching files exist.
// Path: dist-tests/tests/ -> ../../test/golden/
// ---------------------------------------------------------------------------

const goldenDir = join(__dirname, "..", "..", "test", "golden");
let ttlFiles: string[] = [];
let ntFiles:  string[] = [];
let goldenDirOk = false;

try {
  const entries = await readdir(goldenDir, { withFileTypes: true });
  ttlFiles = entries
    .filter((e) => e.isFile() && e.name.endsWith(".ttl"))
    .map((e) => e.name)
    .sort();
  ntFiles = entries
    .filter((e) => e.isFile() && e.name.endsWith(".nt"))
    .map((e) => e.name)
    .sort();
  goldenDirOk = true;
} catch (e) {
  fail("NV5/NV6: unable to read test/golden/ (section 4.7)", e);
}

console.log("\nNV5: Golden Turtle files (IMPLEMENTATION_PLAN.md section 4.7)");
if (goldenDirOk) {
  if (ttlFiles.length === 0) {
    pass("NV5: no *.ttl golden files in test/golden/ -- scan passes vacuously (0 files; section 4.7)");
  } else {
    for (const fname of ttlFiles) {
      try {
        const content = await readFile(join(goldenDir, fname), "utf-8");
        const quads = (new Parser()).parse(content) as RdfQuad[];
        ok(quads.length > 0, `${fname} must yield at least one quad`);
        pass(`NV5: ${fname} parses cleanly: ${quads.length} quads, zero errors (section 4.7)`);
      } catch (e) {
        fail(`NV5: ${fname} failed N3.js parse (section 4.7)`, e);
      }
    }
  }
}

console.log("\nNV6: Golden N-Triples files (IMPLEMENTATION_PLAN.md section 4.7)");
if (goldenDirOk) {
  if (ntFiles.length === 0) {
    pass("NV6: no *.nt golden files in test/golden/ -- scan passes vacuously (0 files; section 4.7)");
  } else {
    for (const fname of ntFiles) {
      try {
        const content = await readFile(join(goldenDir, fname), "utf-8");
        const quads = (new Parser({ format: "N-Triples" })).parse(content) as RdfQuad[];
        ok(quads.length > 0, `${fname} must yield at least one quad`);
        pass(`NV6: ${fname} parses cleanly: ${quads.length} quads, zero errors (section 4.7)`);
      } catch (e) {
        fail(`NV6: ${fname} failed N3.js parse (section 4.7)`, e);
      }
    }
  }
}

// ---------------------------------------------------------------------------
// Summary
// ---------------------------------------------------------------------------
console.log(`\n  ${passed} passed, ${failed} failed`);
if (failed > 0) process.exit(1);
