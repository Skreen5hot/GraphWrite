/**
 * IRI Generation -- uuidFn injection tests (Phase 3 Chain 4 sub-task A2)
 *
 * SPEC refs: section 9.2, NFR-003, FR-C011.
 *
 * Verifies the optional uuidFn parameter added to generateIri in sub-task A2:
 * browser-compat callers supply `() => crypto.randomUUID()` instead of the
 * node:crypto path. The node fallback is non-breaking.
 *
 * AC1: Injected uuidFn return value appears verbatim as the UUID in the IRI.
 * AC2: No uuidFn -- node fallback path produces a valid urn:uuid: IRI (non-breaking).
 * AC3: uuidFn is called exactly once per generateIri invocation.
 * AC4: ecm:deterministic mode is unaffected by the uuidFn parameter.
 *
 * Pattern: hand-rolled per tests/run-tests.ts; no framework; node:assert;
 * process.exit(1) on failure. Follows tests/iri-generation.test.ts.
 */

import { ok, strictEqual } from "node:assert";
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
// Regex: valid urn:uuid: UUID (any variant; covers v4, v5, and injected values)
// ---------------------------------------------------------------------------
const UUID_URN_RE = /^urn:uuid:[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

// ---------------------------------------------------------------------------
// AC1: Injected uuidFn return value appears verbatim in IRI
// ---------------------------------------------------------------------------
console.log("\nAC1: injected uuidFn return value appears verbatim in IRI");

try {
  const FIXED_UUID = "12345678-1234-4123-8234-123456789abc";
  const uuidFn = (): string => FIXED_UUID;
  const iri = generateIri("ecm:uuid-urn", {}, uuidFn);
  strictEqual(
    iri,
    `urn:uuid:${FIXED_UUID}`,
    "IRI must equal urn:uuid:<FIXED_UUID> when uuidFn is provided (AC1)",
  );
  pass("injected uuidFn return value appears verbatim in IRI (AC1)");
} catch (e) {
  fail("IRI must be urn:uuid:<uuidFn()> when uuidFn is provided (AC1)", e);
}

try {
  const values = [
    "aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee",
    "11111111-2222-4333-8444-555555555555",
    "deadbeef-cafe-4bab-8f00-ffffffffffff",
  ];
  for (const v of values) {
    const iri = generateIri("ecm:uuid-urn", {}, () => v);
    strictEqual(iri, `urn:uuid:${v}`, "IRI must reflect injected value verbatim (AC1 variant)");
  }
  pass("multiple distinct injected values each reflected verbatim in IRI (AC1 variant)");
} catch (e) {
  fail("each injected value must appear verbatim in the IRI (AC1 variant)", e);
}

// ---------------------------------------------------------------------------
// AC2: No uuidFn -- node fallback path; non-breaking for existing callers
// ---------------------------------------------------------------------------
console.log("\nAC2: no uuidFn arg -- node fallback path; non-breaking");

try {
  const iri = generateIri("ecm:uuid-urn", {});
  ok(UUID_URN_RE.test(iri), `IRI does not match urn:uuid: UUID regex (AC2): ${iri}`);
  pass("no-uuidFn path (node fallback) returns valid urn:uuid: IRI (AC2)");
} catch (e) {
  fail("no-uuidFn path must return valid urn:uuid: IRI (non-breaking, AC2)", e);
}

try {
  for (let i = 0; i < 5; i++) {
    const iri = generateIri("ecm:uuid-urn", {});
    ok(
      UUID_URN_RE.test(iri),
      `Call ${i + 1}: IRI does not match urn:uuid: UUID regex (AC2 robustness): ${iri}`,
    );
  }
  pass("5 repeated no-uuidFn calls all produce valid urn:uuid: IRIs (AC2 robustness)");
} catch (e) {
  fail("repeated no-uuidFn calls must all return valid urn:uuid: IRIs (AC2 robustness)", e);
}

// ---------------------------------------------------------------------------
// AC3: uuidFn called exactly once per generateIri invocation
// ---------------------------------------------------------------------------
console.log("\nAC3: uuidFn called exactly once per generateIri invocation");

try {
  let callCount = 0;
  const countingFn = (): string => {
    callCount++;
    return "aaaabbbb-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
  };

  generateIri("ecm:uuid-urn", {}, countingFn);
  strictEqual(callCount, 1, `uuidFn must be called exactly once; got ${callCount} (AC3)`);

  generateIri("ecm:uuid-urn", {}, countingFn);
  strictEqual(callCount, 2, `Second call: uuidFn total must be 2; got ${callCount} (AC3)`);

  generateIri("ecm:uuid-urn", {}, countingFn);
  strictEqual(callCount, 3, `Third call: uuidFn total must be 3; got ${callCount} (AC3)`);

  pass("uuidFn called exactly once per generateIri invocation (AC3)");
} catch (e) {
  fail("uuidFn must be called exactly once per generateIri invocation (AC3)", e);
}

// ---------------------------------------------------------------------------
// AC4: ecm:deterministic mode unaffected by uuidFn parameter
// ---------------------------------------------------------------------------
console.log("\nAC4: ecm:deterministic mode unaffected by uuidFn parameter");

try {
  let deterministicFnCalled = false;
  const shouldNotBeCalled = (): string => {
    deterministicFnCalled = true;
    return "should-never-appear-in-deterministic-iri";
  };

  const SEED = "test-seed-a2";
  const CTX = "entity-ctx-a2";

  const iri1 = generateIri(
    "ecm:deterministic",
    { seed: SEED, entityContext: CTX },
    shouldNotBeCalled,
  );
  const iri2 = generateIri("ecm:deterministic", { seed: SEED, entityContext: CTX });

  ok(!deterministicFnCalled, "uuidFn must NOT be called in ecm:deterministic mode (AC4)");
  strictEqual(
    iri1,
    iri2,
    "ecm:deterministic must produce same IRI with or without uuidFn (AC4)",
  );
  ok(iri1.startsWith("urn:uuid:"), "ecm:deterministic IRI must start with urn:uuid: (AC4)");

  pass("ecm:deterministic mode unaffected by uuidFn; uuidFn not called (AC4)");
} catch (e) {
  fail("ecm:deterministic mode must be unaffected by uuidFn parameter (AC4)", e);
}

// ---------------------------------------------------------------------------
// Summary
// ---------------------------------------------------------------------------
console.log(`\n  ${passed} passed, ${failed} failed`);
if (failed > 0) process.exit(1);
