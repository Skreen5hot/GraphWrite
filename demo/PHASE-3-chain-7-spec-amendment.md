# Phase 3 Chain 7 Demo -- SPEC section 5.6 amendment for ecm:degraded

## Stakeholder framing

This chain is a documentation-only follow-up to Chain 6. Your Q3 REVISE verdict on the Chain 6 sign-off flagged that the TypeScript `ecm:importStatus` union had been widened to `'ecm:parsed' | 'ecm:degraded'` but the normative example in `project/SPEC.md` section 5.6 still showed only `'ecm:parsed'`. Chain 7 closes that doc-vs-code gap with a single edit. Phase 3 PLO state at build_ref=60044f7 is `demo-released` (second `demo-released` transition on phase-3; first was Chain 6 at 9b604b8).

## What this chain delivers

A single edit to `project/SPEC.md` section 5.6 adding a closed-enumeration prose block immediately after the existing `ecm:content` sentence. The block names both permitted values of `ecm:importStatus` with semantic definitions:

- `"ecm:parsed"` -- normal import; extracted term count at or below `LARGE_IMPORT_THRESHOLD` (10,000 terms; see section 14.2).
- `"ecm:degraded"` -- user selected "Continue in degraded mode" at the import warning dialog (IMPLEMENTATION_PLAN section 3.3 AC4); the ontology record is stored with partial extraction and search-only navigation applies.

The block also cites `src/import/turtle-import.ts` (`ImportedOntologyRecord`) as the type-defining location.

No code files changed. No new tests added. 165/165 npm tests stay green.

## Acceptance criteria

| AC | What proves it | Reference |
|---|---|---|
| SPEC section 5.6 documents both `ecm:importStatus` values | Post-amendment `project/SPEC.md` lines 445-449 contain the closed-enumeration block | project/SPEC.md section 5.6 |
| Citations in the amendment are consistent with canonical sources | verification-ritual-llm Cat 9 judge: section 14.2 `LARGE_IMPORT_THRESHOLD` value verified consistent; IMPLEMENTATION_PLAN section 3.3 AC4 wording verified consistent; `overall_status: pass` | task 909-verify-llm-p3-c7-v4 |
| Pass 2a ratification clean | architect ruling `ratified`, editorial_verdict `editorial` | task 910-rat-p3-c7-v4 |
| No regression introduced | 165/165 npm tests pass at build_ref=60044f7; no code files touched | task 911-apply-p3-c7-v4 PLO notes |

All four criteria are green.

## How to verify

```
git fetch
git checkout 60044f7
npm install
npm test
```

Expected output tail: `Tests  165 passed (165)` across 22 test files. Then open `project/SPEC.md` and scroll to section 5.6; confirm the closed-enumeration block listing `ecm:parsed` and `ecm:degraded` immediately follows the `ecm:content` sentence.

## What works end-to-end right now

Cumulatively Phase 3 (Chains 1 through 7) delivers:

- Turtle import engine: `importOntology()` at `src/import/turtle-import.ts` (Chain 1)
- CLI `import-ontology` command (Chain 2)
- Kernel `remapReferences()` function + UI immutability + RemapDialog (Chain 3 / 3.2-UI)
- Browser `ImportOntologyDialog` with imported-term read-only UI (Chain 4)
- `owl:AnnotationProperty` extraction (Chain 4.1)
- SKOS preservation + per-section sidebar search + enriched Inspector metadata (Chain 5)
- `LARGE_IMPORT_THRESHOLD` warning + hand-rolled virtualized degraded mode (Chain 6)
- SPEC section 5.6 `ecm:importStatus` enumeration documentation now matches the shipped TypeScript surface (Chain 7)

Test progression across Phase 3 (npm test only; Playwright runs separately): 137 -> 140 -> 148 -> 148 -> 159 -> 160 -> 162 -> 165 -> 165.

## What is NOT yet in scope

- **IMPLEMENTATION_PLAN section 3.4 global scope filter** (`All` / `Project-created only` / `Imported only`). Chain 5 shipped per-section search only; the global scope filter has not been queued.
- **SPEC section 14.2 companion amendment** adding a cross-reference to section 5.6's `ecm:importStatus` enumeration. Deferred per developer-889 open question 1.
- **IMPLEMENTATION_PLAN section 3.1 caller-override note** documenting how the UI applies `"ecm:degraded"` as a spread-override after `importOntology()` returns. Deferred per developer-889 open question 2.
- **OED-303 validation report retention** -- waived under H2 preventive-deferral; Exit Gate items 7/8/9 are waived rather than satisfied.
- **N3.js devDependencies packaging risk** -- forward-tracked to Phase 4/5.
- **Playwright specs** (`imported-term-read-only.spec.ts`, `ontology-import.spec.ts`, `large-import-warning.spec.ts`) -- authored but NOT exercised by `npm test`; require separate `npx playwright test` invocation.
- **Out-of-phase OWL surface**: restrictions, property chains, cardinality, equivalent-class reasoning, imports-closure, blank-node reasoning, SHACL, ZIP import, `rdfs:domain` / `rdfs:range` as TBox fields. All deferred to later phases per ROADMAP.

Phase 3 Exit Gate items 1, 2, 3, 4, 6, 10, 11 are satisfied; item 5 (term search and filter) is partially satisfied (per-section search; no global scope filter); items 7/8/9 are waived.

## Sign-off prompt

1. **Q1.** Does the SPEC section 5.6 closed-enumeration block close the doc-vs-code gap your Chain 6 Q3 REVISE verdict flagged? (If yes, the surfaced REVISE is resolved.)
2. **Q2.** Are the two deferred companion amendments (SPEC section 14.2 cross-reference; IMPLEMENTATION_PLAN section 3.1 caller-override note) acceptable to leave for a follow-on single-file chain, or should one or both be queued before `po-satisfied`?
3. **Q3.** With Phase 3 Exit Gate items 1-4, 6, 10, 11 satisfied and item 5 partially satisfied (per-section search only; no global scope filter), is Phase 3 ready for a `po-satisfied` declaration now, or do you want IMPLEMENTATION_PLAN section 3.4 (global scope filter) queued first?

Decision surface: **pass** (declare `phase po-satisfied phase-3`), **revise** (queue specified companion amendments or the section 3.4 scope filter and re-emit `demo-released` after they land), or **pivot** (redirect Phase 3 in a different direction before sign-off).

## For the substrate-audit-curious

The Chain 7 Pass 2a chain followed the v2.8.0 canonical shape: reconnaissance (888) -> verification-ritual deterministic (906) -> verification-ritual-llm Cat 9 (909) -> architect ratification (910) -> applier commit-finalize (911). Cat 9 verified two citations (SPEC section 14.2 `LARGE_IMPORT_THRESHOLD` value; IMPLEMENTATION_PLAN section 3.3 AC4 verbatim wording) as `overall_status: pass`; zero vetoes, so no adversarial-critic second-pass fired. One stylistic note for future doc-amendment chains: the section 5.6 block includes a non-canonical code citation to `src/import/turtle-import.ts` (`ImportedOntologyRecord`) inside SPEC prose. This is outside Cat 9 canonical-doc scope and was ratified as-is; it is unusual for SPEC prose but harmless.