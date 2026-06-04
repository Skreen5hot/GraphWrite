# Phase 3 Chain 5 Demo -- Polish (SKOS, per-section search, enriched Inspector)

Phase 3 (Ontology Import and Term Management) reached its fifth chain landing at build_ref=610c0de on 2026-06-04. The Polish chain closes two forward-tracks opened during Chain 4 review: ft-821-test-p3-c4-1 (sidebar max-height + per-section search) and ft-821-test-p3-c4-2 (Inspector enriched metadata + SKOS preservation in the importer). This demo doc is scoped to the Polish chain alone; Phase 3 PLO state is `demo-released`, not `po-satisfied`, and several Phase 3 Exit Gate items remain explicitly out of scope (see below).

## What this chain delivers

Three sub-tasks landed end-to-end through the standard Pass 2a / Pass 2b discipline.

**Sub-task A -- SKOS preservation in the Turtle importer** (`src/import/turtle-import.ts`)

- New constants `SKOS_DEFINITION` (`http://www.w3.org/2004/02/skos/core#definition`) and `SKOS_SCOPE_NOTE` (`http://www.w3.org/2004/02/skos/core#scopeNote`) added alongside the existing RDFS block.
- `ImportedTermObject` extended with optional `skos:definition?: { readonly text: string; readonly lang: string }` and `skos:scopeNote?: { readonly text: string; readonly lang: string }`, mirroring the `rdfs:label` `{text, lang}` shape from ADR-008.
- Quad-capture branches collect SKOS literals into `termDefinitions` and `termScopeNotes` maps and attach them to each emitted `ImportedTermObject`.

**Sub-task B -- Per-section search and scrollable lists in TermSidebar** (`src/ui/TermSidebar.tsx`, `src/ui/App.css`)

- `TermSection` rewritten with a local `searchQuery` `useState` per section; case-insensitive filter on resolved label OR IRI substring.
- New empty-state branch renders "No matches for ..." when the filter excludes every term.
- New CSS class `gw-term-section-list` (`max-height: 12rem; overflow-y: auto`) and `gw-term-section-search` rule.
- Four new test-ids: `gw-term-section-search-classes`, `gw-term-section-search-object-properties`, `gw-term-section-search-datatype-properties`, `gw-term-section-search-annotation-properties`.

**Sub-task C -- Enriched Inspector metadata sections** (`src/ui/Inspector.tsx`)

- Term-mode branch renders three sections from the selected `ImportedTermObject`:
  - `gw-inspector-term-definition` (skos:definition)
  - `gw-inspector-term-comment` (rdfs:comment)
  - `gw-inspector-term-scope-note` (skos:scopeNote)
- BCP-47 lang tag is displayed when non-empty for the SKOS fields.
- Sections are conditionally absent when the underlying field is absent on the term.

## Acceptance criteria

| AC | What proves it | SPEC / IMPL reference | Status |
|---|---|---|---|
| AC8: skos:definition preserved as `{text, lang}` | `tests/import-turtle.test.ts` AC8 section + `SKOS_TTL` inline fixture | IMPL section 3.1 (extension); SPEC section 14.1 trails | green |
| AC9: skos:scopeNote preserved as `{text, lang}` | `tests/import-turtle.test.ts` AC9 section + `SKOS_TTL` inline fixture | IMPL section 3.1 (extension); SPEC section 14.1 trails | green |
| Per-section search filters classes / object props / datatype props / annotation props | `tests/import-turtle.test.ts` + manual UI verification at four test-ids above | IMPL section 3.4 (per-section variant; see Sign-off prompt Q2) | green |
| Sidebar term lists scroll independently with bounded height | `gw-term-section-list` CSS rule + manual UI verification | ft-821-test-p3-c4-1 | green |
| Inspector renders skos:definition / rdfs:comment / skos:scopeNote when present | Architect ratification 856-rat-p3-c5-C accepted the three test-ids and lang-tag display rules | ft-821-test-p3-c4-2; SPEC section 26 (UI layout) | green |
| Full suite green at the chain anchor | `npm test` via test-runner task 858-test-p3-c5: 162/162 across 22 files, exit_code=0 | (substrate gating) | green |

## How to verify

From a clean working tree at build_ref=610c0de:

```
git checkout 610c0de
npm install
npm run build
npm test
```

Expected tail of `npm test`:

```
Files: 22/22 passed
Tests: 162/162 passed
```

For the browser UI surface (per-section search + enriched Inspector), run the preview server and open the Import Ontology dialog with the bundled fixture:

```
npm run dev
# In the UI: click "Import Ontology", select tests/playwright/fixtures/sample-ontology.ttl,
# confirm preview, then exercise the four per-section search inputs in the TermSidebar
# and click an imported term to see the Inspector definition / comment / scope-note sections.
```

## What works end-to-end right now

- Importing a Turtle file with `skos:definition` and `skos:scopeNote` literals preserves them on the resulting `ImportedTermObject` records as `{text, lang}` objects, alongside the existing `rdfs:label` and `rdfs:comment` capture from Chain 1.
- The TermSidebar exposes four independent search inputs (one per section: Classes, Object Properties, Datatype Properties, Annotation Properties) and each section list scrolls within its own bounded viewport instead of stretching the whole sidebar.
- Selecting an imported term in the Inspector renders any combination of its definition / comment / scope-note metadata, with BCP-47 lang tags shown when non-empty for the SKOS fields, and sections cleanly omitted when the underlying field is absent.
- All cumulative Phase 3 surfaces from Chains 1-4.1 continue to pass: CLI `import-ontology` command (Chain 2), `remapReferences()` kernel (Chain 3-A), imported-term read-only Inspector + RemapDialog (Chain 3.2-UI), browser Import Ontology dialog with 50 MB pre-check (Chain 4), `owl:AnnotationProperty` as the fourth extracted term type (Chain 4.1).

## What is NOT yet in scope

These remain deferred at build_ref=610c0de and are NOT addressed by Chain 5:

- **IMPL section 3.3 -- Large-Import Handling.** No `LARGE_IMPORT` warning for fixtures over 10,000 terms; no degraded mode with virtualized term list (DOM count <= 200); no "Continue in degraded mode" dialog.
- **IMPL section 3.4 -- Global term search + scope-filter.** The Polish chain ships per-section search, which is structurally different from the section 3.4 design (single global input with All / Project-created only / Imported only filter). Architect banking B2 on task 853-rat-p3-c5-B flagged this scope-drift; see Sign-off prompt Q2.
- **OED-303 validation report retention policy.** Open as a Phase 3 Exit Gate item.
- **Phase 3 Exit Gate items 3, 5, 7, 8, 9, 11.** Including LARGE_IMPORT fixture, term search and filter Playwright coverage, OED-303 closure, Phase 1 golden file refresh, Phase 2 acknowledgement-persistence re-verification, and the section 30 Risk 2 mitigation.
- **Canonical-doc text alignment for AnnotationProperty and SKOS.** SPEC section 14.1 and IMPL section 3.1 do not yet enumerate `owl:AnnotationProperty` (Chain 4.1 gap) or any SKOS vocabulary (Chain 5 gap). The implementation is correct; the canonical text trails it. A separate ratification chain is not yet queued; see Sign-off prompt Q3.
- **Playwright specs not in `npm test`.** `tests/playwright/imported-term-read-only.spec.ts` (AC1+AC2) and `tests/playwright/ontology-import.spec.ts` (AC1-AC6) are authored but run separately via `npx playwright test` against a preview server; the substrate test-runner has not exercised them at this checkpoint. See Sign-off prompt Q4.

## Sign-off prompt

1. **Scope of this sign-off.** Phase 3 PLO state is `demo-released`. Is this review a per-chain sign-off on the Polish chain only (in which case the AC table above is the decision surface), or are you treating it as a full Phase 3 sign-off (in which case the Exit Gate items 3 / 5 / 7 / 8 / 9 / 11 above must be addressed before pass)?
2. **IMPL section 3.4 scope-drift.** Chain 5 sub-task B ships per-section search instead of the section 3.4 global-search + scope-filter design. Pass (accept per-section search as the section 3.4 satisfier and queue an IMPL section 3.4 amendment chain), revise (queue a follow-up chain to add the global-search input on top of per-section search), or pivot (re-baseline section 3.4 to a different design)?
3. **Canonical-doc text gaps.** SPEC section 14.1 and IMPL section 3.1 do not enumerate `owl:AnnotationProperty` or SKOS vocabulary even though the code extracts and preserves them. Pass (acknowledge the gap as forward-tracked and let the alignment chain land later), revise (queue the SPEC + IMPL alignment chain before any further phase progression), or pivot (treat the implementation as out-of-scope and revert AnnotationProperty / SKOS support)?
4. **Playwright verification.** The two new Playwright specs from Chains 3.2-UI and 4 are authored but not exercised by the substrate's test-runner. Pass (you will run `npx playwright test` against a preview yourself as part of sign-off), revise (queue a substrate test-runner task that boots a preview server and exercises Playwright before sign-off resumes), or pivot (declare Playwright coverage out-of-scope for this checkpoint)?

Decision surface: **pass / revise / pivot** on each question above. A bare "pass" answer is treated as pass-on-all-four.

## For the substrate-audit-curious

Chain 5 was three sub-task triplets (developer -> architect ratification -> applier), gated by reconnaissance tasks 804 and 848, and closed by test-runner task 858-test-p3-c5. The architect surfaced one banking (B2 on 853-rat-p3-c5-B) flagging the IMPL section 3.4 scope-drift; no new ADRs were created during Chain 5. Build_ref=610c0de is the head commit at the demo-released audit event for phase-3.
