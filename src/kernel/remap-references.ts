/**
 * Remap References (IMPLEMENTATION_PLAN.md section 3.2)
 *
 * SPEC refs: section 13.3, section 13.6, FR-U010.
 *
 * remapReferences(project, importedIri, projectCreatedIri): RemapResult
 *
 * Rewrites all occurrences of an imported term IRI (A) to a project-created
 * term IRI (B) in the two field types that record term-IRI usage:
 *   ecm:classIris    -- array entries on ecm:instances items (SPEC section 13.6)
 *   ecm:predicateIri -- string field on ecm:relations and ecm:literalAssertions (SPEC section 13.6)
 *
 * Preservation invariants (SPEC sections 13.3, 13.6, 13.7):
 *   ecm:terms      -- NOT modified; the imported term entry is preserved as immutable metadata.
 *   ecm:ontologies -- NOT modified; the ImportedOntologyRecord is preserved verbatim (AC4).
 *   ecm:snapshots  -- NOT modified; snapshots are never traversed by cascade operations.
 *   ecm:subjectIri -- NOT modified; records instance IRI, not term IRI.
 *   ecm:objectIri  -- NOT modified; records instance IRI, not term IRI.
 *
 * Unlike refactorIri (src/refactor/index.ts), this function does NOT perform a
 * collision check: projectCreatedIri is EXPECTED to already exist in ecm:terms as
 * the project-created replacement term.
 *
 * Pure function: no I/O, no Date.now(), no Math.random().
 * Layer boundary: MUST NOT import from src/adapters/ or src/composition/.
 */

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/**
 * Result of a remapReferences call (IMPLEMENTATION_PLAN.md section 3.2).
 *
 * Success path: project has all importedIri occurrences in ecm:classIris and
 *               ecm:predicateIri rewritten to projectCreatedIri.
 * No-op path:   importedIri === projectCreatedIri; project is the unmodified
 *               input (same reference); referenceCount is 0; affectedEntityTypes is [].
 */
export interface RemapResult {
  /** The resulting project document. Unmodified reference on no-op (importedIri === projectCreatedIri). */
  project: Record<string, unknown>;
  /** The imported term IRI whose occurrences were rewritten (A). */
  importedIri: string;
  /** The project-created term IRI that replaced importedIri (B). */
  projectCreatedIri: string;
  /**
   * Count of individual field values replaced across ecm:classIris and ecm:predicateIri.
   * Each matching ecm:classIris array entry counts as 1.
   * Each matching ecm:predicateIri string field counts as 1.
   * Zero on no-op.
   */
  referenceCount: number;
  /**
   * Deduplicated, sorted list of entity types that had at least one reference updated.
   * Possible values: "ecm:Instance", "ecm:LiteralAssertion", "ecm:RelationAssertion".
   * Empty array on no-op.
   */
  affectedEntityTypes: string[];
}

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

/**
 * Extract an array of entity objects from a project field.
 * Returns [] if the field is absent, not an array, or empty.
 * Non-object array elements are excluded (defensive; malformed document).
 */
function getEntityArray(
  project: Record<string, unknown>,
  key: string,
): Record<string, unknown>[] {
  const val = project[key];
  if (!Array.isArray(val)) return [];
  return (val as unknown[]).filter(
    (item): item is Record<string, unknown> =>
      typeof item === "object" && item !== null && !Array.isArray(item),
  );
}

/**
 * Safely read a string field from an entity object.
 * Returns undefined if the field is absent or not a string.
 */
function getStr(obj: Record<string, unknown>, key: string): string | undefined {
  const v = obj[key];
  return typeof v === "string" ? v : undefined;
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Rewrite all ecm:classIris and ecm:predicateIri references from importedIri
 * to projectCreatedIri in a VMP project document.
 *
 * Fields rewritten per IMPLEMENTATION_PLAN.md section 3.2 / SPEC section 13.6:
 *   ecm:classIris    array entries on ecm:instances items
 *   ecm:predicateIri string on ecm:relations items
 *   ecm:predicateIri string on ecm:literalAssertions items
 *
 * Fields preserved verbatim (NOT rewritten):
 *   ecm:terms      (imported term entry remains as immutable metadata)
 *   ecm:ontologies (ImportedOntologyRecord preserved; SPEC section 13.6, AC4)
 *   ecm:snapshots  (never modified by cascade operations; SPEC section 13.7)
 *   ecm:subjectIri (records instance IRI, not term IRI)
 *   ecm:objectIri  (records instance IRI, not term IRI)
 *
 * @param project           VMP project document. Not mutated; a new document is returned.
 * @param importedIri       The imported term IRI to replace (A).
 * @param projectCreatedIri The project-created replacement IRI (B).
 * @returns RemapResult. On no-op (importedIri === projectCreatedIri), result.project
 *          is the same reference as input.
 */
export function remapReferences(
  project: Record<string, unknown>,
  importedIri: string,
  projectCreatedIri: string,
): RemapResult {
  // -- No-op: identity remap --
  if (importedIri === projectCreatedIri) {
    return { project, importedIri, projectCreatedIri, referenceCount: 0, affectedEntityTypes: [] };
  }

  let referenceCount = 0;
  const affectedTypes = new Set<string>();

  // -- ecm:instances: update ecm:classIris entries (SPEC section 13.6) --
  const newInstances: Record<string, unknown>[] = getEntityArray(
    project,
    "ecm:instances",
  ).map((inst) => {
    const classIris = inst["ecm:classIris"];
    if (!Array.isArray(classIris)) return inst;
    let changed = false;
    const updated = (classIris as unknown[]).map((iri) => {
      if (typeof iri === "string" && iri === importedIri) {
        referenceCount++;
        changed = true;
        return projectCreatedIri;
      }
      return iri;
    });
    if (!changed) return inst;
    affectedTypes.add("ecm:Instance");
    return { ...inst, "ecm:classIris": updated };
  });

  // -- ecm:relations: update ecm:predicateIri only (SPEC section 13.6) --
  const newRelations: Record<string, unknown>[] = getEntityArray(
    project,
    "ecm:relations",
  ).map((rel) => {
    if (getStr(rel, "ecm:predicateIri") !== importedIri) return rel;
    referenceCount++;
    affectedTypes.add("ecm:RelationAssertion");
    return { ...rel, "ecm:predicateIri": projectCreatedIri };
  });

  // -- ecm:literalAssertions: update ecm:predicateIri only (SPEC section 13.6) --
  const newLiterals: Record<string, unknown>[] = getEntityArray(
    project,
    "ecm:literalAssertions",
  ).map((la) => {
    if (getStr(la, "ecm:predicateIri") !== importedIri) return la;
    referenceCount++;
    affectedTypes.add("ecm:LiteralAssertion");
    return { ...la, "ecm:predicateIri": projectCreatedIri };
  });

  // -- Assemble result: spread preserves ecm:ontologies, ecm:terms,
  //    ecm:snapshots, and all other project fields unchanged --
  const resultProject: Record<string, unknown> = {
    ...project,
    "ecm:instances": newInstances,
    "ecm:relations": newRelations,
    "ecm:literalAssertions": newLiterals,
  };

  return {
    project: resultProject,
    importedIri,
    projectCreatedIri,
    referenceCount,
    affectedEntityTypes: [...affectedTypes].sort(),
  };
}
