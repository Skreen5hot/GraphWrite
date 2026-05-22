/**
 * Delete Instance (FR-U032, SPEC section 18.2)
 *
 * deleteInstance(doc, instanceIri): DeleteInstanceResult
 *
 * Removes an ecm:Instance and all references to it in a 4-fold atomic cascade:
 *   1. ecm:instances             -- remove the entry whose id === instanceIri
 *   2. ecm:layouts[*].ecm:nodes  -- remove ecm:CanvasNode entries where ecm:instanceIri matches
 *   3. ecm:literalAssertions     -- remove entries where ecm:subjectIri === instanceIri
 *   4. ecm:relations             -- remove entries where ecm:subjectIri === instanceIri
 *                                   OR ecm:objectIri === instanceIri
 *
 * Idempotent: a second call with the same instanceIri on the result returns
 * a document canonically equivalent to the first call's result (all counts zero).
 *
 * Pure function: no I/O, no Date.now(), no Math.random().
 * Layer boundary: MUST NOT import from src/adapters/ or src/composition/.
 */

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/**
 * Summary of cascade removals from a deleteInstance call.
 * Counts are zero when the instanceIri was not found (idempotent path).
 */
export interface CascadeSummary {
  /** Number of ecm:CanvasNode entries removed across all layouts. */
  canvasNodesRemoved: number;
  /** Number of ecm:LiteralAssertion entries removed (ecm:subjectIri match). */
  literalAssertionsRemoved: number;
  /** Number of ecm:RelationAssertion entries removed (subject or object match). */
  relationsRemoved: number;
}

/**
 * Result of a deleteInstance call (FR-U032).
 *
 * Found path:     document has all 4 cascade arrays updated; cascadeSummary reflects counts.
 * Not-found path: document is the unmodified input; all cascadeSummary counts are 0.
 */
export interface DeleteInstanceResult {
  /** The resulting project document. Never mutates input. */
  document: Record<string, unknown>;
  /** Counts of entries removed by the 4-fold cascade. */
  cascadeSummary: CascadeSummary;
}

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

/**
 * Extract an array of plain-object entries from a project field.
 * Returns [] if the field is absent, not an array, or empty.
 * Non-object array elements are excluded (defensive; malformed document).
 */
function getEntityArray(
  doc: Record<string, unknown>,
  key: string,
): Record<string, unknown>[] {
  const val = doc[key];
  if (!Array.isArray(val)) return [];
  return (val as unknown[]).filter(
    (item): item is Record<string, unknown> =>
      typeof item === "object" && item !== null && !Array.isArray(item),
  );
}

/**
 * Safely read a string field from an object.
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
 * Remove an ecm:Instance and all referencing entries via a 4-fold atomic cascade.
 *
 * Cascade scope per FR-U032 / SPEC section 18.2:
 *   ecm:instances            -- the entry whose id equals instanceIri
 *   ecm:layouts[*].ecm:nodes -- ecm:CanvasNode entries where ecm:instanceIri matches
 *   ecm:literalAssertions    -- entries where ecm:subjectIri matches
 *   ecm:relations            -- entries where ecm:subjectIri OR ecm:objectIri matches
 *
 * All layouts are traversed; the cascade covers multi-layout documents correctly.
 * ecm:snapshots is not traversed or modified.
 *
 * @param doc         VMP project document. Not mutated; a new document is returned.
 * @param instanceIri The IRI of the ecm:Instance to remove.
 * @returns DeleteInstanceResult with the updated document and cascade counts.
 */
export function deleteInstance(
  doc: Record<string, unknown>,
  instanceIri: string,
): DeleteInstanceResult {
  // -- ecm:instances: remove the matching entry --
  const rawInstances = getEntityArray(doc, "ecm:instances");
  const newInstances = rawInstances.filter(
    (inst) => getStr(inst, "id") !== instanceIri,
  );

  // -- ecm:layouts[*].ecm:nodes: remove CanvasNode entries matching instanceIri --
  let canvasNodesRemoved = 0;
  const rawLayouts = getEntityArray(doc, "ecm:layouts");
  const newLayouts = rawLayouts.map((layout) => {
    const rawNodes = layout["ecm:nodes"];
    if (!Array.isArray(rawNodes)) return layout;
    const originalCount = rawNodes.length;
    const filteredNodes = (rawNodes as unknown[]).filter((node) => {
      if (typeof node !== "object" || node === null) return true;
      return (
        getStr(node as Record<string, unknown>, "ecm:instanceIri") !== instanceIri
      );
    });
    const removed = originalCount - filteredNodes.length;
    canvasNodesRemoved += removed;
    if (removed === 0) return layout;
    return { ...layout, "ecm:nodes": filteredNodes };
  });

  // -- ecm:literalAssertions: remove entries where ecm:subjectIri matches --
  const rawLiterals = getEntityArray(doc, "ecm:literalAssertions");
  const newLiterals = rawLiterals.filter(
    (la) => getStr(la, "ecm:subjectIri") !== instanceIri,
  );
  const literalAssertionsRemoved = rawLiterals.length - newLiterals.length;

  // -- ecm:relations: remove entries where subjectIri OR objectIri matches --
  const rawRelations = getEntityArray(doc, "ecm:relations");
  const newRelations = rawRelations.filter((rel) => {
    return (
      getStr(rel, "ecm:subjectIri") !== instanceIri &&
      getStr(rel, "ecm:objectIri") !== instanceIri
    );
  });
  const relationsRemoved = rawRelations.length - newRelations.length;

  // -- Assemble result: spread preserves all other fields unchanged --
  const newDoc: Record<string, unknown> = {
    ...doc,
    "ecm:instances": newInstances,
    "ecm:layouts": newLayouts,
    "ecm:literalAssertions": newLiterals,
    "ecm:relations": newRelations,
  };

  return {
    document: newDoc,
    cascadeSummary: {
      canvasNodesRemoved,
      literalAssertionsRemoved,
      relationsRemoved,
    },
  };
}
