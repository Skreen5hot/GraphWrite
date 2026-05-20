/**
 * Normalize-on-Load Tests (IMPLEMENTATION_PLAN.md section 1.10)
 *
 * SPEC refs: section 5.3, section 17.4, FR-C014.
 *
 * Acceptance criteria covered here:
 *   AC1: normalizeOnLoad called twice on the same doc returns wasNormalized:
 *        false on the second call (idempotency).
 *   AC2: a non-canonically-ordered valid fixture returns wasNormalized: true
 *        on first call.
 *   AC3: NORMALIZED_ON_SAVE is present in validate() output when and only
 *        when wasNormalized was true.
 *
 * Pattern: hand-rolled per tests/run-tests.ts; no framework; node:assert;
 * process.exit(1) on failure. Follows tests/legacy-migration.test.ts.
 */

import { strictEqual, ok } from "node:assert";
import { normalizeOnLoad } from "../src/normalize/index.js";
import { validate, type ValidationFinding } from "../src/validate/index.js";
import { serializeVmp } from "../src/kernel/canonicalize.js";

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

/**
 * Non-canonical VMP project: type array in wrong order; iao:isAbout in wrong
 * order. Valid content; not in canonical serialization form.
 */
const NON_CANONICAL_DOC: Record<string, unknown> = {
  "id": "urn:uuid:00000000-0000-0000-0000-000000000020",
  "type": ["iao:OntologyDesignPattern", "ecm:Project"],
  "ecm:specVersion": "0.4",
  "ecm:name": "Non-Canonical Project",
  "ecm:createdAt": "2026-05-14T12:00:00Z",
  "ecm:updatedAt": "2026-05-14T12:00:00Z",
  "iao:isAbout": ["zzz:SubjectMatter", "aaa:SubjectMatter"],
  "ecm:ontologies": [],
  "ecm:terms": [],
  "ecm:instances": [],
  "ecm:relations": [],
  "ecm:literalAssertions": [],
  "ecm:layouts": [],
  "ecm:snapshots": [],
  "ecm:serializations": [],
};

/**
 * Canonical VMP project: derived from NON_CANONICAL_DOC via serializeVmp +
 * JSON.parse, guaranteeing canonical structure without hard-coding the full
 * @context block. normalizeOnLoad(CANONICAL_DOC) must return
 * wasNormalized: false by construction (serializeVmp idempotency + V8
 * JSON.parse insertion-order preservation).
 */
const CANONICAL_DOC: Record<string, unknown> =
  JSON.parse(serializeVmp(NON_CANONICAL_DOC)) as Record<string, unknown>;

// ---------------------------------------------------------------------------
// AC2: non-canonical input returns wasNormalized: true on first call
// ---------------------------------------------------------------------------
console.log("\nAC2: non-canonical input detected");

try {
  const result = normalizeOnLoad(NON_CANONICAL_DOC);
  strictEqual(
    result.wasNormalized,
    true,
    "normalizeOnLoad(non-canonical doc) must return wasNormalized: true (AC2)",
  );
  ok(result.document !== null, "result.document must not be null (AC2)");
  pass("normalizeOnLoad(non-canonical doc) returns wasNormalized: true (AC2)");
} catch (e) {
  fail("normalizeOnLoad(non-canonical doc) must return wasNormalized: true (AC2)", e);
}

// ---------------------------------------------------------------------------
// AC1: idempotency -- second call returns wasNormalized: false
// ---------------------------------------------------------------------------
console.log("\nAC1: idempotency (second call returns wasNormalized: false)");

try {
  const first = normalizeOnLoad(NON_CANONICAL_DOC);
  strictEqual(
    first.wasNormalized,
    true,
    "First call must return wasNormalized: true (AC1 setup)",
  );
  const second = normalizeOnLoad(first.document);
  strictEqual(
    second.wasNormalized,
    false,
    "Second call on normalized document must return wasNormalized: false (AC1)",
  );
  pass("normalizeOnLoad idempotent: second call returns wasNormalized: false (AC1)");
} catch (e) {
  fail("normalizeOnLoad idempotency: second call must return wasNormalized: false (AC1)", e);
}

try {
  // Canonical input: first call must also return wasNormalized: false.
  const result = normalizeOnLoad(CANONICAL_DOC);
  strictEqual(
    result.wasNormalized,
    false,
    "normalizeOnLoad(canonical doc) must return wasNormalized: false (AC1)",
  );
  pass("normalizeOnLoad(canonical doc) returns wasNormalized: false (AC1)");
} catch (e) {
  fail("normalizeOnLoad(canonical doc) must return wasNormalized: false (AC1)", e);
}

// ---------------------------------------------------------------------------
// AC3: NORMALIZED_ON_SAVE in validate() when and only when wasNormalized true
// ---------------------------------------------------------------------------
console.log("\nAC3: NORMALIZED_ON_SAVE in validate() iff wasNormalized");

try {
  // wasNormalized: true path -- validate() must emit NORMALIZED_ON_SAVE.
  const normResult = normalizeOnLoad(NON_CANONICAL_DOC);
  strictEqual(
    normResult.wasNormalized,
    true,
    "AC3 setup: normalizeOnLoad must return wasNormalized: true",
  );
  const report = validate(normResult.document);
  const findings = report["ecm:findings"] as ValidationFinding[];
  const normFindings = findings.filter(
    (f) => f["ecm:code"] === "NORMALIZED_ON_SAVE",
  );
  strictEqual(
    normFindings.length,
    1,
    "validate() must emit exactly 1 NORMALIZED_ON_SAVE finding when wasNormalized: true (AC3)",
  );
  strictEqual(
    normFindings[0]["ecm:severity"],
    "ecm:info",
    "NORMALIZED_ON_SAVE finding must have ecm:info severity (AC3)",
  );
  strictEqual(
    normFindings[0]["ecm:acknowledged"],
    false,
    "NORMALIZED_ON_SAVE finding must have ecm:acknowledged: false (AC3)",
  );
  pass("validate() emits NORMALIZED_ON_SAVE when wasNormalized: true (AC3)");
} catch (e) {
  fail("validate() must emit NORMALIZED_ON_SAVE when wasNormalized: true (AC3)", e);
}

try {
  // wasNormalized: false path -- validate() must NOT emit NORMALIZED_ON_SAVE.
  const normResult = normalizeOnLoad(CANONICAL_DOC);
  strictEqual(
    normResult.wasNormalized,
    false,
    "AC3 setup: canonical doc must give wasNormalized: false",
  );
  const report = validate(normResult.document);
  const findings = report["ecm:findings"] as ValidationFinding[];
  const normFindings = findings.filter(
    (f) => f["ecm:code"] === "NORMALIZED_ON_SAVE",
  );
  strictEqual(
    normFindings.length,
    0,
    "validate() must NOT emit NORMALIZED_ON_SAVE when wasNormalized: false (AC3)",
  );
  pass("validate() does not emit NORMALIZED_ON_SAVE when wasNormalized: false (AC3)");
} catch (e) {
  fail("validate() must NOT emit NORMALIZED_ON_SAVE when wasNormalized: false (AC3)", e);
}

// ---------------------------------------------------------------------------
// Summary
// ---------------------------------------------------------------------------
console.log(`\n  ${passed} passed, ${failed} failed`);
if (failed > 0) process.exit(1);
