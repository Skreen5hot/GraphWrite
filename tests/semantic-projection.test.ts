/**
 * Semantic Projection Tests (IMPLEMENTATION_PLAN.md section 1.4)
 *
 * SPEC refs: section 6.1-6.4, section 8.2-8.3, FR-C002, section 21.1.
 *
 * Acceptance criteria covered here:
 *   AC1: Output contains no ecm:CanvasLayout, ecm:CanvasNode, or ecm:CanvasEdge
 *        objects. Verified by @graph type-scan and raw string scan.
 *   AC2: Two relations with identical s/p/o yield one bare triple in output.
 *        Verified by counting matching triples in @graph.
 *   AC3: Property-based test (section 21.1): adding/removing a canvas layout
 *        entry produces no change in the semantic JSON-LD export. >= 50 samples.
 *        Hand-rolled with seeded deterministic PRNG (Mulberry32); no fast-check.
 *   AC4: Project root in output is typed iao:OntologyDesignPattern (and
 *        ecm:Project) with iao:isAbout intact. Verified by parsing @graph.
 *   AC5: ecm:specVersion, ecm:createdAt, ecm:updatedAt absent from output.
 *        Verified by string scan.
 *
 * Bonus tests:
 *   rdfs:label is stripped from relation bare triples (section 8.3).
 *   All five section 5.14 TBox nodes present in @graph (section 6.3 step 5).
 *
 * Pattern: hand-rolled per tests/run-tests.ts; no framework; node:assert;
 * process.exit(1) on failure. Follows tests/structural-validator.test.ts.
 */

import { strictEqual, ok, deepStrictEqual } from "node:assert";
import { projectSemantic } from "../src/projection/index.js";

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
// Used for AC3 property-based sampling. Pure arithmetic only.
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

/** Minimal but complete VMP v0.4 project with semantic content. */
const BASE_PROJECT: Record<string, unknown> = {
  id: "urn:uuid:00000000-0000-0000-0000-000000000001",
  type: ["ecm:Project", "iao:OntologyDesignPattern"],
  "ecm:specVersion": "0.4",
  "ecm:name": "Test Project",
  "ecm:createdAt": "2026-05-14T12:00:00Z",
  "ecm:updatedAt": "2026-05-14T12:00:00Z",
  "iao:isAbout": ["https://example.org/subjects/CustomerOrders"],
  "ecm:ontologies": [],
  "ecm:terms": [
    {
      id: "urn:term:Customer",
      type: ["owl:Class"],
      "rdfs:label": "Customer",
      "rdfs:comment": "A customer entity.",
    },
    {
      id: "urn:term:knows",
      type: ["owl:ObjectProperty"],
      "rdfs:label": "knows",
    },
  ],
  "ecm:instances": [
    {
      id: "urn:inst:alice",
      type: ["ecm:Instance"],
      "ecm:classIris": ["urn:term:Customer"],
      "rdfs:label": "Alice",
    },
    {
      id: "urn:inst:bob",
      type: ["ecm:Instance"],
      "ecm:classIris": ["urn:term:Customer"],
      "rdfs:label": "Bob",
    },
  ],
  "ecm:relations": [
    {
      id: "urn:rel:r1",
      type: ["ecm:RelationAssertion"],
      "ecm:subjectIri": "urn:inst:alice",
      "ecm:predicateIri": "urn:term:knows",
      "ecm:objectIri": "urn:inst:bob",
      "ecm:createdAt": "2026-05-14T12:00:00Z",
      "ecm:updatedAt": "2026-05-14T12:00:00Z",
      "rdfs:label": "Alice knows Bob",
    },
  ],
  "ecm:literalAssertions": [],
  "ecm:layouts": [],
  "ecm:snapshots": [],
  "ecm:serializations": [],
};

/** Project with editor-layer canvas objects that must be stripped. */
const PROJECT_WITH_CANVAS: Record<string, unknown> = {
  ...BASE_PROJECT,
  id: "urn:uuid:00000000-0000-0000-0000-000000000002",
  "ecm:layouts": [
    {
      id: "urn:layout:l1",
      type: ["ecm:CanvasLayout"],
      "ecm:nodes": [
        {
          id: "urn:cn:1",
          type: ["ecm:CanvasNode"],
          "ecm:x": 100,
          "ecm:y": 200,
        },
      ],
      "ecm:edges": [
        {
          id: "urn:ce:1",
          type: ["ecm:CanvasEdge"],
          "ecm:source": "urn:cn:1",
        },
      ],
    },
  ],
};

/** Project with two relations sharing the same s/p/o (duplicate triple). */
const PROJECT_DUPLICATE_RELATIONS: Record<string, unknown> = {
  ...BASE_PROJECT,
  id: "urn:uuid:00000000-0000-0000-0000-000000000003",
  "ecm:relations": [
    {
      id: "urn:rel:dup1",
      type: ["ecm:RelationAssertion"],
      "ecm:subjectIri": "urn:inst:alice",
      "ecm:predicateIri": "urn:term:knows",
      "ecm:objectIri": "urn:inst:bob",
      "ecm:createdAt": "2026-05-14T12:00:00Z",
      "ecm:updatedAt": "2026-05-14T12:00:00Z",
      "rdfs:label": "Alice knows Bob (1)",
    },
    {
      id: "urn:rel:dup2",
      type: ["ecm:RelationAssertion"],
      "ecm:subjectIri": "urn:inst:alice",
      "ecm:predicateIri": "urn:term:knows",
      "ecm:objectIri": "urn:inst:bob",
      "ecm:createdAt": "2026-05-15T09:00:00Z",
      "ecm:updatedAt": "2026-05-15T09:00:00Z",
      "rdfs:label": "Alice knows Bob (2)",
    },
  ],
};

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

type GraphNode = Record<string, unknown>;

function parseGraph(output: string): GraphNode[] {
  const doc = JSON.parse(output) as Record<string, unknown>;
  const g = doc["@graph"];
  if (!Array.isArray(g)) throw new Error("Output has no @graph array");
  return g as GraphNode[];
}

function nodeTypes(node: GraphNode): string[] {
  const t = node["type"];
  if (typeof t === "string") return [t];
  if (Array.isArray(t))
    return (t as unknown[]).filter((x) => typeof x === "string") as string[];
  return [];
}

// ---------------------------------------------------------------------------
// AC1: Output contains no ecm:CanvasLayout, ecm:CanvasNode, ecm:CanvasEdge
// ---------------------------------------------------------------------------
console.log("\nAC1: No canvas objects in output");

try {
  const output = projectSemantic(PROJECT_WITH_CANVAS);
  const graph = parseGraph(output);
  const canvasTypes = ["ecm:CanvasLayout", "ecm:CanvasNode", "ecm:CanvasEdge"];
  for (const node of graph) {
    const types = nodeTypes(node);
    for (const ct of canvasTypes) {
      if (types.includes(ct)) {
        throw new Error(
          `Canvas type ${ct} found in @graph (id: ${String(node["id"] ?? "<no id>")})`,
        );
      }
    }
  }
  // String scan on raw JSON as belt-and-suspenders
  for (const ct of canvasTypes) {
    if (output.includes(`"${ct}"`)) {
      throw new Error(`Canvas type string "${ct}" found in raw output (string scan)`);
    }
  }
  pass(
    "output @graph contains no ecm:CanvasLayout, ecm:CanvasNode, ecm:CanvasEdge" +
      " (AC1)",
  );
} catch (e) {
  fail("output must not contain canvas objects (AC1)", e);
}

// ---------------------------------------------------------------------------
// AC2: Two relations with identical s/p/o yield one bare triple in output
// ---------------------------------------------------------------------------
console.log("\nAC2: Duplicate s/p/o collapse");

try {
  const output = projectSemantic(PROJECT_DUPLICATE_RELATIONS);
  const graph = parseGraph(output);
  // Bare triples have ecm:subjectIri, ecm:predicateIri, ecm:objectIri but no id
  const aliceKnowsBob = graph.filter(
    (n) =>
      n["ecm:subjectIri"] === "urn:inst:alice" &&
      n["ecm:predicateIri"] === "urn:term:knows" &&
      n["ecm:objectIri"] === "urn:inst:bob",
  );
  strictEqual(
    aliceKnowsBob.length,
    1,
    `Expected exactly 1 alice-knows-bob triple; got ${aliceKnowsBob.length}`,
  );
  pass("two duplicate s/p/o relations collapse to one bare triple in output (AC2)");
} catch (e) {
  fail("duplicate s/p/o relations must collapse to one triple (AC2)", e);
}

// ---------------------------------------------------------------------------
// AC3: Canvas-layout-invariance property-based test (>= 50 samples)
// SPEC section 21.1: adding/removing canvas layout entries must not change
// the semantic JSON-LD export.
// Hand-rolled with Mulberry32 seeded PRNG (seed=0xDEADBEEF). No fast-check.
// ---------------------------------------------------------------------------
console.log("\nAC3: Canvas-layout-invariance property-based test (50 samples, seeded)");

try {
  const SEED = 0xdeadbeef;
  const rng = mulberry32(SEED);
  const SAMPLES = 50;

  // Baseline: same project id, no layouts
  const STABLE_ID = "urn:uuid:00000000-0000-0000-0000-000000000010";
  const baseline = projectSemantic({
    ...BASE_PROJECT,
    id: STABLE_ID,
    "ecm:layouts": [],
  });

  let samplesPassed = 0;
  for (let i = 0; i < SAMPLES; i++) {
    // Generate 0-5 canvas layouts with 0-3 canvas nodes each
    const numLayouts = Math.floor(rng() * 6);
    const layouts: Record<string, unknown>[] = [];
    for (let j = 0; j < numLayouts; j++) {
      const numNodes = Math.floor(rng() * 4);
      const nodes: Record<string, unknown>[] = [];
      for (let k = 0; k < numNodes; k++) {
        nodes.push({
          id: `urn:cn:s${i}-${j}-${k}`,
          type: ["ecm:CanvasNode"],
          "ecm:x": Math.floor(rng() * 1000),
          "ecm:y": Math.floor(rng() * 1000),
        });
      }
      layouts.push({
        id: `urn:layout:s${i}-${j}`,
        type: ["ecm:CanvasLayout"],
        "ecm:nodes": nodes,
        "ecm:edges": [],
      });
    }

    const sample = projectSemantic({
      ...BASE_PROJECT,
      id: STABLE_ID,
      "ecm:layouts": layouts,
    });

    if (sample !== baseline) {
      throw new Error(
        `Sample ${i} (${numLayouts} layout(s)): semantic output differs from` +
          " zero-layout baseline",
      );
    }
    samplesPassed++;
  }

  pass(
    `canvas-layout-invariance: ${samplesPassed}/${SAMPLES} samples pass` +
      " (AC3, section 21.1)",
  );
} catch (e) {
  fail("canvas-layout-invariance property-based test (AC3)", e);
}

// ---------------------------------------------------------------------------
// AC4: Project root is typed iao:OntologyDesignPattern with iao:isAbout intact
// ---------------------------------------------------------------------------
console.log("\nAC4: Project root typing and iao:isAbout retention");

try {
  const output = projectSemantic(BASE_PROJECT);
  const graph = parseGraph(output);

  // The project root node is typed BOTH ecm:Project AND iao:OntologyDesignPattern.
  // The TBox node for iao:OntologyDesignPattern has type ["owl:Class"] only --
  // so the ecm:Project presence in type distinguishes the actual project root.
  const projectRootCandidates = graph.filter((n) => {
    const types = nodeTypes(n);
    return (
      types.includes("iao:OntologyDesignPattern") && types.includes("ecm:Project")
    );
  });

  strictEqual(
    projectRootCandidates.length,
    1,
    `Expected exactly 1 project root node; got ${projectRootCandidates.length}`,
  );
  const root = projectRootCandidates[0];

  ok(
    "iao:isAbout" in root,
    "iao:isAbout must be present on the projected project root (AC4)",
  );
  const isAbout = root["iao:isAbout"];
  ok(
    Array.isArray(isAbout) && (isAbout as unknown[]).length > 0,
    "iao:isAbout must be a non-empty array (AC4)",
  );
  deepStrictEqual(
    isAbout,
    BASE_PROJECT["iao:isAbout"],
    "iao:isAbout values must be preserved verbatim in semantic projection (AC4)",
  );

  pass(
    "project root is typed iao:OntologyDesignPattern + ecm:Project with" +
      " iao:isAbout intact (AC4)",
  );
} catch (e) {
  fail("project root typing and iao:isAbout retention (AC4)", e);
}

// ---------------------------------------------------------------------------
// AC5: ecm:specVersion, ecm:createdAt, ecm:updatedAt absent from output
// ---------------------------------------------------------------------------
console.log("\nAC5: Editor-layer timestamp and version fields stripped");

try {
  const output = projectSemantic(BASE_PROJECT);
  const forbidden = ["ecm:specVersion", "ecm:createdAt", "ecm:updatedAt"];
  for (const key of forbidden) {
    if (output.includes(`"${key}"`)) {
      throw new Error(
        `Editor-layer key "${key}" found in semantic projection output (AC5)`,
      );
    }
  }
  pass(
    "ecm:specVersion, ecm:createdAt, ecm:updatedAt absent from output" +
      " (AC5, string scan)",
  );
} catch (e) {
  fail("editor-layer fields must be stripped from output (AC5)", e);
}

// ---------------------------------------------------------------------------
// Bonus: rdfs:label stripped from relation bare triples (section 8.3)
// rdfs:label is in the section 6.1 predicate allowlist for general entities,
// but section 8.3 explicitly discards it from relation assertions on rewrite.
// ---------------------------------------------------------------------------
console.log("\nBonus: rdfs:label stripped from relation bare triples (section 8.3)");

try {
  const output = projectSemantic(BASE_PROJECT);
  const graph = parseGraph(output);
  // Bare triples: have ecm:subjectIri but no id
  const bareTriples = graph.filter(
    (n) => "ecm:subjectIri" in n && !("id" in n),
  );
  for (const triple of bareTriples) {
    if ("rdfs:label" in triple) {
      throw new Error(
        `rdfs:label found on bare triple` +
          ` (s=${String(triple["ecm:subjectIri"])}) -- must be discarded (section 8.3)`,
      );
    }
  }
  pass(
    `rdfs:label discarded from bare relation triples` +
      ` (${bareTriples.length} triple(s) checked; section 8.3)`,
  );
} catch (e) {
  fail("rdfs:label must be discarded from relation bare triples (section 8.3)", e);
}

// ---------------------------------------------------------------------------
// Bonus: All five section 5.14 TBox nodes present in @graph
// Verifies section 6.3 step 5 (TBox prepend) is applied.
// ---------------------------------------------------------------------------
console.log("\nBonus: Section 5.14 TBox nodes present in @graph (section 6.3 step 5)");

try {
  const output = projectSemantic(BASE_PROJECT);
  const graph = parseGraph(output);
  const tboxIds = [
    "iao:OntologyDesignPattern",
    "ecm:Project",
    "ecm:Serialization",
    "ecm:isSerializationOf",
    "ecm:UnspecifiedSubjectMatter",
  ];
  for (const tboxId of tboxIds) {
    const found = graph.some((n) => n["id"] === tboxId);
    if (!found) {
      throw new Error(`TBox node "${tboxId}" not found in @graph`);
    }
  }
  pass(
    `all 5 section 5.14 TBox nodes present in @graph (section 6.3 step 5)`,
  );
} catch (e) {
  fail("TBox nodes must be present in output @graph (section 6.3 step 5)", e);
}

// ---------------------------------------------------------------------------
// Summary
// ---------------------------------------------------------------------------
console.log(`\n  ${passed} passed, ${failed} failed`);
if (failed > 0) process.exit(1);
