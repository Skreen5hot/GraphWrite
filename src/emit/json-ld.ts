/**
 * Semantic JSON-LD Emitter (FR-C005)
 *
 * SPEC refs: section 6.3, section 5.2, FR-C005.
 *
 * emitJsonLd(project): serializes the semantic projection as a self-contained
 * canonical JSON-LD document.
 *   1. Calls projectSemantic(project) to obtain the canonical JSON-LD string
 *      (SPEC section 6.3 steps 1-6; serializeVmp from src/kernel/canonicalize.ts
 *      injects VMP_CONTEXT, applies deterministic key ordering, and sorts arrays).
 *   2. Returns the JSON-LD string directly.
 *
 * The output JSON-LD document preserves the normative Â§5.2 @context and is
 * byte-identical across calls with identical input (pure; deterministic; no I/O).
 *
 * Pure function: no I/O, no Date.now(), no Math.random().
 * Layer boundary: MUST NOT import from src/adapters/ or src/composition/.
 */

import { projectSemantic } from "../projection/index.js";

/**
 * Emits a canonical semantic JSON-LD serialization of the project (FR-C005).
 *
 * Delegates to projectSemantic(), which applies SPEC section 6.3 steps 1-6
 * (type filtering, predicate filtering, relation rewrite, TBox node injection,
 * canonical serialization via serializeVmp from src/kernel/canonicalize.ts).
 * The resulting document carries the normative Â§5.2 VMP_CONTEXT as @context
 * and wraps all semantic entity nodes in a @graph array.
 *
 * @param project - Parsed canonical VMP project document.
 * @returns Canonical JSON-LD string; terminates with a single LF newline.
 */
export function emitJsonLd(project: Record<string, unknown>): string {
  return projectSemantic(project);
}
