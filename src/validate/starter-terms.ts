/**
 * Starter Terms (SPEC section 5.7 / S4-02)
 *
 * Pre-populated RDFS + OWL vocabulary terms for new projects.
 * Source value: ecm:system-starter-example (authorized in SPEC section 5.7).
 * Sorted lexicographically by id (SPEC section 5.3 rule 4).
 *
 * Shared by:
 *   src/ui/App.tsx  -- buildNewDocument() injects these into ecm:terms
 *   tests/starter-terms.test.ts -- well-formedness verification
 */

export type EcmTermType =
  | "owl:Class"
  | "owl:ObjectProperty"
  | "owl:DatatypeProperty"
  | "owl:AnnotationProperty";

/**
 * Shape of a single ecm:terms entry as produced for starter terms.
 * Full SPEC section 5.7 shape; epoch timestamps for determinism.
 */
export interface EcmTerm {
  id: string;
  type: EcmTermType;
  "ecm:source": "ecm:system-starter-example";
  "ecm:ontologyId": null;
  "ecm:createdAt": string;
  "ecm:updatedAt": string;
  "rdfs:label": { text: string; lang: string };
}

const EPOCH = "1970-01-01T00:00:00Z";

/**
 * Canonical RDFS annotation-property starter terms pre-populated in every new project.
 * 3 entries: rdfs:comment, rdfs:label, rdfs:seeAlso (all owl:AnnotationProperty).
 * Per OWL 2 RDF-Based Semantics, these are canonically typed as owl:AnnotationProperty.
 * XSD datatypes are a separate concern (ecm:datatype in AddLiteralDialog).
 */
export const STARTER_TERMS: ReadonlyArray<EcmTerm> = [
  // ---- rdfs: annotation properties (http://www.w3.org/2000/01/rdf-schema#) --
  // Fragment order: comment < label < seeAlso (lexicographic)
  {
    id: "http://www.w3.org/2000/01/rdf-schema#comment",
    type: "owl:AnnotationProperty",
    "ecm:source": "ecm:system-starter-example",
    "ecm:ontologyId": null,
    "ecm:createdAt": EPOCH,
    "ecm:updatedAt": EPOCH,
    "rdfs:label": { text: "comment", lang: "en" },
  },
  {
    id: "http://www.w3.org/2000/01/rdf-schema#label",
    type: "owl:AnnotationProperty",
    "ecm:source": "ecm:system-starter-example",
    "ecm:ontologyId": null,
    "ecm:createdAt": EPOCH,
    "ecm:updatedAt": EPOCH,
    "rdfs:label": { text: "label", lang: "en" },
  },
  {
    id: "http://www.w3.org/2000/01/rdf-schema#seeAlso",
    type: "owl:AnnotationProperty",
    "ecm:source": "ecm:system-starter-example",
    "ecm:ontologyId": null,
    "ecm:createdAt": EPOCH,
    "ecm:updatedAt": EPOCH,
    "rdfs:label": { text: "seeAlso", lang: "en" },
  },
];
