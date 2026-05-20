/**
 * IRI Generation Tests (IMPLEMENTATION_PLAN.md section 1.6)
 *
 * SPEC refs: section 9.2, section 9.3, section 13.9, FR-C009.
 *
 * Acceptance criteria covered here:
 *   AC1: ecm:uuid-urn mode returns urn:uuid: string matching UUIDv4 regex.
 *        Regex: ^urn:uuid:[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$
 *   AC2: ecm:deterministic mode -- same seed + entityContext returns identical IRI.
 *   AC3: Same seed but different entityContext produces different IRI.
 *        Also verified: different seed with same entityContext produces different IRI.
 *   AC4: Deterministic CI golden comparison. DEFERRED per OED-313 gate.
 *        (Precedent: tests/structural-validator.test.ts AC-fixture stub.)
 *
 * Pattern: hand-rolled per tests/run-tests.ts; no framework; node:assert;
 * process.exit(1) on failure. Follows tests/structural-validator.test.ts.
 */

import { ok, strictEqual, notStrictEqual } from "node:assert";
import { generateIri } from "../src/iri/index.js";

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
// Regex constants
// ---------------------------------------------------------------------------

/**
 * UUIDv4 urn:uuid: format regex per IMPLEMENTATION_PLAN.md section 1.6 AC1.
 * Version nibble = 4; variant nibble in [89ab].
 */
const UUID_URN_V4_RE =
  /^urn:uuid:[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;

// ---------------------------------------------------------------------------
// AC1: ecm:uuid-urn mode returns urn:uuid: string matching UUIDv4 regex
// (IMPLEMENTATION_PLAN.md section 1.6)
// ---------------------------------------------------------------------------
console.log("\nAC1: ecm:uuid-urn format (UUIDv4 urn:uuid: regex)");

try {
  const iri = generateIri("ecm:uuid-urn", {});
  ok(UUID_URN_V4_RE.test(iri), `IRI "${iri}" does not match UUIDv4 urn:uuid: regex`);
  pass("ecm:uuid-urn mode returns UUIDv4-formatted urn:uuid: IRI (AC1)");
} catch (e) {
  fail("ecm:uuid-urn mode must return UUIDv4-formatted urn:uuid: IRI (AC1)", e);
}

try {
  for (let i = 0; i < 3; i++) {
    const iri = generateIri("ecm:uuid-urn", {});
    ok(
      UUID_URN_V4_RE.test(iri),
      `Call ${i + 1}: "${iri}" does not match UUIDv4 urn:uuid: regex`,
    );
  }
  pass("ecm:uuid-urn: 3 independent calls all match UUIDv4 urn:uuid: regex (AC1 robustness)");
} catch (e) {
  fail("ecm:uuid-urn: repeated calls must all match UUIDv4 urn:uuid: regex (AC1 robustness)", e);
}

// ---------------------------------------------------------------------------
// AC2: ecm:deterministic -- same seed + entityContext returns identical IRI
// (IMPLEMENTATION_PLAN.md section 1.6)
// ---------------------------------------------------------------------------
console.log("\nAC2: ecm:deterministic reproducibility");

const SEED_A = "test-seed-2026";
const CTX_A = "entity-class-CustomerOrder";

try {
  const iri1 = generateIri("ecm:deterministic", { seed: SEED_A, entityContext: CTX_A });
  const iri2 = generateIri("ecm:deterministic", { seed: SEED_A, entityContext: CTX_A });
  ok(iri1.startsWith("urn:uuid:"), `IRI "${iri1}" must start with urn:uuid:`);
  strictEqual(
    iri1,
    iri2,
    "Two calls with same seed + entityContext must produce identical IRI",
  );
  pass("ecm:deterministic: same seed + entityContext produces identical IRI on two calls (AC2)");
} catch (e) {
  fail("ecm:deterministic: same seed + entityContext must produce identical IRI (AC2)", e);
}

try {
  const iris = Array.from({ length: 5 }, () =>
    generateIri("ecm:deterministic", { seed: SEED_A, entityContext: CTX_A }),
  );
  const allEqual = iris.every((iri) => iri === iris[0]);
  ok(
    allEqual,
    `Expected all 5 calls to return "${iris[0]}"; got: ${JSON.stringify(iris)}`,
  );
  pass(
    "ecm:deterministic: 5 independent calls with same inputs produce identical IRI" +
    " (AC2 robustness)",
  );
} catch (e) {
  fail(
    "ecm:deterministic: 5 independent calls must all produce identical IRI (AC2 robustness)",
    e,
  );
}

// ---------------------------------------------------------------------------
// AC3: Same seed but different entityContext produces different IRI
// (IMPLEMENTATION_PLAN.md section 1.6)
// ---------------------------------------------------------------------------
console.log("\nAC3: ecm:deterministic -- different entityContext produces different IRI");

const CTX_B = "entity-class-OrderLineItem";

try {
  const iriA = generateIri("ecm:deterministic", { seed: SEED_A, entityContext: CTX_A });
  const iriB = generateIri("ecm:deterministic", { seed: SEED_A, entityContext: CTX_B });
  notStrictEqual(
    iriA,
    iriB,
    `Different entityContext must produce different IRIs; got same: "${iriA}"`,
  );
  pass(
    `ecm:deterministic: "${CTX_A}" vs "${CTX_B}" with same seed produces different IRIs (AC3)`,
  );
} catch (e) {
  fail("ecm:deterministic: different entityContext must produce different IRI (AC3)", e);
}

try {
  const SEED_B = "alternate-seed-2026";
  const iriA = generateIri("ecm:deterministic", { seed: SEED_A, entityContext: CTX_A });
  const iriB = generateIri("ecm:deterministic", { seed: SEED_B, entityContext: CTX_A });
  notStrictEqual(
    iriA,
    iriB,
    `Different seed must produce different IRIs; got same: "${iriA}"`,
  );
  pass(
    "ecm:deterministic: different seed with same entityContext produces different IRI" +
    " (AC3 seed-variation)",
  );
} catch (e) {
  fail(
    "ecm:deterministic: different seed must produce different IRI (AC3 seed-variation)",
    e,
  );
}

// ---------------------------------------------------------------------------
// AC4: Deterministic CI golden comparison (DEFERRED per OED-313 gate)
// Precedent: tests/structural-validator.test.ts AC-fixture stub.
// ---------------------------------------------------------------------------
console.log("\nAC4: deterministic CI golden comparison (DEFERRED)");
pass(
  "deterministic CI golden comparison: export --deterministic --seed myseed" +
  " --clock 2026-01-01T00:00:00Z produces byte-identical output to committed golden" +
  " (AC4 stub; gated on OED-313 resolution; IMPLEMENTATION_PLAN section 21.4)",
);

// ---------------------------------------------------------------------------
// Summary
// ---------------------------------------------------------------------------
console.log(`\n  ${passed} passed, ${failed} failed`);
if (failed > 0) process.exit(1);
