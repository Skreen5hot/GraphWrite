/**
 * Canonical Normalization on Load (IMPLEMENTATION_PLAN.md section 1.10)
 *
 * SPEC refs: section 5.3, FR-C014.
 *
 * Pure function: no I/O, no Date.now(), no Math.random().
 * Layer boundary: MUST NOT import from src/adapters/ or src/composition/.
 */

import { serializeVmp } from "../kernel/canonicalize.js";

// ---------------------------------------------------------------------------
// Internal constants
// ---------------------------------------------------------------------------

/**
 * Marker key placed on the normalized document to signal to validate() that
 * the document was not in canonical form on load. Follows the established
 * ecm:_legacyAnchorPlaceholder pattern from task 1.9 (src/migrate/index.ts).
 */
const NORMALIZED_ON_LOAD_MARKER = "ecm:_wasNormalizedOnLoad";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/** Result of normalizeOnLoad. */
export interface NormalizeOnLoadResult {
  /** The document in canonical form, or the original if already canonical. */
  document: Record<string, unknown>;
  /** True if the document was not in canonical form and was normalized. */
  wasNormalized: boolean;
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Normalize a VMP project document to canonical form on load.
 *
 * Structural canonicality is detected by comparing the output of
 * serializeVmp(doc) against JSON.stringify(doc, null, 2) + "\n". If they
 * differ, the document contains non-canonical structure (wrong key order,
 * unsorted arrays, non-normalized timestamps, missing @context, etc.) and
 * is normalized by passing through serializeVmp + JSON.parse.
 *
 * Idempotent: a second call on the result of a first call always returns
 * wasNormalized: false.
 *
 * When wasNormalized is true, the returned document carries the
 * ecm:_wasNormalizedOnLoad marker so that validate() can emit the
 * NORMALIZED_ON_SAVE info finding (SPEC section 17.4).
 *
 * @param doc - Parsed VMP project document (Record<string, unknown>).
 *   May use @id/@type or compact id/type keys.
 * @returns NormalizeOnLoadResult. If wasNormalized is false, document is the
 *   same object reference as the input. If wasNormalized is true, document is
 *   a freshly parsed canonical copy with ecm:_wasNormalizedOnLoad set.
 */
export function normalizeOnLoad(
  doc: Record<string, unknown>,
): NormalizeOnLoadResult {
  // Strip the marker before comparison so that a second call on a document
  // that was already normalized (and carries the marker) still returns
  // wasNormalized: false.
  const docForComparison: Record<string, unknown> = { ...doc };
  delete docForComparison[NORMALIZED_ON_LOAD_MARKER];

  const canonical = serializeVmp(docForComparison);
  const inputAsSerialized = JSON.stringify(docForComparison, null, 2) + "\n";

  if (canonical === inputAsSerialized) {
    // Already canonical. Return the original document (preserving any
    // existing marker from a previous call).
    return { document: doc, wasNormalized: false };
  }

  // Document was not in canonical form. Normalize and set the marker so
  // that validate() can emit NORMALIZED_ON_SAVE.
  const normalized = JSON.parse(canonical) as Record<string, unknown>;
  normalized[NORMALIZED_ON_LOAD_MARKER] = true;
  return { document: normalized, wasNormalized: true };
}
