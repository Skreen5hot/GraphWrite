/**
 * Remap References Tests (IMPLEMENTATION_PLAN.md section 3.2)
 *
 * SPEC refs: section 13.3, section 13.6, FR-U010.
 *
 * Acceptance criteria covered:
 *   AC3: Remap A->B: zero occurrences of imported IRI A in ecm:classIris and
 *        ecm:predicateIri after remap. Verified by explicit field scan plus
 *        referenceCount and affectedEntityTypes checks.
 *   AC4: Imported ontology record (with IRI A) remains in ecm:ontologies after
 *        remap (preserved verbatim). Verified by JSON.stringify comparison and
 *        object-reference identity.
 *
 * Additional coverage:
 *   ecm:terms is unchanged (imported term preserved as immutable metadata;
 *     SPEC section 13.3).
 *   ecm:snapshots is unchanged (SPEC section 13.7).
 *   ecm:subjectIri and ecm:objectIri are NOT rewritten (instance IRIs, not term IRIs;
 *     outside the remap scope defined in IMPLEMENTATION_PLAN section 3.2).
 *   No-op path: remapReferences(project, A, A) returns same project reference with
 *     referenceCount=0 and affectedEntityTypes=[].
 *   Zero-references path: ecm:ontologies preserved even when referenceCount=0.
 *
 * Pattern: hand-rolled per tests/run-tests.ts; no framework; node:assert;
 * process.exit(1) on failure. Follows tests/delete-instance.test.ts.
 */

import { strictEqual, deepStrictEqual, ok } from "node:assert";
import { remapReferences } from "../src/kernel/remap-references.js";

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
// Constants
// ---------------------------------------------------------------------------

/** IRI of the imported term being superseded (A). */
const IMPORTED_IRI = "https://example.org/ontology/ImportedClass";
/** IRI of the project-created replacement term (B). */
const PROJECT_IRI = "https://example.org/local/LocalClass";
/** IRI of an unrelated term that must remain unchanged throughout. */
const UNRELATED_IRI = "https://example.org/local/UnrelatedProp";
/** Instance IRIs used in subjectIri/objectIri (must NOT be rewritten by remap). */
const INST_A = "urn:test:eid:inst-a";
const INST_B = "urn:test:eid:inst-b";
const INST_C = "urn:test:eid:inst-c";

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

/**
 * ImportedOntologyRecord kept as a named constant so the object-reference
 * identity check in AC4 can use it directly.
 */
const ONTOLOGY_RECORD: Record<string, unknown> = {
  id: "urn:test:eid:ontology-1",
  type: "ecm:ImportedOntology",
  "ecm:name": "Example Ontology",
  "ecm:sourceFileName": "example.ttl",
  "ecm:format": "text/turtle",
  "ecm:contentHash": "sha256-abc123",
  "ecm:createdAt": "2026-01-01T00:00:00Z",
  "ecm:importStatus": "ecm:parsed",
};

/**
 * Base VMP project for all remap tests.
 *
 * ecm:ontologies    -- [ONTOLOGY_RECORD]  (AC4 subject; must be unchanged after remap)
 * ecm:terms         -- imported term (IMPORTED_IRI) + replacement (PROJECT_IRI) + unrelated
 * ecm:instances:
 *   inst-a  ecm:classIris=[IMPORTED_IRI]              -> 1 rewrite expected
 *   inst-b  ecm:classIris=[IMPORTED_IRI, UNRELATED_IRI] -> 1 rewrite; UNRELATED_IRI preserved
 *   inst-c  ecm:classIris=[UNRELATED_IRI]              -> no rewrite
 * ecm:relations:
 *   rel-1  subjectIri=inst-a, predicateIri=IMPORTED_IRI, objectIri=inst-b -> 1 rewrite
 *   rel-2  subjectIri=inst-b, predicateIri=UNRELATED_IRI, objectIri=inst-c -> no rewrite
 * ecm:literalAssertions:
 *   lit-1  subjectIri=inst-a, predicateIri=IMPORTED_IRI -> 1 rewrite
 *   lit-2  subjectIri=inst-b, predicateIri=UNRELATED_IRI -> no rewrite
 * ecm:snapshots     -- one entry (must be unchanged; SPEC section 13.7)
 *
 * Expected after remapReferences(BASE_PROJECT, IMPORTED_IRI, PROJECT_IRI):
 *   referenceCount = 4 (inst-a.classIris + inst-b.classIris + rel-1.predicateIri + lit-1.predicateIri)
 *   affectedEntityTypes = ["ecm:Instance", "ecm:LiteralAssertion", "ecm:RelationAssertion"]
 */
const BASE_PROJECT: Record<string, unknown> = {
  id: "urn:test:project:remap-1",
  type: ["ecm:Project", "ecm:OntologyDesignPattern"],
  "ecm:specVersion": "0.4",
  "ecm:name": "Remap References Test Project",
  "ecm:createdAt": "2026-01-01T00:00:00Z",
  "ecm:updatedAt": "2026-01-01T00:00:00Z",
  "iao:isAbout": ["ecm:UnspecifiedSubjectMatter"],
  "ecm:ontologies": [ONTOLOGY_RECORD],
  "ecm:terms": [
    {
      id: IMPORTED_IRI,
      type: "owl:Class",
      "rdfs:label": { text: "Imported Class", lang: "en" },
      "ecm:source": "ecm:imported-ontology",
      "ecm:ontologyId": "urn:test:eid:ontology-1",
      "ecm:createdAt": "2026-01-01T00:00:00Z",
      "ecm:updatedAt": "2026-01-01T00:00:00Z",
    },
    {
      id: PROJECT_IRI,
      type: "owl:Class",
      "rdfs:label": { text: "Local Class", lang: "en" },
      "ecm:source": "ecm:project-created",
      "ecm:ontologyId": null,
      "ecm:createdAt": "2026-01-01T00:00:00Z",
      "ecm:updatedAt": "2026-01-01T00:00:00Z",
    },
    {
      id: UNRELATED_IRI,
      type: "owl:ObjectProperty",
      "rdfs:label": { text: "Unrelated Prop", lang: "en" },
      "ecm:source": "ecm:project-created",
      "ecm:ontologyId": null,
      "ecm:createdAt": "2026-01-01T00:00:00Z",
      "ecm:updatedAt": "2026-01-01T00:00:00Z",
    },
  ],
  "ecm:instances": [
    {
      id: INST_A,
      type: "ecm:Instance",
      "ecm:classIris": [IMPORTED_IRI],
      "rdfs:label": "Instance A",
    },
    {
      id: INST_B,
      type: "ecm:Instance",
      "ecm:classIris": [IMPORTED_IRI, UNRELATED_IRI],
      "rdfs:label": "Instance B",
    },
    {
      id: INST_C,
      type: "ecm:Instance",
      "ecm:classIris": [UNRELATED_IRI],
      "rdfs:label": "Instance C",
    },
  ],
  "ecm:relations": [
    {
      id: "urn:test:eid:rel-1",
      type: "ecm:RelationAssertion",
      "ecm:subjectIri": INST_A,
      "ecm:predicateIri": IMPORTED_IRI,
      "ecm:objectIri": INST_B,
      "ecm:createdAt": "2026-01-01T00:00:00Z",
      "ecm:updatedAt": "2026-01-01T00:00:00Z",
    },
    {
      id: "urn:test:eid:rel-2",
      type: "ecm:RelationAssertion",
      "ecm:subjectIri": INST_B,
      "ecm:predicateIri": UNRELATED_IRI,
      "ecm:objectIri": INST_C,
      "ecm:createdAt": "2026-01-01T00:00:00Z",
      "ecm:updatedAt": "2026-01-01T00:00:00Z",
    },
  ],
  "ecm:literalAssertions": [
    {
      id: "urn:test:eid:lit-1",
      type: "ecm:LiteralAssertion",
      "ecm:subjectIri": INST_A,
      "ecm:predicateIri": IMPORTED_IRI,
      "ecm:value": "test value",
      "ecm:datatype": "xsd:string",
      "ecm:language": null,
    },
    {
      id: "urn:test:eid:lit-2",
      type: "ecm:LiteralAssertion",
      "ecm:subjectIri": INST_B,
      "ecm:predicateIri": UNRELATED_IRI,
      "ecm:value": "other value",
      "ecm:datatype": "xsd:string",
      "ecm:language": null,
    },
  ],
  "ecm:layouts": [],
  "ecm:snapshots": [
    {
      id: "urn:test:eid:snap-1",
      type: "ecm:Snapshot",
      "ecm:name": "Before Remap",
      "ecm:createdAt": "2026-01-01T00:00:00Z",
    },
  ],
  "ecm:serializations": [],
};

// ---------------------------------------------------------------------------
// AC3: Zero occurrences of IMPORTED_IRI in ecm:classIris/ecm:predicateIri after remap
// ---------------------------------------------------------------------------
console.log("\nAC3: Remap A->B: zero occurrences of imported IRI in ecm:classIris/ecm:predicateIri after remap");

try {
  const result = remapReferences(BASE_PROJECT, IMPORTED_IRI, PROJECT_IRI);

  // Scan ecm:instances[*].ecm:classIris -- no IMPORTED_IRI may remain
  const instances = result.project["ecm:instances"] as Record<string, unknown>[];
  for (let i = 0; i < instances.length; i++) {
    const classIris = instances[i]["ecm:classIris"];
    if (Array.isArray(classIris)) {
      for (const iri of classIris as unknown[]) {
        if (iri === IMPORTED_IRI) {
          throw new Error(
            `IMPORTED_IRI found in ecm:instances[${i}].ecm:classIris after remap (AC3)`,
          );
        }
      }
    }
  }

  // Scan ecm:relations[*].ecm:predicateIri -- no IMPORTED_IRI may remain
  const relations = result.project["ecm:relations"] as Record<string, unknown>[];
  for (let i = 0; i < relations.length; i++) {
    if (relations[i]["ecm:predicateIri"] === IMPORTED_IRI) {
      throw new Error(
        `IMPORTED_IRI found in ecm:relations[${i}].ecm:predicateIri after remap (AC3)`,
      );
    }
  }

  // Scan ecm:literalAssertions[*].ecm:predicateIri -- no IMPORTED_IRI may remain
  const literals = result.project["ecm:literalAssertions"] as Record<string, unknown>[];
  for (let i = 0; i < literals.length; i++) {
    if (literals[i]["ecm:predicateIri"] === IMPORTED_IRI) {
      throw new Error(
        `IMPORTED_IRI found in ecm:literalAssertions[${i}].ecm:predicateIri after remap (AC3)`,
      );
    }
  }

  // Verify referenceCount: inst-a(1) + inst-b(1) + rel-1(1) + lit-1(1) = 4
  strictEqual(
    result.referenceCount,
    4,
    `Expected referenceCount=4; got ${result.referenceCount} (AC3)`,
  );

  // Verify affectedEntityTypes
  deepStrictEqual(
    result.affectedEntityTypes,
    ["ecm:Instance", "ecm:LiteralAssertion", "ecm:RelationAssertion"],
    "affectedEntityTypes must list all three affected entity types, sorted (AC3)",
  );

  pass(
    `zero occurrences of IMPORTED_IRI in ecm:classIris/ecm:predicateIri after remap (AC3); ` +
      `referenceCount=${result.referenceCount}; ` +
      `affectedEntityTypes=${JSON.stringify(result.affectedEntityTypes)}`,
  );
} catch (e) {
  fail("AC3: IMPORTED_IRI must be absent from ecm:classIris and ecm:predicateIri after remap", e);
}

// AC3 sub-case: verify correct replacement values and preservation of unrelated entries
try {
  const result = remapReferences(BASE_PROJECT, IMPORTED_IRI, PROJECT_IRI);
  const instances = result.project["ecm:instances"] as Record<string, unknown>[];

  const instA = instances.find((i) => i["id"] === INST_A);
  ok(instA !== undefined, "inst-a must be present in result (AC3 replacement check)");
  deepStrictEqual(
    instA!["ecm:classIris"],
    [PROJECT_IRI],
    "inst-a.ecm:classIris should be [PROJECT_IRI] after remap (AC3)",
  );

  // inst-b: IMPORTED_IRI replaced; UNRELATED_IRI preserved at original position
  const instB = instances.find((i) => i["id"] === INST_B);
  ok(instB !== undefined, "inst-b must be present in result (AC3 replacement check)");
  deepStrictEqual(
    instB!["ecm:classIris"],
    [PROJECT_IRI, UNRELATED_IRI],
    "inst-b.ecm:classIris should be [PROJECT_IRI, UNRELATED_IRI] after remap (AC3)",
  );

  // inst-c: unchanged
  const instC = instances.find((i) => i["id"] === INST_C);
  ok(instC !== undefined, "inst-c must be present in result (AC3 no-change check)");
  deepStrictEqual(
    instC!["ecm:classIris"],
    [UNRELATED_IRI],
    "inst-c.ecm:classIris should remain [UNRELATED_IRI] (no IMPORTED_IRI in that entry; AC3)",
  );

  // rel-1 predicateIri -> PROJECT_IRI
  const relations = result.project["ecm:relations"] as Record<string, unknown>[];
  const rel1 = relations.find((r) => r["id"] === "urn:test:eid:rel-1");
  ok(rel1 !== undefined, "rel-1 must be present in result");
  strictEqual(
    rel1!["ecm:predicateIri"],
    PROJECT_IRI,
    "rel-1.ecm:predicateIri should be PROJECT_IRI after remap (AC3)",
  );

  // rel-2 predicateIri -> UNRELATED_IRI (unchanged)
  const rel2 = relations.find((r) => r["id"] === "urn:test:eid:rel-2");
  ok(rel2 !== undefined, "rel-2 must be present in result");
  strictEqual(
    rel2!["ecm:predicateIri"],
    UNRELATED_IRI,
    "rel-2.ecm:predicateIri should remain UNRELATED_IRI (not in remap scope; AC3)",
  );

  pass(
    "PROJECT_IRI correctly replaces IMPORTED_IRI in classIris and predicateIri; " +
      "unrelated entries preserved (AC3 replacement check)",
  );
} catch (e) {
  fail("AC3: replacement and non-replacement values must be correct after remap", e);
}

// ---------------------------------------------------------------------------
// AC4: Imported ontology record remains in ecm:ontologies after remap
// ---------------------------------------------------------------------------
console.log("\nAC4: Imported ontology record remains in ecm:ontologies after remap (verbatim)");

try {
  const ontologiesBefore = JSON.stringify(BASE_PROJECT["ecm:ontologies"]);
  const result = remapReferences(BASE_PROJECT, IMPORTED_IRI, PROJECT_IRI);
  const ontologiesAfter = JSON.stringify(result.project["ecm:ontologies"]);

  strictEqual(
    ontologiesAfter,
    ontologiesBefore,
    "ecm:ontologies must be bytewise-identical after remap (AC4; SPEC section 13.6)",
  );

  // Object-reference identity: spread does not copy ecm:ontologies into a new array
  const resultOntologies = result.project["ecm:ontologies"];
  ok(
    Array.isArray(resultOntologies) &&
      (resultOntologies as unknown[])[0] === ONTOLOGY_RECORD,
    "ecm:ontologies[0] must be the same object reference as the input record (AC4)",
  );

  pass(
    "ecm:ontologies preserved verbatim after remap; " +
      "ImportedOntologyRecord object reference identical (AC4; SPEC section 13.6)",
  );
} catch (e) {
  fail("AC4: ecm:ontologies must be preserved verbatim after remap", e);
}

// AC4 sub-case: ecm:ontologies unchanged even when referenceCount=0
try {
  const ZERO_REF_PROJECT: Record<string, unknown> = {
    ...BASE_PROJECT,
    "ecm:instances": [
      { id: INST_A, type: "ecm:Instance", "ecm:classIris": [UNRELATED_IRI], "rdfs:label": "Instance A" },
    ],
    "ecm:relations": [],
    "ecm:literalAssertions": [],
  };
  const ontologiesBefore = JSON.stringify(ZERO_REF_PROJECT["ecm:ontologies"]);
  const result = remapReferences(ZERO_REF_PROJECT, IMPORTED_IRI, PROJECT_IRI);

  strictEqual(
    result.referenceCount,
    0,
    "referenceCount must be 0 when no classIris/predicateIri references exist (AC4 zero-ref sub-case)",
  );
  strictEqual(
    JSON.stringify(result.project["ecm:ontologies"]),
    ontologiesBefore,
    "ecm:ontologies must be preserved even when referenceCount=0 (AC4 zero-ref sub-case)",
  );

  pass("ecm:ontologies preserved when referenceCount=0 (AC4 zero-ref sub-case)");
} catch (e) {
  fail("AC4: ecm:ontologies must be preserved even when no references are rewritten", e);
}

// ---------------------------------------------------------------------------
// Additional: ecm:terms unchanged (imported term preserved as immutable metadata)
// ---------------------------------------------------------------------------
console.log("\nAdditional: ecm:terms unchanged after remap (SPEC section 13.3 imported term immutability)");

try {
  const termsBefore = JSON.stringify(BASE_PROJECT["ecm:terms"]);
  const result = remapReferences(BASE_PROJECT, IMPORTED_IRI, PROJECT_IRI);

  strictEqual(
    JSON.stringify(result.project["ecm:terms"]),
    termsBefore,
    "ecm:terms must be bytewise-identical after remap (SPEC section 13.3; imported term immutability)",
  );

  pass("ecm:terms preserved verbatim after remap (imported term immutability; SPEC section 13.3)");
} catch (e) {
  fail("ecm:terms must be preserved verbatim after remap (SPEC section 13.3)", e);
}

// ---------------------------------------------------------------------------
// Additional: ecm:snapshots unchanged (SPEC section 13.7)
// ---------------------------------------------------------------------------
console.log("\nAdditional: ecm:snapshots unchanged after remap (SPEC section 13.7)");

try {
  const snapshotsBefore = JSON.stringify(BASE_PROJECT["ecm:snapshots"]);
  const result = remapReferences(BASE_PROJECT, IMPORTED_IRI, PROJECT_IRI);

  strictEqual(
    JSON.stringify(result.project["ecm:snapshots"]),
    snapshotsBefore,
    "ecm:snapshots must be bytewise-identical after remap (SPEC section 13.7)",
  );

  pass("ecm:snapshots preserved verbatim after remap (SPEC section 13.7)");
} catch (e) {
  fail("ecm:snapshots must be preserved verbatim after remap (SPEC section 13.7)", e);
}

// ---------------------------------------------------------------------------
// Additional: ecm:subjectIri and ecm:objectIri are NOT rewritten
// ---------------------------------------------------------------------------
console.log("\nAdditional: ecm:subjectIri and ecm:objectIri are NOT rewritten by remapReferences");

try {
  // Edge-case project: IMPORTED_IRI appears as subjectIri and objectIri but NOT as predicateIri.
  // Verifies that remapReferences does not overreach into fields outside its defined scope.
  const SUBJ_OBJ_PROJECT: Record<string, unknown> = {
    ...BASE_PROJECT,
    "ecm:instances": [],
    "ecm:literalAssertions": [],
    "ecm:relations": [
      {
        id: "urn:test:eid:rel-edge",
        type: "ecm:RelationAssertion",
        "ecm:subjectIri": IMPORTED_IRI,  // NOT rewritten by remap
        "ecm:predicateIri": UNRELATED_IRI,
        "ecm:objectIri": IMPORTED_IRI,   // NOT rewritten by remap
        "ecm:createdAt": "2026-01-01T00:00:00Z",
        "ecm:updatedAt": "2026-01-01T00:00:00Z",
      },
    ],
  };

  const result = remapReferences(SUBJ_OBJ_PROJECT, IMPORTED_IRI, PROJECT_IRI);
  const relations = result.project["ecm:relations"] as Record<string, unknown>[];

  strictEqual(
    relations[0]["ecm:subjectIri"],
    IMPORTED_IRI,
    "ecm:subjectIri must NOT be rewritten by remapReferences (outside remap scope)",
  );
  strictEqual(
    relations[0]["ecm:objectIri"],
    IMPORTED_IRI,
    "ecm:objectIri must NOT be rewritten by remapReferences (outside remap scope)",
  );
  strictEqual(
    result.referenceCount,
    0,
    "referenceCount must be 0 when only subjectIri/objectIri match",
  );

  pass("ecm:subjectIri and ecm:objectIri are NOT rewritten (outside remap scope)");
} catch (e) {
  fail("ecm:subjectIri and ecm:objectIri must remain unchanged after remapReferences", e);
}

// ---------------------------------------------------------------------------
// Additional: no-op when importedIri === projectCreatedIri (identity remap)
// ---------------------------------------------------------------------------
console.log("\nAdditional: no-op when importedIri === projectCreatedIri (identity remap)");

try {
  const result = remapReferences(BASE_PROJECT, IMPORTED_IRI, IMPORTED_IRI);

  ok(
    result.project === BASE_PROJECT,
    "result.project must be the same reference as input for identity remap (no-op)",
  );
  strictEqual(result.referenceCount, 0, "referenceCount must be 0 for identity remap");
  strictEqual(
    result.affectedEntityTypes.length,
    0,
    "affectedEntityTypes must be empty for identity remap",
  );

  pass("identity remap (A->A) returns same project reference with referenceCount=0");
} catch (e) {
  fail("identity remap (A->A) must return same project reference with referenceCount=0", e);
}

// ---------------------------------------------------------------------------
// Summary
// ---------------------------------------------------------------------------
console.log(`\n  ${passed} passed, ${failed} failed`);
if (failed > 0) process.exit(1);
