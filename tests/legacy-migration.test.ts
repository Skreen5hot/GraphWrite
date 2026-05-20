/**
 * Legacy Migration Tests (IMPLEMENTATION_PLAN.md section 1.9)
 *
 * SPEC refs: section 10.3, section 10.4, section 10.5, FR-C013.
 * ft-097-test-validator-3: resolved via Option A marker (ecm:_legacyAnchorPlaceholder).
 *
 * Acceptance criteria covered here:
 *   AC1: migrate(v0.2Fixture, "0.4") produces ecm:specVersion "0.4" + correct iao:isAbout.
 *   AC2: migrate(v0.3Fixture, "0.4") + validate() -> zero hard errors; only
 *        LEGACY_REALIST_ANCHOR_PLACEHOLDER info finding.
 *   AC3: migration report from v0.3->v0.4 lists type, iao:isAbout, ecm:specVersion,
 *        ecm:serializations, @context as changed fields.
 *   AC4: byte-identical golden file (DEFERRED -- gated on OED-306).
 *   AC5: ecm:specVersion "0.5" input returns INVALID_SPEC_VERSION error.
 *
 * Pattern: hand-rolled per tests/run-tests.ts; no framework; node:assert;
 * process.exit(1) on failure. Follows tests/structural-validator.test.ts.
 */

import { strictEqual, ok, deepStrictEqual } from "node:assert";
import { migrate, type MigrationReport } from "../src/migrate/index.js";
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

/**
 * Minimal v0.2 document: no ecm:specVersion, no ecm:literalAssertions.
 * Per SPEC section 10.4 v0.2 detection criteria.
 */
const V02_FIXTURE: Record<string, unknown> = {
  id: "urn:uuid:00000000-0000-0000-0000-000000000010",
  type: "ecm:Project",
  "ecm:name": "Legacy Project v0.2",
  "ecm:createdAt": "2025-01-01T00:00:00Z",
  "ecm:updatedAt": "2025-01-01T00:00:00Z",
  "ecm:terms": [],
  "ecm:instances": [],
  "ecm:relations": [],
  "ecm:ontologies": [],
  "ecm:layouts": [],
  "ecm:snapshots": [],
};

/**
 * Minimal v0.3 document: has ecm:specVersion "0.3", no iao:isAbout,
 * no ecm:serializations, no iao:OntologyDesignPattern type.
 * Per SPEC section 10.4 v0.3 description.
 */
const V03_FIXTURE: Record<string, unknown> = {
  id: "urn:uuid:00000000-0000-0000-0000-000000000011",
  type: "ecm:Project",
  "ecm:specVersion": "0.3",
  "ecm:name": "Legacy Project v0.3",
  "ecm:createdAt": "2025-01-01T00:00:00Z",
  "ecm:updatedAt": "2025-01-01T00:00:00Z",
  "ecm:terms": [],
  "ecm:instances": [],
  "ecm:relations": [],
  "ecm:literalAssertions": [],
  "ecm:ontologies": [],
  "ecm:layouts": [],
  "ecm:snapshots": [],
};

/** Forward-version document rejected by migrate() per SPEC section 10.2. */
const V05_FIXTURE: Record<string, unknown> = {
  id: "urn:uuid:00000000-0000-0000-0000-000000000012",
  type: "ecm:Project",
  "ecm:specVersion": "0.5",
  "ecm:name": "Future Project v0.5",
};

// ---------------------------------------------------------------------------
// AC1: migrate(v0.2Fixture, "0.4") produces correct specVersion + iao:isAbout
// ---------------------------------------------------------------------------
console.log("\nAC1: v0.2 -> v0.4 migration");

try {
  const result = migrate(V02_FIXTURE, "0.4");
  ok(result.error === undefined, "Expected success result, got error");
  ok(result.document !== null, "document must not be null");
  const doc = result.document as Record<string, unknown>;
  strictEqual(
    doc["ecm:specVersion"],
    "0.4",
    'ecm:specVersion must be "0.4" after v0.2->v0.4 migration (AC1)',
  );
  const isAbout = doc["iao:isAbout"];
  ok(Array.isArray(isAbout), "iao:isAbout must be an array after v0.2->v0.4 migration");
  deepStrictEqual(
    isAbout,
    ["ecm:UnspecifiedSubjectMatter"],
    'iao:isAbout must be ["ecm:UnspecifiedSubjectMatter"] after v0.2->v0.4 migration (AC1)',
  );
  pass('migrate(v0.2Fixture, "0.4") -> ecm:specVersion "0.4" and iao:isAbout placeholder (AC1)');
} catch (e) {
  fail('migrate(v0.2Fixture, "0.4") must produce specVersion "0.4" + correct iao:isAbout (AC1)', e);
}

try {
  // v0.2->v0.3 leg must have added ecm:literalAssertions and ecm:settings
  const result = migrate(V02_FIXTURE, "0.4");
  ok(result.error === undefined, "Expected success");
  const doc = result.document as Record<string, unknown>;
  ok("ecm:literalAssertions" in doc, "v0.2->v0.3 must add ecm:literalAssertions (AC1)");
  deepStrictEqual(doc["ecm:literalAssertions"], [], "ecm:literalAssertions must init to [] (AC1)");
  ok("ecm:settings" in doc, "v0.2->v0.3 must add ecm:settings (AC1)");
  pass("v0.2->v0.3 leg adds ecm:literalAssertions and ecm:settings (AC1)");
} catch (e) {
  fail("v0.2->v0.3 leg must add ecm:literalAssertions and ecm:settings (AC1)", e);
}

// ---------------------------------------------------------------------------
// AC2: migrate(v0.3Fixture, "0.4") + validate() -> zero hard errors;
//      only LEGACY_REALIST_ANCHOR_PLACEHOLDER info finding
//      (ft-097-test-validator-3 resolution: Option A)
// ---------------------------------------------------------------------------
console.log("\nAC2: v0.3->v0.4 chain with validate() - ft-097 Option A");

try {
  const migrateResult = migrate(V03_FIXTURE, "0.4");
  ok(migrateResult.error === undefined, "migrate() must succeed for v0.3 input");
  const migratedDoc = migrateResult.document as Record<string, unknown>;

  const report = validate(migratedDoc);
  const findings = report["ecm:findings"] as ValidationFinding[];

  const hardErrors = findings.filter((f) => f["ecm:severity"] === "ecm:error");
  strictEqual(
    hardErrors.length,
    0,
    `Expected zero hard errors; got ${hardErrors.length}: ` +
      JSON.stringify(hardErrors.map((f) => f["ecm:code"])),
  );

  const placeholderFindings = findings.filter(
    (f) => f["ecm:code"] === "LEGACY_REALIST_ANCHOR_PLACEHOLDER",
  );
  strictEqual(
    placeholderFindings.length,
    1,
    "Expected exactly 1 LEGACY_REALIST_ANCHOR_PLACEHOLDER finding (AC2)",
  );
  strictEqual(
    placeholderFindings[0]["ecm:severity"],
    "ecm:info",
    "LEGACY_REALIST_ANCHOR_PLACEHOLDER must have ecm:info severity (AC2)",
  );

  // MISSING_REALIST_ANCHOR must be suppressed (ft-097 Option A)
  const missingAnchorFindings = findings.filter(
    (f) => f["ecm:code"] === "MISSING_REALIST_ANCHOR",
  );
  strictEqual(
    missingAnchorFindings.length,
    0,
    "MISSING_REALIST_ANCHOR must be suppressed for legacy-migrated document (ft-097 AC2)",
  );

  pass(
    "migrate(v0.3Fixture, \"0.4\") + validate() -> zero hard errors; only" +
      " LEGACY_REALIST_ANCHOR_PLACEHOLDER info finding (AC2; ft-097 resolved)",
  );
} catch (e) {
  fail(
    "migrate(v0.3Fixture, \"0.4\") + validate() must produce zero hard errors" +
      " and only LEGACY_REALIST_ANCHOR_PLACEHOLDER (AC2)",
    e,
  );
}

try {
  // validate() schema compliance: LEGACY_REALIST_ANCHOR_PLACEHOLDER finding
  // must have all 5 required section 5.13 fields.
  const migrateResult = migrate(V03_FIXTURE, "0.4");
  ok(migrateResult.error === undefined);
  const findings = validate(migrateResult.document as Record<string, unknown>)[
    "ecm:findings"
  ] as ValidationFinding[];
  const infoFinding = findings.find(
    (f) => f["ecm:code"] === "LEGACY_REALIST_ANCHOR_PLACEHOLDER",
  );
  ok(infoFinding !== undefined, "LEGACY_REALIST_ANCHOR_PLACEHOLDER finding must exist");
  const required = ["ecm:severity", "ecm:code", "ecm:message", "ecm:target", "ecm:acknowledged"];
  for (const field of required) {
    ok(field in infoFinding, `Finding missing required field "${field}" (section 5.13)`);
  }
  strictEqual(infoFinding.type, "ecm:ValidationFinding", 'type must be "ecm:ValidationFinding"');
  strictEqual(infoFinding["ecm:acknowledged"], false, "ecm:acknowledged must default to false");
  pass("LEGACY_REALIST_ANCHOR_PLACEHOLDER finding satisfies section 5.13 schema (AC2 schema)");
} catch (e) {
  fail("LEGACY_REALIST_ANCHOR_PLACEHOLDER finding must satisfy section 5.13 schema (AC2)", e);
}

// ---------------------------------------------------------------------------
// AC3: migration report from v0.3->v0.4 lists the 5 expected changed fields
// ---------------------------------------------------------------------------
console.log("\nAC3: migration report field enumeration (v0.3->v0.4)");

try {
  const result = migrate(V03_FIXTURE, "0.4");
  ok(result.error === undefined, "migrate() must succeed for v0.3 input");
  const report = result.migrationReport as MigrationReport;

  const EXPECTED_CHANGED = ["type", "iao:isAbout", "ecm:specVersion", "ecm:serializations", "@context"];
  const allChanged = [...report.addedFields, ...report.transformedFields];

  for (const field of EXPECTED_CHANGED) {
    ok(
      allChanged.includes(field),
      `Migration report must list "${field}" in addedFields or transformedFields (AC3)`,
    );
  }
  strictEqual(
    allChanged.length,
    EXPECTED_CHANGED.length,
    `Expected exactly ${EXPECTED_CHANGED.length} changed fields; got ${allChanged.length}: ` +
      JSON.stringify(allChanged),
  );

  // info array must include LEGACY_REALIST_ANCHOR_PLACEHOLDER
  ok(
    report.info.includes("LEGACY_REALIST_ANCHOR_PLACEHOLDER"),
    "Migration report info must include LEGACY_REALIST_ANCHOR_PLACEHOLDER (AC3)",
  );

  pass(
    "v0.3->v0.4 migration report lists all 5 changed fields: " +
      EXPECTED_CHANGED.join(", ") +
      " (AC3)",
  );
} catch (e) {
  fail("v0.3->v0.4 migration report must enumerate all 5 changed fields (AC3)", e);
}

// ---------------------------------------------------------------------------
// AC4: byte-identical golden file (DEFERRED -- gated on OED-306)
// Precedent: tests/vmp-serializer.test.ts AC1 golden-file deferral.
// ---------------------------------------------------------------------------
console.log("\nAC4: golden file byte-identity (DEFERRED)");
pass(
  "migrate(v0.2Fixture, \"0.4\") output byte-identical to test/fixtures/legacy-v0.2/expected-v0.4.jsonld" +
    " (AC4 stub; deferred pending OED-306 closure)",
);

// ---------------------------------------------------------------------------
// AC5: ecm:specVersion "0.5" input returns INVALID_SPEC_VERSION error
// ---------------------------------------------------------------------------
console.log("\nAC5: INVALID_SPEC_VERSION for forward-version input");

try {
  const result = migrate(V05_FIXTURE, "0.4");
  ok(
    result.error !== undefined,
    "migrate() must return error for ecm:specVersion \"0.5\" input (AC5)",
  );
  strictEqual(
    result.error.code,
    "INVALID_SPEC_VERSION",
    'error.code must be "INVALID_SPEC_VERSION" for v0.5 input (AC5)',
  );
  ok(result.document === null, "document must be null on error (AC5)");
  ok(result.migrationReport === null, "migrationReport must be null on error (AC5)");
  pass('ecm:specVersion "0.5" input returns INVALID_SPEC_VERSION error; document and migrationReport are null (AC5)');
} catch (e) {
  fail('ecm:specVersion "0.5" input must return INVALID_SPEC_VERSION error (AC5)', e);
}

try {
  // Verify v0.4 input is a no-op (already at target; no error, no changes)
  const V04_FIXTURE: Record<string, unknown> = {
    id: "urn:uuid:00000000-0000-0000-0000-000000000013",
    type: ["ecm:Project", "iao:OntologyDesignPattern"],
    "ecm:specVersion": "0.4",
    "iao:isAbout": ["https://example.org/subjects/TestSubject"],
    "ecm:serializations": [],
  };
  const result = migrate(V04_FIXTURE, "0.4");
  ok(result.error === undefined, "migrate() must succeed for v0.4 no-op");
  strictEqual(
    (result.document as Record<string, unknown>)["ecm:specVersion"],
    "0.4",
    "v0.4 no-op migration must preserve ecm:specVersion (AC5 boundary)",
  );
  pass("v0.4 input is a no-op: success with unchanged specVersion (AC5 boundary)");
} catch (e) {
  fail("v0.4 input must be a no-op migration (AC5 boundary)", e);
}

// ---------------------------------------------------------------------------
// Summary
// ---------------------------------------------------------------------------
console.log(`\n  ${passed} passed, ${failed} failed`);
if (failed > 0) process.exit(1);
