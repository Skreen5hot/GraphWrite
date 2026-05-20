/**
 * Structural Validator (IMPLEMENTATION_PLAN.md section 1.3)
 *
 * SPEC refs: section 17.1-17.4, section 5.13, FR-C001.
 *
 * Phase 1 scope: MISSING_REALIST_ANCHOR + INVALID_SPEC_VERSION.
 * Follow-up chains implement the remaining 24 SPEC-declared codes.
 * Pure function: no I/O, no Date.now(), no Math.random().
 * Layer boundary: MUST NOT import from src/adapters/ or src/composition/.
 */

import {
  MISSING_REALIST_ANCHOR,
  INVALID_SPEC_VERSION,
  LEGACY_REALIST_ANCHOR_PLACEHOLDER,
  NORMALIZED_ON_SAVE,
} from "./codes.js";

// ---------------------------------------------------------------------------
// Types (SPEC section 5.13)
// ---------------------------------------------------------------------------

/** Severity values per SPEC section 5.13. */
export type ValidationSeverity = "ecm:error" | "ecm:warning" | "ecm:info";

/**
 * A single validation finding per SPEC section 5.13.
 * All five fields are required (IMPLEMENTATION_PLAN.md section 1.3 AC).
 * ecm:acknowledged defaults to false on creation.
 */
export interface ValidationFinding {
  type: "ecm:ValidationFinding";
  "ecm:severity": ValidationSeverity;
  "ecm:code": string;
  "ecm:message": string;
  "ecm:target": string;
  "ecm:acknowledged": boolean;
}

/**
 * Validation report per SPEC section 5.13.
 *
 * Phase 1 note: id and ecm:createdAt use fixed stubs. Task 1.6 (IRI
 * generation) will wire these to real UUID / timestamp values in a
 * follow-up chain. Pure-function constraint: no Date.now() or
 * Math.random() permitted in src/validate/.
 */
export interface ValidationReport {
  id: string;
  type: "ecm:ValidationReport";
  "ecm:createdAt": string;
  "ecm:findings": ValidationFinding[];
}

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

const MAX_MAJOR = 0;
const MAX_MINOR = 4;

/**
 * Returns true if v is a well-formed version string at or below 0.4.
 * Well-formed means /^\d+\.\d+$/ and numerically <= MAX_MAJOR.MAX_MINOR.
 */
function isValidSpecVersion(v: string): boolean {
  const match = /^(\d+)\.(\d+)$/.exec(v);
  if (match === null) return false;
  const major = parseInt(match[1], 10);
  const minor = parseInt(match[2], 10);
  if (major > MAX_MAJOR) return false;
  if (major === MAX_MAJOR && minor > MAX_MINOR) return false;
  return true;
}

function makeError(
  code: string,
  message: string,
  target: string,
): ValidationFinding {
  return {
    type: "ecm:ValidationFinding",
    "ecm:severity": "ecm:error",
    "ecm:code": code,
    "ecm:message": message,
    "ecm:target": target,
    "ecm:acknowledged": false,
  };
}

function makeInfo(
  code: string,
  message: string,
  target: string,
): ValidationFinding {
  return {
    type: "ecm:ValidationFinding",
    "ecm:severity": "ecm:info",
    "ecm:code": code,
    "ecm:message": message,
    "ecm:target": target,
    "ecm:acknowledged": false,
  };
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Validates a VMP project document and returns a ValidationReport.
 *
 * @param project Parsed compact JSON-LD project document (Record<string, unknown>).
 * @returns ValidationReport; ecm:findings is empty for a fully valid project.
 */
export function validate(project: Record<string, unknown>): ValidationReport {
  const findings: ValidationFinding[] = [];

  // Derive a stable target IRI for project-level findings.
  // Falls back to a placeholder if the project has no id.
  const projectId =
    typeof project["id"] === "string" ? project["id"] : "ecm:project";

  // -------------------------------------------------------------------------
  // MISSING_REALIST_ANCHOR / LEGACY_REALIST_ANCHOR_PLACEHOLDER (sections 17.2, 17.4)
  // MISSING_REALIST_ANCHOR fires when iao:isAbout is absent, empty, or contains
  // only ecm:UnspecifiedSubjectMatter and no migration marker is present.
  // LEGACY_REALIST_ANCHOR_PLACEHOLDER (info) fires instead when the
  // ecm:_legacyAnchorPlaceholder marker is set (placed by migrate() during
  // v0.3->v0.4 leg). The two findings are mutually exclusive by provenance
  // (SPEC section 5.4.1). ft-097-test-validator-3 resolution: Option A marker.
  // -------------------------------------------------------------------------
  const ECM_UNSPECIFIED = "ecm:UnspecifiedSubjectMatter";
  const rawIsAbout = project["iao:isAbout"];
  const isAboutArr: unknown[] = Array.isArray(rawIsAbout)
    ? rawIsAbout
    : rawIsAbout !== undefined
    ? [rawIsAbout]
    : [];
  const nonPlaceholder = isAboutArr.filter(
    (iri) => typeof iri === "string" && iri !== ECM_UNSPECIFIED,
  );
  const isLegacyAnchorPlaceholder =
    project["ecm:_legacyAnchorPlaceholder"] === true;
  if (isAboutArr.length === 0 || nonPlaceholder.length === 0) {
    if (
      isLegacyAnchorPlaceholder &&
      isAboutArr.some((iri) => iri === ECM_UNSPECIFIED)
    ) {
      // ft-097 Option A: suppress hard error; emit info finding instead.
      findings.push(
        makeInfo(
          LEGACY_REALIST_ANCHOR_PLACEHOLDER,
          "iao:isAbout contains only ecm:UnspecifiedSubjectMatter" +
            " (placeholder set during v0.3 -> v0.4 migration). Replace" +
            " with a real subject IRI to enable export (SPEC section 17.4).",
          projectId,
        ),
      );
    } else {
      findings.push(
        makeError(
          MISSING_REALIST_ANCHOR,
          "iao:isAbout is absent, empty, or contains only" +
            " ecm:UnspecifiedSubjectMatter. Declare a real subject IRI" +
            " to enable export (SPEC section 17.2).",
          projectId,
        ),
      );
    }
  }

  // -------------------------------------------------------------------------
  // INVALID_SPEC_VERSION (section 17.2)
  // Fires when ecm:specVersion is absent, malformed, or > 0.4.
  // -------------------------------------------------------------------------
  const specVersion = project["ecm:specVersion"];
  if (typeof specVersion !== "string" || !isValidSpecVersion(specVersion)) {
    findings.push(
      makeError(
        INVALID_SPEC_VERSION,
        "ecm:specVersion is absent, malformed, or greater than the" +
          " implementation maximum (0.4). Supported: 0.0 through 0.4" +
          " (SPEC section 17.2).",
        projectId,
      ),
    );
  }

  // TODO (follow-up chain A): MISSING_PROJECT_ID, MISSING_PROJECT_NAME,
  // MALFORMED_TERM, MALFORMED_INSTANCE, MALFORMED_RELATION,
  // MALFORMED_LITERAL_ASSERTION, MALFORMED_SERIALIZATION_ENTRY, DUPLICATE_IRI.
  // TODO (follow-up chain B): DANGLING_RELATION_SUBJECT_REF,
  // DANGLING_RELATION_OBJECT_REF, DANGLING_RELATION_PREDICATE_REF,
  // DANGLING_LITERAL_SUBJECT_REF, DANGLING_LITERAL_PREDICATE_REF.
  // DANGLING_INSTANCE_CLASS_REF: project-terms variant here; Phase 3 extends
  // to imported-ontology terms.
  // TODO (follow-up chain C): DUPLICATE_TRIPLE, DISCONNECTED_INSTANCE,
  // INSTANCE_WITHOUT_CLASS, TERM_WITHOUT_LABEL, LITERAL_DATATYPE_MISMATCH.
  // STALE_SAVE_TARGET -> persistence adapter (task 5.7), never emitted here.
  // LARGE_IMPORT -> Phase 3 (task 3.3), never emitted here.
  // LEGACY_DOCUMENT_MIGRATED -> task 1.9 (remaining).
  // LEGACY_REALIST_ANCHOR_PLACEHOLDER: implemented above (task 1.9; ft-097-test-validator-3).

  // -------------------------------------------------------------------------
  // NORMALIZED_ON_SAVE (section 17.4)
  // Emitted when normalizeOnLoad() (task 1.10) detected the loaded document
  // was not in canonical form. The ecm:_wasNormalizedOnLoad marker is set on
  // the document by normalizeOnLoad (same pattern as ecm:_legacyAnchorPlaceholder
  // from task 1.9).
  // -------------------------------------------------------------------------
  if (project["ecm:_wasNormalizedOnLoad"] === true) {
    findings.push(
      makeInfo(
        NORMALIZED_ON_SAVE,
        "The loaded project was not in canonical form; it will be" +
          " normalized to canonical form on save (SPEC section 17.4).",
        projectId,
      ),
    );
  }

  return {
    id: "urn:ecm:report:phase1-stub",
    type: "ecm:ValidationReport",
    "ecm:createdAt": "1970-01-01T00:00:00Z",
    "ecm:findings": findings,
  };
}
