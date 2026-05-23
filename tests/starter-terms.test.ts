/**
 * Starter Terms Well-formedness Tests (S4-02)
 *
 * Verifies that STARTER_TERMS is a well-formed array of ecm:terms entries
 * per SPEC section 5.7.
 *
 * Acceptance criteria:
 *   AC1: STARTER_TERMS has at least 15 entries.
 *   AC2: Each entry has a non-empty string id.
 *   AC3: Each entry's type is owl:Class | owl:ObjectProperty | owl:DatatypeProperty.
 *   AC4: Each entry has ecm:source === "ecm:system-starter-example".
 *   AC5: Each entry has a non-empty string rdfs:label.
 *   AC6: Entries are sorted lexicographically by id (SPEC section 5.3 rule 4).
 *
 * Pattern: hand-rolled per tests/run-tests.ts; node:assert; process.exit(1) on failure.
 */

import { strictEqual, ok } from "node:assert";
import { STARTER_TERMS, type EcmTermType } from "../src/validate/starter-terms.js";

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

const VALID_TYPES: ReadonlySet<EcmTermType> = new Set([
  "owl:Class",
  "owl:ObjectProperty",
  "owl:DatatypeProperty",
]);

// ---------------------------------------------------------------------------
// AC1: at least 15 entries
// ---------------------------------------------------------------------------
console.log("\nAC1: STARTER_TERMS has at least 15 entries");
try {
  ok(
    STARTER_TERMS.length >= 15,
    `Expected >= 15 entries; got ${STARTER_TERMS.length}`,
  );
  pass(`STARTER_TERMS has ${STARTER_TERMS.length} entries (>= 15) (AC1)`);
} catch (e) {
  fail("AC1: STARTER_TERMS must have at least 15 entries", e);
}

// ---------------------------------------------------------------------------
// AC2 / AC3 / AC4 / AC5: each entry has valid id, type, source, label
// ---------------------------------------------------------------------------
console.log("\nAC2-AC5: each entry has valid id, type, ecm:source, rdfs:label");
try {
  for (let i = 0; i < STARTER_TERMS.length; i++) {
    const t = STARTER_TERMS[i];
    ok(
      typeof t.id === "string" && t.id.length > 0,
      `entry[${i}]: id must be a non-empty string; got ${JSON.stringify(t.id)}`,
    );
    ok(
      VALID_TYPES.has(t.type),
      `entry[${i}]: type must be owl:Class|owl:ObjectProperty|owl:DatatypeProperty; got "${t.type}"`,
    );
    strictEqual(
      t["ecm:source"],
      "ecm:system-starter-example",
      `entry[${i}]: ecm:source must be "ecm:system-starter-example"; got "${t["ecm:source"]}"`,
    );
    ok(
      typeof t["rdfs:label"] === "string" && t["rdfs:label"].length > 0,
      `entry[${i}]: rdfs:label must be a non-empty string; got ${JSON.stringify(t["rdfs:label"])}`,
    );
  }
  pass("all entries have valid id, type, ecm:source, rdfs:label (AC2-AC5)");
} catch (e) {
  fail("AC2-AC5: per-entry field validation failed", e);
}

// ---------------------------------------------------------------------------
// AC6: entries sorted lexicographically by id (SPEC section 5.3 rule 4)
// ---------------------------------------------------------------------------
console.log("\nAC6: entries sorted lexicographically by id");
try {
  for (let i = 1; i < STARTER_TERMS.length; i++) {
    const prev = STARTER_TERMS[i - 1].id;
    const curr = STARTER_TERMS[i].id;
    ok(
      prev <= curr,
      `entries must be sorted by id; entry[${i - 1}].id "${prev}" > entry[${i}].id "${curr}"`,
    );
  }
  pass("entries are sorted lexicographically by id (AC6)");
} catch (e) {
  fail("AC6: STARTER_TERMS must be sorted lexicographically by id", e);
}

// ---------------------------------------------------------------------------
// Summary
// ---------------------------------------------------------------------------
console.log(`\n  ${passed} passed, ${failed} failed`);
if (failed > 0) process.exit(1);
