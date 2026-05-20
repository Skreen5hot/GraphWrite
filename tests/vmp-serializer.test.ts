/**
 * VMP Serializer Tests
 *
 * Covers IMPLEMENTATION_PLAN.md §1.1 acceptance criteria:
 *   AC1 â€” round-trip: serialize(parse(canonical)) === canonical (golden-file
 *          comparison deferred to OED-313; approximated here with a self-
 *          consistent canonical fixture).
 *   AC2 â€” idempotency: serialize(parse(serialize(doc))) === serialize(doc).
 *   AC3 â€” @id and @type do not appear as keys in the compact document body.
 *   AC4 â€” @context is always the first key and matches Â§5.2 VMP_CONTEXT.
 *
 * Note: true property-based tests (fast-check) approved per task 1.12.
 * Canonical idempotency PBT uses fast-check (>= 100 samples; seed 0xcafef00d).
 */

import * as fc from "fast-check";
import { strictEqual, deepStrictEqual } from "node:assert";
import { serializeVmp, VMP_CONTEXT } from "../src/kernel/canonicalize.js";

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

/** Minimal VMP project using non-compact @id/@type (tests alias rename path). */
const MINIMAL_VMP_ATID: Record<string, unknown> = {
  "@id": "urn:uuid:00000000-0000-0000-0000-000000000001",
  "@type": ["ecm:Project", "iao:OntologyDesignPattern"],
  "ecm:specVersion": "0.4",
  "ecm:name": "Test Project",
  "ecm:createdAt": "2026-05-14T12:00:00Z",
  "ecm:updatedAt": "2026-05-14T12:00:00Z",
  "iao:isAbout": ["ecm:UnspecifiedSubjectMatter"],
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
 * Non-canonical VMP project: reversed type array, wrong IRI order,
 * fractional-second and offset timestamps, named-array elements out of order.
 */
const UNORDERED_VMP: Record<string, unknown> = {
  "id": "urn:uuid:00000000-0000-0000-0000-000000000002",
  "type": ["iao:OntologyDesignPattern", "ecm:Project"],
  "ecm:specVersion": "0.4",
  "ecm:name": "Unordered Project",
  "ecm:createdAt": "2026-05-14T12:00:00.123Z",
  "ecm:updatedAt": "2026-05-14T12:00:00+00:00",
  "iao:isAbout": ["zzz:Subject", "aaa:Subject"],
  "ecm:terms": [
    { "id": "urn:term:z", "ecm:label": "Zeta" },
    { "id": "urn:term:a", "ecm:label": "Alpha" },
  ],
  "ecm:instances": [],
  "ecm:relations": [],
  "ecm:literalAssertions": [],
  "ecm:ontologies": [],
  "ecm:layouts": [],
  "ecm:snapshots": [],
  "ecm:serializations": [],
};

// ---------------------------------------------------------------------------
// AC4: @context is always the first key and matches §5.2 VMP_CONTEXT
// ---------------------------------------------------------------------------
try {
  const output = serializeVmp(MINIMAL_VMP_ATID);
  const parsed = JSON.parse(output) as Record<string, unknown>;
  const firstKey = Object.keys(parsed)[0];
  strictEqual(firstKey, "@context");
  deepStrictEqual(parsed["@context"], VMP_CONTEXT);
  pass("@context is the first key and deep-equals §5.2 VMP_CONTEXT (AC4)");
} catch (e) {
  fail("@context first-key and §5.2 match (AC4)", e);
}

// ---------------------------------------------------------------------------
// AC3: @id and @type do not appear as keys in the compact document body
// (The @context value legitimately uses @type as a JSON-LD processing
// keyword inside context definitions; that value is excluded from the scan.)
// ---------------------------------------------------------------------------
try {
  for (const [label, doc] of Object.entries({ MINIMAL_VMP_ATID, UNORDERED_VMP })) {
    const output = serializeVmp(doc as Record<string, unknown>);
    const parsed = JSON.parse(output) as Record<string, unknown>;
    // Stringify everything except @context so we only scan the document body
    const body: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(parsed)) {
      if (k !== "@context") body[k] = v;
    }
    const bodyStr = JSON.stringify(body);
    if (bodyStr.includes('"@id"')) {
      throw new Error(`"@id" found as key in document body (fixture: ${label})`);
    }
    if (bodyStr.includes('"@type"')) {
      throw new Error(`"@type" found as key in document body (fixture: ${label})`);
    }
  }
  pass('neither "@id" nor "@type" appear as keys in compact document body (AC3)');
} catch (e) {
  fail('"@id" / "@type" absence in document body (AC3)', e);
}

// ---------------------------------------------------------------------------
// §5.3 rule 2: top-level key order (@context, id, type, ecm:specVersion first)
// ---------------------------------------------------------------------------
try {
  const output = serializeVmp(MINIMAL_VMP_ATID);
  const parsed = JSON.parse(output) as Record<string, unknown>;
  const keys = Object.keys(parsed);
  strictEqual(keys[0], "@context");
  strictEqual(keys[1], "id");
  strictEqual(keys[2], "type");
  strictEqual(keys[3], "ecm:specVersion");
  pass("top-level key order: @context, id, type, ecm:specVersion first (§5.3 rule 2)");
} catch (e) {
  fail("top-level key order (§5.3 rule 2)", e);
}

// ---------------------------------------------------------------------------
// §5.3 rule 4: named arrays sorted by element id
// ---------------------------------------------------------------------------
try {
  const output = serializeVmp(UNORDERED_VMP);
  const parsed = JSON.parse(output) as Record<string, unknown>;
  const terms = parsed["ecm:terms"] as Array<Record<string, unknown>>;
  strictEqual(terms[0]["id"], "urn:term:a",
    "first ecm:terms element should be urn:term:a");
  strictEqual(terms[1]["id"], "urn:term:z",
    "second ecm:terms element should be urn:term:z");
  pass("ecm:terms sorted by element id lexicographically (§5.3 rule 4)");
} catch (e) {
  fail("named-array sorting by element id (§5.3 rule 4)", e);
}

// ---------------------------------------------------------------------------
// §5.3 rule 5: IRI arrays sorted lexicographically
// ---------------------------------------------------------------------------
try {
  const output = serializeVmp(UNORDERED_VMP);
  const parsed = JSON.parse(output) as Record<string, unknown>;
  const isAbout = parsed["iao:isAbout"] as string[];
  strictEqual(isAbout[0], "aaa:Subject");
  strictEqual(isAbout[1], "zzz:Subject");
  pass("iao:isAbout sorted lexicographically (§5.3 rule 5)");
} catch (e) {
  fail("IRI-array lexicographic sorting (§5.3 rule 5)", e);
}

// ---------------------------------------------------------------------------
// §5.3 rule 8: ISO 8601 timestamp normalization
// ---------------------------------------------------------------------------
try {
  const output = serializeVmp(UNORDERED_VMP);
  const parsed = JSON.parse(output) as Record<string, unknown>;
  strictEqual(parsed["ecm:createdAt"], "2026-05-14T12:00:00Z",
    "fractional seconds should be stripped");
  strictEqual(parsed["ecm:updatedAt"], "2026-05-14T12:00:00Z",
    "UTC offset +00:00 should be replaced with Z");
  pass("ISO 8601 timestamps normalized: no fractional seconds, Z suffix (§5.3 rule 8)");
} catch (e) {
  fail("timestamp normalization (§5.3 rule 8)", e);
}

// ---------------------------------------------------------------------------
// §5.4: project type is a lexicographically sorted array
// ---------------------------------------------------------------------------
try {
  // UNORDERED_VMP has type in reverse order: ["iao:OntologyDesignPattern", "ecm:Project"]
  const output = serializeVmp(UNORDERED_VMP);
  const parsed = JSON.parse(output) as Record<string, unknown>;
  const typeArr = parsed["type"] as string[];
  deepStrictEqual(typeArr, ["ecm:Project", "iao:OntologyDesignPattern"]);
  pass("project type sorted lexicographically even when input is unordered (§5.4)");
} catch (e) {
  fail("project type sorted array (§5.4)", e);
}

// ---------------------------------------------------------------------------
// AC2: idempotency â€” serialize(parse(serialize(doc))) === serialize(doc)
// ---------------------------------------------------------------------------
try {
  const s1 = serializeVmp(MINIMAL_VMP_ATID);
  const s2 = serializeVmp(JSON.parse(s1) as Record<string, unknown>);
  strictEqual(s2, s1);
  pass("serializeVmp idempotent on @id/@type input (AC2)");
} catch (e) {
  fail("idempotency on @id/@type input (AC2)", e);
}

try {
  const s1 = serializeVmp(UNORDERED_VMP);
  const s2 = serializeVmp(JSON.parse(s1) as Record<string, unknown>);
  strictEqual(s2, s1);
  pass("serializeVmp idempotent on non-canonical input (AC2)");
} catch (e) {
  fail("idempotency on non-canonical input (AC2)", e);
}

// ---------------------------------------------------------------------------
// AC1: round-trip â€” serialize(parse(canonical)) === canonical
// (Approximation: uses self-consistent first serialization as the canonical
// reference. True golden-file comparison deferred to OED-313 close.)
// ---------------------------------------------------------------------------
try {
  const canonical = serializeVmp(MINIMAL_VMP_ATID);
  const roundTripped = serializeVmp(JSON.parse(canonical) as Record<string, unknown>);
  strictEqual(roundTripped, canonical);
  pass("round-trip: serialize(parse(canonical)) === canonical (AC1 stub; golden files gated on OED-313)");
} catch (e) {
  fail("round-trip (AC1 stub)", e);
}

// ---------------------------------------------------------------------------
// Terminating newline (§5.3 rule 6)
// ---------------------------------------------------------------------------
try {
  const output = serializeVmp(MINIMAL_VMP_ATID);
  if (!output.endsWith("\n")) throw new Error("Output does not end with LF newline");
  if (output.endsWith("\n\n")) throw new Error("Output has multiple trailing newlines");
  pass("output ends with exactly one terminating LF newline (§5.3 rule 6)");
} catch (e) {
  fail("terminating newline (§5.3 rule 6)", e);
}

// ---------------------------------------------------------------------------
// AC2-PBT: Canonical idempotency property-based test (fast-check, 100 samples)
// SPEC section 21.1: serialize(parse(serialize(P))) === serialize(P) bytewise.
// Exercises: varied timestamps, named-array ordering, IRI-array ordering.
// ---------------------------------------------------------------------------
console.log("\nAC2-PBT: Canonical idempotency property-based test (fast-check, 100 samples)");

try {
  const emptyArrArb = fc.constant([] as unknown[]);

  const vmpArb = fc.record({
    "id": fc.constantFrom(
      "urn:uuid:00000000-0000-0000-0000-000000000001",
      "urn:uuid:00000000-0000-0000-0000-000000000002",
      "urn:uuid:aaaabbbb-cccc-dddd-eeee-ffffffffffff",
    ),
    "type": fc.constant(["ecm:Project", "iao:OntologyDesignPattern"] as unknown[]),
    "ecm:specVersion": fc.constantFrom("0.4", "0.3", "0.0"),
    "ecm:name": fc.constantFrom("Project A", "Project B", "Test Project"),
    "ecm:createdAt": fc.constantFrom(
      "2026-01-01T00:00:00Z",
      "2026-05-14T12:00:00.123Z",
      "2026-05-14T12:00:00+00:00",
      "2026-05-14T12:00:00.456+05:30",
    ),
    "ecm:updatedAt": fc.constantFrom(
      "2026-01-01T00:00:00Z",
      "2026-05-14T12:30:00.999Z",
      "2026-05-14T12:00:00-08:00",
    ),
    "iao:isAbout": fc.array(
      fc.constantFrom(
        "https://example.org/s/A",
        "https://example.org/s/B",
        "https://example.org/s/C",
      ),
      { minLength: 1, maxLength: 3 },
    ),
    "ecm:terms": fc.array(
      fc.record({
        "id": fc.constantFrom("urn:t:a", "urn:t:b", "urn:t:c", "urn:t:z"),
        "ecm:label": fc.constantFrom("Alpha", "Beta", "Gamma"),
      }),
      { minLength: 0, maxLength: 3 },
    ),
    "ecm:instances": emptyArrArb,
    "ecm:relations": emptyArrArb,
    "ecm:literalAssertions": emptyArrArb,
    "ecm:ontologies": emptyArrArb,
    "ecm:layouts": emptyArrArb,
    "ecm:snapshots": emptyArrArb,
    "ecm:serializations": emptyArrArb,
  });

  fc.assert(
    fc.property(vmpArb, (doc) => {
      const s1 = serializeVmp(doc as Record<string, unknown>);
      const s2 = serializeVmp(JSON.parse(s1) as Record<string, unknown>);
      return s1 === s2;
    }),
    { numRuns: 100, seed: 0xcafef00d },
  );
  pass(
    "canonical idempotency: 100 samples pass " +
      "(AC2-PBT, SPEC section 21.1; fast-check seed 0xcafef00d)",
  );
} catch (e) {
  fail("canonical idempotency property-based test (AC2-PBT, SPEC section 21.1)", e);
}

// ---------------------------------------------------------------------------
// Summary
// ---------------------------------------------------------------------------
console.log(`\n  ${passed} passed, ${failed} failed`);
if (failed > 0) process.exit(1);