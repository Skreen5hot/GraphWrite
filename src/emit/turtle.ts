/**
 * Turtle Emitter (FR-C003)
 *
 * SPEC refs: section 6.3, section 17.6, FR-C003.
 *
 * emitTurtle(project): serializes the semantic projection as Turtle.
 *   1. Calls projectSemantic(project) to obtain canonical JSON-LD string.
 *   2. Parses the @graph array from that document.
 *   3. Converts each node to N3 Quads via graphToQuads() (TBox nodes skipped).
 *   4. Serializes quads via N3.js Writer (Turtle, full-IRI notation).
 *   5. Prepends getProjectTBoxTurtle() to the Writer output.
 *
 * graphToQuads(graphNodes): exported for reuse by n-triples.ts (FR-C004).
 *
 * TBox node-objects in the @graph are skipped (TBOX_IDS) because they are
 * covered by the prepended TBox Turtle block; re-emitting them would produce
 * valid but redundant triples.
 *
 * Pure function: no I/O, no Date.now(), no Math.random().
 * Layer boundary: MUST NOT import from src/adapters/ or src/composition/.
 */

import { Writer, DataFactory, Quad } from "n3";
import { projectSemantic } from "../projection/index.js";
import { getProjectTBoxTurtle } from "../tbox/index.js";

const { namedNode, literal, quad: makeQuad, blankNode } = DataFactory;

// ---------------------------------------------------------------------------
// IRI prefix map -- mirrors VMP_CONTEXT in src/kernel/canonicalize.ts
// ---------------------------------------------------------------------------

const PREFIX_MAP: Record<string, string> = {
  ecm:  "https://edgecanonical.org/ns/modeler#",
  rdf:  "http://www.w3.org/1999/02/22-rdf-syntax-ns#",
  rdfs: "http://www.w3.org/2000/01/rdf-schema#",
  owl:  "http://www.w3.org/2002/07/owl#",
  xsd:  "http://www.w3.org/2001/XMLSchema#",
  iao:  "http://purl.obolibrary.org/obo/iao#",
  cco:  "https://www.commoncoreontologies.org/",
};

/**
 * Expands a compact IRI (e.g., "ecm:Project") to its full IRI using PREFIX_MAP.
 * Returns the input unchanged for full IRIs, unknown prefixes, and blank nodes.
 */
function expandIri(compact: string): string {
  const colon = compact.indexOf(":");
  if (colon <= 0) return compact;
  const ns = PREFIX_MAP[compact.slice(0, colon)];
  return ns !== undefined ? ns + compact.slice(colon + 1) : compact;
}

/** Returns an N3 NamedNode or BlankNode for a compact or full IRI string. */
function termForIri(iri: string) {
  return iri.startsWith("_:") ? blankNode(iri.slice(2)) : namedNode(expandIri(iri));
}

// ---------------------------------------------------------------------------
// TBox compact IRIs to skip during @graph serialization
// (covered by the getProjectTBoxTurtle() prepend; SPEC section 5.14)
// ---------------------------------------------------------------------------

const TBOX_IDS = new Set([
  "iao:OntologyDesignPattern",
  "ecm:Project",
  "ecm:Serialization",
  "ecm:isSerializationOf",
  "ecm:UnspecifiedSubjectMatter",
]);

const RDF_TYPE_IRI = PREFIX_MAP.rdf + "type";

// ---------------------------------------------------------------------------
// Literal construction
// ---------------------------------------------------------------------------

/**
 * Constructs an N3 Literal for a LiteralAssertion value.
 * Applies a language tag when lang is provided and datatype is xsd:string
 * or rdf:langString (SPEC section 5.10).
 */
function makeLiteralTerm(value: string, datatype: string, lang: string | null) {
  if (lang !== null && (datatype === "xsd:string" || datatype === "rdf:langString")) {
    return literal(value, lang);
  }
  return literal(value, namedNode(expandIri(datatype)));
}

// ---------------------------------------------------------------------------
// @graph node introspection helpers
// ---------------------------------------------------------------------------

function typesOf(node: Record<string, unknown>): string[] {
  const t = node["type"];
  if (typeof t === "string") return [t];
  if (Array.isArray(t)) {
    return (t as unknown[]).filter((x): x is string => typeof x === "string");
  }
  return [];
}

function isLiteralAssertion(node: Record<string, unknown>): boolean {
  return typesOf(node).includes("ecm:LiteralAssertion");
}

// ---------------------------------------------------------------------------
// Core: @graph node -> N3 Quads
// ---------------------------------------------------------------------------

/**
 * Converts one @graph node from projectSemantic() output to N3 Quads.
 *
 * Node cases:
 *   Bare triple (no id):   ecm:subjectIri/predicateIri/objectIri -> object-property triple
 *   LiteralAssertion:      ecm:subjectIri/predicateIri/value/datatype -> typed literal triple
 *                          (assertion id is NOT emitted as a named node; section 6.3)
 *   TBox node in TBOX_IDS: skipped (covered by getProjectTBoxTurtle() prepend)
 *   Regular named node:    type, ecm:classIris (section 5.8), rdfs:label, subClassOf, etc.
 */
function nodeToQuads(node: Record<string, unknown>): Quad[] {
  const result: Quad[] = [];
  const nodeId = node["id"];

  // --- Bare triple (no id): object-property assertion from ecm:relations rewrite ---
  if (nodeId === undefined) {
    const s = node["ecm:subjectIri"];
    const p = node["ecm:predicateIri"];
    const o = node["ecm:objectIri"];
    if (typeof s === "string" && typeof p === "string" && !p.startsWith("_:") && typeof o === "string") {
      result.push(makeQuad(termForIri(s), namedNode(expandIri(p)), termForIri(o)));
    }
    return result;
  }

  if (typeof nodeId !== "string") return result;

  // --- TBox nodes: skip (covered by prepend) ---
  if (TBOX_IDS.has(nodeId)) return result;

  // --- LiteralAssertion: emit as datatype-property triple ---
  if (isLiteralAssertion(node)) {
    const s = node["ecm:subjectIri"];
    const p = node["ecm:predicateIri"];
    const v = node["ecm:value"];
    const dt = node["ecm:datatype"];
    const lang = node["ecm:language"];
    if (
      typeof s === "string" && typeof p === "string" && !p.startsWith("_:") &&
      typeof v === "string" && typeof dt === "string"
    ) {
      result.push(makeQuad(
        termForIri(s),
        namedNode(expandIri(p)),
        makeLiteralTerm(v, dt, typeof lang === "string" ? lang : null),
      ));
    }
    return result;
  }

  // --- Regular named node ---
  const subj = termForIri(nodeId);
  const rdfTypeNode = namedNode(RDF_TYPE_IRI);

  // rdf:type from `type` field
  for (const t of typesOf(node)) {
    result.push(makeQuad(subj, rdfTypeNode, termForIri(t)));
  }

  // rdf:type from ecm:classIris (SPEC section 5.8: each classIri -> rdf:type assertion)
  const classIris = node["ecm:classIris"];
  if (Array.isArray(classIris)) {
    for (const c of classIris as unknown[]) {
      if (typeof c === "string") {
        result.push(makeQuad(subj, rdfTypeNode, termForIri(c)));
      }
    }
  }

  // IRI-valued predicates (single IRI or array of IRIs)
  for (const pred of ["rdfs:subClassOf", "rdfs:subPropertyOf", "iao:isAbout", "ecm:isSerializationOf"]) {
    const val = node[pred];
    const items: unknown[] = Array.isArray(val) ? val : typeof val === "string" ? [val] : [];
    const predNode = namedNode(expandIri(pred));
    for (const v of items) {
      if (typeof v === "string") {
        result.push(makeQuad(subj, predNode, termForIri(v)));
      }
    }
  }

  // String-literal predicates
  for (const pred of [
    "rdfs:label", "rdfs:comment", "ecm:format", "ecm:filename",
    "ecm:contentHash", "ecm:generatedAt",
  ]) {
    const val = node[pred];
    if (typeof val === "string") {
      result.push(makeQuad(subj, namedNode(expandIri(pred)), literal(val)));
    }
  }

  // ecm:byteLength: number -> xsd:integer typed literal
  const byteLen = node["ecm:byteLength"];
  if (typeof byteLen === "number") {
    result.push(makeQuad(
      subj,
      namedNode(expandIri("ecm:byteLength")),
      literal(String(byteLen), namedNode(expandIri("xsd:integer"))),
    ));
  }

  return result;
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Converts an @graph array from projectSemantic() output to N3 Quads.
 * Exported for reuse by the N-Triples emitter (n-triples.ts, FR-C004).
 *
 * TBox node-objects (TBOX_IDS) are skipped; each calling emitter prepends
 * the TBox in its own format (Turtle text or re-serialized N-Triples).
 *
 * @param graphNodes - Elements of the "@graph" array from the semantic JSON-LD doc.
 * @returns Array of N3 Quads; malformed or TBox entries silently skipped.
 */
export function graphToQuads(graphNodes: unknown[]): Quad[] {
  const quads: Quad[] = [];
  for (const node of graphNodes) {
    if (node !== null && typeof node === "object") {
      quads.push(...nodeToQuads(node as Record<string, unknown>));
    }
  }
  return quads;
}

/**
 * Emits a Turtle serialization of the project's semantic content (FR-C003).
 *
 * Prepends getProjectTBoxTurtle() to the N3.js-serialized non-TBox triples.
 * N3.js Writer emits full-IRI Turtle (no additional prefix declarations) to
 * avoid duplicating the prefix declarations in the TBox prepend block.
 *
 * @param project - Parsed canonical VMP project document.
 * @returns Turtle string; TBox prefix declarations appear at the top.
 */
export function emitTurtle(project: Record<string, unknown>): string {
  const semanticDoc = JSON.parse(projectSemantic(project)) as Record<string, unknown>;
  const graphArr: unknown[] = Array.isArray(semanticDoc["@graph"])
    ? (semanticDoc["@graph"] as unknown[])
    : [];

  const quads = graphToQuads(graphArr);
  let body = "";
  const writer = new Writer();
  writer.addQuads(quads);
  writer.end((_err, r) => { body = r; });

  return getProjectTBoxTurtle() + body;
}
