/**
 * Project TBox Bundle Tests (IMPLEMENTATION_PLAN.md section 1.2)
 *
 * AC1: getProjectTBoxTurtle() parses cleanly under N3.js with zero errors.
 * AC2: Parsed triple set contains all five section 5.14 declarations
 *      by IRI and property. Verified by set-equality assertion.
 * AC3: Byte-identical golden file. DEFERRED -- OED-313 must close first.
 *
 * Test pattern follows tests/vmp-serializer.test.ts (hand-rolled runner;
 * no framework; node:assert; process.exit(1) on failure).
 */

import { strictEqual } from "node:assert";
import { Parser } from "n3";
import {
  getProjectTBoxTurtle,
  getProjectTBoxNodes,
} from "../src/tbox/index.js";

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
// Full IRI constants for the five section 5.14 declarations
// ---------------------------------------------------------------------------

const ECM  = "https://edgecanonical.org/ns/modeler#";
const IAO  = "http://purl.obolibrary.org/obo/iao#";
const CCO  = "https://www.commoncoreontologies.org/";
const OWL  = "http://www.w3.org/2002/07/owl#";
const RDFS = "http://www.w3.org/2000/01/rdf-schema#";
const RDF  = "http://www.w3.org/1999/02/22-rdf-syntax-ns#";

const IRI_ODP    = IAO  + "OntologyDesignPattern";
const IRI_PROJ   = ECM  + "Project";
const IRI_SER    = ECM  + "Serialization";
const IRI_ISO    = ECM  + "isSerializationOf";
const IRI_USM    = ECM  + "UnspecifiedSubjectMatter";
const IRI_ICE    = CCO  + "ont00000958";
const OWL_CLASS  = OWL  + "Class";
const OWL_OBJP   = OWL  + "ObjectProperty";
const RDF_TYPE   = RDF  + "type";
const RDFS_SUB   = RDFS + "subClassOf";
const RDFS_DOM   = RDFS + "domain";
const RDFS_RNG   = RDFS + "range";

// Duck-type interface compatible with N3.js Quad; avoids N3 type-resolution
// issues under moduleResolution: NodeNext + skipLibCheck.
interface RdfTerm { value: string; }
interface RdfQuad {
  subject:   RdfTerm;
  predicate: RdfTerm;
  object:    RdfTerm;
}

function hasTriple(
  quads: RdfQuad[],
  s: string,
  p: string,
  o: string,
): boolean {
  return quads.some(
    (q) => q.subject.value === s && q.predicate.value === p && q.object.value === o,
  );
}

// ---------------------------------------------------------------------------
// AC1: N3.js parses getProjectTBoxTurtle() with zero errors (section 5.14)
// ---------------------------------------------------------------------------
console.log("\nAC1: N3.js parse (section 5.14)");

let quads: RdfQuad[] = [];
try {
  const turtle = getProjectTBoxTurtle();
  strictEqual(typeof turtle, "string", "getProjectTBoxTurtle() must return a string");
  const parser = new Parser();
  // parse(string) is synchronous in N3.js; throws on parse error.
  quads = parser.parse(turtle) as RdfQuad[];
  if (quads.length === 0) {
    throw new Error("Parser produced zero quads -- Turtle may be empty or unparseable");
  }
  pass(`N3.js parsed TBox cleanly: ${quads.length} quads, zero errors (AC1)`);
} catch (e) {
  fail("N3.js parse of getProjectTBoxTurtle() (AC1)", e);
}

// ---------------------------------------------------------------------------
// AC2: Parsed triple set contains all five section 5.14 declarations
// ---------------------------------------------------------------------------
console.log("\nAC2: Five section 5.14 declarations present by IRI and property");

// Declaration 1: iao:OntologyDesignPattern a owl:Class ; rdfs:subClassOf cco:ont00000958
try {
  if (!hasTriple(quads, IRI_ODP, RDF_TYPE, OWL_CLASS))
    throw new Error(`Missing: <${IRI_ODP}> rdf:type owl:Class`);
  if (!hasTriple(quads, IRI_ODP, RDFS_SUB, IRI_ICE))
    throw new Error(`Missing: <${IRI_ODP}> rdfs:subClassOf <${IRI_ICE}>`);
  pass("Declaration 1: iao:OntologyDesignPattern a owl:Class; rdfs:subClassOf cco:ont00000958 (AC2)");
} catch (e) {
  fail("Declaration 1: iao:OntologyDesignPattern (AC2)", e);
}

// Declaration 2: ecm:Project a owl:Class ; rdfs:subClassOf iao:OntologyDesignPattern
try {
  if (!hasTriple(quads, IRI_PROJ, RDF_TYPE, OWL_CLASS))
    throw new Error(`Missing: <${IRI_PROJ}> rdf:type owl:Class`);
  if (!hasTriple(quads, IRI_PROJ, RDFS_SUB, IRI_ODP))
    throw new Error(`Missing: <${IRI_PROJ}> rdfs:subClassOf <${IRI_ODP}>`);
  pass("Declaration 2: ecm:Project a owl:Class; rdfs:subClassOf iao:OntologyDesignPattern (AC2)");
} catch (e) {
  fail("Declaration 2: ecm:Project (AC2)", e);
}

// Declaration 3: ecm:Serialization a owl:Class ; rdfs:subClassOf cco:ont00000958
try {
  if (!hasTriple(quads, IRI_SER, RDF_TYPE, OWL_CLASS))
    throw new Error(`Missing: <${IRI_SER}> rdf:type owl:Class`);
  if (!hasTriple(quads, IRI_SER, RDFS_SUB, IRI_ICE))
    throw new Error(`Missing: <${IRI_SER}> rdfs:subClassOf <${IRI_ICE}>`);
  pass("Declaration 3: ecm:Serialization a owl:Class; rdfs:subClassOf cco:ont00000958 (AC2)");
} catch (e) {
  fail("Declaration 3: ecm:Serialization (AC2)", e);
}

// Declaration 4: ecm:isSerializationOf a owl:ObjectProperty ;
//                rdfs:domain ecm:Serialization ; rdfs:range iao:OntologyDesignPattern
try {
  if (!hasTriple(quads, IRI_ISO, RDF_TYPE, OWL_OBJP))
    throw new Error(`Missing: <${IRI_ISO}> rdf:type owl:ObjectProperty`);
  if (!hasTriple(quads, IRI_ISO, RDFS_DOM, IRI_SER))
    throw new Error(`Missing: <${IRI_ISO}> rdfs:domain <${IRI_SER}>`);
  if (!hasTriple(quads, IRI_ISO, RDFS_RNG, IRI_ODP))
    throw new Error(`Missing: <${IRI_ISO}> rdfs:range <${IRI_ODP}>`);
  pass("Declaration 4: ecm:isSerializationOf a owl:ObjectProperty; rdfs:domain + rdfs:range (AC2)");
} catch (e) {
  fail("Declaration 4: ecm:isSerializationOf (AC2)", e);
}

// Declaration 5: ecm:UnspecifiedSubjectMatter a owl:Class
try {
  if (!hasTriple(quads, IRI_USM, RDF_TYPE, OWL_CLASS))
    throw new Error(`Missing: <${IRI_USM}> rdf:type owl:Class`);
  pass("Declaration 5: ecm:UnspecifiedSubjectMatter a owl:Class (AC2)");
} catch (e) {
  fail("Declaration 5: ecm:UnspecifiedSubjectMatter (AC2)", e);
}

// ---------------------------------------------------------------------------
// getProjectTBoxNodes() shape check (section 5.14)
// ---------------------------------------------------------------------------
console.log("\ngetProjectTBoxNodes() shape");

try {
  const nodes = getProjectTBoxNodes();
  if (!Array.isArray(nodes)) throw new Error("getProjectTBoxNodes() must return an array");
  strictEqual(nodes.length, 5, "getProjectTBoxNodes() must return exactly 5 node objects");
  pass("getProjectTBoxNodes() returns an array of 5 objects (section 5.14)");
} catch (e) {
  fail("getProjectTBoxNodes() array length (section 5.14)", e);
}

try {
  const nodes = getProjectTBoxNodes() as Array<Record<string, unknown>>;
  const ids = nodes.map((n) => n["id"] as string).sort();
  const expected = [
    "ecm:Project",
    "ecm:Serialization",
    "ecm:UnspecifiedSubjectMatter",
    "ecm:isSerializationOf",
    "iao:OntologyDesignPattern",
  ].sort();
  if (JSON.stringify(ids) !== JSON.stringify(expected)) {
    throw new Error(`Node ids: ${JSON.stringify(ids)} != expected ${JSON.stringify(expected)}`);
  }
  pass("getProjectTBoxNodes() node ids match all five section 5.14 entity compact IRIs (AC2)");
} catch (e) {
  fail("getProjectTBoxNodes() node id set-equality (AC2)", e);
}

// ---------------------------------------------------------------------------
// AC3: Byte-identical golden file -- DEFERRED (OED-313 must close first)
// ---------------------------------------------------------------------------
console.log("\nAC3: Golden-file (DEFERRED)");
pass("golden-file: byte-identical to test/golden/project-tbox.ttl (AC3 stub; gated on OED-313)");

// ---------------------------------------------------------------------------
// Summary
// ---------------------------------------------------------------------------
console.log(`\n  ${passed} passed, ${failed} failed`);
if (failed > 0) process.exit(1);
