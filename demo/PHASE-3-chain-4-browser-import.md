# Phase 3 Chain 4 Demo -- Browser Import Ontology

Phase 3 (Ontology Import and Term Management) covers four substantive chains. This document reviews **Chain 4**, the browser-side Import Ontology workflow that lands at build_ref `0b3a424`. Chain 4 closes the 2026-06-02 demo-review gap surfaced after Chain 3: the engine (Chain 1), CLI command (Chain 2), and kernel remap function (Chain 3) were all in place, but the application had no header button or dialog through which a user could actually import a Turtle ontology. Chain 4 adds that surface and wires it end-to-end.

For the full phase context, see IMPLEMENTATION_PLAN section 3 (Phase 3) and ROADMAP.md Phase 3.

## What this chain delivers

User-visible affordances added in the running app:

- A new **Import Ontology** header button (`gw-btn-import-ontology`) placed between Open and Download. Disabled until a project is loaded.
- A multi-phase **Import Ontology dialog** (`ImportOntologyDialog`) that:
  - accepts `.ttl` files only (file input `accept='.ttl'` plus an extension guard);
  - performs a 50 MB byte-length pre-check **before** reading file contents;
  - shows a preview line of the form `N terms ready to import.`;
  - on confirm, merges the parsed terms and the `ecm:ImportedOntology` record into the current project.
- Imported terms appear in the sidebar marked `aria-disabled='true'`, carrying `ecm:source='ecm:imported-ontology'` and an `ecm:ontologyId` back-reference.

New code surface:

- `src/kernel/sha256.ts` -- `sha256Hex` (sync, `node:crypto`) and `sha256HexAsync` (async, `globalThis.crypto.subtle.digest`). Lets the engine produce `ecm:contentHash` from both Node and browser callers.
- `src/iri/index.ts` -- `generateIri()` now accepts an optional `uuidFn` parameter so callers can inject `crypto.randomUUID` instead of pulling in `node:crypto` at module load.
- `src/ui/ImportOntologyDialog.tsx` -- 4-phase state machine (`idle` / `reading` / `preview` / `error`), invokes `importOntology()` with `digestHexFn=sha256HexAsync` and `uuidFn=() => crypto.randomUUID()`.
- `src/ui/App.tsx` -- mounts the dialog and exposes the header button.
- `tests/playwright/ontology-import.spec.ts` and `tests/playwright/fixtures/sample-ontology.ttl` -- end-to-end spec plus 5-term fixture (Animal / Dog / Cat / hasPet / petName).
- `tests/sha256.test.ts` and `tests/iri-uuid-injection.test.ts` -- unit coverage for the new shim and the injectable UUID.

## Acceptance criteria

| AC | What proves it | Reference | Status |
|---|---|---|---|
| AC1: extract owl:Class / ObjectProperty / DatatypeProperty from .ttl | `tests/import-turtle.test.ts` (Chain 1) | SPEC section 14.1; FR-C011 | green |
| AC2: 50 MB hard-reject before parsing | byte-length pre-check in `ImportOntologyDialog` + engine guard | SPEC section 12.2; IMPLEMENTATION_PLAN section 3.1 | green |
| AC3: ecm:ImportedOntology record with ecm:contentHash (SHA-256) | `tests/sha256.test.ts`; engine record emit | SPEC section 5.6 | green |
| AC4: deterministic kernel; non-deterministic UUID injected at the boundary | `tests/iri-uuid-injection.test.ts`; `tests/determinism.test.ts` | SPEC section 9.2; NFR-003 | green |
| AC5: browser dialog accepts .ttl, previews term count, merges on confirm | `tests/playwright/ontology-import.spec.ts` AC1-5 (happy path) | IMPLEMENTATION_PLAN section 3.1 | authored; operator runs `npx playwright test` |
| AC6: round-trip -- saved project carries ecm:source=ecm:imported-ontology and ecm:ontologies entry with ecm:format='text/turtle' | `tests/playwright/ontology-import.spec.ts` AC6 | SPEC section 5.6; section 14.1 | authored; operator runs `npx playwright test` |
| Phase 3 Exit Gate item 10: `npm test` and build zero failures | anchor task `821-test-p3-c4` -- 159/159 tests across 22 files; exit_code=0 | IMPLEMENTATION_PLAN Phase 3 Exit Gate | green |

Note: AC5 and AC6 Playwright specs are authored at `tests/playwright/ontology-import.spec.ts` but are not exercised by `npm test`. The operator runs them separately against a preview server.

## How to verify

From the repo root at build_ref `0b3a424`:

```
npm install
npm run build
npm test
```

Expected tail of `npm test`:

```
Files: 22/22 passed  Tests: 159/159 passed
```

To exercise the browser workflow manually:

```
npm run dev
# open the served URL; create or open a project;
# click the Import Ontology header button;
# attach tests/playwright/fixtures/sample-ontology.ttl;
# verify the dialog reports '5 terms ready to import.';
# confirm; verify Animal / Dog / Cat / hasPet / petName appear in the sidebar
# rendered with aria-disabled='true'.
```

To run the Playwright spec (operator step):

```
npx playwright test tests/playwright/ontology-import.spec.ts
```

## What works end-to-end right now

- Loading a project, clicking **Import Ontology**, attaching a `.ttl` file under 50 MB, seeing a term-count preview, and confirming the merge.
- Imported terms land in the project with `ecm:source='ecm:imported-ontology'` and an `ecm:ontologyId` referencing the appended `ecm:ImportedOntology` record (with `ecm:contentHash` and `ecm:format='text/turtle'`).
- Saving the project preserves the imported markers; reloading the saved file reproduces the imported state.
- The CLI path (`graphwrite import-ontology ...`) from Chain 2 remains green and shares the same engine and merge semantics.
- The kernel `remapReferences()` pure function (Chain 3 sub-task A) is available for downstream UI consumers; it leaves the `ecm:ImportedOntology` record unchanged while rewriting `ecm:classIris` / `ecm:predicateIri` occurrences.

## What is NOT yet in scope

The following Phase 3 items are explicitly **not** delivered at build_ref `0b3a424` and should not be reviewed as part of this chain:

- **IMPLEMENTATION_PLAN section 3.2 UI work** -- read-only Inspector for imported terms, the Remap dialog affordance, the `EditTermDialog` defensive guard, and Playwright AC1+AC2. Forward-tracked as `ft-778-dev-p3-c3-1` (subject `phase-3-chain-3.2-ui-immutability-remap`). The current sidebar marks imported terms `aria-disabled='true'` but the full read-only Inspector is a separate follow-up chain.
- **IMPLEMENTATION_PLAN section 3.3 Large-Import Handling** -- the `LARGE_IMPORT` warning at > 10,000 terms and the virtualized-list degraded mode are deferred.
- **IMPLEMENTATION_PLAN section 3.4 Term Search and Filter UI** -- substring search and the `All / Project-created / Imported only` scope filter are deferred.
- **JSON-LD ontology import** -- only `.ttl` (Turtle) is accepted. JSON-LD ontology parsing remains forward-tracked.
- **OED-303 (Validation report retention policy)** -- per ROADMAP Phase 3 Decisions Deferred, this is a Phase 3 exit-gate item and remains open at this chain. Resolution is a separate decision before phase close.
- The Phase 3 'NOT in scope' list from ROADMAP still stands: OWL restrictions, property chains and cardinality, equivalent-class reasoning, subsumption inference, imports-closure resolution, blank-node reasoning, class-expression editing, disjointness, consistency checking, `rdfs:domain` / `rdfs:range` as first-class TBox fields (section 7.5 deferred), SHACL validation (section 17.7 deferred), blank-node editing UI (section 7.3), and ZIP import (section 3.2).

## Sign-off prompt

Please review and respond:

1. Does the browser Import Ontology workflow exercised above (header button, dialog, preview, confirm, sidebar markers) match what you expected for the Phase 3 demo cut?
2. Are you satisfied treating the imported-term **read-only Inspector** and the **Remap dialog** (ft-778-dev-p3-c3-1) as a follow-up chain, given that the current build marks imported terms `aria-disabled='true'` in the sidebar?
3. Are you satisfied that **OED-303**, **section 3.3 large-import handling**, and **section 3.4 search/filter** remain deferred at this checkpoint, with Phase 3 exit gate closure tracked separately?
4. Verdict: **pass** (advance to po-satisfied), **revise** (specify what to change before advancing), or **pivot** (specify the alternative direction)?

## For the substrate-audit-curious

The Chain 4 sub-task B went through one architect denial-and-remediation cycle: the original `812-dev-p3-c4-B` was denied on R1 (FileReader read before the 50 MB byte-length check) and R2 (`importOntology` async branch reached `node:crypto` via `generateIri`). The remediated `825-dev-p3-c4-B-v2` placed the byte-length pre-check before `reader.readAsText` and threaded both `digestHexFn=sha256HexAsync` and `uuidFn=() => crypto.randomUUID()` into the call. The anchor test `821-test-p3-c4` was emitted after the v2 applier landed.
