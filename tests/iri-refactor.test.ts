/**
 * IRI Refactor Tests (IMPLEMENTATION_PLAN.md section 1.7)
 *
 * SPEC refs: section 13.1-13.9, FR-C010, section 21.1.
 *
 * Acceptance criteria covered:
 *   AC1: Full-document traversal -- after successful refactor A->B, no
 *        occurrence of A remains in ecm:classIris, ecm:predicateIri,
 *        ecm:subjectIri, or ecm:objectIri. Verified by explicit field scan.
 *   AC2: Collision -- if newIri is an existing entity id, result carries a
 *        collision report; input project is unchanged (same reference).
 *   AC3: Reversibility property-based test >= 50 samples. Hand-rolled with
 *        seeded Mulberry32 PRNG (seed 0xcafebabe); no fast-check.
 *        Scope note: test fixture uses disjoint IRI prefix pools so oldIri
 *        never appears as an entity id (F9 gap from recon task; see
 *        open_questions in task urn:fnsr:task:124-dev-iri-refactor).
 *   AC4: Idempotency property-based test >= 50 samples. Seeded Mulberry32
 *        (seed 0xbeefdead). Verifies refactorIri(P, A, A) is a no-op.
 *   AC5: ecm:snapshots bytewise-identical after any refactor (SPEC section 13.7).
 *        Verified by JSON.stringify comparison on both success and collision paths.
 *
 * Pattern: hand-rolled per tests/run-tests.ts; no framework; node:assert;
 * process.exit(1) on failure. Follows tests/semantic-projection.test.ts.
 */

import { strictEqual, deepStrictEqual, ok } from "node:assert";
import { refactorIri } from "../src/refactor/index.js";
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
// Seeded deterministic PRNG (Mulberry32) -- no external deps
// Used for AC3/AC4 property-based sampling. Pure arithmetic only.
// ---------------------------------------------------------------------------

/** Mulberry32 seeded PRNG. Returns values in [0, 1). Deterministic per seed. */
function mulberry32(seed: number): () => number {
  let s = seed >>> 0;
  return function (): number {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = Math.imul(s ^ (s >>> 15), 1 | s);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

/**
 * Pool of reference-only IRIs used in ecm:classIris / ecm:predicateIri /
 * ecm:subjectIri / ecm:objectIri. None appear as entity id values.
 * The "urn:test:ref:" and "urn:test:eid:" prefixes are disjoint by design,
 * enabling reversibility tests to pass without entity-id-field updates
 * (IMPLEMENTATION_PLAN.md section 1.7 sub-task scope; F9 gap).
 */
const REF_IRI_POOL: readonly string[] = [
  "urn:test:ref:alpha",
  "urn:test:ref:beta",
  "urn:test:ref:gamma",
  "urn:test:ref:delta",
  "urn:test:ref:epsilon",
];

/**
 * Snapshot fixture embedded in BASE_PROJECT to verify AC5.
 * Must be bytewise-identical in result.project["ecm:snapshots"] after any
 * refactor call (success, collision, or no-op).
 */
const SNAPSHOT_FIXTURE: unknown[] = [
  {
    id: "urn:test:eid:snap-s1",
    type: "ecm:Snapshot",
    "ecm:name": "Before Refactor",
    "ecm:createdAt": "2026-01-01T00:00:00Z",
    "ecm:specVersion": "0.4",
    "ecm:projectState": {
      id: "urn:test:eid:snap-state-s1",
      "ecm:specVersion": "0.4",
    },
  },
];

/**
 * Base VMP project for all refactor tests.
 *
 * Entity ids use "urn:test:eid:" prefix.
 * Reference-field IRIs use "urn:test:ref:" prefix (REF_IRI_POOL).
 * The two namespaces are intentionally disjoint for property-based tests.
 *
 * Expected reference counts per pool IRI (used in AC1 exact-count assertions):
 *   urn:test:ref:alpha   -> inst-1.classIris[0], rel-1.subjectIri, lit-1.subjectIri   = 3
 *   urn:test:ref:beta    -> inst-1.classIris[1], rel-1.objectIri                       = 2
 *   urn:test:ref:gamma   -> inst-2.classIris[0], rel-2.subjectIri, rel-2.objectIri     = 3
 *   urn:test:ref:delta   -> rel-1.predicateIri, rel-2.predicateIri                     = 2
 *   urn:test:ref:epsilon -> lit-1.predicateIri                                          = 1
 */
const BASE_PROJECT: Record<string, unknown> = {
  id: "urn:test:project:p1",
  type: ["ecm:Project", "iao:OntologyDesignPattern"],
  "ecm:specVersion": "0.4",
  "ecm:name": "Refactor Test Project",
  "ecm:createdAt": "2026-01-01T00:00:00Z",
  "ecm:updatedAt": "2026-01-01T00:00:00Z",
  "iao:isAbout": ["ecm:UnspecifiedSubjectMatter"],
  "ecm:ontologies": [],
  "ecm:terms": [
    {
      id: "urn:test:eid:term-1",
      type: ["owl:Class"],
      "rdfs:label": "TermOne",
    },
  ],
  "ecm:instances": [
    {
      id: "urn:test:eid:inst-1",
      type: ["ecm:Instance"],
      "ecm:classIris": ["urn:test:ref:alpha", "urn:test:ref:beta"],
      "rdfs:label": "Instance One",
    },
    {
      id: "urn:test:eid:inst-2",
      type: ["ecm:Instance"],
      "ecm:classIris": ["urn:test:ref:gamma"],
      "rdfs:label": "Instance Two",
    },
  ],
  "ecm:relations": [
    {
      id: "urn:test:eid:rel-1",
      type: ["ecm:RelationAssertion"],
      "ecm:subjectIri": "urn:test:ref:alpha",
      "ecm:predicateIri": "urn:test:ref:delta",
      "ecm:objectIri": "urn:test:ref:beta",
      "ecm:createdAt": "2026-01-01T00:00:00Z",
      "ecm:updatedAt": "2026-01-01T00:00:00Z",
    },
    {
      id: "urn:test:eid:rel-2",
      type: ["ecm:RelationAssertion"],
      "ecm:subjectIri": "urn:test:ref:gamma",
      "ecm:predicateIri": "urn:test:ref:delta",
      "ecm:objectIri": "urn:test:ref:gamma",
      "ecm:createdAt": "2026-01-01T00:00:00Z",
      "ecm:updatedAt": "2026-01-01T00:00:00Z",
    },
  ],
  "ecm:literalAssertions": [
    {
      id: "urn:test:eid:lit-1",
      type: ["ecm:LiteralAssertion"],
      "ecm:subjectIri": "urn:test:ref:alpha",
      "ecm:predicateIri": "urn:test:ref:epsilon",
      "ecm:value": "test value",
      "ecm:datatype": "xsd:string",
      "ecm:language": null,
    },
  ],
  "ecm:layouts": [],
  "ecm:snapshots": SNAPSHOT_FIXTURE,
  "ecm:serializations": [],
};

// ---------------------------------------------------------------------------
// AC1: Full-document traversal -- no oldIri in four reference fields post-refactor
// ---------------------------------------------------------------------------
console.log("\nAC1: Traversal -- no oldIri in any reference field after successful refactor");

try {
  const OLD_IRI = "urn:test:ref:alpha";
  const NEW_IRI = "urn:test:new:alpha";

  const result = refactorIri(BASE_PROJECT, OLD_IRI, NEW_IRI);
  ok(result.collision === undefined, "No collision expected for fresh newIri (AC1)");

  // Scan ecm:instances[*].ecm:classIris
  const instances = result.project["ecm:instances"] as Record<string, unknown>[];
  for (let i = 0; i < instances.length; i++) {
    const classIris = instances[i]["ecm:classIris"];
    if (Array.isArray(classIris)) {
      for (const iri of classIris as unknown[]) {
        if (iri === OLD_IRI) {
          throw new Error(
            `oldIri found in ecm:instances[${i}].ecm:classIris after refactor (AC1)`,
          );
        }
      }
    }
  }

  // Scan ecm:relations[*].ecm:subjectIri, ecm:predicateIri, ecm:objectIri
  const relations = result.project["ecm:relations"] as Record<string, unknown>[];
  for (let i = 0; i < relations.length; i++) {
    const rel = relations[i];
    if (rel["ecm:subjectIri"] === OLD_IRI) {
      throw new Error(`oldIri found in ecm:relations[${i}].ecm:subjectIri (AC1)`);
    }
    if (rel["ecm:predicateIri"] === OLD_IRI) {
      throw new Error(`oldIri found in ecm:relations[${i}].ecm:predicateIri (AC1)`);
    }
    if (rel["ecm:objectIri"] === OLD_IRI) {
      throw new Error(`oldIri found in ecm:relations[${i}].ecm:objectIri (AC1)`);
    }
  }

  // Scan ecm:literalAssertions[*].ecm:subjectIri, ecm:predicateIri
  const literals = result.project["ecm:literalAssertions"] as Record<string, unknown>[];
  for (let i = 0; i < literals.length; i++) {
    const la = literals[i];
    if (la["ecm:subjectIri"] === OLD_IRI) {
      throw new Error(`oldIri found in ecm:literalAssertions[${i}].ecm:subjectIri (AC1)`);
    }
    if (la["ecm:predicateIri"] === OLD_IRI) {
      throw new Error(`oldIri found in ecm:literalAssertions[${i}].ecm:predicateIri (AC1)`);
    }
  }

  // Verify exact referenceCount for the known fixture
  // alpha: inst-1.classIris[0]=1, rel-1.subjectIri=1, lit-1.subjectIri=1 -> 3
  strictEqual(
    result.referenceCount,
    3,
    `Expected referenceCount=3 for "${OLD_IRI}"; got ${result.referenceCount} (AC1)`,
  );
  deepStrictEqual(
    result.affectedEntityTypes,
    ["ecm:Instance", "ecm:LiteralAssertion", "ecm:RelationAssertion"],
    "affectedEntityTypes must list all three affected entity types, sorted (AC1)",
  );

  pass(
    `no oldIri in any of ecm:classIris, ecm:predicateIri, ecm:subjectIri, ` +
      `ecm:objectIri after refactor (AC1); ` +
      `referenceCount=${result.referenceCount}; ` +
      `affectedEntityTypes=${JSON.stringify(result.affectedEntityTypes)}`,
  );
} catch (e) {
  fail(
    "traversal: oldIri must be absent from all four reference field types after refactor (AC1)",
    e,
  );
}

// Additional AC1 case: refactor urn:test:ref:delta (predicateIri only; count=2)
try {
  const result = refactorIri(BASE_PROJECT, "urn:test:ref:delta", "urn:test:new:delta");
  ok(result.collision === undefined, "No collision expected (AC1 delta sub-case)");
  // delta: rel-1.predicateIri=1, rel-2.predicateIri=1 -> 2
  strictEqual(result.referenceCount, 2, "Expected referenceCount=2 for delta (AC1 delta)");
  deepStrictEqual(
    result.affectedEntityTypes,
    ["ecm:RelationAssertion"],
    "Only ecm:RelationAssertion affected by delta predicate refactor (AC1 delta)",
  );
  // Scan: no delta remains
  const relations = result.project["ecm:relations"] as Record<string, unknown>[];
  for (let i = 0; i < relations.length; i++) {
    if (relations[i]["ecm:predicateIri"] === "urn:test:ref:delta") {
      throw new Error(`oldIri still present in ecm:relations[${i}].ecm:predicateIri (AC1 delta)`);
    }
  }
  pass(
    "predicateIri-only refactor: referenceCount=2; only ecm:RelationAssertion affected (AC1 delta)",
  );
} catch (e) {
  fail("predicateIri-only refactor correctness (AC1 delta sub-case)", e);
}

// ---------------------------------------------------------------------------
// AC2: Collision -- project unchanged bytewise; collision report present
// ---------------------------------------------------------------------------
console.log("\nAC2: Collision -- project unchanged; collision report present");

try {
  // "urn:test:eid:term-1" is the id of ecm:terms[0] in BASE_PROJECT
  const COLLIDING_IRI = "urn:test:eid:term-1";
  const result = refactorIri(BASE_PROJECT, "urn:test:ref:alpha", COLLIDING_IRI);

  ok(
    result.collision !== undefined,
    "collision must be present when newIri is an ecm:terms entity id (AC2)",
  );
  strictEqual(
    result.collision!.collidingIri,
    COLLIDING_IRI,
    "collision.collidingIri must equal newIri (AC2)",
  );
  strictEqual(
    result.collision!.collidingEntityId,
    COLLIDING_IRI,
    "collision.collidingEntityId must equal the colliding entity id (AC2)",
  );
  // Bytewise identity: same object reference
  ok(
    result.project === BASE_PROJECT,
    "result.project must be the same reference as input on collision (bytewise identity, AC2)",
  );
  strictEqual(result.referenceCount, 0, "referenceCount must be 0 on collision (AC2)");
  strictEqual(
    result.affectedEntityTypes.length,
    0,
    "affectedEntityTypes must be empty on collision (AC2)",
  );

  pass(
    `collision against ecm:terms id detected; project reference unchanged; ` +
      `referenceCount=0; affectedEntityTypes=[] (AC2)`,
  );
} catch (e) {
  fail("collision: project must be unchanged and collision report must be present (AC2)", e);
}

// AC2 robustness: collision against ecm:instances entity id
try {
  const INST_ID = "urn:test:eid:inst-1";
  const result = refactorIri(BASE_PROJECT, "urn:test:ref:gamma", INST_ID);
  ok(
    result.collision !== undefined,
    "collision must be detected for ecm:instances entity id (AC2 robustness)",
  );
  strictEqual(result.collision!.collidingIri, INST_ID);
  ok(
    result.project === BASE_PROJECT,
    "project unchanged on ecm:instances collision (AC2 robustness)",
  );
  pass("collision detected against ecm:instances entity id (AC2 robustness)");
} catch (e) {
  fail("collision must be detected for ecm:instances entity ids (AC2 robustness)", e);
}

// ---------------------------------------------------------------------------
// AC3: Reversibility property-based test (>= 50 samples, seeded Mulberry32)
// SPEC section 21.1: refactorIri(refactorIri(P, A, B).project, B, A).project
// is canonically equivalent to P.
// Design: oldIri drawn from REF_IRI_POOL (disjoint from entity ids), ensuring
// the reverse refactor is not blocked by collision detection (F9 scope note).
// ---------------------------------------------------------------------------
console.log(
  "\nAC3: Reversibility property-based test (50 samples, Mulberry32 seed 0xcafebabe)",
);

try {
  const SEED_REV = 0xcafebabe;
  const rng = mulberry32(SEED_REV);
  const SAMPLES = 50;

  const baseSerial = serializeVmp(BASE_PROJECT);
  let samplesPassed = 0;

  for (let i = 0; i < SAMPLES; i++) {
    const idx = Math.floor(rng() * REF_IRI_POOL.length);
    const oldIri = REF_IRI_POOL[idx];
    const newIri = `urn:test:fresh:${i}`;

    const r1 = refactorIri(BASE_PROJECT, oldIri, newIri);
    if (r1.collision !== undefined) {
      throw new Error(
        `Sample ${i}: unexpected collision on forward refactor (${oldIri} -> ${newIri}); ` +
          `collidingIri=${r1.collision.collidingIri}`,
      );
    }

    const r2 = refactorIri(r1.project, newIri, oldIri);
    if (r2.collision !== undefined) {
      throw new Error(
        `Sample ${i}: unexpected collision on reverse refactor (${newIri} -> ${oldIri}); ` +
          `collidingIri=${r2.collision.collidingIri}`,
      );
    }

    const roundTripSerial = serializeVmp(r2.project);
    if (roundTripSerial !== baseSerial) {
      throw new Error(
        `Sample ${i}: reversibility failed for ${oldIri} -> ${newIri} -> ${oldIri}; ` +
          `canonical serialization of round-trip does not match original`,
      );
    }
    samplesPassed++;
  }

  pass(
    `reversibility: ${samplesPassed}/${SAMPLES} samples pass ` +
      `(AC3, SPEC section 21.1; Mulberry32 seed 0xcafebabe)`,
  );
} catch (e) {
  fail("reversibility property-based test (AC3, SPEC section 21.1)", e);
}

// ---------------------------------------------------------------------------
// AC4: Idempotency property-based test (>= 50 samples, seeded Mulberry32)
// SPEC section 21.1: refactorIri(P, A, A) is a no-op.
// Tests reference-field IRIs, entity ids, and IRIs absent from the project.
// ---------------------------------------------------------------------------
console.log(
  "\nAC4: Idempotency property-based test (50 samples, Mulberry32 seed 0xbeefdead)",
);

try {
  const SEED_IDEM = 0xbeefdead;
  const rng2 = mulberry32(SEED_IDEM);
  const SAMPLES = 50;

  // Pool covers reference-field IRIs, entity ids, and IRIs absent from the project.
  const IDEM_POOL: readonly string[] = [
    ...REF_IRI_POOL,
    "urn:test:eid:term-1",
    "urn:test:eid:inst-1",
    "urn:test:eid:rel-1",
    "urn:test:nonexistent:X",
    "urn:test:nonexistent:Y",
  ];

  let samplesPassed = 0;
  for (let i = 0; i < SAMPLES; i++) {
    const idx = Math.floor(rng2() * IDEM_POOL.length);
    const iri = IDEM_POOL[idx];
    const result = refactorIri(BASE_PROJECT, iri, iri);

    // Same reference: the implementation returns early without any mutation
    ok(
      result.project === BASE_PROJECT,
      `Sample ${i}: result.project must be the same reference as input for A->A (AC4)`,
    );
    strictEqual(
      result.referenceCount,
      0,
      `Sample ${i}: referenceCount must be 0 for A->A no-op (AC4)`,
    );
    strictEqual(
      result.affectedEntityTypes.length,
      0,
      `Sample ${i}: affectedEntityTypes must be empty for A->A no-op (AC4)`,
    );
    ok(
      result.collision === undefined,
      `Sample ${i}: collision must be undefined for A->A no-op (AC4)`,
    );
    samplesPassed++;
  }

  pass(
    `idempotency: ${samplesPassed}/${SAMPLES} samples pass ` +
      `(AC4, SPEC section 21.1; Mulberry32 seed 0xbeefdead)`,
  );
} catch (e) {
  fail("idempotency property-based test (AC4, SPEC section 21.1)", e);
}

// ---------------------------------------------------------------------------
// AC5: ecm:snapshots bytewise-identical after any refactor (SPEC section 13.7)
// ---------------------------------------------------------------------------
console.log("\nAC5: ecm:snapshots bytewise-identical after refactor (SPEC section 13.7)");

try {
  const snapshotsBefore = JSON.stringify(BASE_PROJECT["ecm:snapshots"]);

  // Success path: reference-field refactor must not touch snapshots
  const resultOk = refactorIri(BASE_PROJECT, "urn:test:ref:alpha", "urn:test:snap-safe:Z");
  ok(resultOk.collision === undefined, "No collision expected in AC5 success sub-case");
  strictEqual(
    JSON.stringify(resultOk.project["ecm:snapshots"]),
    snapshotsBefore,
    "ecm:snapshots must be bytewise-identical to input after successful refactor (AC5)",
  );

  // Collision path: project unmodified; snapshots trivially identical
  const resultColl = refactorIri(BASE_PROJECT, "urn:test:ref:beta", "urn:test:eid:term-1");
  ok(resultColl.collision !== undefined, "Collision expected in AC5 collision sub-case");
  strictEqual(
    JSON.stringify(resultColl.project["ecm:snapshots"]),
    snapshotsBefore,
    "ecm:snapshots must be bytewise-identical to input on collision (AC5)",
  );

  // No-op path: A->A; snapshots trivially identical
  const resultNoop = refactorIri(BASE_PROJECT, "urn:test:ref:gamma", "urn:test:ref:gamma");
  strictEqual(
    JSON.stringify(resultNoop.project["ecm:snapshots"]),
    snapshotsBefore,
    "ecm:snapshots must be bytewise-identical to input on no-op (AC5)",
  );

  pass(
    "ecm:snapshots bytewise-identical in success, collision, and no-op paths " +
      "(AC5, SPEC section 13.7)",
  );
} catch (e) {
  fail(
    "ecm:snapshots must be bytewise-identical to input after any refactor operation (AC5)",
    e,
  );
}

// ---------------------------------------------------------------------------
// Summary
// ---------------------------------------------------------------------------
console.log(`\n  ${passed} passed, ${failed} failed`);
if (failed > 0) process.exit(1);
