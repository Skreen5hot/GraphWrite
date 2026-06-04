/**
 * Turtle Ontology Importer (FR-C011)
 *
 * SPEC refs: Â§14.1, Â§12.2, Â§5.6, FR-C011.
 * IMPLEMENTATION_PLAN refs: Â§3.1.
 *
 * importOntology(turtleSource, fileName, projectId, createdAt): ImportResult
 *
 * Extracts owl:Class, rdfs:Class (â†’ owl:Class), owl:ObjectProperty,
 * owl:DatatypeProperty, owl:AnnotationProperty from Turtle. Preserves
 * rdfs:label (with language tag), skos:definition (with language tag),
 * skos:scopeNote (with language tag), rdfs:comment, rdfs:subClassOf,
 * rdfs:subPropertyOf verbatim (named-node targets only).
 * Produces ecm:ImportedOntology record per Â§5.6.
 *
 * Security (Â§12.2): hard-rejects source > 50 MB before parsing;
 * does NOT follow owl:imports references.
 *
 * Layer boundary: MUST NOT import from src/adapters/ or src/composition/.
 * Synchronous path uses node:crypto (Node-only). Supply digestHexFn (e.g.
 * sha256HexAsync from src/kernel/sha256.ts) for the async browser-safe path.
 * Caller threads createdAt; this function never calls Date.now() (Â§9.3).
 */

import { Parser, Quad } from "n3";
import { createHash } from "node:crypto";
import { generateIri } from "../iri/index.js";

// Node-side imports node:crypto directly; browser builds use the Vite
// resolve.alias (vite.config.ts) to redirect to src/_browser-shims/
// node-crypto.ts. Browser callers inject digestHexFn so this code
// never runs at runtime in browser. Hotfix per 2026-06-02 Pages fail.

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/** 50 MB hard limit per SPEC Â§12.2. */
const MAX_SOURCE_BYTES = 50 * 1024 * 1024;

/** Term count threshold for LARGE_IMPORT warning per SPEC section 14.2. */
const LARGE_IMPORT_THRESHOLD = 10_000;

const RDF_TYPE        = "http://www.w3.org/1999/02/22-rdf-syntax-ns#type";
const OWL_CLASS       = "http://www.w3.org/2002/07/owl#Class";
const RDFS_CLASS      = "http://www.w3.org/2000/01/rdf-schema#Class";
const OWL_OBJECT_PROP = "http://www.w3.org/2002/07/owl#ObjectProperty";
const OWL_DATA_PROP   = "http://www.w3.org/2002/07/owl#DatatypeProperty";
const OWL_ANNOTATION_PROP = "http://www.w3.org/2002/07/owl#AnnotationProperty";
const RDFS_LABEL      = "http://www.w3.org/2000/01/rdf-schema#label";
const RDFS_COMMENT    = "http://www.w3.org/2000/01/rdf-schema#comment";
const RDFS_SUB_CLASS  = "http://www.w3.org/2000/01/rdf-schema#subClassOf";
const RDFS_SUB_PROP   = "http://www.w3.org/2000/01/rdf-schema#subPropertyOf";
const SKOS_DEFINITION = "http://www.w3.org/2004/02/skos/core#definition";
const SKOS_SCOPE_NOTE = "http://www.w3.org/2004/02/skos/core#scopeNote";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/** Normalized type for an extracted term (Â§5.7). */
export type ImportedTermType =
  | "owl:Class"
  | "owl:ObjectProperty"
  | "owl:DatatypeProperty"
  | "owl:AnnotationProperty";

/**
 * A term extracted from an imported Turtle ontology (Â§14.1).
 *
 * Blank-node subjects are excluded. rdfs:subClassOf / rdfs:subPropertyOf
 * contain named-node IRIs only; blank-node restriction targets are excluded
 * (Â§14.1: blank-node reasoning out of scope for MVP).
 */
export interface ImportedTermObject {
  readonly id: string;
  readonly type: ImportedTermType;
  readonly "rdfs:label"?: { readonly text: string; readonly lang: string };
  readonly "rdfs:comment"?: string;
  readonly "skos:definition"?: { readonly text: string; readonly lang: string };
  readonly "skos:scopeNote"?: { readonly text: string; readonly lang: string };
  readonly "rdfs:subClassOf"?: readonly string[];
  readonly "rdfs:subPropertyOf"?: readonly string[];
}

/** ecm:ImportedOntology record per SPEC Â§5.6. */
export interface ImportedOntologyRecord {
  readonly id: string;
  readonly type: "ecm:ImportedOntology";
  readonly "ecm:projectId": string;
  readonly "ecm:name": string;
  readonly "ecm:sourceFileName": string;
  readonly "ecm:format": "text/turtle";
  readonly "ecm:contentHash": string;
  readonly "ecm:content": string;
  readonly "ecm:createdAt": string;
  readonly "ecm:importStatus": "ecm:parsed" | "ecm:degraded";
}

/** Discriminated-union result of importOntology. */
export type ImportResult =
  | {
      readonly ok: true;
      readonly ontology: ImportedOntologyRecord;
      readonly terms: readonly ImportedTermObject[];
      readonly warning?: "LARGE_IMPORT";
      readonly termCount: number;
      readonly thresholdExceeded: boolean;
    }
  | {
      readonly ok: false;
      readonly error: string;
      readonly code: "SIZE_EXCEEDED" | "PARSE_ERROR";
    };

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

/** Strips the last file extension from fileName to derive ecm:name. */
function deriveOntologyName(fileName: string): string {
  const dot = fileName.lastIndexOf(".");
  return dot > 0 ? fileName.slice(0, dot) : fileName;
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Imports a Turtle ontology source string.
 *
 * @param turtleSource - Raw Turtle content.
 * @param fileName     - Original file name; used for ecm:sourceFileName and
 *                       (extension stripped) for ecm:name.
 * @param projectId    - Owning project IRI (ecm:projectId).
 * @param createdAt    - ISO-8601 timestamp for ecm:createdAt. Threaded from
 *                       caller; this function never calls Date.now() (Â§9.3).
 * @returns ImportResult â€” ok:true on success; ok:false on SIZE_EXCEEDED or PARSE_ERROR.
 */
export function importOntology(
  turtleSource: string,
  fileName: string,
  projectId: string,
  createdAt: string,
): ImportResult;
export function importOntology(
  turtleSource: string,
  fileName: string,
  projectId: string,
  createdAt: string,
  digestHexFn: (bytes: Uint8Array) => Promise<string>,
  uuidFn?: () => string,
): Promise<ImportResult>;
export function importOntology(
  turtleSource: string,
  fileName: string,
  projectId: string,
  createdAt: string,
  digestHexFn?: (bytes: Uint8Array) => Promise<string>,
  uuidFn?: () => string,
): ImportResult | Promise<ImportResult> {
  // §12.2: hard-reject > 50 MB before parsing
  // TextEncoder is browser-compatible; byte count is identical to Buffer.from for UTF-8.
  const sourceBytes = new TextEncoder().encode(turtleSource);
  if (sourceBytes.length > MAX_SOURCE_BYTES) {
    return {
      ok: false,
      error:
        `Import rejected: source is ${sourceBytes.length} bytes, ` +
        `exceeding the 50 MB limit (${MAX_SOURCE_BYTES} bytes) per SPEC Â§12.2.`,
      code: "SIZE_EXCEEDED",
    };
  }

  // Parse with N3.js (Â§15.4: normative RDF library)
  const parser = new Parser();
  let quads: Quad[] = [];
  try {
    quads = parser.parse(turtleSource);
  } catch (e) {
    return {
      ok: false,
      error: `Turtle parse error: ${e instanceof Error ? e.message : String(e)}`,
      code: "PARSE_ERROR",
    };
  }

  // Collect term data from quads (Â§14.1)
  const termTypes         = new Map<string, ImportedTermType>();
  const termLabels        = new Map<string, { text: string; lang: string }>();
  const termComments      = new Map<string, string>();
  const termDefinitions   = new Map<string, { text: string; lang: string }>();
  const termScopeNotes    = new Map<string, { text: string; lang: string }>();
  const termSubClassOf    = new Map<string, string[]>();
  const termSubPropertyOf = new Map<string, string[]>();

  for (const quad of quads) {
    // Blank-node subjects excluded (Â§14.1: blank-node reasoning out of scope)
    if (quad.subject.termType !== "NamedNode") continue;
    const subj = quad.subject.value;
    const pred = quad.predicate.value;

    if (pred === RDF_TYPE && quad.object.termType === "NamedNode") {
      const obj = quad.object.value;
      if (obj === OWL_CLASS || obj === RDFS_CLASS) {
        // owl:Class wins unconditionally; rdfs:Class normalized to owl:Class (Â§5.7, Â§14.1)
        termTypes.set(subj, "owl:Class");
      } else if (obj === OWL_OBJECT_PROP && !termTypes.has(subj)) {
        termTypes.set(subj, "owl:ObjectProperty");
      } else if (obj === OWL_DATA_PROP && !termTypes.has(subj)) {
        termTypes.set(subj, "owl:DatatypeProperty");
      } else if (obj === OWL_ANNOTATION_PROP && !termTypes.has(subj)) {
        termTypes.set(subj, "owl:AnnotationProperty");
      }
      // Other rdf:type values (e.g. owl:Ontology) are not extracted.
      // owl:imports objects never receive a target-type triple in the supplied
      // file; no special handling needed â€” they remain absent from termTypes.
      continue;
    }

    if (pred === RDFS_LABEL && quad.object.termType === "Literal" && !termLabels.has(subj)) {
      const lang = quad.object.language || "en"; // default "en" per Â§5.7
      termLabels.set(subj, { text: quad.object.value, lang });
    }

    if (pred === RDFS_COMMENT && quad.object.termType === "Literal" && !termComments.has(subj)) {
      termComments.set(subj, quad.object.value);
    }

    if (pred === SKOS_DEFINITION && quad.object.termType === "Literal" && !termDefinitions.has(subj)) {
      const lang = quad.object.language || "en";
      termDefinitions.set(subj, { text: quad.object.value, lang });
    }

    if (pred === SKOS_SCOPE_NOTE && quad.object.termType === "Literal" && !termScopeNotes.has(subj)) {
      const lang = quad.object.language || "en";
      termScopeNotes.set(subj, { text: quad.object.value, lang });
    }

    // rdfs:subClassOf: named-node targets only (blank-node restrictions excluded Â§14.1)
    if (pred === RDFS_SUB_CLASS && quad.object.termType === "NamedNode") {
      const list = termSubClassOf.get(subj) ?? [];
      list.push(quad.object.value);
      termSubClassOf.set(subj, list);
    }

    if (pred === RDFS_SUB_PROP && quad.object.termType === "NamedNode") {
      const list = termSubPropertyOf.get(subj) ?? [];
      list.push(quad.object.value);
      termSubPropertyOf.set(subj, list);
    }
  }

  // Build ImportedTermObject[] for subjects with a recognized term type
  const terms: ImportedTermObject[] = [];
  for (const [iri, type] of termTypes) {
    const obj: {
      id: string;
      type: ImportedTermType;
      "rdfs:label"?: { text: string; lang: string };
      "rdfs:comment"?: string;
      "skos:definition"?: { text: string; lang: string };
      "skos:scopeNote"?: { text: string; lang: string };
      "rdfs:subClassOf"?: string[];
      "rdfs:subPropertyOf"?: string[];
    } = { id: iri, type };

    const label = termLabels.get(iri);
    if (label !== undefined) obj["rdfs:label"] = label;

    const comment = termComments.get(iri);
    if (comment !== undefined) obj["rdfs:comment"] = comment;

    const definition = termDefinitions.get(iri);
    if (definition !== undefined) obj["skos:definition"] = definition;

    const scopeNote = termScopeNotes.get(iri);
    if (scopeNote !== undefined) obj["skos:scopeNote"] = scopeNote;

    const subClassOf = termSubClassOf.get(iri);
    if (subClassOf !== undefined && subClassOf.length > 0) obj["rdfs:subClassOf"] = subClassOf;

    const subPropertyOf = termSubPropertyOf.get(iri);
    if (subPropertyOf !== undefined && subPropertyOf.length > 0) obj["rdfs:subPropertyOf"] = subPropertyOf;

    terms.push(obj);
  }

  // Build ecm:ImportedOntology record (Â§5.6)
  if (digestHexFn !== undefined) {
    // Async browser path: caller supplies Web Crypto digest function.
    const fn = digestHexFn;
    return (async (): Promise<ImportResult> => {
      const digest = await fn(sourceBytes);
      const ontology: ImportedOntologyRecord = {
        id: generateIri("ecm:uuid-urn", {}, uuidFn),
        type: "ecm:ImportedOntology",
        "ecm:projectId": projectId,
        "ecm:name": deriveOntologyName(fileName),
        "ecm:sourceFileName": fileName,
        "ecm:format": "text/turtle",
        "ecm:contentHash": `sha256-${digest}`,
        "ecm:content": turtleSource,
        "ecm:createdAt": createdAt,
        "ecm:importStatus": "ecm:parsed",
      };
      if (terms.length > LARGE_IMPORT_THRESHOLD) {
        return { ok: true, ontology, terms, termCount: terms.length, thresholdExceeded: true, warning: "LARGE_IMPORT" };
      }
      return { ok: true, ontology, terms, termCount: terms.length, thresholdExceeded: false };
    })();
  }

  // Synchronous node path (default; preserves existing behaviour verbatim).
  const digest = createHash("sha256").update(sourceBytes).digest("hex");
  const ontology: ImportedOntologyRecord = {
    id: generateIri("ecm:uuid-urn", {}),
    type: "ecm:ImportedOntology",
    "ecm:projectId": projectId,
    "ecm:name": deriveOntologyName(fileName),
    "ecm:sourceFileName": fileName,
    "ecm:format": "text/turtle",
    "ecm:contentHash": `sha256-${digest}`,
    "ecm:content": turtleSource,
    "ecm:createdAt": createdAt,
    "ecm:importStatus": "ecm:parsed",
  };

  if (terms.length > LARGE_IMPORT_THRESHOLD) {
    return { ok: true, ontology, terms, termCount: terms.length, thresholdExceeded: true, warning: "LARGE_IMPORT" };
  }
  return { ok: true, ontology, terms, termCount: terms.length, thresholdExceeded: false };
}
