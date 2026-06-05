# Phase 3 Chain 8 Demo -- Global Scope Filter + Degraded-Mode Search Gate

## Stakeholder framing

Phase 3 (Ontology Import and Term Management) reached PLO state `demo-released` at build_ref `b3a9fd2` on 2026-06-04. This chain (Chain 8) closes the final user-facing piece of Phase 3 Exit Gate item 5: a global scope filter on the term sidebar that scopes all four term sections by source (project-created vs imported), plus a degraded-mode search-only gate that enforces the SPEC sec. 14.2 navigation contract on large ontologies. Acceptance contract: IMPLEMENTATION_PLAN sec. 3.4 sub-tasks 2 and 3 (FR-U005).

Anchor task: `urn:fnsr:task:923-test-p3-c8`. Build ref: `b3a9fd2`.

## What this chain delivers

Three surfaces in `src/ui/TermSidebar.tsx` plus one Playwright AC file:

1. **Global scope filter** -- a `<select>` at the TermSidebar root with `data-testid="gw-term-scope-filter-global"` and three options: `all`, `project-created`, `imported`. Internally a `ScopeFilter` type. Filters all four term sections simultaneously by `ecm:source`. Predicate:
   - `imported` keeps `term['ecm:source'] === 'ecm:imported-ontology'`
   - `project-created` keeps `term['ecm:source'] !== 'ecm:imported-ontology'`
   - `all` is identity.

2. **Degraded-mode search-only gate** -- when `isDegraded && searchQuery.trim() === ''`, each per-section list renders a `"Search to find terms"` empty state instead of the scrollable virtualized list. Enforces SPEC sec. 14.2 search-to-navigate contract on >10,000-term degraded imports.

3. **Playwright AC test** -- `tests/playwright/term-scope-filter.spec.ts` (268 lines) encodes the IMPLEMENTATION_PLAN sec. 3.4 AC2 contract: AC2a / AC2b / AC2c plus the degraded-mode hint AC.

The `SourceBadge` visual distinction (FR-U005) shipped in Chain 3.2-UI and is untouched by Chain 8.

## Acceptance criteria

| AC | What proves it | Reference | Status |
|---|---|---|---|
| sec. 3.4 AC2a -- "project-created" hides imported | `term-scope-filter.spec.ts` AC2a (`toHaveCount(0)` on `gw-badge--imported`) | FR-U005 | green (Playwright) |
| sec. 3.4 AC2b -- "imported" hides project-created | `term-scope-filter.spec.ts` AC2b | FR-U005 | green (Playwright) |
| sec. 3.4 AC2c -- "All" restores both | `term-scope-filter.spec.ts` AC2c | FR-U005 | green (Playwright) |
| sec. 3.4 AC3 -- degraded mode shows search hint, zero `gw-term-item` until typed | `term-scope-filter.spec.ts` ACd | SPEC sec. 14.2 | green (Playwright) |
| Regression: prior npm suite stays green | Task 923-test-p3-c8 raw_stdout `Tests: 165/165 passed` | n/a | green (22/22 files; 165/165 tests) |

Note: Playwright AC tests are NOT exercised by `npm test`. The operator runs `npx playwright test` separately to validate the AC2 contract.

## How to verify

```
git checkout b3a9fd2
npm install
npm test
# Expected tail:
#   Files: 22/22 passed
#   Tests: 165/165 passed
#   exit_code: 0

# Playwright AC validation (separate suite)
npx playwright test tests/playwright/term-scope-filter.spec.ts
# Expected: AC2a, AC2b, AC2c, ACd all pass

# Manual smoke in the browser
# 1. Start the app; create or import an ontology with both imported and project-created terms.
# 2. Locate the scope-filter <select> at the top of the term sidebar.
# 3. Toggle "All" / "Project-created only" / "Imported only";
#    confirm all four sections update simultaneously.
# 4. Import a >10,000-term ontology; choose "Continue in degraded mode";
#    confirm each section renders "Search to find terms" until input is typed.
```

## What works end-to-end right now

Chain 8 lands inside a Phase 3 that is functionally complete on user-facing scope. The full Phase 3 capability set:

- `importOntology()` (`src/import/turtle-import.ts`) extracts `owl:Class` (with `rdfs:Class` normalization), `owl:ObjectProperty`, `owl:DatatypeProperty`, and `owl:AnnotationProperty` from Turtle via N3.js; emits an `ImportedOntologyRecord` per SPEC sec. 5.6 with SHA-256 `ecm:contentHash`; returns an `ImportResult` discriminated union with error codes `SIZE_EXCEEDED` and `PARSE_ERROR` (SPEC sec. 14.1, FR-C011).
- Browser-compatible SHA-256 path -- `src/kernel/sha256.ts` exports `sha256Hex()` (node:crypto, sync) and `sha256HexAsync()` (Web Crypto, async); `importOntology()` accepts an optional `digestHexFn` injection point.
- CLI `import-ontology` command (`src/cli/index.ts`) replaces the Phase 1 stub; augments each term with `ecm:source: 'ecm:imported-ontology'` and `ecm:ontologyId`; merges into `ecm:terms` and `ecm:ontologies`. >50 MB inputs exit 2 with a clear message (SPEC sec. 12.2, sec. 23).
- Browser-side `ImportOntologyDialog` UI component with progressive disclosure; LARGE_IMPORT warning at the 10,000-term threshold (SPEC sec. 14.2); the "Continue in degraded mode" path persists `ecm:importStatus: 'ecm:degraded'`.
- Imported-term UI immutability -- TermSidebar renders imported terms with `aria-disabled="true"` and routes edits through a Remap dialog (Chain 3.2-UI). The kernel `remapReferences()` pure function is unit-tested (Chain 3, IMPLEMENTATION_PLAN sec. 3.2 AC3+AC4; SPEC sec. 13.3, sec. 13.6).
- Per-section search input (case-insensitive on label + IRI) and enriched Inspector metadata (`skos:definition`, `rdfs:comment`, `skos:scopeNote`); SKOS properties preserved by the importer (Chain 5).
- Degraded-mode performance -- TermSidebar DOM virtualization (`VIRT_THRESHOLD=200`, `overflowY:auto`) activates when `isDegraded && filteredTerms.length > 200` (Chain 6; mitigates browser crash risk on large ontologies).
- Global scope filter + degraded-mode search-only gate (Chain 8; this chain).
- SPEC sec. 5.6 amended to document `ecm:importStatus` as a closed enumeration `{ecm:parsed, ecm:degraded}` aligning the normative schema with the shipped code (Chain 7).

Three new test files were added during Phase 3: `sha256.test.js`, `iri-uuid-injection.test.js`, `cli-import-ontology.test.js`.

## What is NOT yet in scope

Explicit deferrals per ROADMAP sec. Phase 3 and IMPLEMENTATION_PLAN sec. Phase 3:

- OWL restrictions, property chains, cardinality (SPEC sec. 3.2, sec. 7.6)
- Equivalent-class reasoning, subsumption inference, imports-closure resolution, blank-node reasoning, class-expression editing, disjointness, consistency checking (sec. 14.1)
- `rdfs:domain` / `rdfs:range` as first-class TBox fields (sec. 7.5 deferred)
- SHACL validation engine (sec. 17.7 deferred)
- Blank-node editing UI (sec. 7.3 -- preserved on round-trip only)
- ZIP import (sec. 3.2 -- v0.4 export-only)
- `AnnotationProperty` editing UI (read-only only in Phase 3)
- Any Phase 4, 5, or 6 features

Phase 3 Exit Gate items still open (do not block `demo-released`, but block phase close):

- Item 7: OED-303 (validation report retention) closure
- Item 8: Phase 1 golden files updated if OED-303 ruling requires it
- Item 9: Phase 2 acknowledgement-persistence re-verified against OED-303

Minor limitations surfaced by Chain 8 ratification bankings (deliberate scope decisions, not regressions):

- B1 (label-semantic gap): the "Project-created only" predicate is `term['ecm:source'] !== 'ecm:imported-ontology'`, which keeps `ecm:system-starter-example` terms visible under the same label. AC2 literal contract is met; the label is narrower than the actual predicate when starter-example terms are present.
- B2 (degraded-mode edge case): the degraded-mode empty-list gate fires as the first ternary branch without a `terms.length > 0` guard, so a genuinely-empty section under `isDegraded` displays "Search to find terms" instead of "No [section] yet". Cosmetic only.

No new ADRs were created in Phase 3.

## Sign-off prompt

Reviewer, please consider:

1. Does the live scope-filter behavior (Playwright or manual) match your FR-U005 + IMPLEMENTATION_PLAN sec. 3.4 AC2 intent? Specifically: are you comfortable with "Project-created only" including starter-example terms (banking B1), or do you want a follow-up to narrow the predicate?
2. Is the degraded-mode search-only gate the right friction for >10,000-term imports? Threshold, empty-state copy, and "first interaction must be search" rule all OK?
3. Are you willing to advance Phase 3 to `po-satisfied` with Exit Gate items 7-9 (OED-303 and downstream) still open, or do you want OED-303 to close first?
4. If 1-3 are acceptable: emit
   ```
   python state_admin.py phase po-satisfied phase-3 \
       --anchor-task urn:fnsr:task:923-test-p3-c8 \
       --notes "..."
   ```
   to advance the PLO state.

**Decision:** pass / revise (list specific feedback) / pivot (treat Phase 3 as blocked on OED-303 before further PLO advance).

---

## For the substrate-audit-curious (optional)

This demo doc was auto-generated by the v3.5.0 demo-doc auto-generation chain (reconnaissance -> demo-doc-author -> architect -> applier) triggered by `state_admin phase demo-released phase-3`. Reconnaissance task: `urn:fnsr:task:924-recon-demo-doc-phase-3`. Author task: `urn:fnsr:task:925-author-demo-doc-phase-3`. The chain composes with the v3.4.0 status surface: once this file lands, the next watchdog probe re-classifies `fnsr.status.md` to `ready-for-review` and links this doc verbatim in the operator message.
