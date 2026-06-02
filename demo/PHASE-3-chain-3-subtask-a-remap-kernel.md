# Phase 3 Chain 3 Sub-Task A Demo -- remapReferences Kernel Function

Phase 3 ("Ontology Import and Term Management") delivers Turtle import, the CLI surface, and the imported-term immutability + remap workflow. Chain 1 (build_ref=8707ef0) shipped the importOntology engine; Chain 2 (build_ref=439d69d) wired it into the real CLI command and discharged the ADR-003 stub. Chain 3 sub-task A (build_ref=4691d75) lands the third piece: a pure kernel function that rewrites instance/relation references from an imported IRI to a project-created replacement IRI, satisfying IMPLEMENTATION_PLAN section 3.2 AC3 and AC4. The remaining Chain 3 work (UI affordance, Inspector read-only mode, Playwright tests) is deliberately deferred and forward-tracked.

## What this chain delivers

One new kernel-pure function and its unit-test suite:

- `src/kernel/remap-references.ts` (7,480 bytes) -- exports `remapReferences(project, importedIri, projectCreatedIri): RemapResult`.
- `tests/remap-references.test.ts` (19,403 bytes) -- unit coverage including AC3 (zero residual occurrences) and AC4 (ontology-record preservation).

Call signature:

```ts
import { remapReferences } from './kernel/remap-references';

const result = remapReferences(project, importedIri, projectCreatedIri);
// result.project: rewritten project (ecm:instances and ecm:relations updated)
// result.changedInstanceCount, result.changedRelationCount, etc.
```

Semantics, per SPEC section 13.6 and IMPLEMENTATION_PLAN section 3.2:

- Rewrites `ecm:classIris` array entries on every `ecm:instance` from `importedIri` (A) to `projectCreatedIri` (B).
- Rewrites `ecm:predicateIri` string fields on every `ecm:relation` and `ecm:literalAssertion` from A to B.
- Preserves `ecm:ontologies`, `ecm:terms`, `ecm:snapshots`, `ecm:subjectIri`, and `ecm:objectIri` verbatim (object-reference identity AND bytewise JSON equality, both verified by the test suite).
- Does NOT perform a collision check. This is the deliberate divergence from the existing `refactorIri` in `src/refactor/index.ts`: the remap workflow requires `projectCreatedIri` to ALREADY exist in `ecm:terms`, which is exactly the state `refactorIri`'s collision guard rejects. The two functions are sibling pure functions with distinct contracts (banked as pattern-observation B1 at ratification).

## Acceptance criteria

| AC | What proves it | SPEC ref | Status |
|---|---|---|---|
| 3.2 AC3 -- Remap A to B: zero occurrences of A in `ecm:classIris` / `ecm:predicateIri` after remap | `tests/remap-references.test.ts` (unit) | IMPLEMENTATION_PLAN section 3.2; SPEC section 13.6 | GREEN |
| 3.2 AC4 -- Imported ontology record (with IRI A) remains in `ecm:ontologies` after remap | `tests/remap-references.test.ts` two-pronged invariant (JSON.stringify equality + object-reference identity) | IMPLEMENTATION_PLAN section 3.2; SPEC section 13.3 | GREEN |
| 3.2 AC1 -- Imported term has `ecm:source: "ecm:imported-ontology"` in saved project (Playwright) | -- | IMPLEMENTATION_PLAN section 3.2 | NOT IN SCOPE (forward-tracked as ft-778-dev-p3-c3-1) |
| 3.2 AC2 -- Clicking imported term in sidebar shows read-only inspector (Playwright) | -- | IMPLEMENTATION_PLAN section 3.2 | NOT IN SCOPE (forward-tracked as ft-778-dev-p3-c3-1) |

Full test-suite gate: `148/148` tests pass across 20 test files at `build_ref=4691d75` (Phase 3 Exit Gate item 10).

## How to verify

From the GraphWrite repo root, on `build_ref=4691d75`:

```
npm install
npm run build
npm test
```

Expected tail of `npm test`:

```
... remap-references.test.js (90ms)
Files: 20/20 passed
Tests: 148/148 passed
```

No TypeScript errors from `npm run build`; no purity violations from `npm run test:purity` (the new file lives in `src/kernel/` and imports no adapter or composition code).

## What works end-to-end right now

Cumulative Phase 3 surface at `build_ref=4691d75`:

- Turtle ontology import as a pure-function engine -- `src/import/turtle-import.ts` (Chain 1; IMPLEMENTATION_PLAN section 3.1; 6/6 ACs).
- Operator-runnable CLI: `graphwrite import-ontology <project> <ttl>` writes a saved project with imported terms tagged `ecm:source: "ecm:imported-ontology"` -- `src/cli/index.ts` (Chain 2; IMPLEMENTATION_PLAN section 3.5; 2/2 ACs; ADR-003 stub discharged).
- Programmatic remap of instance/relation references from an imported IRI to a project-created replacement IRI -- `src/kernel/remap-references.ts` (Chain 3 sub-task A; IMPLEMENTATION_PLAN section 3.2 AC3+AC4).

A developer can today: import a Turtle ontology via the CLI, create a project-created term in `ecm:terms`, call `remapReferences(project, importedIri, projectCreatedIri)`, and obtain a project in which the imported ontology record remains intact but no instance or relation still references the imported IRI.

## What is NOT yet in scope

Deferred from this chain (explicitly):

- IMPLEMENTATION_PLAN section 3.2 **AC1 + AC2** -- the Playwright UI tests for `ecm:source` tagging and read-only Inspector activation. The TermSidebar already marks imported terms `aria-disabled="true"` (verified by existing `tests/playwright/term-crud.spec.ts` AC4), but no Inspector term-selection mode exists, no RemapDialog UI component exists, and `EditTermDialog` has no defensive guard. Forward-tracked as `ft-778-dev-p3-c3-1` (subject: `phase-3-chain-3.2-ui-immutability-remap`); gated on PO answers to four open questions (see Sign-off prompt below).
- IMPLEMENTATION_PLAN section 3.3 -- LARGE_IMPORT warning, degraded mode, virtualized term lists.
- IMPLEMENTATION_PLAN section 3.4 -- term search and filter UI.
- OED-303 resolution.
- Phase 3 Exit Gate items 2, 3, 5, 7, 8, 9, 11.

No new ADRs were created during Phase 3 Chains 1-3.

## Sign-off prompt

Reviewer questions for the PO:

1. Does the kernel-only delivery of section 3.2 (AC3+AC4 by unit test) satisfy the chain-landing bar, with AC1+AC2 (the UI/Playwright pair) accepted as forward-tracked work? The substrate-side rationale was Option B at the 2026-06-02 rescope: ship the testable pure function now; defer the UI loop until the four OQs resolve.
2. Of the four PO-territory open questions captured under `ft-778-dev-p3-c3-1`, which would you like to answer in this review pass?
   - **OQ-B:** Should importing a term change `TermSidebar` behavior from "click-suppressed" to "click-opens-Inspector-in-read-only-mode" while keeping `aria-disabled`?
   - **OQ-E:** Should IMPLEMENTATION_PLAN section 3.2 AC1's Playwright test use the existing `imported-term.jsonld` round-trip fixture, or require the browser-side import UI?
   - **OQ-A-fixture:** Is an inline hand-crafted fixture for unit tests (with `ecm:ontologyId: null`) acceptable, or should the fixture round-trip the import pipeline?
   - **OQ-B-continuity:** Will the existing `term-crud.spec.ts` AC4 (aria-disabled on imported terms) continue to pass after sub-task B wires `onImportedTermClick`?
3. The remap function's deliberate divergence from `refactorIri` (no collision check, because B is required to pre-exist) was ratified and banked as pattern-observation B1. Concur, or would you prefer a single unified function with an explicit `expect_collision: boolean` mode?
4. **Decision:** `pass` (close Chain 3 sub-task A; queue Chain 3.2-UI follow-up with PO answers), `revise` (specific concern), or `pivot` (re-scope before any UI work begins)?

## For the substrate-audit-curious

This chain was the first Phase 3 chain to use the v3.3.2 substrate-discipline patch (the resolve-to-execution link) -- the Option B rescope was committed via `state_admin resolve --execution-mode state-surgery-applied` rather than a bare resolve, so the followup state is traceable from the audit chain. The ratification task (`779-rat-p3-c3`) banked two pattern-observations: B1 (sibling-pure-function separation between `remapReferences` and `refactorIri`) and B2 (two-pronged AC4-style preservation-invariant pattern: JSON.stringify bytewise equality plus object-reference identity). This demo doc itself was produced by the v3.5.0 demo-doc auto-generation primitive (CLAUDE.md section 7.15): operator emitted `state_admin phase demo-released phase-3 --build-ref 4691d75 --demo-doc-descriptor chain-3-subtask-a-remap-kernel` and the substrate auto-queued the 4-task chain (reconnaissance -> demo-doc-author -> architect ratification -> applier) anchored on task 781-test-p3-c3.
