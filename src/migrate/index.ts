/**
 * Legacy Migration (IMPLEMENTATION_PLAN.md section 1.9)
 *
 * SPEC refs: section 10.3, section 10.4, section 10.5, FR-C013.
 *
 * Provides migrate(doc, targetVersion) -> { document, migrationReport }.
 * Migration is non-destructive: returns a new document object; caller is
 * responsible for preserving the original on disk per SPEC section 10.3.
 *
 * Pure function: no I/O, no Date.now(), no Math.random().
 * Layer boundary: MUST NOT import from src/adapters/ or src/composition/.
 */

import { VMP_CONTEXT } from "../kernel/canonicalize.js";
import {
  INVALID_SPEC_VERSION,
  LEGACY_REALIST_ANCHOR_PLACEHOLDER,
} from "../validate/codes.js";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/** Migration report per SPEC section 10.3. */
export interface MigrationReport {
  /** Fields added to the document during migration. */
  addedFields: string[];
  /** Fields removed from the document during migration. */
  removedFields: string[];
  /** Fields whose values were transformed during migration. */
  transformedFields: string[];
  /** Info finding codes emitted during migration (e.g., LEGACY_REALIST_ANCHOR_PLACEHOLDER). */
  info: string[];
}

/** Successful migration result. */
export interface MigrateSuccess {
  document: Record<string, unknown>;
  migrationReport: MigrationReport;
  error?: undefined;
}

/** Error result when migration is refused (e.g., forward-version document). */
export interface MigrateError {
  document: null;
  migrationReport: null;
  error: { code: string; message: string };
}

/** Union return type for migrate(). */
export type MigrateResult = MigrateSuccess | MigrateError;

// ---------------------------------------------------------------------------
// Internal constants
// ---------------------------------------------------------------------------

/**
 * Default ecm:settings object per SPEC section 5.5.
 * The ecm:determinism block is new in v0.3 (SPEC section 5.5).
 */
const SETTINGS_DEFAULTS: Record<string, unknown> = {
  type: "ecm:ProjectSettings",
  "ecm:iriGeneration": {
    type: "ecm:IriGenerationPolicy",
    "ecm:mode": "ecm:uuid-urn",
    "ecm:baseIri": "https://example.org/instances/",
    "ecm:pattern": "{baseIri}{classSlug}_{labelSlug}_{uuid}",
    "ecm:separator": "_",
    "ecm:caseStyle": "lower-kebab",
    "ecm:includeClass": true,
    "ecm:includeLabel": true,
    "ecm:includeUuid": true,
  },
  "ecm:export": {
    "ecm:defaultRdfFormat": "text/turtle",
    "ecm:includeProjectCreatedTerms": true,
    "ecm:includeImportedOntologyContent": false,
  },
  "ecm:determinism": {
    "ecm:mode": "ecm:interactive",
    "ecm:seed": null,
  },
};

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

/**
 * Detect the source version of a document.
 * Per SPEC section 10.4: missing ecm:specVersion = v0.2; "0.3" = v0.3; "0.4" = current.
 * Non-string or malformed specVersion is treated as legacy v0.2.
 */
function detectSourceVersion(
  doc: Record<string, unknown>,
): "0.2" | "0.3" | "0.4" | "future" {
  const sv = doc["ecm:specVersion"];
  if (sv === undefined || sv === null || typeof sv !== "string") return "0.2";
  const match = /^(\d+)\.(\d+)$/.exec(sv);
  if (!match) return "0.2";
  const major = parseInt(match[1], 10);
  const minor = parseInt(match[2], 10);
  if (major === 0 && minor <= 2) return "0.2";
  if (major === 0 && minor === 3) return "0.3";
  if (major === 0 && minor === 4) return "0.4";
  return "future";
}

/**
 * Apply rdfs:subClassOf / rdfs:subPropertyOf stubs to terms lacking them.
 * Per SPEC section 10.4: v0.2 documents are missing these on terms.
 */
function addSubclassStubs(
  terms: unknown[],
): Record<string, unknown>[] {
  return terms.map((term) => {
    if (typeof term !== "object" || term === null || Array.isArray(term)) {
      return term as Record<string, unknown>;
    }
    const t = { ...(term as Record<string, unknown>) };
    if (!("rdfs:subClassOf" in t)) {
      t["rdfs:subClassOf"] = [];
    }
    if (!("rdfs:subPropertyOf" in t)) {
      t["rdfs:subPropertyOf"] = [];
    }
    return t;
  });
}

/**
 * v0.2 -> v0.3 migration leg.
 * Per SPEC section 10.4 + IMPLEMENTATION_PLAN.md section 1.9:
 *   - add ecm:specVersion: "0.3"
 *   - init ecm:literalAssertions: []
 *   - init ecm:settings defaults (section 5.5)
 *   - add rdfs:subClassOf / rdfs:subPropertyOf stubs on ecm:terms
 */
function migrateV2toV3(
  doc: Record<string, unknown>,
): { doc: Record<string, unknown>; added: string[]; transformed: string[] } {
  const result = { ...doc };
  const added: string[] = [];
  const transformed: string[] = [];

  result["ecm:specVersion"] = "0.3";
  added.push("ecm:specVersion");

  if (!("ecm:literalAssertions" in result)) {
    result["ecm:literalAssertions"] = [];
    added.push("ecm:literalAssertions");
  }

  if (!("ecm:settings" in result)) {
    result["ecm:settings"] = SETTINGS_DEFAULTS;
    added.push("ecm:settings");
  }

  const rawTerms = result["ecm:terms"];
  if (Array.isArray(rawTerms) && rawTerms.length > 0) {
    result["ecm:terms"] = addSubclassStubs(rawTerms);
  }

  return { doc: result, added, transformed };
}

/**
 * v0.3 -> v0.4 migration leg.
 * Per SPEC section 10.4:
 *   - update ecm:specVersion to "0.4"
 *   - replace @context with full VMP_CONTEXT (adds iao: and cco: per section 5.2)
 *   - update type to ["ecm:Project", "iao:OntologyDesignPattern"]
 *   - init iao:isAbout: ["ecm:UnspecifiedSubjectMatter"]
 *   - init ecm:serializations: []
 *   - set ecm:_legacyAnchorPlaceholder: true (ft-097-test-validator-3 Option A)
 */
function migrateV3toV4(
  doc: Record<string, unknown>,
): { doc: Record<string, unknown>; added: string[]; transformed: string[] } {
  const result = { ...doc };
  const added: string[] = [];
  const transformed: string[] = [];

  result["ecm:specVersion"] = "0.4";
  transformed.push("ecm:specVersion");

  result["@context"] = VMP_CONTEXT;
  transformed.push("@context");

  result["type"] = ["ecm:Project", "iao:OntologyDesignPattern"];
  transformed.push("type");

  result["iao:isAbout"] = ["ecm:UnspecifiedSubjectMatter"];
  added.push("iao:isAbout");

  if (!("ecm:serializations" in result)) {
    result["ecm:serializations"] = [];
    added.push("ecm:serializations");
  }

  // ft-097-test-validator-3 Option A: marker tells validate() to emit
  // LEGACY_REALIST_ANCHOR_PLACEHOLDER info finding instead of MISSING_REALIST_ANCHOR
  // error. Not listed in migration report (implementation detail).
  result["ecm:_legacyAnchorPlaceholder"] = true;

  return { doc: result, added, transformed };
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Migrate a VMP project document to the target version.
 *
 * Chains v0.2->v0.3->v0.4 as needed. Migration is non-destructive:
 * returns a new document object; the original is not mutated.
 *
 * @param doc - Parsed project document.
 * @param targetVersion - Target spec version. Only "0.4" is currently supported.
 * @returns MigrateResult: {document, migrationReport} on success or {error} on refusal.
 */
export function migrate(
  doc: Record<string, unknown>,
  targetVersion: string = "0.4",
): MigrateResult {
  // Guard: only "0.4" supported as target (reserved for future minor versions).
  if (targetVersion !== "0.4") {
    return {
      document: null,
      migrationReport: null,
      error: {
        code: INVALID_SPEC_VERSION,
        message:
          `Unsupported migration target version "${targetVersion}".` +
          " Only \"0.4\" is currently supported.",
      },
    };
  }

  // Reject forward-version documents before detecting source version
  // (SPEC section 10.2; IMPLEMENTATION_PLAN.md section 1.9 AC5).
  const sv = doc["ecm:specVersion"];
  if (typeof sv === "string") {
    const match = /^(\d+)\.(\d+)$/.exec(sv);
    if (match !== null) {
      const major = parseInt(match[1], 10);
      const minor = parseInt(match[2], 10);
      if (major > 0 || (major === 0 && minor > 4)) {
        return {
          document: null,
          migrationReport: null,
          error: {
            code: INVALID_SPEC_VERSION,
            message:
              `ecm:specVersion "${sv}" exceeds implementation maximum (0.4).` +
              " Cannot migrate forward-version documents (SPEC section 10.2).",
          },
        };
      }
    }
  }

  const sourceVersion = detectSourceVersion(doc);

  const report: MigrationReport = {
    addedFields: [],
    removedFields: [],
    transformedFields: [],
    info: [],
  };

  let current = { ...doc };

  // v0.2 -> v0.3 leg
  if (sourceVersion === "0.2") {
    const { doc: migrated, added, transformed } = migrateV2toV3(current);
    current = migrated;
    report.addedFields.push(...added);
    report.transformedFields.push(...transformed);
  }

  // v0.3 -> v0.4 leg (runs after v0.2->v0.3, or directly for v0.3 input)
  if (sourceVersion === "0.2" || sourceVersion === "0.3") {
    const { doc: migrated, added, transformed } = migrateV3toV4(current);
    current = migrated;
    report.addedFields.push(...added);
    report.transformedFields.push(...transformed);
    report.info.push(LEGACY_REALIST_ANCHOR_PLACEHOLDER);
  }

  // v0.4 input: no-op (already at target)
  return { document: current, migrationReport: report };
}
