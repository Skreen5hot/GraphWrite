/**
 * Validation Finding Codes (SPEC sections 17.2-17.4)
 *
 * All 26 SPEC-declared finding codes as exported string constants.
 * Central enumeration: prevents typos; enables exhaustive-switch checks
 * in follow-up chains that implement the remaining 24 codes.
 */

// ---------------------------------------------------------------------------
// section 17.2 Hard Errors (16 codes)
// ---------------------------------------------------------------------------

export const MISSING_PROJECT_ID              = "MISSING_PROJECT_ID";
export const MISSING_PROJECT_NAME            = "MISSING_PROJECT_NAME";
export const INVALID_SPEC_VERSION            = "INVALID_SPEC_VERSION";
export const MALFORMED_TERM                  = "MALFORMED_TERM";
export const MALFORMED_INSTANCE              = "MALFORMED_INSTANCE";
export const MALFORMED_RELATION              = "MALFORMED_RELATION";
export const MALFORMED_LITERAL_ASSERTION     = "MALFORMED_LITERAL_ASSERTION";
export const MISSING_REALIST_ANCHOR          = "MISSING_REALIST_ANCHOR";
export const MALFORMED_SERIALIZATION_ENTRY   = "MALFORMED_SERIALIZATION_ENTRY";
export const DUPLICATE_IRI                   = "DUPLICATE_IRI";
export const DANGLING_INSTANCE_CLASS_REF     = "DANGLING_INSTANCE_CLASS_REF"; // Phase 3 for imported-ontology refs
export const DANGLING_RELATION_SUBJECT_REF   = "DANGLING_RELATION_SUBJECT_REF";
export const DANGLING_RELATION_OBJECT_REF    = "DANGLING_RELATION_OBJECT_REF";
export const DANGLING_RELATION_PREDICATE_REF = "DANGLING_RELATION_PREDICATE_REF";
export const DANGLING_LITERAL_SUBJECT_REF    = "DANGLING_LITERAL_SUBJECT_REF";
export const DANGLING_LITERAL_PREDICATE_REF  = "DANGLING_LITERAL_PREDICATE_REF";

// ---------------------------------------------------------------------------
// section 17.3 Warnings (7 codes)
// ---------------------------------------------------------------------------

export const DUPLICATE_TRIPLE          = "DUPLICATE_TRIPLE";
export const DISCONNECTED_INSTANCE     = "DISCONNECTED_INSTANCE";
export const INSTANCE_WITHOUT_CLASS    = "INSTANCE_WITHOUT_CLASS";
export const TERM_WITHOUT_LABEL        = "TERM_WITHOUT_LABEL";
export const LITERAL_DATATYPE_MISMATCH = "LITERAL_DATATYPE_MISMATCH";
export const LARGE_IMPORT              = "LARGE_IMPORT"; // Phase 3 scope (section 3.3)
/**
 * STALE_SAVE_TARGET requires filesystem-concurrency context (section 11.2).
 * The pure validate() function cannot detect a stale save target; this code
 * is emitted by the persistence adapter layer only (task 5.7). Never emitted
 * by src/validate/index.ts.
 */
export const STALE_SAVE_TARGET         = "STALE_SAVE_TARGET";

// ---------------------------------------------------------------------------
// section 17.4 Info Findings (3 codes)
// ---------------------------------------------------------------------------

export const LEGACY_DOCUMENT_MIGRATED          = "LEGACY_DOCUMENT_MIGRATED";          // emitted by task 1.9
export const LEGACY_REALIST_ANCHOR_PLACEHOLDER = "LEGACY_REALIST_ANCHOR_PLACEHOLDER"; // emitted by task 1.9
export const NORMALIZED_ON_SAVE                = "NORMALIZED_ON_SAVE";                // emitted by task 1.10
