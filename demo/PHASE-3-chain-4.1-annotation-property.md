# Phase 3 Chain 4.1 Demo -- owl:AnnotationProperty Import

Phase 3 (Ontology Import and Term Management) shipped its main browser workflow at Chain 4 (build_ref `0b3a424`). Chain 4.1 is a focused gap-closure patch on top of that: when Aaron tested the Chain 4 browser import against BFO on 2026-06-04, terms typed `owl:AnnotationProperty` (for example `dc11:contributor`, `dc11:identifier`) were silently dropped by the engine. Every downstream layer was already prepared to receive them; only the importer was missing the rdf:type branch. Chain 4.1 adds that branch and brings the cumulative test gate to 160/160.

This doc is a companion to [PHASE-3-chain-4-browser-import.md](PHASE-3-chain-4-browser-import.md); read that one first for the surrounding browser-import context.

## What this chain delivers

The importer at [`src/import/turtle-import.ts`](../src/import/turtle-import.ts) now extracts `owl:AnnotationProperty` as a first-class term type alongside `owl:Class`, `owl:ObjectProperty`, and `owl:DatatypeProperty`. The change is seven coordinated edits across two files:

- `src/import/turtle-import.ts` (4 edits):
  - `OWL_ANNOTATION_PROP` constant
  - `ImportedTermType` union extension to include `'owl:AnnotationProperty'`
  - new `else if` branch on the `rdf:type` switch
  - module-level JSDoc update naming the four supported types
- `tests/import-turtle.test.ts` (3 edits):
  - AC7 file-header declaration
  - `ANNOTATION_PROP_TTL` inline fixture
  - AC7 test block asserting that `owl:AnnotationProperty` declarations land as terms with the correct type

No UI changes were needed. `TermSidebar.tsx` (line 327) already renders a `gw-term-section-annotation-properties` section that partitions on `t.type === 'owl:AnnotationProperty'`; before Chain 4.1 it was always empty because the engine never emitted the type. Likewise `EcmTermType` in `src/validate/starter-terms.ts` and `SEMANTIC_TYPE_ALLOWLIST` in `src/projection/index.ts` already accepted the type.

## Acceptance criteria

| AC | What proves it | Reference | Status |
|---|---|---|---|
| AC7: importer extracts `owl:AnnotationProperty` declarations as terms with `type='owl:AnnotationProperty'` | `tests/import-turtle.test.ts` AC7 block against `ANNOTATION_PROP_TTL` fixture | SPEC section 5.7 (allowed term-type values) | green |
| Existing AC1-AC6 (Chain 1 importer behavior) still pass | `tests/import-turtle.test.ts` (full suite) | SPEC section 14.1; IMPLEMENTATION_PLAN section 3.1 | green |
| Downstream consumers handle the new type cleanly (no projection / validation / sidebar regressions) | `tests/semantic-projection.test.js`, `tests/starter-terms.test.js`, full unit suite | SPEC section 5.7; section 13.3 | green |
| Phase 3 cumulative test gate: `npm test` zero failures | anchor task `841-test-p3-c4.1-tsfix` -- 160/160 tests across 22 files; exit_code=0 | IMPLEMENTATION_PLAN Phase 3 Exit Gate item 10 | green |

The `159/159` from Chain 4 increments by exactly one new AC7 test, yielding `160/160`. All other tests are unchanged.

## How to verify

From the repo root at build_ref `7475066`:

```
npm install
npm run build
npm test
```

Expected tail of `npm test`:

```
Files: 22/22 passed  Tests: 160/160 passed
```

To exercise the BFO regression manually (the originating scenario):

```
npm run dev
# open the served URL; create or open a project;
# click the Import Ontology header button;
# attach a .ttl file containing owl:AnnotationProperty declarations
# (for example, dc11:contributor a owl:AnnotationProperty; dc11:identifier a owl:AnnotationProperty);
# confirm the import;
# verify the sidebar 'Annotation Properties' section now lists those terms
# (rendered aria-disabled='true' as imported, like other imported terms).
```

## What works end-to-end right now

- Importing a Turtle file containing `<iri> a owl:AnnotationProperty` triples produces `ImportedTermObject` entries with `type='owl:AnnotationProperty'`.
- The sidebar 'Annotation Properties' section (`gw-term-section-annotation-properties`) populates instead of staying empty.
- BFO and similarly structured ontologies that lean on Dublin Core annotation properties (`dc11:contributor`, `dc11:identifier`, and so on) round-trip through the import flow without silent drops.
- All four allowed term types from SPEC section 5.7 are now produced by the importer: `owl:Class`, `owl:ObjectProperty`, `owl:DatatypeProperty`, `owl:AnnotationProperty`.
- Chain 4's browser dialog, Chain 3.2's read-only Inspector and Remap dialog, Chain 2's CLI command, and Chain 1's pure engine are all unaffected and remain green.

## What is NOT yet in scope

The following items are explicitly **not** delivered at build_ref `7475066` and should not be reviewed as part of this chain:

- **SPEC section 14.1 canonical-doc update.** The SPEC extraction-scope text and IMPLEMENTATION_PLAN section 3.1 sub-task list do not yet enumerate `owl:AnnotationProperty`. The code is correct; the canonical-doc text trails it and needs a separate ratification chain to align.
- **Playwright end-to-end coverage of annotation-property import.** Only the AC7 unit test landed in this chain. A Playwright spec asserting that a `.ttl` with `owl:AnnotationProperty` triples populates the sidebar section in the browser was not authored here.
- **IMPLEMENTATION_PLAN section 3.3 Large-Import Handling.** The `LARGE_IMPORT` warning at > 10,000 terms and the virtualized-list degraded mode are still deferred.
- **IMPLEMENTATION_PLAN section 3.4 Term Search and Filter UI.** Substring search and the `All / Project-created / Imported only` scope filter are still deferred. Sidebar ergonomic improvements (per-section max-height + per-section search) are forward-tracked as `ft-821-test-p3-c4-1` per Aaron's 2026-06-04 explicit deferral.
- **Inspector enriched-metadata display** -- preserving and rendering `skos:definition`, `rdfs:comment`, `skos:scopeNote` for imported terms is forward-tracked as `ft-821-test-p3-c4-2` per Aaron's 2026-06-04 explicit deferral.
- **OED-303 (Validation report retention policy).** Still open as a Phase 3 exit-gate item.
- **Phase 3 Exit Gate items 3, 5, 7, 8, 9, 11.** Large-import warning verification, term search/filter, OED-303 closure, Phase 1 golden-file updates, Phase 2 acknowledgement-persistence re-verification, and Risk 2 degraded-mode work are all separate before phase close.
- The Phase 3 'NOT in scope' list from ROADMAP still stands: OWL restrictions, property chains and cardinality, equivalent-class reasoning, subsumption inference, imports-closure resolution, blank-node reasoning, class-expression editing, disjointness, consistency checking, `rdfs:domain` / `rdfs:range` as first-class TBox fields, SHACL validation, blank-node editing UI, and ZIP import.

## Sign-off prompt

Please review and respond:

1. Does the owl:AnnotationProperty extraction match what you expected after the 2026-06-04 BFO test? Specifically: do `dc11:contributor` / `dc11:identifier` and similar annotation-typed terms now appear in the sidebar 'Annotation Properties' section when you import the same `.ttl` you tested on Chain 4?
2. Are you satisfied that the SPEC section 14.1 and IMPLEMENTATION_PLAN section 3.1 canonical-doc text trails the code and will be aligned in a separate ratification chain, rather than blocking this checkpoint?
3. Are you satisfied treating sidebar ergonomic UX (`ft-821-test-p3-c4-1`) and Inspector enriched metadata (`ft-821-test-p3-c4-2`) as forward-tracked deferrals to a later phase, given the AC7 unit test alone covers the BFO regression?
4. Verdict: **pass** (advance Phase 3 toward po-satisfied), **revise** (specify what to change at this checkpoint), or **pivot** (specify the alternative direction)?

## For the substrate-audit-curious

Chain 4.1 went through one mojibake-induced apply failure and a brief-confirmation recovery chain. The original developer task `833-dev-p3-c4.1` emitted seven changes; the first applier `835-apply-p3-c4.1` landed five (C1, C3, C5, C6, C7) but reported `before_not_found` on C2 and C4 because the developer's `before`-snippet strings included single-byte UTF-8 codepoints that disk had as cp1252-UTF8 double-encoded bytes. Fixer `837` diagnosed the encoding mismatch; developer `839-dev-p3-c4.1-tsfix` re-targeted just C2 and C4 with disk-exact byte-strings; applier `840-apply-p3-c4.1-tsfix` landed both cleanly; anchor test `841-test-p3-c4.1-tsfix` reported 160/160 with exit_code=0. Task `835-apply-p3-c4.1` remains `status=blocked` in the audit chain as a truthful record of the original failure; the brief-confirmation cycle resolved the substantive work.

The full audit trail is in [state.jsonld](../state.jsonld). The phase-state transition to `demo-released` was emitted on task `841` with `build_ref='7475066'` and notes referencing both forward-tracks.
