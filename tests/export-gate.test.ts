/**
 * Export Gate Tests (IMPLEMENTATION_PLAN.md section 4.6)
 *
 * SPEC refs: sections 17.2, 17.4.
 *
 * Acceptance criteria covered:
 *   AC-gate-ok:          checkExportGate returns ok=true for a valid project.
 *   AC-gate-empty:       checkExportGate blocks for empty iao:isAbout array (MISSING_REALIST_ANCHOR).
 *   AC-gate-placeholder: checkExportGate blocks for placeholder-only iao:isAbout (MISSING_REALIST_ANCHOR).
 *   AC-gate-legacy:      checkExportGate blocks for LEGACY_REALIST_ANCHOR_PLACEHOLDER.
 *   AC-gate-codes:       blockingFindings contains the blocking code(s) exactly; empty on ok.
 *   AC-gate-noblock:     Non-anchor finding INVALID_SPEC_VERSION alone does NOT block export.
 *
 * Pattern: hand-rolled per tests/run-tests.ts; node:assert; process.exit(1) on failure.
 */

import { strictEqual, ok, deepStrictEqual } from "node:assert";
import { checkExportGate } from "../src/validate/export-gate.js";

let passed = 0;
let failed = 0;

function pass(msg: string): void {
  console.log(`  \u2713 PASS: ${msg}`);
  passed++;
}
function fail(msg: string, err?: unknown): void {
  console.error(`  \u2717 FAIL: ${msg}`);
  if (err !== undefined) {
    console.error("  ", err instanceof Error ? err.message : String(err));
  }
  failed++;
}

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

/** Minimal fully valid v0.4 project (no blocking findings expected). */
const VALID_V04: Record<string, unknown> = {
  id: "urn:uuid:00000000-0000-0000-0000-000000000001",
  type: ["ecm:Project", "ecm:OntologyDesignPattern"],
  "ecm:specVersion": "0.4",
  "ecm:name": "Export Gate Test Project",
  "ecm:createdAt": "2026-05-14T12:00:00Z",
  "ecm:updatedAt": "2026-05-14T12:00:00Z",
  "iao:isAbout": ["https://example.org/subjects/GateTest"],
  "ecm:ontologies": [],
  "ecm:terms": [],
  "ecm:instances": [],
  "ecm:relations": [],
  "ecm:literalAssertions": [],
  "ecm:layouts": [],
  "ecm:snapshots": [],
  "ecm:serializations": [],
};

/** iao:isAbout is an empty array -> MISSING_REALIST_ANCHOR. */
const EMPTY_ABOUT: Record<string, unknown> = {
  ...VALID_V04,
  id: "urn:uuid:00000000-0000-0000-0000-000000000002",
  "iao:isAbout": [],
};

/** iao:isAbout contains only the placeholder -> MISSING_REALIST_ANCHOR. */
const PLACEHOLDER_ONLY: Record<string, unknown> = {
  ...VALID_V04,
  id: "urn:uuid:00000000-0000-0000-0000-000000000003",
  "iao:isAbout": ["ecm:UnspecifiedSubjectMatter"],
};

/** Legacy migration marker set -> LEGACY_REALIST_ANCHOR_PLACEHOLDER instead of MISSING_REALIST_ANCHOR. */
const LEGACY_PLACEHOLDER: Record<string, unknown> = {
  ...VALID_V04,
  id: "urn:uuid:00000000-0000-0000-0000-000000000004",
  "iao:isAbout": ["ecm:UnspecifiedSubjectMatter"],
  "ecm:_legacyAnchorPlaceholder": true,
};

/** Bad specVersion only (real iao:isAbout) -> INVALID_SPEC_VERSION; must NOT block export gate. */
const BAD_VERSION: Record<string, unknown> = {
  ...VALID_V04,
  id: "urn:uuid:00000000-0000-0000-0000-000000000005",
  "ecm:specVersion": "0.5",
};

// ---------------------------------------------------------------------------
// AC-gate-ok: valid project returns ok=true with empty blockingFindings
// ---------------------------------------------------------------------------
console.log("\nAC-gate-ok: valid project");

try {
  const result = checkExportGate(VALID_V04);
  strictEqual(result.ok, true, "ok must be true for a valid project");
  deepStrictEqual(
    result.blockingFindings,
    [],
    "blockingFindings must be empty for a valid project",
  );
  pass("checkExportGate returns ok=true + empty blockingFindings for valid project (AC-gate-ok)");
} catch (e) {
  fail("checkExportGate must return ok=true for valid project (AC-gate-ok)", e);
}

// ---------------------------------------------------------------------------
// AC-gate-empty: empty iao:isAbout array blocks export
// ---------------------------------------------------------------------------
console.log("\nAC-gate-empty: empty iao:isAbout array");

try {
  const result = checkExportGate(EMPTY_ABOUT);
  strictEqual(result.ok, false, "ok must be false when iao:isAbout is empty");
  ok(
    result.blockingFindings.includes("MISSING_REALIST_ANCHOR"),
    "blockingFindings must contain MISSING_REALIST_ANCHOR for empty iao:isAbout",
  );
  pass("checkExportGate blocks for empty iao:isAbout array (AC-gate-empty)");
} catch (e) {
  fail("checkExportGate must block for empty iao:isAbout array (AC-gate-empty)", e);
}

// ---------------------------------------------------------------------------
// AC-gate-placeholder: placeholder-only iao:isAbout blocks export
// ---------------------------------------------------------------------------
console.log("\nAC-gate-placeholder: placeholder-only iao:isAbout");

try {
  const result = checkExportGate(PLACEHOLDER_ONLY);
  strictEqual(result.ok, false, "ok must be false for placeholder-only iao:isAbout");
  ok(
    result.blockingFindings.includes("MISSING_REALIST_ANCHOR"),
    "blockingFindings must contain MISSING_REALIST_ANCHOR for placeholder-only iao:isAbout",
  );
  pass("checkExportGate blocks for placeholder-only iao:isAbout (AC-gate-placeholder)");
} catch (e) {
  fail("checkExportGate must block for placeholder-only iao:isAbout (AC-gate-placeholder)", e);
}

// ---------------------------------------------------------------------------
// AC-gate-legacy: LEGACY_REALIST_ANCHOR_PLACEHOLDER blocks export
// (ecm:info severity but unconditionally blocks per SPEC section 17.4)
// ---------------------------------------------------------------------------
console.log("\nAC-gate-legacy: LEGACY_REALIST_ANCHOR_PLACEHOLDER");

try {
  const result = checkExportGate(LEGACY_PLACEHOLDER);
  strictEqual(
    result.ok,
    false,
    "ok must be false for project with LEGACY_REALIST_ANCHOR_PLACEHOLDER",
  );
  ok(
    result.blockingFindings.includes("LEGACY_REALIST_ANCHOR_PLACEHOLDER"),
    "blockingFindings must contain LEGACY_REALIST_ANCHOR_PLACEHOLDER",
  );
  pass("checkExportGate blocks for LEGACY_REALIST_ANCHOR_PLACEHOLDER (AC-gate-legacy)");
} catch (e) {
  fail("checkExportGate must block for LEGACY_REALIST_ANCHOR_PLACEHOLDER (AC-gate-legacy)", e);
}

// ---------------------------------------------------------------------------
// AC-gate-noblock: INVALID_SPEC_VERSION alone does NOT block export
// The gate checks anchor codes only; version errors are not export-blocking
// ---------------------------------------------------------------------------
console.log("\nAC-gate-noblock: INVALID_SPEC_VERSION alone");

try {
  const result = checkExportGate(BAD_VERSION);
  strictEqual(
    result.ok,
    true,
    "ok must be true when only INVALID_SPEC_VERSION is present (not an anchor code)",
  );
  deepStrictEqual(
    result.blockingFindings,
    [],
    "blockingFindings must be empty when only INVALID_SPEC_VERSION is present",
  );
  pass("checkExportGate does NOT block for INVALID_SPEC_VERSION alone (AC-gate-noblock)");
} catch (e) {
  fail("checkExportGate must not block for INVALID_SPEC_VERSION alone (AC-gate-noblock)", e);
}

// ---------------------------------------------------------------------------
// Summary
// ---------------------------------------------------------------------------
console.log(`\n  ${passed} passed, ${failed} failed`);
if (failed > 0) process.exit(1);
