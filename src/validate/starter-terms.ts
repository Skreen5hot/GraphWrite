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
  | "owl:DatatypeProperty";

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
  "rdfs:label": string;
}

const EPOCH = "1970-01-01T00:00:00Z";

/**
 * Canonical RDFS + OWL starter terms pre-populated in every new project.
 * 16 entries: 8 rdfs: properties + 5 owl: properties + 3 owl: meta-classes.
 * XSD datatypes are a separate concern (ecm:datatype in AddLiteralDialog).
 *
 * Type assignments (per implementation_directions):
 *   owl:DatatypeProperty: rdfs:label, rdfs:comment, rdfs:seeAlso, rdfs:isDefinedBy
 *   owl:ObjectProperty:   rdfs:domain, rdfs:range, rdfs:subClassOf, rdfs:subPropertyOf,
 *                         owl:sameAs, owl:differentFrom, owl:equivalentClass,
 *                         owl:equivalentProperty, owl:inverseOf
 *   owl:Class (meta):     owl:Class, owl:DatatypeProperty, owl:ObjectProperty
 */
export const STARTER_TERMS: ReadonlyArray<EcmTerm> = [
  // ---- rdfs: terms (http://www.w3.org/2000/01/rdf-schema#) ----------------
  // Fragment order: comment < domain < isDefinedBy < label < range <
  //   seeAlso < subClassOf < subPropertyOf
  {
    id: "http://www.w3.org/2000/01/rdf-schema#comment",
    type: "owl:DatatypeProperty",
    "ecm:source": "ecm:system-starter-example",
    "ecm:ontologyId": null,
    "ecm:createdAt": EPOCH,
    "ecm:updatedAt": EPOCH,
    "rdfs:label": "comment",
  },
  {
    id: "http://www.w3.org/2000/01/rdf-schema#domain",
    type: "owl:ObjectProperty",
    "ecm:source": "ecm:system-starter-example",
    "ecm:ontologyId": null,
    "ecm:createdAt": EPOCH,
    "ecm:updatedAt": EPOCH,
    "rdfs:label": "domain",
  },
  {
    id: "http://www.w3.org/2000/01/rdf-schema#isDefinedBy",
    type: "owl:DatatypeProperty",
    "ecm:source": "ecm:system-starter-example",
    "ecm:ontologyId": null,
    "ecm:createdAt": EPOCH,
    "ecm:updatedAt": EPOCH,
    "rdfs:label": "isDefinedBy",
  },
  {
    id: "http://www.w3.org/2000/01/rdf-schema#label",
    type: "owl:DatatypeProperty",
    "ecm:source": "ecm:system-starter-example",
    "ecm:ontologyId": null,
    "ecm:createdAt": EPOCH,
    "ecm:updatedAt": EPOCH,
    "rdfs:label": "label",
  },
  {
    id: "http://www.w3.org/2000/01/rdf-schema#range",
    type: "owl:ObjectProperty",
    "ecm:source": "ecm:system-starter-example",
    "ecm:ontologyId": null,
    "ecm:createdAt": EPOCH,
    "ecm:updatedAt": EPOCH,
    "rdfs:label": "range",
  },
  {
    id: "http://www.w3.org/2000/01/rdf-schema#seeAlso",
    type: "owl:DatatypeProperty",
    "ecm:source": "ecm:system-starter-example",
    "ecm:ontologyId": null,
    "ecm:createdAt": EPOCH,
    "ecm:updatedAt": EPOCH,
    "rdfs:label": "seeAlso",
  },
  {
    id: "http://www.w3.org/2000/01/rdf-schema#subClassOf",
    type: "owl:ObjectProperty",
    "ecm:source": "ecm:system-starter-example",
    "ecm:ontologyId": null,
    "ecm:createdAt": EPOCH,
    "ecm:updatedAt": EPOCH,
    "rdfs:label": "subClassOf",
  },
  {
    id: "http://www.w3.org/2000/01/rdf-schema#subPropertyOf",
    type: "owl:ObjectProperty",
    "ecm:source": "ecm:system-starter-example",
    "ecm:ontologyId": null,
    "ecm:createdAt": EPOCH,
    "ecm:updatedAt": EPOCH,
    "rdfs:label": "subPropertyOf",
  },
  // ---- owl: terms (http://www.w3.org/2002/07/owl#) -------------------------
  // Uppercase (A-Z: 65-90) sorts before lowercase (a-z: 97-122) in ASCII.
  // Fragment order: Class < DatatypeProperty < ObjectProperty < differentFrom <
  //   equivalentClass < equivalentProperty < inverseOf < sameAs
  {
    id: "http://www.w3.org/2002/07/owl#Class",
    type: "owl:Class",
    "ecm:source": "ecm:system-starter-example",
    "ecm:ontologyId": null,
    "ecm:createdAt": EPOCH,
    "ecm:updatedAt": EPOCH,
    "rdfs:label": "Class",
  },
  {
    id: "http://www.w3.org/2002/07/owl#DatatypeProperty",
    type: "owl:Class",
    "ecm:source": "ecm:system-starter-example",
    "ecm:ontologyId": null,
    "ecm:createdAt": EPOCH,
    "ecm:updatedAt": EPOCH,
    "rdfs:label": "DatatypeProperty",
  },
  {
    id: "http://www.w3.org/2002/07/owl#ObjectProperty",
    type: "owl:Class",
    "ecm:source": "ecm:system-starter-example",
    "ecm:ontologyId": null,
    "ecm:createdAt": EPOCH,
    "ecm:updatedAt": EPOCH,
    "rdfs:label": "ObjectProperty",
  },
  {
    id: "http://www.w3.org/2002/07/owl#differentFrom",
    type: "owl:ObjectProperty",
    "ecm:source": "ecm:system-starter-example",
    "ecm:ontologyId": null,
    "ecm:createdAt": EPOCH,
    "ecm:updatedAt": EPOCH,
    "rdfs:label": "differentFrom",
  },
  {
    id: "http://www.w3.org/2002/07/owl#equivalentClass",
    type: "owl:ObjectProperty",
    "ecm:source": "ecm:system-starter-example",
    "ecm:ontologyId": null,
    "ecm:createdAt": EPOCH,
    "ecm:updatedAt": EPOCH,
    "rdfs:label": "equivalentClass",
  },
  {
    id: "http://www.w3.org/2002/07/owl#equivalentProperty",
    type: "owl:ObjectProperty",
    "ecm:source": "ecm:system-starter-example",
    "ecm:ontologyId": null,
    "ecm:createdAt": EPOCH,
    "ecm:updatedAt": EPOCH,
    "rdfs:label": "equivalentProperty",
  },
  {
    id: "http://www.w3.org/2002/07/owl#inverseOf",
    type: "owl:ObjectProperty",
    "ecm:source": "ecm:system-starter-example",
    "ecm:ontologyId": null,
    "ecm:createdAt": EPOCH,
    "ecm:updatedAt": EPOCH,
    "rdfs:label": "inverseOf",
  },
  {
    id: "http://www.w3.org/2002/07/owl#sameAs",
    type: "owl:ObjectProperty",
    "ecm:source": "ecm:system-starter-example",
    "ecm:ontologyId": null,
    "ecm:createdAt": EPOCH,
    "ecm:updatedAt": EPOCH,
    "rdfs:label": "sameAs",
  },
];
