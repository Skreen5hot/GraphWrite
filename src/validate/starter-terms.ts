/**
 * Starter Terms (SPEC section 5.7 / S4-02)
 *
 * Pre-populated RDFS + OWL vocabulary terms for new projects.
 * Source value: ecm:system-starter-example (authorized in SPEC section 5.7).
 * Sorted lexicographically by id (SPEC section 5.3 rule 4).
 *
 * Shared by:
 *   src/ui/App.tsx  -- buildNewDocument() injects these into ecm:terms;
 *                      handleFileChange() calls injectStarterTerms() on upload
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

/**
 * Inject any missing STARTER_TERMS entries into an ecm:terms array.
 *
 * Idempotent: if an entry with a matching id already exists (regardless of
 * ecm:source or other fields), it is preserved as-is; no duplicate is
 * inserted. Injected entries are shallow copies of STARTER_TERMS constants,
 * including EPOCH timestamps (1970-01-01T00:00:00Z) for determinism: the
 * same document loaded twice must produce identical canonical form.
 *
 * The returned array is sorted lexicographically by id. If all three starter
 * terms are already present, the original array reference is returned unchanged.
 *
 * Used on the upload-deserialization path (FR-U002) to ensure rdfs:label,
 * rdfs:comment, and rdfs:seeAlso are always present after loading a document
 * that predates or omits them (R5-A2).
 *
 * @param terms - The ecm:terms array from the loaded document (entries may be
 *   any object shape from JSON.parse; only the id field is consulted for
 *   presence detection).
 * @returns The merged and sorted terms array, or the original if unchanged.
 */
export function injectStarterTerms(terms: unknown[]): unknown[] {
  const existingIds = new Set<unknown>(
    terms.map((t) =>
      typeof t === "object" && t !== null
        ? (t as Record<string, unknown>)["id"]
        : undefined,
    ),
  );
  const missing = STARTER_TERMS.filter((st) => !existingIds.has(st.id));
  if (missing.length === 0) return terms;
  const merged: unknown[] = [
    ...terms,
    ...missing.map((st): Record<string, unknown> => ({ ...st })),
  ];
  merged.sort((a, b) => {
    const idOf = (v: unknown): string =>
      typeof v === "object" && v !== null
        ? String((v as Record<string, unknown>)["id"] ?? "")
        : "";
    const ai = idOf(a);
    const bi = idOf(b);
    return ai < bi ? -1 : ai > bi ? 1 : 0;
  });
  return merged;
}
