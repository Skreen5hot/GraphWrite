/**
 * TBox-Pruning Filter (Sub-task B)
 *
 * Exports filterProjectByMode(project, mode, keptAnnotationPredicates?) -- a
 * pure function that reduces a VMP project's ecm:terms to those actually
 * referenced by instances, relations, or literal assertions, then optionally
 * closes the set over rdfs:subClassOf / rdfs:subPropertyOf ancestors.
 *
 * Three modes:
 *   'all'       -- identity; returns project unchanged (same reference).
 *   'iris-used' -- ecm:terms reduced to directly-referenced terms only.
 *   'closure'   -- iris-used set plus transitive rdfs:subClassOf /
 *                  rdfs:subPropertyOf ancestors found in project.ecm:terms.
 *
 * Annotation stripping (iris-used and closure modes):
 *   KEEP  rdfs:domain and rdfs:range unconditionally on retained terms.
 *   KEEP  predicates listed in keptAnnotationPredicates.
 *   KEEP  all ecm:* and iao:* prefixed keys (editor / ECM layer).
 *   KEEP  structural predicates: id, type, rdfs:subClassOf, rdfs:subPropertyOf.
 *   STRIP all other annotation predicates not in the kept list.
 *
 * Pure function: no I/O, no Date.now(), no Math.random().
 * Layer boundary: MUST NOT import from src/adapters/ or src/composition/.
 */

export type FilterMode = "all" | "iris-used" | "closure";

/**
 * Default annotation predicates retained on kept terms.
 * Uses compact-IRI form to match the VMP data model's key convention.
 */
const DEFAULT_KEPT_ANNOTATION_PREDICATES: readonly string[] = [
  "rdfs:label",
  "skos:definition",
  "rdfs:comment",
];

/**
 * Structural predicates always retained on kept terms regardless of the
 * keptAnnotationPredicates list.
 * rdfs:domain and rdfs:range are included unconditionally per sub-task B spec.
 */
const STRUCTURAL_PREDICATES = new Set<string>([
  "id",
  "type",
  "rdfs:subClassOf",
  "rdfs:subPropertyOf",
  "rdfs:domain",
  "rdfs:range",
]);

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

/**
 * Collects term IRIs directly referenced by the project's instances
 * (via ecm:classIris), relations (via ecm:predicateIri), and literal
 * assertions (via ecm:predicateIri as a datatype-property IRI).
 */
function collectUsedIris(project: Record<string, unknown>): Set<string> {
  const used = new Set<string>();

  // ecm:instances -> ecm:classIris[]
  const instances = project["ecm:instances"];
  if (Array.isArray(instances)) {
    for (const inst of instances) {
      if (inst === null || typeof inst !== "object") continue;
      const classIris = (inst as Record<string, unknown>)["ecm:classIris"];
      if (Array.isArray(classIris)) {
        for (const iri of classIris) {
          if (typeof iri === "string") used.add(iri);
        }
      }
    }
  }

  // ecm:relations -> ecm:predicateIri
  const relations = project["ecm:relations"];
  if (Array.isArray(relations)) {
    for (const rel of relations) {
      if (rel === null || typeof rel !== "object") continue;
      const predIri = (rel as Record<string, unknown>)["ecm:predicateIri"];
      if (typeof predIri === "string") used.add(predIri);
    }
  }

  // ecm:literalAssertions -> ecm:predicateIri (datatype-property IRI)
  const litAssertions = project["ecm:literalAssertions"];
  if (Array.isArray(litAssertions)) {
    for (const lit of litAssertions) {
      if (lit === null || typeof lit !== "object") continue;
      const predIri = (lit as Record<string, unknown>)["ecm:predicateIri"];
      if (typeof predIri === "string") used.add(predIri);
    }
  }

  return used;
}

/**
 * Expands `usedIris` in-place via fixed-point iteration over
 * rdfs:subClassOf and rdfs:subPropertyOf links in project.ecm:terms.
 * Only walks terms already present in the project (no external fetch).
 */
function expandClosure(
  project: Record<string, unknown>,
  usedIris: Set<string>,
): void {
  const rawTerms = project["ecm:terms"];
  if (!Array.isArray(rawTerms)) return;

  // Build id -> term index (project-local only)
  const termById = new Map<string, Record<string, unknown>>();
  for (const term of rawTerms) {
    if (term === null || typeof term !== "object") continue;
    const t = term as Record<string, unknown>;
    const id = t["id"];
    if (typeof id === "string") termById.set(id, t);
  }

  // Fixed-point: each round may add ancestors that unlock further ancestors
  let changed = true;
  while (changed) {
    changed = false;
    for (const iri of [...usedIris]) {
      const term = termById.get(iri);
      if (term === undefined) continue;
      for (const relPred of ["rdfs:subClassOf", "rdfs:subPropertyOf"] as const) {
        const val = term[relPred];
        const parents: unknown[] = Array.isArray(val)
          ? val
          : typeof val === "string"
          ? [val]
          : [];
        for (const parent of parents) {
          if (
            typeof parent === "string" &&
            !usedIris.has(parent) &&
            termById.has(parent)
          ) {
            usedIris.add(parent);
            changed = true;
          }
        }
      }
    }
  }
}

/**
 * Strips annotation predicates NOT in `kept` from a single term object.
 * Always retains STRUCTURAL_PREDICATES and ecm:* and iao:* prefixed keys.
 * Returns a new object; input is not mutated.
 */
function filterTermAnnotations(
  term: Record<string, unknown>,
  kept: Set<string>,
): Record<string, unknown> {
  const result: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(term)) {
    // Structural predicates: always retain
    if (STRUCTURAL_PREDICATES.has(k)) {
      result[k] = v;
      continue;
    }
    // Editor / ECM layer prefixes: always retain
    if (k.startsWith("ecm:") || k.startsWith("iao:")) {
      result[k] = v;
      continue;
    }
    // Annotation predicates in the kept list: retain
    if (kept.has(k)) {
      result[k] = v;
      continue;
    }
    // All other annotation predicates: strip
  }
  return result;
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Returns a project with ecm:terms filtered according to `mode`.
 *
 * @param project - VMP project document (compact JSON-LD). Not mutated.
 * @param mode    - 'all' | 'iris-used' | 'closure'
 * @param keptAnnotationPredicates - Compact-IRI strings of annotation
 *   predicates to retain on kept terms. When provided, overrides both
 *   the function default and project["ecm:keptAnnotationPredicates"].
 *   When absent, reads project["ecm:keptAnnotationPredicates"] (string[]);
 *   falls back to DEFAULT_KEPT_ANNOTATION_PREDICATES.
 * @returns The original project reference for mode='all'; a shallow-copied
 *   project with filtered ecm:terms for iris-used / closure.
 */
export function filterProjectByMode(
  project: Record<string, unknown>,
  mode: FilterMode,
  keptAnnotationPredicates?: readonly string[],
): Record<string, unknown> {
  if (mode === "all") return project;

  // Resolve kept annotation predicate set
  let keptArray: readonly string[];
  if (keptAnnotationPredicates !== undefined) {
    keptArray = keptAnnotationPredicates;
  } else {
    const projectKept = project["ecm:keptAnnotationPredicates"];
    keptArray = Array.isArray(projectKept)
      ? (projectKept as unknown[]).filter(
          (x): x is string => typeof x === "string",
        )
      : DEFAULT_KEPT_ANNOTATION_PREDICATES;
  }
  const kept = new Set<string>(keptArray);

  // Step 1: collect directly-referenced IRIs
  const usedIris = collectUsedIris(project);

  // Step 2: expand via transitive hierarchy (closure mode only)
  if (mode === "closure") {
    expandClosure(project, usedIris);
  }

  // Step 3: filter ecm:terms -- retain used terms; strip non-kept annotations
  const rawTerms = project["ecm:terms"];
  const filteredTerms: unknown[] = Array.isArray(rawTerms)
    ? rawTerms
        .filter((term): term is Record<string, unknown> => {
          if (term === null || typeof term !== "object") return false;
          const id = (term as Record<string, unknown>)["id"];
          return typeof id === "string" && usedIris.has(id);
        })
        .map((term) => filterTermAnnotations(term, kept))
    : [];

  return { ...project, "ecm:terms": filteredTerms };
}
