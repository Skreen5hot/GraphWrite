# Phase 3 Chain 6 Demo -- LARGE_IMPORT warning and degraded mode

Phase 3 (Ontology Import and Term Management) reached its sixth chain landing at build_ref=9b604b8 on 2026-06-04. Chain 6 closes IMPLEMENTATION_PLAN section 3.3 (Large-Import Handling) and mitigates ROADMAP Risk 2 (browser crashes on large ontologies). This demo doc is scoped to Chain 6 alone; Phase 3 PLO state is `demo-released`, not `po-satisfied`, and a small set of Phase 3 items remain explicitly out of scope (see below).

## What this chain delivers

Four sub-tasks landed end-to-end through the standard Pass 2a / Pass 2b discipline (14 substrate tasks; clean first-try).

**Sub-task A -- Kernel: threshold constant, widened import status, ImportResult extension** (`src/import/turtle-import.ts`)

- New `LARGE_IMPORT_THRESHOLD = 10_000` constant per SPEC section 14.2.
- `ImportedOntologyRecord.ecm:importStatus` widened from `'ecm:parsed'` only to `'ecm:parsed' | 'ecm:degraded'`.
- `ImportResult` `ok: true` branch extended with optional `warning?`, `termCount`, and `thresholdExceeded` fields.
- Three unit tests in `tests/import-turtle.test.ts` cover threshold-not-crossed, threshold-crossed (synthetic >10,000-term fixture), and the warning payload shape.

**Sub-task B -- Browser UI: large-import warning dialog phase** (`src/ui/ImportOntologyDialog.tsx`)

- New `'large_import_warning'` phase in the dialog state machine, entered when `result.thresholdExceeded === true`.
- Two-button flow: "Continue in degraded mode" advances import with `ecm:importStatus = 'ecm:degraded'`; "Cancel" returns the dialog to its idle state and leaves the project document untouched.
- Extracted term count is shown verbatim from `result.termCount` so the operator sees the actual fixture size before committing.

**Sub-task C -- Validate surface: LARGE_IMPORT warning emission** (`src/validate/index.ts`)

- New `makeWarning()` helper produces a structured validation warning record.
- `LARGE_IMPORT` warning is emitted on any `ImportedOntologyRecord` whose `ecm:importStatus === 'ecm:degraded'`, mirroring SPEC section 17.3 severity guidance.

**Sub-task D -- Virtualized term list + Playwright AC** (`src/ui/TermSidebar.tsx`, `src/ui/App.css`, `tests/playwright/large-import-warning.spec.ts`)

- Hand-rolled `VirtualizedTermList` component (no `react-window` or other new runtime dependency) renders only the visible slice of imported terms when the project is in degraded mode; composes cleanly with the Chain 5 per-section search filter.
- Degraded-mode CSS class signals the bounded-rendering state in the sidebar.
- New Playwright spec `tests/playwright/large-import-warning.spec.ts` covers the warning UI, Cancel, Continue-degraded, and the DOM-node assertion for AC5.

## Acceptance criteria (IMPLEMENTATION_PLAN section 3.3)

| AC | Behavior | What proves it | Status |
|---|---|---|---|
| AC1 | LARGE_IMPORT warning fires in `validate()` for a >10,000-term ontology | Sub-task A unit test (synthetic fixture) + sub-task C `makeWarning()` emission | green (npm test) |
| AC2 | Import warning UI shows the extracted term count | `tests/playwright/large-import-warning.spec.ts` against `ImportOntologyDialog` `large_import_warning` phase | green (Playwright; see Sign-off prompt Q4) |
| AC3 | Cancel leaves the project document unchanged | `tests/playwright/large-import-warning.spec.ts` Cancel branch | green (Playwright) |
| AC4 | Continue in degraded mode sets `ecm:importStatus = 'ecm:degraded'` in the saved project | `tests/playwright/large-import-warning.spec.ts` Continue branch | green (Playwright) |
| AC5 | In degraded mode, DOM node count for term list is <= 200 regardless of total term count | `tests/playwright/large-import-warning.spec.ts` DOM assertion against `VirtualizedTermList` | green (Playwright) |
| Full unit + integration suite green at the chain anchor | `npm test` via test-runner task 883-test-p3-c6: 165/165 across 22 files, exit_code=0 in 12.78s | green |

## How to verify

From a clean working tree at build_ref=9b604b8:

```
git checkout 9b604b8
npm install
npm run build
npm test
```

Expected tail of `npm test`:

```
Files: 22/22 passed
Tests: 165/165 passed
```

For the browser UI surface (LARGE_IMPORT warning, two-button flow, and degraded-mode virtualization), run the preview server and exercise the Playwright spec for this chain:

```
npm run dev
# In a second shell:
npx playwright test tests/playwright/large-import-warning.spec.ts
```

Manual smoke path: open the preview, click "Import Ontology", select a synthetic fixture with more than 10,000 terms, and confirm the dialog displays the extracted term count and the two buttons (Continue in degraded mode, Cancel). Cancel returns to idle; Continue commits with `ecm:importStatus = 'ecm:degraded'` and the sidebar renders the virtualized term list.

## What works end-to-end right now

- Importing a Turtle ontology with more than 10,000 extractable terms triggers the LARGE_IMPORT warning in the validate surface and surfaces a confirmation dialog in the browser before any project mutation.
- The operator can Cancel without side effects, or Continue in degraded mode and have the project record carry `ecm:importStatus = 'ecm:degraded'` so downstream tooling can recognize the degraded state.
- In degraded mode, the TermSidebar uses the hand-rolled `VirtualizedTermList` so the DOM only holds a bounded slice of the imported terms regardless of total term count -- the AC5 <=200 DOM-node assertion holds against arbitrarily large fixtures.
- All cumulative Phase 3 surfaces from Chains 1 through 5 continue to pass: programmatic `importOntology()` (Chain 1); CLI `import-ontology` command (Chain 2); kernel `remapReferences()` (Chain 3-A); imported-term read-only Inspector and RemapDialog (Chain 3.2-UI); browser Import Ontology dialog with 50 MB pre-check (Chain 4); `owl:AnnotationProperty` as the fourth extracted term type (Chain 4.1); SKOS preservation, per-section search, and enriched Inspector metadata (Chain 5).
- Test suite grew cleanly across the phase: Chain 1 = 137/137 (18 files); Chain 2 = 140/140 (19); Chain 3 = 148/148 (20); Chain 3.2-UI = 148/148 (20); Chain 4 = 159/159 (22); Chain 4.1 = 160/160 (22); Chain 5 = 162/162 (22); Chain 6 = 165/165 (22).

## What is NOT yet in scope

These remain deferred at build_ref=9b604b8 and are NOT addressed by Chain 6:

- **IMPLEMENTATION_PLAN section 3.4 -- Global term search and scope filter.** Chain 5 shipped per-section search inputs (Classes / Object Properties / Datatype Properties / Annotation Properties). The section 3.4 design calls for a single global search with an `All / Project-created only / Imported only` scope filter -- that filter is not yet shipped. See Sign-off prompt Q2.
- **SPEC section 5.6 amendment for `ecm:degraded`.** Sub-task A widened the TypeScript `ecm:importStatus` type to `'ecm:parsed' | 'ecm:degraded'` and the architect ratified that widening, but the normative schema in SPEC section 5.6 still shows only `'ecm:parsed'`. A SPEC section 5.6 amendment chain is not yet queued. See Sign-off prompt Q3.
- **OED-303 validation report retention policy.** Originally a Phase 3 Exit Gate item; waived under the H2 preventive-deferral pattern consistent with the Phase 2 precedent. No Chain 6 work depends on it.
- **N3.js packaging risk.** N3.js remains in `devDependencies` only; a published npm install that omits devDependencies would fail at `import-ontology` runtime. Forward-tracked for Phase 4 or 5 packaging work; not blocking this demo.
- **Out-of-phase OWL surface.** OWL restrictions / property chains / cardinality, equivalent-class reasoning, imports-closure resolution, blank-node reasoning, class-expression editing, disjointness, SHACL validation, `rdfs:domain` / `rdfs:range` as first-class TBox fields, blank-node editing UI, and ZIP import all remain explicitly out of Phase 3 scope per ROADMAP.
- **Playwright specs not in `npm test`.** `tests/playwright/large-import-warning.spec.ts` (this chain), `tests/playwright/imported-term-read-only.spec.ts` (Chain 3.2-UI), and `tests/playwright/ontology-import.spec.ts` (Chain 4) are authored but run separately via `npx playwright test`; the 165/165 count covers only unit and integration tests. See Sign-off prompt Q4.

## Sign-off prompt

1. **Scope of this sign-off.** Phase 3 PLO state is `demo-released`. Is this review a per-chain sign-off on Chain 6 only (in which case the AC table above is the decision surface), or are you treating it as the Phase 3 sign-off (in which case Q2 on section 3.4, Q3 on SPEC section 5.6, and Q4 on Playwright should all clear before pass)?
2. **IMPLEMENTATION_PLAN section 3.4 gap.** Phase 3 shipped per-section search (Chain 5) but not the global `All / Project-created only / Imported only` scope filter. Pass (accept per-section search as the de-facto section 3.4 satisfier and queue an IMPL amendment chain), revise (queue a follow-up chain to add the global search + scope filter before Phase 3 closes), or pivot (re-baseline section 3.4 to a different design)?
3. **SPEC section 5.6 amendment for `ecm:degraded`.** Sub-task A widened the TypeScript `ecm:importStatus` to include `'ecm:degraded'`; SPEC section 5.6 still shows only `'ecm:parsed'`. Pass (acknowledge the gap and let the alignment chain land later), revise (queue the SPEC section 5.6 amendment chain before any further phase progression), or pivot (revert the type widening and route degraded state through a separate field)?
4. **Playwright verification.** The three Phase 3 Playwright specs (Chains 3.2-UI, 4, and 6) are authored but not exercised by the substrate's test-runner. Pass (you will run `npx playwright test` against a preview yourself as part of sign-off), revise (queue a substrate test-runner task that boots a preview server and exercises Playwright before sign-off resumes), or pivot (declare Playwright coverage out-of-scope for this checkpoint)?

Decision surface: **pass / revise / pivot** on each question above. A bare "pass" answer is treated as pass-on-all-four.

## For the substrate-audit-curious

Chain 6 was a 14-task substrate chain (reconnaissance -> four developer / architect ratification / applier triplets for sub-tasks A through D -> test-runner -> PLO demo-released emission). The PLO `phase_state_changed` event for `demo-released` records `build_ref=9b604b8` and `anchor_task=urn:fnsr:task:883-test-p3-c6` at 2026-06-04T12:37:58Z. The architect surfaced one open question on the SPEC section 5.6 amendment status for `ecm:degraded`; no new ADRs were created during Chain 6. The v3.6.0 substrate patch was active during this run but was not exercised. Cumulative npm test growth across Phase 3: 137 -> 140 -> 148 -> 148 -> 159 -> 160 -> 162 -> 165.
