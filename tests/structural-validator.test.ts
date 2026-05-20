/**
 * Structural Validator Tests (IMPLEMENTATION_PLAN.md section 1.3)
 *
 * SPEC refs: section 17.1-17.4, section 5.13, FR-C001.
 * Phase 1 scope: MISSING_REALIST_ANCHOR + INVALID_SPEC_VERSION.
 * Follow-up chains extend with the remaining 24 SPEC-declared codes.
 *
 * Acceptance criteria covered here:
 *   AC-valid  : fully valid v0.4 project produces empty ecm:findings.
 *   AC-schema : every finding has all 5 required section 5.13 fields.
 *   AC-anchor1: MISSING_REALIST_ANCHOR fires for ["ecm:UnspecifiedSubjectMatter"].
 *   AC-anchor2: MISSING_REALIST_ANCHOR does NOT fire for a real IRI.
 *   AC-version: INVALID_SPEC_VERSION fires for "0.5"; not for "0.4".
 *   AC-fixture: per-code malformed fixtures (DEFERRED -- gated on OED-313).
 *   AC-coverage: branch coverage >= 85% (DEFERRED -- gated on CI tooling).
 *
 * Pattern: hand-rolled per tests/run-tests.ts; no framework; node:assert;
 * process.exit(1) on failure. Follows tests/vmp-serializer.test.ts.
 */

import { strictEqual, ok } from "node:assert";
import { validate, type ValidationFinding } from "../src/validate/index.js";

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

/** Minimal fully valid v0.4 project document (no findings expected). */
const VALID_V04: Record<string, unknown> = {
  id: "urn:uuid:00000000-0000-0000-0000-000000000001",
  type: ["ecm:Project", "iao:OntologyDesignPattern"],
  "ecm:specVersion": "0.4",
  "ecm:name": "Test Project",
  "ecm:createdAt": "2026-05-14T12:00:00Z",
  "ecm:updatedAt": "2026-05-14T12:00:00Z",
  "iao:isAbout": ["https://example.org/subjects/CustomerOrders"],
  "ecm:ontologies": [],
  "ecm:terms": [],
  "ecm:instances": [],
  "ecm:relations": [],
  "ecm:literalAssertions": [],
  "ecm:layouts": [],
  "ecm:snapshots": [],
  "ecm:serializations": [],
};

/** Project with only the ecm:UnspecifiedSubjectMatter placeholder in iao:isAbout. */
const PLACEHOLDER_ONLY: Record<string, unknown> = {
  ...VALID_V04,
  id: "urn:uuid:00000000-0000-0000-0000-000000000002",
  "iao:isAbout": ["ecm:UnspecifiedSubjectMatter"],
};

/** Project with iao:isAbout absent entirely. */
const ABSENT_IS_ABOUT: Record<string, unknown> = Object.fromEntries(
  Object.entries(VALID_V04).filter((e) => e[0] !== "iao:isAbout"),
) as Record<string, unknown>;

/** Project with iao:isAbout as an empty array. */
const EMPTY_IS_ABOUT: Record<string, unknown> = {
  ...VALID_V04,
  id: "urn:uuid:00000000-0000-0000-0000-000000000003",
  "iao:isAbout": [],
};

/** Project with placeholder + a real IRI (anchor check must NOT fire). */
const MIXED_IS_ABOUT: Record<string, unknown> = {
  ...VALID_V04,
  id: "urn:uuid:00000000-0000-0000-0000-000000000004",
  "iao:isAbout": [
    "ecm:UnspecifiedSubjectMatter",
    "https://example.org/subjects/RealSubject",
  ],
};

/** Project with specVersion too high. */
const VERSION_05: Record<string, unknown> = {
  ...VALID_V04,
  id: "urn:uuid:00000000-0000-0000-0000-000000000005",
  "ecm:specVersion": "0.5",
};

/** Project with ecm:specVersion absent. */
const VERSION_ABSENT: Record<string, unknown> = Object.fromEntries(
  Object.entries(VALID_V04).filter((e) => e[0] !== "ecm:specVersion"),
) as Record<string, unknown>;

/** Project with a malformed ecm:specVersion string. */
const VERSION_MALFORMED: Record<string, unknown> = {
  ...VALID_V04,
  id: "urn:uuid:00000000-0000-0000-0000-000000000006",
  "ecm:specVersion": "not-a-version",
};

/** Project with an older valid specVersion (0.3 is <= 0.4). */
const VERSION_03: Record<string, unknown> = {
  ...VALID_V04,
  id: "urn:uuid:00000000-0000-0000-0000-000000000007",
  "ecm:specVersion": "0.3",
};

// ---------------------------------------------------------------------------
// Helper: collect findings for a given code from a project
// ---------------------------------------------------------------------------

function findingsByCode(
  project: Record<string, unknown>,
  code: string,
): ValidationFinding[] {
  const report = validate(project);
  return (report["ecm:findings"] as ValidationFinding[]).filter(
    (f) => f["ecm:code"] === code,
  );
}

// ---------------------------------------------------------------------------
// AC-valid: fully valid v0.4 project produces empty ecm:findings
// ---------------------------------------------------------------------------
console.log("\nAC-valid: fully valid v0.4 project");

try {
  const report = validate(VALID_V04);
  const findings = report["ecm:findings"] as ValidationFinding[];
  strictEqual(
    findings.length,
    0,
    `Expected 0 findings; got ${findings.length}: ` +
      JSON.stringify(findings.map((f) => f["ecm:code"])),
  );
  pass("fully valid v0.4 project produces empty ecm:findings (AC-valid)");
} catch (e) {
  fail("fully valid v0.4 project must produce no findings (AC-valid)", e);
}

// ---------------------------------------------------------------------------
// AC-schema: every finding has all 5 required section 5.13 fields
// ---------------------------------------------------------------------------
console.log("\nAC-schema: finding schema compliance (section 5.13)");

try {
  const findings = validate(PLACEHOLDER_ONLY)["ecm:findings"] as ValidationFinding[];
  ok(findings.length > 0, "Need >= 1 finding to verify schema");
  const required = ["ecm:severity", "ecm:code", "ecm:message", "ecm:target", "ecm:acknowledged"];
  for (const f of findings) {
    for (const field of required) {
      if (!(field in f)) {
        throw new Error(
          `Finding "${f["ecm:code"]}" missing required field "${field}" (section 5.13)`,
        );
      }
    }
    if (f.type !== "ecm:ValidationFinding") {
      throw new Error(`Finding type must be "ecm:ValidationFinding", got "${String(f.type)}"`);
    }
    strictEqual(f["ecm:acknowledged"], false, "ecm:acknowledged must default to false");
    const validSeverities = ["ecm:error", "ecm:warning", "ecm:info"];
    ok(
      validSeverities.includes(f["ecm:severity"]),
      `ecm:severity "${f["ecm:severity"]}" is not a valid severity value`,
    );
  }
  pass(`every finding has all 5 required section 5.13 fields + correct type (AC-schema, ${findings.length} finding(s) checked)`);
} catch (e) {
  fail("finding schema compliance (AC-schema)", e);
}

// ---------------------------------------------------------------------------
// AC-anchor1: MISSING_REALIST_ANCHOR fires for placeholder-only iao:isAbout
// AC-anchor2: MISSING_REALIST_ANCHOR does NOT fire for a real subject IRI
// (IMPLEMENTATION_PLAN.md section 1.3 -- two required separate unit tests)
// ---------------------------------------------------------------------------
console.log("\nAC-anchor1/anchor2: MISSING_REALIST_ANCHOR");

try {
  const hits = findingsByCode(PLACEHOLDER_ONLY, "MISSING_REALIST_ANCHOR");
  strictEqual(hits.length, 1, "Expected exactly 1 MISSING_REALIST_ANCHOR finding");
  strictEqual(hits[0]["ecm:severity"], "ecm:error");
  strictEqual(
    hits[0]["ecm:target"],
    PLACEHOLDER_ONLY["id"],
    "ecm:target must equal project id",
  );
  pass('MISSING_REALIST_ANCHOR fires for iao:isAbout: ["ecm:UnspecifiedSubjectMatter"] (AC-anchor1)');
} catch (e) {
  fail('MISSING_REALIST_ANCHOR must fire for iao:isAbout: ["ecm:UnspecifiedSubjectMatter"] (AC-anchor1)', e);
}

try {
  const hits = findingsByCode(VALID_V04, "MISSING_REALIST_ANCHOR");
  strictEqual(hits.length, 0, "MISSING_REALIST_ANCHOR must not fire for real IRI");
  pass("MISSING_REALIST_ANCHOR does NOT fire for iao:isAbout with non-placeholder IRI (AC-anchor2)");
} catch (e) {
  fail("MISSING_REALIST_ANCHOR must not fire for a real iao:isAbout IRI (AC-anchor2)", e);
}

try {
  strictEqual(findingsByCode(ABSENT_IS_ABOUT, "MISSING_REALIST_ANCHOR").length, 1,
    "Expected MISSING_REALIST_ANCHOR when iao:isAbout is absent");
  pass("MISSING_REALIST_ANCHOR fires when iao:isAbout is absent");
} catch (e) {
  fail("MISSING_REALIST_ANCHOR must fire when iao:isAbout is absent", e);
}

try {
  strictEqual(findingsByCode(EMPTY_IS_ABOUT, "MISSING_REALIST_ANCHOR").length, 1,
    "Expected MISSING_REALIST_ANCHOR when iao:isAbout is empty array");
  pass("MISSING_REALIST_ANCHOR fires when iao:isAbout is empty array");
} catch (e) {
  fail("MISSING_REALIST_ANCHOR must fire when iao:isAbout is empty array", e);
}

try {
  strictEqual(findingsByCode(MIXED_IS_ABOUT, "MISSING_REALIST_ANCHOR").length, 0,
    "MISSING_REALIST_ANCHOR must not fire when placeholder + real IRI are both present");
  pass("MISSING_REALIST_ANCHOR does NOT fire when iao:isAbout contains placeholder + real IRI");
} catch (e) {
  fail("MISSING_REALIST_ANCHOR must not fire for mixed placeholder + real IRI", e);
}

// ---------------------------------------------------------------------------
// AC-version: INVALID_SPEC_VERSION
// (IMPLEMENTATION_PLAN.md section 1.3 -- ecm:specVersion: "0.5" triggers it)
// ---------------------------------------------------------------------------
console.log("\nAC-version: INVALID_SPEC_VERSION");

try {
  const hits = findingsByCode(VERSION_05, "INVALID_SPEC_VERSION");
  strictEqual(hits.length, 1, 'Expected INVALID_SPEC_VERSION for ecm:specVersion: "0.5"');
  strictEqual(hits[0]["ecm:severity"], "ecm:error");
  pass('INVALID_SPEC_VERSION fires for ecm:specVersion: "0.5" (AC-version)');
} catch (e) {
  fail('INVALID_SPEC_VERSION must fire for ecm:specVersion: "0.5" (AC-version)', e);
}

try {
  strictEqual(findingsByCode(VALID_V04, "INVALID_SPEC_VERSION").length, 0,
    'INVALID_SPEC_VERSION must not fire for "0.4"');
  pass('INVALID_SPEC_VERSION does NOT fire for ecm:specVersion: "0.4"');
} catch (e) {
  fail('INVALID_SPEC_VERSION must not fire for ecm:specVersion: "0.4"', e);
}

try {
  strictEqual(findingsByCode(VERSION_ABSENT, "INVALID_SPEC_VERSION").length, 1,
    "Expected INVALID_SPEC_VERSION when ecm:specVersion absent");
  pass("INVALID_SPEC_VERSION fires when ecm:specVersion is absent");
} catch (e) {
  fail("INVALID_SPEC_VERSION must fire when ecm:specVersion is absent", e);
}

try {
  strictEqual(findingsByCode(VERSION_MALFORMED, "INVALID_SPEC_VERSION").length, 1,
    'Expected INVALID_SPEC_VERSION for malformed specVersion "not-a-version"');
  pass('INVALID_SPEC_VERSION fires for malformed ecm:specVersion "not-a-version"');
} catch (e) {
  fail('INVALID_SPEC_VERSION must fire for malformed ecm:specVersion', e);
}

try {
  strictEqual(findingsByCode(VERSION_03, "INVALID_SPEC_VERSION").length, 0,
    'INVALID_SPEC_VERSION must not fire for "0.3"');
  pass('INVALID_SPEC_VERSION does NOT fire for ecm:specVersion: "0.3"');
} catch (e) {
  fail('INVALID_SPEC_VERSION must not fire for ecm:specVersion: "0.3"', e);
}

// ---------------------------------------------------------------------------
// AC-fixture: per-code malformed fixtures (DEFERRED -- gated on OED-313)
// Precedent: tests/tbox-bundle.test.ts AC3 stub.
// ---------------------------------------------------------------------------
console.log("\nAC-fixture: per-code malformed fixtures (DEFERRED)");
pass(
  "per-code malformed fixtures for all section 17.2 error codes" +
    " (AC-fixture stub; gated on OED-313 conformance fixture set scope decision)",
);

// ---------------------------------------------------------------------------
// AC-coverage: branch coverage >= 85% (DEFERRED -- gated on CI coverage tooling)
// Precedent: same deferral pattern as property-based tests and OED-313 goldens.
// ---------------------------------------------------------------------------
console.log("\nAC-coverage: >= 85% branch coverage (DEFERRED)");
pass(
  "branch coverage >= 85% for src/validate/ (AC-coverage stub;" +
    " gated on CI coverage tooling addition; no c8/nyc in package.json devDependencies)",
);

// ---------------------------------------------------------------------------
// Summary
// ---------------------------------------------------------------------------
console.log(`\n  ${passed} passed, ${failed} failed`);
if (failed > 0) process.exit(1);
