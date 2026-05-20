/**
 * IRI Refactor (IMPLEMENTATION_PLAN.md section 1.7)
 *
 * SPEC refs: section 13.1-13.9, FR-C010, section 21.1.
 *
 * refactorIri(project, oldIri, newIri): RefactorResult
 *
 * Cascade-updates all occurrences of oldIri in:
 *   ecm:classIris    -- array entries on ecm:instances items (SPEC section 13.2)
 *   ecm:predicateIri -- string on ecm:relations and ecm:literalAssertions (SPEC section 13.2)
 *   ecm:subjectIri   -- string on ecm:relations and ecm:literalAssertions (SPEC section 13.4)
 *   ecm:objectIri    -- string on ecm:relations items only (SPEC section 13.4)
 *
 * Pre-apply collision check: if newIri is already the id of an entity in
 * ecm:terms or ecm:instances, the function returns without modifying the
 * project (SPEC section 13.5).
 *
 * ecm:snapshots is never traversed or modified (SPEC section 13.7; AC5).
 *
 * Idempotent: refactorIri(P, A, A).project is canonically equivalent to P
 * (SPEC section 21.1). Implemented as an early return when oldIri === newIri.
 *
 * Reversible (conditional): refactorIri(refactorIri(P, A, B).project, B, A).project
 * is canonically equivalent to P when A does not appear as the id of any entity
 * in ecm:terms or ecm:instances. This implementation updates only the four
 * reference field types in IMPLEMENTATION_PLAN.md section 1.7 sub-tasks; it
 * does NOT update entity id fields. See open question F9 from reconnaissance
 * task urn:fnsr:task:123-recon-iri-refactor.
 *
 * Pure function: no I/O, no Date.now(), no Math.random().
 * Layer boundary: MUST NOT import from src/adapters/ or src/composition/.
 */

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/**
 * Collision report returned when newIri is already in use by an existing entity.
 * Per SPEC section 13.5: the update is aborted; project is returned unmodified.
 */
export interface CollisionReport {
  /** The IRI that already exists on another entity (equals newIri). */
  collidingIri: string;
  /** The id of the entity whose id field equals newIri. */
  collidingEntityId: string;
}

/**
 * Result of a refactorIri call (IMPLEMENTATION_PLAN.md section 1.7).
 *
 * Collision path: project is the unmodified input; collision is present;
 *                 referenceCount is 0; affectedEntityTypes is [].
 * Success path:   project has all oldIri references replaced; collision is absent.
 * No-op path:     project is the unmodified input (oldIri === newIri);
 *                 collision is absent; referenceCount is 0; affectedEntityTypes is [].
 */
export interface RefactorResult {
  /** The resulting project document. Unmodified on collision or no-op. */
  project: Record<string, unknown>;
  /** The IRI that was replaced (or attempted). */
  oldIri: string;
  /** The IRI that replaced oldIri (or was attempted). */
  newIri: string;
  /**
   * Count of individual field values replaced across all four reference field types.
   * Each matching ecm:classIris entry counts as 1. Each matching ecm:predicateIri,
   * ecm:subjectIri, or ecm:objectIri string field counts as 1.
   * Zero on collision or no-op.
   */
  referenceCount: number;
  /**
   * Deduplicated, sorted list of entity types that had at least one reference
   * updated. Possible values: "ecm:Instance", "ecm:LiteralAssertion",
   * "ecm:RelationAssertion". Empty array on collision or no-op.
   */
  affectedEntityTypes: string[];
  /**
   * Present only when newIri already exists as the id of an entity in
   * ecm:terms or ecm:instances (SPEC section 13.5).
   */
  collision?: CollisionReport;
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

/**
 * Collect all entity id values from ecm:terms and ecm:instances.
 * Returns a Map<id, sourceArrayKey> for collision detection.
 * Scope is limited to semantic entity arrays.
 * ecm:snapshots is never scanned (SPEC section 13.7).
 */
function collectSemanticEntityIds(
  project: Record<string, unknown>,
): Map<string, string> {
  const map = new Map<string, string>();
  for (const key of ["ecm:terms", "ecm:instances"] as const) {
    for (const entity of getEntityArray(project, key)) {
      const id = getStr(entity, "id");
      if (id !== undefined) map.set(id, key);
    }
  }
  return map;
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Cascade-update all occurrences of oldIri to newIri in a VMP project document.
 *
 * Fields updated per IMPLEMENTATION_PLAN.md section 1.7 sub-tasks:
 *   ecm:classIris array entries on ecm:instances items
 *   ecm:predicateIri string on ecm:relations and ecm:literalAssertions items
 *   ecm:subjectIri string on ecm:relations and ecm:literalAssertions items
 *   ecm:objectIri string on ecm:relations items only
 *
 * ecm:snapshots is never traversed or modified (SPEC section 13.7).
 *
 * Assumes the input is a well-formed VMP document; the three cascade array
 * fields are always written to the result (as [] when absent in the input).
 *
 * @param project VMP project document. Not mutated; a new document is returned.
 * @param oldIri  The IRI to replace.
 * @param newIri  The replacement IRI.
 * @returns RefactorResult. On collision, result.project is the unmodified input.
 */
export function refactorIri(
  project: Record<string, unknown>,
  oldIri: string,
  newIri: string,
): RefactorResult {
  // -- Idempotent no-op: A->A is always a no-op (SPEC section 21.1) --
  if (oldIri === newIri) {
    return { project, oldIri, newIri, referenceCount: 0, affectedEntityTypes: [] };
  }

  // -- Collision check: abort if newIri is already an entity id (SPEC section 13.5) --
  const existingIds = collectSemanticEntityIds(project);
  if (existingIds.has(newIri)) {
    return {
      project,
      oldIri,
      newIri,
      referenceCount: 0,
      affectedEntityTypes: [],
      collision: { collidingIri: newIri, collidingEntityId: newIri },
    };
  }

  let referenceCount = 0;
  const affectedTypes = new Set<string>();

  // -- ecm:instances: update ecm:classIris entries (SPEC section 13.2) --
  const newInstances: Record<string, unknown>[] = getEntityArray(
    project,
    "ecm:instances",
  ).map((inst) => {
    const classIris = inst["ecm:classIris"];
    if (!Array.isArray(classIris)) return inst;
    let changed = false;
    const updated = (classIris as unknown[]).map((iri) => {
      if (typeof iri === "string" && iri === oldIri) {
        referenceCount++;
        changed = true;
        return newIri;
      }
      return iri;
    });
    if (!changed) return inst;
    affectedTypes.add("ecm:Instance");
    return { ...inst, "ecm:classIris": updated };
  });

  // -- ecm:relations: update ecm:subjectIri, ecm:predicateIri, ecm:objectIri (SPEC section 13.4) --
  const newRelations: Record<string, unknown>[] = getEntityArray(
    project,
    "ecm:relations",
  ).map((rel) => {
    let changed = false;
    const patch: Record<string, unknown> = {};
    if (getStr(rel, "ecm:subjectIri") === oldIri) {
      patch["ecm:subjectIri"] = newIri;
      referenceCount++;
      changed = true;
    }
    if (getStr(rel, "ecm:predicateIri") === oldIri) {
      patch["ecm:predicateIri"] = newIri;
      referenceCount++;
      changed = true;
    }
    if (getStr(rel, "ecm:objectIri") === oldIri) {
      patch["ecm:objectIri"] = newIri;
      referenceCount++;
      changed = true;
    }
    if (!changed) return rel;
    affectedTypes.add("ecm:RelationAssertion");
    return { ...rel, ...patch };
  });

  // -- ecm:literalAssertions: update ecm:subjectIri, ecm:predicateIri (SPEC sections 13.2, 13.4) --
  const newLiterals: Record<string, unknown>[] = getEntityArray(
    project,
    "ecm:literalAssertions",
  ).map((la) => {
    let changed = false;
    const patch: Record<string, unknown> = {};
    if (getStr(la, "ecm:subjectIri") === oldIri) {
      patch["ecm:subjectIri"] = newIri;
      referenceCount++;
      changed = true;
    }
    if (getStr(la, "ecm:predicateIri") === oldIri) {
      patch["ecm:predicateIri"] = newIri;
      referenceCount++;
      changed = true;
    }
    if (!changed) return la;
    affectedTypes.add("ecm:LiteralAssertion");
    return { ...la, ...patch };
  });

  // -- Assemble result: spread preserves ecm:snapshots and all other fields unchanged --
  const resultProject: Record<string, unknown> = {
    ...project,
    "ecm:instances": newInstances,
    "ecm:relations": newRelations,
    "ecm:literalAssertions": newLiterals,
  };

  return {
    project: resultProject,
    oldIri,
    newIri,
    referenceCount,
    affectedEntityTypes: [...affectedTypes].sort(),
  };
}
