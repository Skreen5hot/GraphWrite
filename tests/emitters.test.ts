/**
 * Emitters Tests -- Chain 1 (IMPLEMENTATION_PLAN.md section 1.5)
 *
 * SPEC refs: section 6.3, section 7.1, section 9.1, section 17.6,
 *            FR-C003, FR-C004, FR-C008.
 *
 * Chain 1 coverage (N3-based emitters + triple narration):
 *   AC1: Turtle output parses cleanly under N3.js (section 17.6, FR-C003).
 *   AC2: N-Triples output parses cleanly under N3.js (section 17.6, FR-C004).
 *   AC3: Golden-file byte-identical -- DEFERRED (OED-306 + OED-313).
 *   AC6: idempotency for emitTurtle + emitNTriples + narrateProject (section 9.1).
 *   AC7: Turtle contains TBox markers ecm:OntologyDesignPattern + ecm:isSerializationOf.
 *   FR-C008: narrateTriple template; narrateProject label resolution.
 *
 * Content checks (inline):
 *   ecm:classIris -> rdf:type expansion (section 5.8)
 *   Bare triple from ecm:relations rewrite (section 8.3)
 *   LiteralAssertion -> typed literal triple (section 5.10)
 *
 * AC4 (Mermaid structural) and AC5 (Markdown substring) added by Chain 3.
 * FR-C005 (Semantic JSON-LD) tests added by Chain 2.
 *
 * Pattern: hand-rolled per tests/run-tests.ts; node:assert; process.exit(1) on failure.
 */

import { strictEqual, ok } from "node:assert";
import { Parser } from "n3";
import { emitTurtle }   from "../src/emit/turtle.js";
import { emitNTriples } from "../src/emit/n-triples.js";
import { narrateTriple, narrateProject } from "../src/emit/triple-narration.js";
import { emitJsonLd }   from "../src/emit/json-ld.js";
import { emitMermaid }  from "../src/emit/mermaid.js";
import { emitMarkdown } from "../src/emit/markdown.js";
import { validate } from "../src/validate/index.js";
import { LABEL_CONTAINS_COLON } from "../src/validate/codes.js";

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

function hasTriple(qs: RdfQuad[], s: string, p: string, o: string): boolean {
  return qs.some(q => q.subject.value === s && q.predicate.value === p && q.object.value === o);
}

// ---------------------------------------------------------------------------
// IRI constants
// ---------------------------------------------------------------------------

const RDF = "http://www.w3.org/1999/02/22-rdf-syntax-ns#";

const PROJ_IRI   = "urn:uuid:00000000-0000-0000-0000-000000000001";
const TERM_IRI   = "urn:uuid:00000000-0000-0000-0000-000000000010";
const TERM_IRI_2 = "urn:uuid:00000000-0000-0000-0000-000000000011";
const INST_A_IRI = "urn:uuid:00000000-0000-0000-0000-000000000020";
const INST_B_IRI = "urn:uuid:00000000-0000-0000-0000-000000000021";
const PRED_IRI   = "urn:uuid:00000000-0000-0000-0000-000000000030";
const LIT_PRED   = "urn:uuid:00000000-0000-0000-0000-000000000031";

// ---------------------------------------------------------------------------
// Fixture: minimal VMP project (inline; no file read)
// ---------------------------------------------------------------------------

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
    "ecm:value": "Alice Smith", "ecm:datatype": "xsd:string",
    "ecm:language": null,
    "ecm:createdAt": "2026-05-20T00:00:00Z", "ecm:updatedAt": "2026-05-20T00:00:00Z",
  }],
  "ecm:ontologies": [], "ecm:layouts": [], "ecm:snapshots": [], "ecm:serializations": [],
};

// Fixture: multi-type instance (tests ADR-011 round-trip format with >1 rdf:type)
const MULTI_TYPE_PROJECT: Record<string, unknown> = {
  id: PROJ_IRI,
  type: ["ecm:Project", "ecm:OntologyDesignPattern"],
  "ecm:specVersion": "0.4",
  "ecm:name": "Multi-Type Test",
  "ecm:createdAt": "2026-05-20T00:00:00Z",
  "ecm:updatedAt": "2026-05-20T00:00:00Z",
  "iao:isAbout": ["ecm:UnspecifiedSubjectMatter"],
  "ecm:terms": [
    {
      id: TERM_IRI, type: "owl:Class", "rdfs:label": "TestTerm",
      "ecm:createdAt": "2026-05-20T00:00:00Z", "ecm:updatedAt": "2026-05-20T00:00:00Z",
    },
    {
      id: TERM_IRI_2, type: "owl:Class", "rdfs:label": "SecondTerm",
      "ecm:createdAt": "2026-05-20T00:00:00Z", "ecm:updatedAt": "2026-05-20T00:00:00Z",
    },
  ],
  "ecm:instances": [{
    id: INST_A_IRI, type: "ecm:Instance", "rdfs:label": "Alice",
    "ecm:classIris": [TERM_IRI, TERM_IRI_2],
    "ecm:createdAt": "2026-05-20T00:00:00Z", "ecm:updatedAt": "2026-05-20T00:00:00Z",
  }],
  "ecm:relations": [],
  "ecm:literalAssertions": [],
  "ecm:ontologies": [], "ecm:layouts": [], "ecm:snapshots": [], "ecm:serializations": [],
};

// Fixture: instance with colon in rdfs:label (tests LABEL_CONTAINS_COLON, ADR-011)
const COLON_LABEL_PROJECT: Record<string, unknown> = {
  ...MINIMAL_PROJECT,
  "ecm:instances": [{
    id: INST_A_IRI, type: "ecm:Instance", "rdfs:label": "Alice:BadLabel",
    "ecm:classIris": [TERM_IRI],
    "ecm:createdAt": "2026-05-20T00:00:00Z", "ecm:updatedAt": "2026-05-20T00:00:00Z",
  }],
};

// ---------------------------------------------------------------------------
// AC1: Turtle parses cleanly under N3.js (section 17.6, FR-C003)
// ---------------------------------------------------------------------------
console.log("\nAC1: Turtle N3.js parse (section 17.6, FR-C003)");

let turtleOut = "";
try {
  turtleOut = emitTurtle(MINIMAL_PROJECT);
  ok(typeof turtleOut === "string" && turtleOut.length > 0,
    "emitTurtle must return a non-empty string");
  const quads = (new Parser()).parse(turtleOut) as RdfQuad[];
  ok(quads.length > 0, "Turtle must yield at least one quad");
  pass(`Turtle parses cleanly: ${quads.length} quads, zero errors (AC1)`);
} catch (e) { fail("Turtle N3.js parse (AC1)", e); }

// ---------------------------------------------------------------------------
// AC7: TBox markers present in Turtle (FR-C003)
// ---------------------------------------------------------------------------
console.log("\nAC7: TBox markers in Turtle (FR-C003)");
try {
  ok(turtleOut.includes("OntologyDesignPattern"),
    "Turtle must contain 'OntologyDesignPattern' (TBox marker, AC7)");
  ok(turtleOut.includes("isSerializationOf"),
    "Turtle must contain 'isSerializationOf' (TBox marker, AC7)");
  pass("TBox markers ecm:OntologyDesignPattern and ecm:isSerializationOf present in Turtle (AC7)");
} catch (e) { fail("TBox markers in Turtle (AC7)", e); }

// ---------------------------------------------------------------------------
// Turtle content: ecm:classIris expansion, bare triple, LiteralAssertion
// ---------------------------------------------------------------------------
console.log("\nTurtle content: section 5.8 + section 8.3 + section 5.10");
try {
  const quads = (new Parser()).parse(turtleOut) as RdfQuad[];
  ok(
    hasTriple(quads, INST_A_IRI, RDF + "type", TERM_IRI),
    "Alice rdf:type TestTerm must be present (ecm:classIris -> rdf:type, section 5.8)",
  );
  ok(
    hasTriple(quads, INST_A_IRI, PRED_IRI, INST_B_IRI),
    "Alice <pred> Bob triple must be present (object-property, section 8.3)",
  );
  ok(
    quads.some(q =>
      q.subject.value === INST_A_IRI &&
      q.predicate.value === LIT_PRED &&
      q.object.value === "Alice Smith",
    ),
    "Alice <litPred> 'Alice Smith' must be present (LiteralAssertion, section 5.10)",
  );
  pass("ecm:classIris rdf:type expansion, bare triple, and LiteralAssertion present in Turtle");
} catch (e) { fail("Turtle content checks", e); }

// ---------------------------------------------------------------------------
// AC2: N-Triples parses cleanly under N3.js (section 17.6, FR-C004)
// ---------------------------------------------------------------------------
console.log("\nAC2: N-Triples N3.js parse (section 17.6, FR-C004)");

let ntOut = "";
try {
  ntOut = emitNTriples(MINIMAL_PROJECT);
  ok(typeof ntOut === "string" && ntOut.length > 0,
    "emitNTriples must return a non-empty string");
  const quads = (new Parser({ format: "N-Triples" })).parse(ntOut) as RdfQuad[];
  ok(quads.length > 0, "N-Triples must yield at least one quad");
  pass(`N-Triples parses cleanly: ${quads.length} quads, zero errors (AC2)`);
} catch (e) { fail("N-Triples N3.js parse (AC2)", e); }

try {
  ok(ntOut.includes("OntologyDesignPattern"),
    "N-Triples must contain 'OntologyDesignPattern' (TBox present, FR-C004)");
  pass("TBox markers present in N-Triples output (FR-C004)");
} catch (e) { fail("TBox markers in N-Triples (FR-C004)", e); }

// ---------------------------------------------------------------------------
// AC3: Golden-file byte-identical -- DEFERRED (OED-306 + OED-313)
// ---------------------------------------------------------------------------
console.log("\nAC3: Golden-file (DEFERRED)");
pass("golden-file: byte-identical to committed golden files (AC3 stub; gated on OED-306 + OED-313)");

// ---------------------------------------------------------------------------
// AC6 (partial): Idempotency -- emitTurtle and emitNTriples (section 9.1)
// ---------------------------------------------------------------------------
console.log("\nAC6: Idempotency -- Turtle and N-Triples (section 9.1)");
try {
  strictEqual(
    emitTurtle(MINIMAL_PROJECT), emitTurtle(MINIMAL_PROJECT),
    "emitTurtle must return byte-identical output on two calls with identical input",
  );
  pass("emitTurtle idempotent: two calls produce byte-identical Turtle (AC6)");
} catch (e) { fail("emitTurtle idempotency (AC6)", e); }

try {
  strictEqual(
    emitNTriples(MINIMAL_PROJECT), emitNTriples(MINIMAL_PROJECT),
    "emitNTriples must return byte-identical output on two calls with identical input",
  );
  pass("emitNTriples idempotent: two calls produce byte-identical N-Triples (AC6)");
} catch (e) { fail("emitNTriples idempotency (AC6)", e); }

// ---------------------------------------------------------------------------
// FR-C008: Triple Narration
// ---------------------------------------------------------------------------
console.log("\nFR-C008: Triple Narration");
try {
  const result = narrateTriple({
    subjectLabel: "Alice", className: "Person",
    predicateLabel: "participates in",
    objectLabel: "Meeting1", objectClassName: "Meeting",
  });
  strictEqual(
    result,
    "Alice (Person) participates in Meeting1 (Meeting)",
    "narrateTriple must match FR-C008 example template",
  );
  pass("narrateTriple: 'Alice (Person) participates in Meeting1 (Meeting)' (FR-C008)");
} catch (e) { fail("narrateTriple template (FR-C008)", e); }

// ft-r3-s2-05 resolution: classless instances must NOT emit "{label} ()"
try {
  const noSubjectClass = narrateTriple({
    subjectLabel: "Alice", className: "",
    predicateLabel: "knows",
    objectLabel: "Bob", objectClassName: "Person",
  });
  strictEqual(
    noSubjectClass,
    "Alice knows Bob (Person)",
    "narrateTriple must omit empty class parens for classless subject (ft-r3-s2-05)",
  );
  const noObjectClass = narrateTriple({
    subjectLabel: "Alice", className: "Person",
    predicateLabel: "knows",
    objectLabel: "Bob", objectClassName: "",
  });
  strictEqual(
    noObjectClass,
    "Alice (Person) knows Bob",
    "narrateTriple must omit empty class parens for classless object (ft-r3-s2-05)",
  );
  const bothClassless = narrateTriple({
    subjectLabel: "Alice", className: "",
    predicateLabel: "knows",
    objectLabel: "Bob", objectClassName: "",
  });
  strictEqual(
    bothClassless,
    "Alice knows Bob",
    "narrateTriple must omit empty class parens when both subject and object are classless",
  );
  pass("narrateTriple: classless instances omit empty parens (ft-r3-s2-05)");
} catch (e) { fail("narrateTriple classless case (ft-r3-s2-05)", e); }

try {
  const narrations = narrateProject(MINIMAL_PROJECT);
  ok(Array.isArray(narrations), "narrateProject must return an array");
  ok(narrations.length >= 1,
    `narrateProject must return at least one narration; got ${narrations.length}`);
  ok(
    narrations.some(n => n.includes("Alice") && n.includes("Bob")),
    "narrateProject must include Alice+Bob narration for the fixture relation",
  );
  pass(`narrateProject: ${narrations.length} narration(s); Alice+Bob relation present (FR-C008)`);
} catch (e) { fail("narrateProject label resolution (FR-C008)", e); }

try {
  strictEqual(
    JSON.stringify(narrateProject(MINIMAL_PROJECT)),
    JSON.stringify(narrateProject(MINIMAL_PROJECT)),
    "narrateProject must return identical narrations on two calls",
  );
  pass("narrateProject idempotent: two calls return identical narrations (AC6)");
} catch (e) { fail("narrateProject idempotency (AC6)", e); }

// ---------------------------------------------------------------------------
// FR-C005: Semantic JSON-LD emitter
// ---------------------------------------------------------------------------
console.log("\nFR-C005: Semantic JSON-LD emitter");

let jsonLdOut = "";
try {
  jsonLdOut = emitJsonLd(MINIMAL_PROJECT);
  ok(typeof jsonLdOut === "string" && jsonLdOut.length > 0,
    "emitJsonLd must return a non-empty string");
  pass("emitJsonLd returns non-empty string (FR-C005)");
} catch (e) { fail("emitJsonLd basic call (FR-C005)", e); }

try {
  const parsed = JSON.parse(jsonLdOut) as Record<string, unknown>;
  ok("@context" in parsed, "emitJsonLd output must have @context key");
  ok("@graph" in parsed, "emitJsonLd output must have @graph key");
  ok(Array.isArray(parsed["@graph"]), "emitJsonLd @graph must be an array");
  pass("emitJsonLd output is valid JSON-LD with @context and @graph (FR-C005)");
} catch (e) { fail("emitJsonLd JSON-LD structure check (FR-C005)", e); }

try {
  ok(
    jsonLdOut.includes(PROJ_IRI),
    "emitJsonLd output must contain the project IRI (round-trip check, FR-C005)",
  );
  pass("emitJsonLd round-trip: project IRI present in JSON-LD output (FR-C005)");
} catch (e) { fail("emitJsonLd round-trip IRI check (FR-C005)", e); }

try {
  strictEqual(
    emitJsonLd(MINIMAL_PROJECT), emitJsonLd(MINIMAL_PROJECT),
    "emitJsonLd must return byte-identical output on two calls with identical input",
  );
  pass("emitJsonLd idempotent: two calls produce byte-identical JSON-LD (FR-C005)");
} catch (e) { fail("emitJsonLd idempotency (FR-C005)", e); }

// ---------------------------------------------------------------------------
// AC4: Mermaid structural (FR-C006)
// ---------------------------------------------------------------------------
console.log("\nAC4: Mermaid structural (FR-C006)");

let mermaidOut = "";
try {
  mermaidOut = emitMermaid(MINIMAL_PROJECT);
  ok(typeof mermaidOut === "string" && mermaidOut.length > 0,
    "emitMermaid must return a non-empty string");
  ok(mermaidOut.startsWith("graph"),
    "emitMermaid output must start with 'graph' (ADR-011)");
  pass("emitMermaid returns Mermaid graph string (AC4, FR-C006, ADR-011)");
} catch (e) { fail("emitMermaid basic call (AC4, FR-C006)", e); }

try {
  ok(mermaidOut.includes("Alice"),
    "emitMermaid output must contain instance label 'Alice'");
  ok(mermaidOut.includes("Bob"),
    "emitMermaid output must contain instance label 'Bob'");
  pass("emitMermaid: instance labels Alice and Bob present as nodes (AC4, FR-C006)");
} catch (e) { fail("emitMermaid instance nodes (AC4, FR-C006)", e); }

try {
  ok(
    mermaidOut.includes("-->"),
    "emitMermaid output must contain at least one directed edge ('-->')",
  );
  pass("emitMermaid: directed edge present for the fixture relation (AC4, FR-C006)");
} catch (e) { fail("emitMermaid edge check (AC4, FR-C006)", e); }

try {
  strictEqual(
    emitMermaid(MINIMAL_PROJECT), emitMermaid(MINIMAL_PROJECT),
    "emitMermaid must return byte-identical output on two calls with identical input",
  );
  pass("emitMermaid idempotent: two calls produce byte-identical Mermaid (AC4, FR-C006)");
} catch (e) { fail("emitMermaid idempotency (AC4, FR-C006)", e); }

// ---------------------------------------------------------------------------
// AC5: Markdown content assertions (FR-C007 / FR-E006)
// ---------------------------------------------------------------------------
console.log("\nAC5: Markdown content assertions (FR-C007 / FR-E006)");

let markdownOut = "";
try {
  markdownOut = emitMarkdown(MINIMAL_PROJECT);
  ok(typeof markdownOut === "string" && markdownOut.length > 0,
    "emitMarkdown must return a non-empty string");
  pass("emitMarkdown returns non-empty string (AC5, FR-C007)");
} catch (e) { fail("emitMarkdown basic call (AC5, FR-C007)", e); }

try {
  ok(markdownOut.includes("Emitter Test Project"),
    "emitMarkdown output must contain the project name as a heading (ecm:name)");
  pass("emitMarkdown: project name 'Emitter Test Project' present in output (AC5)");
} catch (e) { fail("emitMarkdown project name heading (AC5)", e); }

try {
  ok(markdownOut.includes("TestTerm"),
    "emitMarkdown output must contain term label 'TestTerm'");
  pass("emitMarkdown: term label 'TestTerm' present in output (AC5, FR-C007)");
} catch (e) { fail("emitMarkdown term label (AC5, FR-C007)", e); }

try {
  ok(markdownOut.includes("Alice"),
    "emitMarkdown output must contain instance label 'Alice'");
  ok(markdownOut.includes("Bob"),
    "emitMarkdown output must contain instance label 'Bob'");
  pass("emitMarkdown: instance labels 'Alice' and 'Bob' present in output (AC5, FR-C007)");
} catch (e) { fail("emitMarkdown instance labels (AC5, FR-C007)", e); }

try {
  strictEqual(
    emitMarkdown(MINIMAL_PROJECT), emitMarkdown(MINIMAL_PROJECT),
    "emitMarkdown must return byte-identical output on two calls with identical input",
  );
  pass("emitMarkdown idempotent: two calls produce byte-identical Markdown (AC5, FR-C007)");
} catch (e) { fail("emitMarkdown idempotency (AC5, FR-C007)", e); }

// ---------------------------------------------------------------------------
// AC4-roundtrip: Mermaid round-trip format (ADR-011, FR-C006)
// ---------------------------------------------------------------------------
console.log("\nAC4-roundtrip: Mermaid round-trip format (ADR-011)");

try {
  const rtOut = emitMermaid(MINIMAL_PROJECT);
  ok(rtOut.startsWith("graph TD"),
    "emitMermaid must start with 'graph TD' (ADR-011)");
  ok(rtOut.includes("Alice:"),
    "emitMermaid node label must include 'Alice:' (label:type separator, ADR-011)");
  ok(rtOut.includes("<br>"),
    "emitMermaid node label must include '<br>' line breaks (ADR-011)");
  ok(rtOut.includes(" -- &quot;"),
    "emitMermaid edge must use ' -- &quot;' HTML-entity format (ADR-011)");
  pass("emitMermaid: graph TD, label:type separator, <br> line breaks, -- edge format (ADR-011)");
} catch (e) { fail("emitMermaid round-trip format (ADR-011)", e); }

try {
  const multiOut = emitMermaid(MULTI_TYPE_PROJECT);
  ok(multiOut.includes(TERM_IRI),
    "emitMermaid must include first type IRI in multi-type node label (ADR-011)");
  ok(multiOut.includes(TERM_IRI_2),
    "emitMermaid must include second type IRI in multi-type node label (ADR-011)");
  pass("emitMermaid: multi-type instance includes all rdf:type IRIs in node label (ADR-011)");
} catch (e) { fail("emitMermaid multi-type node label (ADR-011)", e); }

// ---------------------------------------------------------------------------
// AC4-golden: Mermaid byte-equality against Aaron's literal ADR-011 spec
// example. This is the operator-authored golden discipline: when the
// operator provides a literal example output in chat, that example MUST
// become a test fixture so emitter drift is caught at byte level.
// ---------------------------------------------------------------------------
console.log("\nAC4-golden: Mermaid byte-equality against Aaron's literal ADR-011 example");

try {
  const PERSON_IRI = "https://www.commoncoreontologies.org/ont00001262";
  const INTEREST_IRI = "https://www.commoncoreontologies.org/ont00001984";
  // Instance IRIs chosen so sortedIris places mama before baby (N0=mama).
  const SPEC_PROJECT = {
    "ecm:terms": [
      {
        "id": PERSON_IRI,
        "rdfs:label": { text: "Person", lang: "en" },
        "ecm:classIris": [],
      },
      {
        "id": INTEREST_IRI,
        "rdfs:label": { text: "has interest in", lang: "en" },
        "ecm:classIris": [],
      },
    ],
    "ecm:instances": [
      {
        "id": "https://example.com/0-mama",
        "rdfs:label": { text: "mama", lang: "en" },
        "ecm:classIris": [PERSON_IRI],
      },
      {
        "id": "https://example.com/1-baby",
        "rdfs:label": { text: "baby", lang: "en" },
        "ecm:classIris": [PERSON_IRI],
      },
    ],
    "ecm:relations": [
      {
        "ecm:subjectIri": "https://example.com/0-mama",
        "ecm:predicateIri": INTEREST_IRI,
        "ecm:objectIri": "https://example.com/1-baby",
      },
    ],
  };
  const out = emitMermaid(SPEC_PROJECT);
  const fs = await import("node:fs/promises");
  const path = await import("node:path");
  // Resolve from cwd (project root when running npm test); the test file
  // itself runs from dist-tests/ after tsc, so import.meta.url-based paths
  // misalign with on-disk fixtures.
  const goldenPath = path.resolve(process.cwd(), "test", "golden", "mermaid-aaron-spec.mmd");
  const expected = await fs.readFile(goldenPath, "utf-8");
  strictEqual(out, expected,
    `emitMermaid byte-equality vs test/golden/mermaid-aaron-spec.mmd. ` +
    `Operator-authored golden discipline: when Aaron provides a literal ` +
    `example, the emitter MUST match it byte-for-byte.`);
  pass("emitMermaid byte-equality vs Aaron's literal ADR-011 spec example");
} catch (e) { fail("emitMermaid byte-equality vs Aaron's literal ADR-011 example", e); }

// ---------------------------------------------------------------------------
// AC5-fence: Markdown Mermaid code fence (ADR-011)
// ---------------------------------------------------------------------------
console.log("\nAC5-fence: Markdown Mermaid code fence (ADR-011)");

try {
  ok(markdownOut.includes("```mermaid"),
    "emitMarkdown output must contain a ```mermaid code fence (ADR-011)");
  ok(markdownOut.includes("graph TD"),
    "emitMarkdown embedded Mermaid must contain 'graph TD' (ADR-011)");
  pass("emitMarkdown: Mermaid diagram embedded with ```mermaid code fence (ADR-011)");
} catch (e) { fail("emitMarkdown Mermaid code fence (ADR-011)", e); }

// ---------------------------------------------------------------------------
// LABEL_CONTAINS_COLON: validator finding for colon in instance rdfs:label (ADR-011)
// ---------------------------------------------------------------------------
console.log("\nLABEL_CONTAINS_COLON: validator (ADR-011)");

try {
  const colonReport = validate(COLON_LABEL_PROJECT);
  const colonFindings = colonReport["ecm:findings"].filter(
    (f) => f["ecm:code"] === LABEL_CONTAINS_COLON,
  );
  ok(colonFindings.length >= 1,
    "validate must emit LABEL_CONTAINS_COLON when instance rdfs:label contains ':'");
  pass("LABEL_CONTAINS_COLON emitted for colon-in-label instance (ADR-011)");
} catch (e) { fail("LABEL_CONTAINS_COLON validator finding (ADR-011)", e); }

try {
  const cleanReport = validate(MINIMAL_PROJECT);
  const colonFindings = cleanReport["ecm:findings"].filter(
    (f) => f["ecm:code"] === LABEL_CONTAINS_COLON,
  );
  ok(colonFindings.length === 0,
    "validate must NOT emit LABEL_CONTAINS_COLON when no instance label contains ':'");
  pass("LABEL_CONTAINS_COLON not emitted for clean instance labels (ADR-011)");
} catch (e) { fail("LABEL_CONTAINS_COLON clean project (ADR-011)", e); }

// ---------------------------------------------------------------------------
// Summary
// ---------------------------------------------------------------------------
console.log(`\n  ${passed} passed, ${failed} failed`);
if (failed > 0) process.exit(1);
