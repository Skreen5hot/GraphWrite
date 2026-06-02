# Phase 3 Chain 2 Demo -- CLI import-ontology Command

**Stakeholder review:** CLI-level capability landing. Chain 2 closes the gap between the Chain 1 importer engine and an operator-runnable command. UI integration (sidebar import affordances, immutability badges, large-import warnings) is still ahead.

Companion to [PHASE-3-CHAIN-1-TURTLE-IMPORT.md](PHASE-3-CHAIN-1-TURTLE-IMPORT.md) (engine-level demo). This document covers Chain 2 specifically -- the `node index.js import-ontology ...` command that wires the engine to a writeable project file.

---

## What this chain delivers

The real `import-ontology` subcommand at [`src/cli/index.ts`](../src/cli/index.ts), replacing the Phase 1 stub (lines 332-337) that previously wrote `not yet implemented; available in Phase 3` to stderr and exited 2 (ADR-003, now superseded).

Invocation per SPEC section 23:

```bash
node dist/index.js import-ontology <project.jsonld> <ontology.ttl> \
    --out <updated-project.jsonld> \
    [--clock <ISO8601>] \
    [--allow-outside-cwd]
```

What the command does:

1. Reads `<project.jsonld>` and `<ontology.ttl>` from disk (50 MB hard limit per SPEC section 12.2 / 14.2).
2. Sources `createdAt` once at the CLI boundary via `values.clock ?? new Date().toISOString()` -- `--clock` enables deterministic override per SPEC section 9.3 kernel-purity discipline. The engine itself never calls `Date.now()`.
3. Calls `importOntology()` (the Chain 1 pure-function engine).
4. Augments each extracted term with `ecm:source: "ecm:imported-ontology"` and `ecm:ontologyId` (per SPEC section 5.7), then merges the `ImportedOntologyRecord` into `project["ecm:ontologies"]` and the augmented terms into `project["ecm:terms"]`.
5. Writes the canonical JSON-LD output to the `--out` path.

Exit codes per SPEC section 23:

| Code | Meaning |
|---|---|
| 0 | Success |
| 2 | File I/O error OR `SIZE_EXCEEDED` (input > 50 MB) |
| 3 | Missing required argument OR `PARSE_ERROR` (malformed Turtle) |

---

## Acceptance criteria (IMPLEMENTATION_PLAN section 3.5)

Both Chain 2 acceptance criteria pass. Test suite is 140/140 across 19 files; the new file is `tests/cli-import-ontology.test.js`.

| AC | Behavior | What proves it | Reference |
|---|---|---|---|
| **AC1** | Valid Turtle input produces a project file that subsequently passes `validate` with zero errors | `tests/cli-import-ontology.test.js` end-to-end fixture: import-ontology exits 0, validate on the output exits 0, no `ecm:error` findings | IMPLEMENTATION_PLAN section 3.5 |
| **AC2** | A 51 MB input file exits 2 with a non-empty stderr message, without parsing | `tests/cli-import-ontology.test.js` size-guard fixture; the guard runs before the engine is invoked (cheap byte-length check) | IMPLEMENTATION_PLAN section 3.5; SPEC section 14.2 |

Adjacent invariants that landed alongside the ACs:

- Missing positional args -> exit 3 with `import-ontology:` prefix in stderr (replaces the old Phase 1 stub assertion at `tests/cli-integration.test.ts`)
- `--allow-outside-cwd` honors the existing CLI safety contract
- `--clock <ISO8601>` produces byte-identical output on re-run for the same input, satisfying determinism (SPEC section 9.3)

---

## How to verify

**Prerequisites:** Node.js >= 22, one-time `npm install` (about 30 seconds).

```bash
npm run build
npm test
```

Expected output tail:

```
  Files: 19/19 passed
  Tests: 140/140 passed
```

The Chain 2 acceptance tests live in `tests/cli-import-ontology.test.ts`; the stub-replacement guard lives in `tests/cli-integration.test.ts`. Direct invocation against a hand-built fixture:

```bash
node dist/index.js import-ontology \
    examples/empty-project.jsonld \
    tests/fixtures/small.ttl \
    --out /tmp/merged.jsonld \
    --clock 2026-06-02T00:00:00Z

node dist/index.js validate /tmp/merged.jsonld
# exit 0; no ecm:error findings
```

---

## What works end-to-end right now

- `import-ontology` accepts a project JSON-LD file plus a Turtle ontology file and produces a merged project at `--out`
- Merged output validates cleanly via the existing `validate` subcommand (round-trip integrity)
- Each imported term carries `ecm:source: "ecm:imported-ontology"` and `ecm:ontologyId` provenance
- Project `ecm:ontologies` array accumulates `ImportedOntologyRecord` entries (content hash, source-file metadata, parsed status)
- 50 MB hard size guard fires before any parsing
- `--clock` deterministic-timestamp override produces byte-identical output across runs
- Operator gets actionable exit codes (0 / 2 / 3) and a stderr prefix that identifies the failing subcommand
- ADR-003 obligation discharged: the Phase 1 stub for `import-ontology` is gone

---

## What is NOT yet in scope

Chain 2 ships only IMPLEMENTATION_PLAN section 3.5. The remaining Phase 3 sub-tasks and Phase 3 exit gate items below are NOT delivered:

- **IMPLEMENTATION_PLAN section 3.2 -- Imported-Term Immutability and Remap Workflow.** Imported terms are not yet rendered read-only in the UI; the "remap references" workflow does not exist. SPEC sections 13.3 and 13.6 are deferred.
- **IMPLEMENTATION_PLAN section 3.3 -- Large-Import Handling.** The 10,000-term `LARGE_IMPORT` warning does not fire; degraded-mode virtualized lists are not implemented. SPEC section 14.2 large-ontology UX is deferred.
- **IMPLEMENTATION_PLAN section 3.4 -- Term Search and Filter UI.** Not delivered.
- **OED-303** (validation report retention policy) remains open. Per IMPLEMENTATION_PLAN Phase 3 Exit Gate item 7 and ROADMAP Phase 3 Decisions Deferred, OED-303 MUST be resolved before Phase 3 closes, and the resolution MUST rule on whether Phase 1 goldens and Phase 2 acknowledgement-persistence need retrospective updates.
- **Other ontology formats.** OWL/XML, JSON-LD-as-ontology, and N-Triples are NOT supported. The engine accepts Turtle only per FR-C011.
- **OWL reasoning.** Restrictions, property chains, cardinality, equivalent-class reasoning, imports-closure, and blank-node reasoning are explicitly out of MVP per SPEC section 14.1.
- **Phase 3 Exit Gate items 2, 3, 5, 7, 8, 9, 11** (IMPLEMENTATION_PLAN Phase 3 Exit Gate) are not yet satisfied; the phase remains in `demo-released`, not `po-satisfied`.

---

## Sign-off prompt

Three questions for the PO:

1. **Does the CLI command work end-to-end?** Run `npm run build && npm test` and confirm 140/140. Optionally run the direct-invocation block in "How to verify" against a fixture you trust. If both pass, Chain 2 works.
2. **Is the Chain 2 scope right?** AC1 + AC2 plus the "NOT yet in scope" list above describe exactly what Chain 2 delivers. Anything you expected in this slice that is missing, or anything in the "NOT yet in scope" list that you believe should be pulled forward into the current sprint?
3. **What is the next chain?** The natural next moves are IMPLEMENTATION_PLAN section 3.2 (immutability + remap UI) and section 3.3 (LARGE_IMPORT warning and degraded mode), both of which are Phase 3 exit-gate blockers. OED-303 closure is the other gating item. Pick the next chain, or pause Phase 3 here.

**Decision surface:** pass (proceed to Chain 3) / revise (Chain 2 is incomplete; specify the delta) / pivot (Phase 3 scope changes; specify the new shape).

---

## For the substrate-audit-curious

Chain 2's anchor task is `urn:fnsr:task:772-test-p3-c2`; build_ref `439d69d`. The chain ran clean (recon -> developer -> ratification -> applier -> test-runner, all `done` first try; no Fixer dispatches, no operator interventions). The applier modified three files: `src/cli/index.ts` (+3906 bytes across C1/C2/C3), `tests/cli-integration.test.ts` (+36 bytes across C4/C5 -- the AC7 stub-assertion replacement), and `tests/cli-import-ontology.test.ts` (new file, 7234 bytes, C6).

This demo doc was produced by the v3.5.0 demo-doc auto-generation primitive (CLAUDE.md section 7.15): the operator emitted `state_admin phase demo-released phase-3 --regenerate-demo-doc --demo-doc-descriptor chain-2-cli-integration`, the substrate auto-queued a 4-task chain (reconnaissance -> demo-doc-author -> architect ratification -> applier), and the applier landed this file. End-to-end the v3.5.0 primitive was exercised for the first time on a clean Pass 2a / Pass 2b discipline run.
