/**
 * Canonical Reserved Names (SPEC section 5.7.1)
 *
 * The 8 property IRIs that MUST NOT be re-minted as project-created terms
 * within a v0.4 project document.
 *
 * Shared by:
 *   src/validate/index.ts  -- validator CANONICAL_RESERVED_NAME_COLLISION check
 *   src/ui/AddTermDialog.tsx -- UI prevention (inline warning + disabled Save)
 *
 * Full IRI form; prefix expansions match VMP_CONTEXT in
 * src/kernel/canonicalize.ts and PREFIX_MAP in src/emit/turtle.ts:
 *   rdfs: -> http://www.w3.org/2000/01/rdf-schema#
 *   owl:  -> http://www.w3.org/2002/07/owl#
 */

export const RESERVED_CANONICAL_IRIS: ReadonlyArray<string> = [
  // rdfs: canonical properties
  "http://www.w3.org/2000/01/rdf-schema#label",
  "http://www.w3.org/2000/01/rdf-schema#comment",
  "http://www.w3.org/2000/01/rdf-schema#seeAlso",
  "http://www.w3.org/2000/01/rdf-schema#isDefinedBy",
  // owl: canonical properties
  "http://www.w3.org/2002/07/owl#sameAs",
  "http://www.w3.org/2002/07/owl#differentFrom",
  "http://www.w3.org/2002/07/owl#equivalentClass",
  "http://www.w3.org/2002/07/owl#equivalentProperty",
] as const;
