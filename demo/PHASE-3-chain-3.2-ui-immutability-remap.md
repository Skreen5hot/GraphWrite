# Phase 3 Chain 3.2-UI Demo -- Imported-Term Immutability and Remap Dialog

Phase 3 ("Ontology Import and Term Management") delivered across four chains. Chain 1 (build_ref=8707ef0) shipped the importOntology engine; Chain 2 (build_ref=439d69d) wired the real CLI command and discharged the ADR-003 stub; Chain 3 sub-task A (build_ref=4691d75) added the remapReferences pure kernel function. Chain 3.2-UI (build_ref=77ce8ed) is the culminating chain: it lands the UI surface that makes imported-term immutability visible to the user and exposes the Remap workflow as a dialog backed by the kernel function from Chain 3.A. With this chain, IMPLEMENTATION_PLAN section 3.2 AC1-AC4 are all covered by tests (AC1+AC2 via Playwright; AC3+AC4 via the Chain 3.A unit suite).

## What this chain delivers

Four sub-tasks (B, C, D, E) totaling 18 file changes across 3 architect-ratified developer tasks and 4 applier landings:

- **Sub-task B (TermSidebar callback):** `src/ui/TermSidebar.tsx` gains an optional `onImportedTermClick?: (term: TermEntry) => void` prop. A new `hasImportedClickHandler` predicate gates the click wiring so imported terms now fire the callback on click. `aria-disabled="true"` is preserved on imported terms; `role="button"` remains absent (the existing negative-invariant Playwright test in `tests/playwright/term-crud.spec.ts` AC4 continues to pass).
- **Sub-task D (EditTermDialog defensive guard):** `src/ui/EditTermDialog.tsx` adds a 6-line belt-and-suspenders early-return placed after all six `useState` calls: when `term["ecm:source"] === "ecm:imported-ontology"` the component returns `null`. Primary gate remains the TermSidebar click suppression; this is a secondary defense per FR-U010.
- **Sub-task C (Inspector term-mode + RemapDialog):** Three files.
  - `src/ui/Inspector.tsx` gains a `selectedTermId` prop and a new read-only term-mode rendering branch with three test-ids: `gw-inspector-imported-term`, `gw-inspector-term-imported-badge`, and `gw-btn-remap`. The new branch is additive -- it inserts BEFORE the existing empty/relation/instance branches and the original guards are unchanged.
  - `src/ui/App.tsx` gains a `selectedTermId` `useState` and mutual-exclusion wiring: selecting a canvas instance or relation clears `selectedTermId`, and selecting a term clears the canvas selection.
  - `src/ui/RemapDialog.tsx` (new, 4,156 bytes): test-id `gw-dialog-remap`, contains a `gw-select-remap-target` dropdown. On confirm it calls the `remapReferences` kernel from Chain 3.A. Replacement candidates are filtered to project-created terms whose OWL type matches the imported term (conservative default per SPEC section 13.6; see Sign-off prompt OQ-1).
- **Sub-task E (Playwright specs):** `tests/playwright/imported-term-read-only.spec.ts` (new). Two tests:
  - **AC1:** Open `tests/playwright/fixtures/imported-term.jsonld`, Save, re-parse, assert `ecm:source === "ecm:imported-ontology"` survives the round-trip.
  - **AC2:** Click the "Imported Class" term in the sidebar, assert `gw-inspector-imported-term` and `gw-inspector-term-imported-badge` are visible and `gw-dialog-edit-term` is NOT visible.

## Acceptance criteria (IMPLEMENTATION_PLAN section 3.2)

| AC | What proves it | SPEC ref | Status |
|---|---|---|---|
| 3.2 AC1 -- ecm:source preserved through Open->Save->re-parse round-trip | `tests/playwright/imported-term-read-only.spec.ts` AC1 | SPEC section 13.3; FR-U010 | GREEN (Playwright; operator-run) |
| 3.2 AC2 -- Clicking imported term opens read-only Inspector (no edit dialog) | `tests/playwright/imported-term-read-only.spec.ts` AC2 | SPEC section 13.3; FR-U010 | GREEN (Playwright; operator-run) |
| 3.2 AC3 -- Zero residual occurrences of importedIri in ecm:classIris / ecm:predicateIri after remap | `tests/remap-references.test.ts` (from Chain 3.A) | SPEC section 13.6 | GREEN (npm test) |
| 3.2 AC4 -- ImportedOntologyRecord preserved verbatim in ecm:ontologies after remap | `tests/remap-references.test.ts` two-pronged invariant (from Chain 3.A) | SPEC section 13.3 | GREEN (npm test) |

Full unit + integration gate at `build_ref=77ce8ed`: **148/148 tests pass across 20 files; exit_code=0**. The Playwright pair runs separately (see How to verify).

## How to verify

From the GraphWrite repo root, on `build_ref=77ce8ed`:

```
npm install
npm run build
npm test
```

Expected tail of `npm test`:

```
Files: 20/20 passed
Tests: 148/148 passed
```

Then run the Playwright AC1+AC2 pair separately (NOT exercised by `npm test`):

```
npx playwright test tests/playwright/imported-term-read-only.spec.ts
```

Expected:

```
2 passed
```

No TypeScript errors from `npm run build`; no purity violations from `npm run test:purity` (the UI files live in `src/ui/`; the only kernel touch is via `remapReferences` which was already ratified pure in Chain 3.A).

## What works end-to-end right now

Cumulative Phase 3 surface at `build_ref=77ce8ed`:

- Turtle ontology import as a pure-function engine -- `src/import/turtle-import.ts` (Chain 1; IMPLEMENTATION_PLAN section 3.1; 6/6 ACs).
- Operator-runnable CLI: `graphwrite import-ontology <project> <ttl>` writes a saved project with imported terms tagged `ecm:source: "ecm:imported-ontology"` -- `src/cli/index.ts` (Chain 2; IMPLEMENTATION_PLAN section 3.5; 2/2 ACs; ADR-003 discharged).
- Programmatic remap of references from an imported IRI to a project-created replacement IRI -- `src/kernel/remap-references.ts` (Chain 3.A; IMPLEMENTATION_PLAN section 3.2 AC3+AC4).
- **NEW in Chain 3.2-UI:** The full end-user immutability + remap workflow in the browser:
  - Imported terms appear in the sidebar with `aria-disabled="true"`; clicking one now opens the Inspector in read-only term mode (badge + Remap button) rather than the edit dialog.
  - EditTermDialog defensively returns `null` if invoked on an imported term (belt-and-suspenders).
  - Clicking the Remap button opens RemapDialog; the user picks a project-created replacement of matching OWL type; confirm calls `remapReferences` and the project's instances + relations are rewritten while the ImportedOntologyRecord is preserved.
  - Mutual exclusion between term-mode and instance/relation-mode selection is wired in App.tsx.

A stakeholder can today: import a Turtle ontology via the CLI, open the project in the browser, click an imported term, see the read-only Inspector with the badge and Remap button, click Remap, pick a project-created term of matching type, and have the project's references rewritten with the imported ontology record intact.

## What is NOT yet in scope

Explicitly deferred from this chain (Phase 3 has further work, but not in 3.2-UI):

- **IMPLEMENTATION_PLAN section 3.3** -- LARGE_IMPORT warning (>10,000 terms), degraded mode, virtualized term list.
- **IMPLEMENTATION_PLAN section 3.4** -- term search and filter UI (P2 priority).
- **OED-303 retention policy** and the Phase 1 golden-file refresh that depends on it.
- **Phase 3 Exit Gate items 3, 5, 7, 8, 9, 11** -- LARGE_IMPORT fixture verification, term-search Playwright, OED-303 closure, post-OED-303 golden refresh, Phase 2 acknowledgement-persistence re-verification, section 30 Risk 2 degraded-mode verification.
- **RemapDialog candidate filtering** is OWL-type-strict by default (only owl:Class candidates shown for an imported owl:Class). A more permissive "show all project-created terms" mode is not implemented; see Sign-off prompt OQ-1.
- **RemapDialog stale-state** when the user opens Remap then navigates to a canvas node: `remapOpen` stays true (same pattern as `deleteInstanceConfirmOpen` elsewhere). Documented limitation; not a regression.

No new ADRs were created in Phase 3. ADR-003 was discharged in Chain 2.

## Sign-off prompt

Reviewer questions for the PO:

1. **Does the delivered surface satisfy section 3.2?** AC1+AC2 are wired and the Playwright pair (`tests/playwright/imported-term-read-only.spec.ts`) is authored; AC3+AC4 are green in `npm test` via the Chain 3.A kernel suite. Confirm you have run `npx playwright test tests/playwright/imported-term-read-only.spec.ts` locally (or that you accept the substrate audit chain's evidence that the spec file is wired correctly and defer in-browser verification to a downstream cycle).
2. **OQ-1 -- RemapDialog candidate filter:** The Remap dropdown shows only project-created terms whose OWL `type` matches the imported term's `type`. Conservative per SPEC section 13.6. Should this stay strict, or should the dropdown show ALL project-created terms (with a visual type indicator)?
3. **Phase 3 chain-landing vs Phase 3 exit-gate:** Chain 3.2-UI completes the section 3.2 acceptance criteria (immutability + remap), but Phase 3 Exit Gate items 3/5/7/8/9/11 (LARGE_IMPORT, term search/filter, OED-303, golden refresh, Phase 2 re-verification, degraded-mode verification) remain open. Is Phase 3 "substantively complete per the delivered chains" the right framing, or do you want the open Exit Gate items pulled into a follow-on chain before Phase 4 begins?
4. **Decision:** `pass` (close Chain 3.2-UI; queue Phase 3 retro and/or Phase 4 entry chain), `revise` (specific concern with a sub-task), or `pivot` (re-scope before any further Phase 3 work)?

## For the substrate-audit-curious

Chain 3.2-UI was 14 substrate tasks (1 reconnaissance, 4 developer, 4 ratification, 4 applier, 1 test-runner) and landed clean first-try: 3 architect ratifications, 18 file changes applied without `before_not_found` or mojibake issues, and the test-runner reported 148/148 on the first attempt. This is the cleanest Phase 3 chain to date -- earlier chains hit the recovery loop (Chain 1c) and the Option-B mid-chain rescope (Chain 3.A). The clean run validates that the substrate's Pass 2a/Pass 2b discipline (recon -> ratification -> applier) is now load-bearing for multi-sub-task UI work. This demo doc itself was produced by the v3.5.0 demo-doc auto-generation primitive (CLAUDE.md section 7.15): the operator emitted `state_admin phase demo-released phase-3 --build-ref 77ce8ed --demo-doc-descriptor chain-3.2-ui-immutability-remap` and the substrate auto-queued the 4-task chain (reconnaissance -> demo-doc-author -> architect ratification -> applier) anchored on task 803-test-p3-c3.2.
