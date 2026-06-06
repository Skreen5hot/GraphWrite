/**
 * Export Gate (SPEC sections 17.2, 17.4; IMPLEMENTATION_PLAN.md section 4.6)
 *
 * checkExportGate(project): ExportGateResult
 *
 * Determines whether export is permitted for the given project document.
 * Export is blocked (ok === false) when any of the following finding codes
 * are present in the validate() report:
 *   - MISSING_REALIST_ANCHOR (ecm:error; SPEC section 17.2)
 *   - LEGACY_REALIST_ANCHOR_PLACEHOLDER (ecm:info; blocks export per section 17.4)
 *
 * Blocking is code-based, NOT severity-based:
 * LEGACY_REALIST_ANCHOR_PLACEHOLDER carries ecm:info severity but
 * unconditionally blocks export per SPEC section 17.4; a severity-only
 * check would miss this case.
 *
 * Layer boundary: src/validate/ is non-kernel; no I/O, no Date.now(), no Math.random().
 */

import { validate } from "./index.js";
import {
  MISSING_REALIST_ANCHOR,
  LEGACY_REALIST_ANCHOR_PLACEHOLDER,
} from "./codes.js";

/** Finding codes that unconditionally block export (SPEC sections 17.2, 17.4). */
const EXPORT_BLOCKING_CODES = new Set<string>([
  MISSING_REALIST_ANCHOR,
  LEGACY_REALIST_ANCHOR_PLACEHOLDER,
]);

/** Result returned by checkExportGate. */
export interface ExportGateResult {
  /** true if export is permitted; false if any blocking finding is present. */
  ok: boolean;
  /** Codes of blocking findings; empty when ok === true. */
  blockingFindings: string[];
}

/**
 * Runs validate() and returns whether export is permitted.
 *
 * @param project Parsed compact JSON-LD project document.
 * @returns ExportGateResult; ok === false when any export-blocking finding is present.
 */
export function checkExportGate(
  project: Record<string, unknown>,
): ExportGateResult {
  const report = validate(project);
  const blockingFindings = report["ecm:findings"]
    .filter((f) => EXPORT_BLOCKING_CODES.has(f["ecm:code"]))
    .map((f) => f["ecm:code"]);

  return {
    ok: blockingFindings.length === 0,
    blockingFindings,
  };
}
