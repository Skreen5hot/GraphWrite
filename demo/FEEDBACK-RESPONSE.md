---
document_kind: stakeholder-feedback-response
audience: product-owner-Aaron
companion_to: demo/FEEDBACK.md
date: 2026-05-21
---

# Stakeholder Feedback Response

**Source:** demo/FEEDBACK.md (Aaron, 2026-05-21, commit 727c431)  
**Grounded by:** reconnaissance pass (task urn:fnsr:task:261-recon-feedback)  
**Status:** PROPOSAL — operator adjudicates per-item before any implementation chain is queued.

---

## Summary

17 items total: **8 accept-ready**, **5 need-amendment** (spec/FR change required first), **2 defer-recommend**, **2 operator-decision-required**.

| Classification | Count | Items |
|---|---|---|
| Accept-ready | 8 | Quick-1, Quick-2, Quick-3, Quick-4, Quick-5, C, D, K |
| Amend (spec/FR change first) | 5 | B, F, G, J, L |
| Defer-recommend | 2 | H, I |
| Operator decision required | 2 | A, E |

**Bundling note:** Quick-1, Quick-2, Quick-4, Quick-5, C, and D are all trivial CSS/label/one-line changes with no spec amendments. They can land in a single Phase 3 “UI polish” developer chain. Quick-3 and K are slightly larger and suit a second chain. Items requiring spec amendments (B, F, G, J, L) each need an operator-authored FR delta before developer chains can be queued.

---

## Per-Item Responses

### Item Quick-1: Canvas nodes missing labels

- **Feedback summary:** Aaron observed in Section 2 that canvas nodes show no visible label — only blank cards. He expected to see instance names (e.g., “Dune”, “Isaac Asimov”) rendered on each node. The demo project loaded with a visual graph present but “NO labels on the nodes.”
- **SPEC ref:** FR-U011, §15.3
- **Classification:** UI bug
- **Effort estimate:** Trivial (<2hr)
- **Dependencies:** None blocking. `Inspector.tsx` lines 91–103 already builds an `instanceLabel` map; the canvas simply never receives it.
- **Proposed resolution:** In `src/ui/CanvasView.tsx` `deriveNodes()` (lines 137–151), add label lookup: read `inst["rdfs:label"]` and include it as `data.label` in the node data bag. React Flow's default node type renders `data.label` automatically. Fallback to IRI local-name tail if label is absent. Chain shape: developer → applier. No spec amendment required.
- **Recommendation:** Accept (Phase 3 priority 1)
- **Rationale:** Confirmed UI bug with direct file evidence. The label field exists on instances (demo fixtures populate it); `deriveNodes()` simply omits it from the data bag passed to React Flow. Fix is a one-line addition. High user-facing impact, trivial risk.

---

### Item Quick-2: Edges missing directional arrowheads

- **Feedback summary:** Aaron noted in Section 2 and Section 6 that “predicate edges have no arrow head representing direction.” React Flow renders undirected lines because `deriveEdges()` produces edge objects with no `markerEnd` property. A directed graph with undirected visual edges is a core UX defect for a semantic modeling tool.
- **SPEC ref:** FR-U014 (“directed object-property relation”), §15.3
- **Classification:** UI bug
- **Effort estimate:** Trivial (<2hr)
- **Dependencies:** None.
- **Proposed resolution:** In `src/ui/CanvasView.tsx` `deriveEdges()` (lines 157–173), add `markerEnd: { type: MarkerType.ArrowClosed }` to each returned edge object. Import `MarkerType` from `@xyflow/react`. Chain shape: developer → applier.
- **Recommendation:** Accept (Phase 3 priority 1)
- **Rationale:** Direction is semantically meaningful in RDF — a subject-predicate-object triple has a definite direction. Not surfacing this visually is a semantic transparency failure per NFR-008. The fix is a single property addition; React Flow provides `MarkerType.ArrowClosed` out of the box.

---

### Item Quick-3: Inspector Subject/Object rows show raw IRIs

- **Feedback summary:** Aaron noted in Section 3: “the Subject is an IRI (no label) the predicate is a dropdown of labels (no IRI) and the Object is a IRI no label. I would like to see plain language next to IRIs in the Subject and Object section too.” The predicate row already resolves labels; Subject and Object rows do not.
- **SPEC ref:** FR-U020
- **Classification:** UI polish
- **Effort estimate:** Small (2–8hr)
- **Dependencies:** Soft dependency on Quick-1 for label availability on canvas nodes, but `resolveRelationNarration()` in `Inspector.tsx` (lines 83–129) already builds an `instanceLabel` map independently. Quick-1 does not need to land first.
- **Proposed resolution:** In `src/ui/Inspector.tsx`, extract the `instanceLabel` construction from `resolveRelationNarration()` into a shared helper (e.g., `buildInstanceLabelMap(project)`). Apply it in the relation-mode Subject and Object rows: render `label (IRI)` or just `label` with IRI as title/tooltip, falling back to the raw IRI when no label exists. Chain shape: developer → applier.
- **Recommendation:** Accept (Phase 3 priority 2)
- **Rationale:** The label resolution logic already exists in the same file; this is a refactor and application of existing logic, not new logic. The inconsistency (predicate shows label, Subject/Object show UUID strings) is noticeable and undermines the plain-language promise of FR-U020.

---

### Item Quick-4: Outputs panel fixed at 180px

- **Feedback summary:** Aaron noted in Section 12 UI notes: “the section `<div>` gw-outputs is taking up too much real estate, can we limit it to 75px.” The `.gw-outputs` rule in App.css is fixed at `height: 180px`, consuming approximately 24% of typical viewport height.
- **SPEC ref:** §26 layout (non-normative panel sizing)
- **Classification:** UI polish
- **Effort estimate:** Trivial (<2hr)
- **Dependencies:** None.
- **Proposed resolution:** In `src/ui/App.css`, change the `.gw-outputs` rule (lines 72–79) from `height: 180px` to `max-height: 75px`. Using `max-height` rather than `height` allows the panel to collapse when content is minimal while capping at Aaron’s requested ceiling. Chain shape: developer → applier.
- **Recommendation:** Accept (Phase 3 priority 3)
- **Rationale:** Single CSS property change with no state interactions. `max-height` is a slightly more robust interpretation of the request (degrades gracefully when the panel is empty) without deviating from the intent.

---

### Item Quick-5: Add-Literal dialog appears top-left instead of centered

- **Feedback summary:** Aaron noted in Section 7: “I was able to add the new literal but the popup is top left not center page.” The native `<dialog showModal()>` centering depends on the browser UA stylesheet’s `margin: auto`. The global CSS reset in App.css (`*, *::before, *::after { margin: 0 }`) overrides it, and the `dialog.gw-dialog` rule adds no margin override to restore it.
- **SPEC ref:** §26 layout (dialog positioning)
- **Classification:** UI bug
- **Effort estimate:** Trivial (<2hr)
- **Dependencies:** None. Fix is isolated to one CSS rule.
- **Proposed resolution:** In `src/ui/App.css`, add `margin: auto` to the `dialog.gw-dialog` rule (lines 257–265). This restores the native centering behavior that `showModal()` relies on. Chain shape: developer → applier. Affects all Dialog instances (AddLiteralDialog, AddTermDialog, ProjectSettingsDialog) — uniformly beneficial.
- **Recommendation:** Accept (Phase 3 priority 1)
- **Rationale:** The global CSS reset is the root cause; restoring `margin: auto` on the dialog rule is the canonical fix. The bug affects every modal in the app.

---

### Item A: Save semantics — download vs IndexedDB persistence

- **Feedback summary:** Aaron asked in Section 4: “Save = download is NOT obvious. Save should be saving to IndexedDB or Local Storage. I should then see a project menu to see saved items. I thought that was in the spec.” The current `handleSave()` in App.tsx produces a browser file download. FR-U003 as written and implemented specifies exactly this (canonical serialize → browser download as project.jsonld), but Aaron’s mental model is persistent in-browser save with a project picker UI.
- **SPEC ref:** FR-U003, IMPLEMENTATION_PLAN §2.1 (Phase 2), Phase-5 §5.3 (IndexedDBAdapter, gated on OED-302)
- **Classification:** Spec amendment
- **Effort estimate:** Large (>24hr) — IndexedDB adapter + project picker UI + stale-save detection + OED-302 closure required
- **Dependencies:** OED-302 must close before the IndexedDB adapter schema can be finalized. Full persistence is Phase 5 scope as currently spec’d.
- **Proposed resolution:** Two options for Aaron’s adjudication: **(A1)** Amend FR-U003 now to split “Save” (IndexedDB) from “Download” (file export) and pull the persistence surface into Phase 3 scope, accepting the OED-302 dependency and significant Phase 3 scope expansion. **(A2)** Rename the current “Save” button to “Download” immediately (trivial label fix, no spec amendment), leave FR-U003 as-is, and create a new FR-U032 “Save to local project store” for Phase 5 delivery. A2 is low-risk and accurately labels current behavior; A1 is the right long-term shape but requires OED-302 resolution and significant scope expansion.
- **Recommendation:** Operator decision required (A1 vs A2)
- **Rationale:** The implementation correctly matches the written spec; the spec does not match Aaron’s expectation. Neither option is a developer unilateral call. A2 is shippable immediately; A1 requires a phase scope negotiation.

---

### Item B: First-time iao:isAbout wizard

- **Feedback summary:** Aaron’s first reaction in Section 1 was confusion at the `MISSING_REALIST_ANCHOR` banner on a freshly opened project. He expected a creation-time prompt: “how about before throwing an error have a popup to select what the graph is about.” Currently `handleNew()` creates the project silently and shows a post-creation banner; no wizard step exists.
- **SPEC ref:** FR-U001, FR-U031, IMPLEMENTATION_PLAN §2.1
- **Classification:** Spec amendment (FR-U001 UX improvement)
- **Effort estimate:** Small (2–8hr)
- **Dependencies:** None blocking. Soft coordination with Item L (both involve creation-time prompts; could share a combined “New project” dialog design pattern).
- **Proposed resolution:** Amend FR-U001 to add a required creation-time `iao:isAbout` prompt step. After `buildNewDocument()`, open a modal asking “What is this graph about? (Enter a subject IRI or description)” before rendering the main UI. The wizard result sets `iao:isAbout` to the entered IRI; dismissing keeps `ecm:UnspecifiedSubjectMatter` and shows the banner as currently. Operator authors FR-U001 delta first; then: developer → applier. No implementation until spec amendment is landed.
- **Recommendation:** Amend (FR-U001 spec change needed first)
- **Rationale:** The current UX is defensible as-spec’d, but Aaron’s reaction is unambiguous: the error-on-open experience is hostile for a new user. A creation-time prompt is a better default UX pattern and aligns with the “prominent affordance” intent of FR-U031.

---

### Item C: iao:isAbout plain-language labeling

- **Feedback summary:** Aaron noted in Section 9: “This is confusing label. This is the Subject of the graph.” The ProjectSettingsDialog and banner buttons use the raw ontology shortname “iao:isAbout” and “Add subject IRI” as user-facing labels. Plain-language alternatives (“Subject”, “What is this graph about?”) would be more accessible.
- **SPEC ref:** NFR-008 (semantic transparency — surfacing concepts in plain language)
- **Classification:** UI polish
- **Effort estimate:** Trivial (<2hr)
- **Dependencies:** None. Presentational label change only; no SPEC schema amendment required. The underlying field and IRI remain `iao:isAbout`.
- **Proposed resolution:** In `src/ui/ProjectSettingsDialog.tsx` and any locations where “iao:isAbout” or “Add subject IRI” appear as primary user-facing labels (including App.tsx line 305 button text), replace with “Subject” or “What is this graph about?” as context warrants. IRIs and ontology shortnames can remain as secondary labels or tooltips. Chain shape: developer → applier.
- **Recommendation:** Accept (Phase 3 priority 2)
- **Rationale:** NFR-008 explicitly requires plain-language surfacing of semantic modeling concepts. Using raw ontology IRI prefixes as the primary UI label violates this commitment. Trivial fix with high clarity impact.

---

### Item D: MISSING_REALIST_ANCHOR plain-language banner text

- **Feedback summary:** Aaron asked in Section 1: “What is MISSING_REALIST_ANCHOR even mean.” The error code is surfaced verbatim in the user-facing banner (App.tsx line 296). A plain-language message such as “This project needs a subject — what real-world thing does it describe? Export is blocked until a subject is declared.” would be far more accessible.
- **SPEC ref:** §17.2, §17.3, NFR-008
- **Classification:** UI polish
- **Effort estimate:** Trivial (<2hr)
- **Dependencies:** None. The error code itself does not change; only the banner display string changes. The code `MISSING_REALIST_ANCHOR` can remain as an accessible tooltip or developer-visible detail.
- **Proposed resolution:** In `src/ui/App.tsx` (lines 295–298), replace the banner string `'No subject declared (MISSING_REALIST_ANCHOR). Export is blocked until a real subject IRI is added.'` with plain-language copy: `'This project needs a subject — what real-world thing does it describe? Export is blocked until a subject is declared.'` Similarly update the `LEGACY_REALIST_ANCHOR_PLACEHOLDER` branch to plain language. Chain shape: developer → applier.
- **Recommendation:** Accept (Phase 3 priority 2)
- **Rationale:** Same NFR-008 reasoning as Item C. The error code is internal vocabulary; the user message must be human-readable. High clarity improvement for zero implementation risk.

---

### Item E: Mermaid emitter missing

- **Feedback summary:** Aaron noted in Section 12 UI notes: “I am assuming we have not gotten to key functionality. Mermaid diagram export.” Reconnaissance confirmed that `src/emit/mermaid.ts` does not exist. The existing emitters are `turtle.ts`, `n-triples.ts`, `triple-narration.ts`, and `markdown.ts` only. Implementing Mermaid export requires both the core emitter (FR-C006) and UI wiring in the outputs panel (FR-U021/FR-U022).
- **SPEC ref:** FR-C006, FR-U021, FR-U022, IMPLEMENTATION_PLAN Phase-4 §4.2, OED-301
- **Classification:** Missing feature
- **Effort estimate:** Moderate (8–24hr) — emitter module + Mermaid.js rendering in outputs panel + Copy/Download buttons
- **Dependencies:** OED-301 (truncation/edge-label policy) gates golden-file tests but not the implementation itself. `ft-112-test-emitter-typefix-2` in V3.2-GAP-REGISTRY.md is about test coverage for existing emitters, not a blocker for this feature.
- **Proposed resolution:** Two options for Aaron’s adjudication: **(E1)** Pull FR-C006 + FR-U021/FR-U022 forward from Phase 4 to Phase 3. Implement the emitter module and outputs-panel rendering in Phase 3, accepting that golden-file tests remain incomplete until OED-301 resolves. **(E2)** Defer to Phase 4 as currently planned. Pulling forward is technically feasible (OED-301 does not block implementation), but it expands Phase 3 scope by approximately one moderate-effort item.
- **Recommendation:** Operator decision required (E1 vs E2)
- **Rationale:** The feature is Phase 4 as spec’d; Aaron’s comment suggests he expected it sooner. The sequencing call belongs to Aaron as product owner.

---

### Item F: Drag-from-sidebar to canvas unimplemented

- **Feedback summary:** Aaron noted in Section 5: “I was trying to DRAG a class onto the canvas.” The double-click path for instance creation works; the drag-from-sidebar path does not. Reconnaissance confirmed FR-U011 already specifies “drag or double-click” — so this is a partially spec’d missing feature, not a gap requiring a net-new FR. Only the drag half of FR-U011 is unimplemented.
- **SPEC ref:** FR-U011 (“drag or double-click → new ecm:Instance”), IMPLEMENTATION_PLAN §2.4
- **Classification:** Missing feature (partially spec’d)
- **Effort estimate:** Moderate (8–24hr) — HTML5 drag-and-drop or React DnD from TermSidebar to CanvasView, plus drop-position instance creation
- **Dependencies:** None blocking. FR-U011 already covers this path; no new FR required.
- **Proposed resolution:** Implement the drag-from-sidebar half of FR-U011: add `draggable` + `onDragStart` handlers to term cards in `src/ui/TermSidebar.tsx`; add `onDrop` + `onDragOver` handlers to the React Flow pane in `src/ui/CanvasView.tsx`. On drop, create an `ecm:Instance` of the dragged class at the drop position, mirroring the existing `handlePaneClick` double-click path. Add a drag-handle cursor to term cards for discoverability. Operator should confirm FR-U011 completion status in IMPLEMENTATION_PLAN before queuing. Chain shape: developer → applier → test-runner.
- **Recommendation:** Amend (FR-U011 implementation completion should be documented; then developer chain)
- **Rationale:** The double-click path being non-discoverable (Aaron had to read the walkthrough) reinforces that the drag path is the primary intuitive affordance. Drag-and-drop is moderately complex (event handling, ghost image, drop-target detection) and warrants its own developer chain rather than bundling with Quick fixes.

---

### Item G: Delete instance affordance missing

- **Feedback summary:** Aaron asked in Section 5: “How do I delete a node once I make it?” There is no delete-instance button in Inspector instance mode, no `onNodesDelete` or Backspace-key handler in CanvasView, and no FR covering delete-instance. FR-U017 covers delete-relation only.
- **SPEC ref:** FR-U017 (delete-relation, existing); no corresponding FR for delete-instance
- **Classification:** Missing feature (new FR required)
- **Effort estimate:** Small (2–8hr) — delete button in Inspector instance mode + cascade-delete ecm:relations and ecm:literalAssertions for the instance + remove ecm:canvasNodes entry
- **Dependencies:** Cascade cleanup touches `ecm:relations`, `ecm:literalAssertions`, and `ecm:canvasNodes`. An open question exists about whether the cascade logic belongs in the kernel layer (new `deleteInstance()` function in `src/kernel/`) or in the UI layer only. This question must be adjudicated before the developer chain is queued.
- **Proposed resolution:** Operator authors a new FR-U-N (delete instance) specifying: clicking a “Delete instance” button in Inspector instance mode removes the instance from `ecm:instances`, all `ecm:relations` where the instance is subject or object, all `ecm:literalAssertions` for the instance, and the corresponding `ecm:canvasNodes` entry. After FR is authored and kernel-vs-UI question is resolved, chain shape: developer → applier → test-runner.
- **Recommendation:** Amend (new FR-U needed first; operator adjudicates kernel-vs-UI cascade question)
- **Rationale:** The cascade behavior on instance delete is consequential — it silently removes related relations and literals. A deliberate spec statement about cascade semantics is required before implementation to avoid silent data loss. The kernel-vs-UI question has downstream implications for CLI and test coverage.

---

### Item H: Domain/range enforcement

- **Feedback summary:** Aaron noted in Section 3: “Object Properties have no visible domain and range restrictions.” The Realist Graph Critique demonstrated the data-quality consequence: Aaron assigned `hasISBN` to an Author instance and a Genre instance because no domain constraint warned him away. SPEC §7.5 explicitly defers rdfs:domain / rdfs:range as first-class TBox fields with the note “Documented as a known gap.”
- **SPEC ref:** §5.7 (Term Object schema), §7.5 (explicit deferral), §17.x (validation codes)
- **Classification:** Spec amendment + data-discipline
- **Effort estimate:** Large (>24hr) — §5.7 schema extension, UI dropdown filtering, new §17.x validation warnings, migration path for existing terms
- **Dependencies:** Closely related to Item I (both require §5.7 schema extension). Open question: should H and I be batched into a single “OWL property metadata” spec amendment (v0.5?), or tackled independently?
- **Proposed resolution:** Defer to a dedicated §5.7 / v0.5 schema amendment cycle. Adding `rdfs:domain` and `rdfs:range` fields to the Term Object requires removing the §7.5 “Deferred” classification, extending the schema, adding migration logic for existing term documents, adding new §17.x validation warning codes, and implementing UI dropdown filtering. The effort and schema disruption justify a coordinated spec version bump rather than a mid-Phase 3 amendment.
- **Recommendation:** Defer (v0.5 spec work; post-Phase 3; batch with Item I)
- **Rationale:** §7.5 is an explicit “known gap” declaration. Reopening it mid-Phase 3 without a deliberate process is scope creep. The data-quality consequence is real but reflects Aaron’s own test-data entry, not a production-blocking concern.

---

### Item I: Functional property awareness (owl:FunctionalProperty)

- **Feedback summary:** The Realist Graph Critique surfaced that Dune had two ISBNs in Aaron’s test project (“978-0-441-17271-9” and “12345”), which is semantically invalid for a functional property. No UI warning exists. SPEC §7.6 places “OWL Restrictions, Property Chains, Cardinality” explicitly out of scope, and owl:FunctionalProperty does not appear anywhere in SPEC.md.
- **SPEC ref:** §5.7 (Term Object type enum), §7.6 (explicit out-of-scope), §17.3 (warnings)
- **Classification:** Spec amendment + data-discipline
- **Effort estimate:** Moderate (8–24hr) — §7.6 amendment to carve out functional-property awareness, §5.7 schema flag, new §17.3 warning code, UI indicator on second-value assignment
- **Dependencies:** Closely related to Item H (both require §5.7 schema extension). Batching the two avoids two successive schema disruptions.
- **Proposed resolution:** Defer to the same v0.5 spec amendment batch as Item H. The functional-property case is conceptually simpler than full domain/range (a boolean flag rather than a type hierarchy), but it still requires removing §7.6 out-of-scope language, adding the flag to §5.7, and adding validation machinery. A coordinated single amendment with Item H is the clean path.
- **Recommendation:** Defer (v0.5 spec work; batch with Item H)
- **Rationale:** §7.6 is an explicit out-of-scope declaration. Overriding it mid-Phase 3 without a deliberate spec process is scope creep. The batching with Item H ensures one migration, one validation round, one golden-file update cycle.

---

### Item J: rdfs:label collision detection and starter terms

- **Feedback summary:** Aaron created a custom DatatypeProperty labeled “rdfs:label” during Section 5 testing, producing a non-canonical project-local IRI that shadows a core RDFS term. No collision check exists in `AddTermDialog.tsx`. Additionally, `ecm:terms` is empty on new projects (`buildNewDocument()` initializes it as `[]`), even though §5.7 reserves the `ecm:system-starter-example` source value for exactly this purpose.
- **SPEC ref:** §5.7 (ecm:source enum with `ecm:system-starter-example`), IMPLEMENTATION_PLAN Phase-2 §2.2
- **Classification:** Data-discipline + spec amendment (new FR for collision detection and starter-term population)
- **Effort estimate:** Moderate (8–24hr)
- **Dependencies:** Does NOT depend on Item H to be useful. Open question: should the canonical reserved-name list be declared in SPEC §5.7 (governing validator + emitter + UI) or hard-coded in the UI layer only?
- **Proposed resolution:** Two-part fix requiring a new FR: **(J1)** Populate `buildNewDocument()` in `src/ui/App.tsx` with a curated set of `ecm:system-starter-example` terms (rdfs:label, rdfs:comment, rdfs:subClassOf, owl:sameAs, owl:inverseOf) seeded from standard RDFS/OWL vocabulary. **(J2)** Add a collision check in `src/ui/AddTermDialog.tsx` `handleSubmit()` that warns when the user-entered label matches a canonical RDFS/OWL property name and offers to use the canonical IRI instead. The canonical reserved-name list should be declared in SPEC §5.7 (not hard-coded in UI) so it governs both the UI and future emitter/validator logic. Operator adjudicates the reserved-name-list placement question first, then authors a new FR covering both J1 and J2.
- **Recommendation:** Amend (new FR + SPEC §5.7 extension needed first; operator adjudicates reserved-name-list location)
- **Rationale:** The `ecm:system-starter-example` source value already exists in the spec enum but is never exercised. Implementing starter terms is spec-authorized; collision detection requires a new FR. Placing the reserved-name list in the spec (not the UI) is the principled choice with downstream benefits for the validator and emitter, but the decision belongs to Aaron.

---

### Item K: Turtle emitter prefix abandonment

- **Feedback summary:** The Realist Graph Critique noted that the Turtle output emits long-form IRIs (e.g., `<https://edgecanonical.org/ns/modeler#Project>`) instead of declared prefix abbreviations (`ecm:Project`), making manual reading hard. Reconnaissance confirmed the root cause: `new Writer()` at `src/emit/turtle.ts` line 258 receives no `prefixes` argument, while `PREFIX_MAP` (lines 33–41) already declares all standard prefixes but is used only for IRI expansion (compact → full), not output abbreviation.
- **SPEC ref:** FR-C003 (Turtle emitter), ft-112-test-emitter-typefix-2 (gap registry)
- **Classification:** Emitter quality
- **Effort estimate:** Trivial (<2hr) for the Writer change; small if TBox prepend restructuring is also desired
- **Dependencies:** Passing `PREFIX_MAP` to the Writer will produce duplicate `@prefix` declarations alongside the TBox prepend block (both declare the same prefix bindings). This is valid Turtle per the W3C grammar but is redundant. Operator must decide on the duplicate-prefix strategy before this ships.
- **Proposed resolution:** In `src/emit/turtle.ts` line 258, change `new Writer()` to `new Writer({ prefixes: PREFIX_MAP })`. This causes the N3.js Writer to emit abbreviated prefix forms in the ABox body. Operator decides: **(K1)** Accept duplicate `@prefix` declarations (valid Turtle, ships immediately); or **(K2)** Restructure `getProjectTBoxTurtle()` to omit prefix declarations for prefixes the Writer will declare (eliminates duplication, adds ~small effort). Recommend K1 as the immediately shippable path. Chain shape: developer → applier → test-runner.
- **Recommendation:** Accept (Phase 3 priority 3) — pending operator K1/K2 decision on duplicate prefix strategy
- **Rationale:** The current output is technically valid but unnecessarily verbose. Prefix abbreviation is a significant reader-friendliness improvement. The fix is trivially small. K1 is shippable without additional design work; K2 is optional cleanup.

---

### Item L: Class assignment at instance creation time

- **Feedback summary:** Aaron in Section 5 encountered instances showing “No class assignments” after double-click creation. SPEC §17.3 treats `INSTANCE_WITHOUT_CLASS` as a warning (not a hard error), so class-less creation is valid but immediately warned. Creating an instance without a class is the default outcome of the current double-click path (`ecm:classIris: []`).
- **SPEC ref:** FR-U011, FR-U012, §17.3 (INSTANCE_WITHOUT_CLASS warning)
- **Classification:** Spec amendment (FR-U011) + UI polish
- **Effort estimate:** Small (2–8hr)
- **Dependencies:** Soft coordination with Item B (both involve creation-time prompts; could share a combined “New instance” dialog design pattern to reduce duplication).
- **Proposed resolution:** Amend FR-U011 to require (or strongly default to) class selection at creation time. After double-click (or drag-drop per Item F), open a small creation dialog with a class picker pre-populated from the term sidebar. On confirm, create the instance with the selected class in `ecm:classIris`. Allow an explicit “Skip” for expert users who want to assign class later. Operator authors FR-U011 delta first; then: developer → applier. Coordination note: consider batching with Item B in a single “enhanced creation dialog” design pass to avoid two near-identical dialog components.
- **Recommendation:** Amend (FR-U011 spec change needed first; consider batching design with Item B)
- **Rationale:** The current behavior is spec-correct but produces a poor default: every newly created instance immediately triggers a class-assignment warning. A creation-time picker with a “Skip” escape hatch is a better default UX. The soft dependency on Item B suggests a coordinated design pass is worth the planning overhead.

---

## Recommended Phase 3 Scope

Items recommended for **Accept** — cleared for Phase 3 implementation chains:

| Priority | Item | Description | Effort | Chain shape |
|---|---|---|---|---|
| 1 | Quick-1 | Canvas node labels | Trivial | developer → applier |
| 1 | Quick-2 | Edge directional arrowheads | Trivial | developer → applier |
| 1 | Quick-5 | Dialog centering (top-left bug) | Trivial | developer → applier |
| 2 | Quick-3 | Inspector Subject/Object label resolution | Small | developer → applier |
| 2 | C | iao:isAbout plain-language label | Trivial | developer → applier |
| 2 | D | MISSING_REALIST_ANCHOR banner plain language | Trivial | developer → applier |
| 3 | Quick-4 | Outputs panel height (180px → 75px) | Trivial | developer → applier |
| 3 | K | Turtle emitter prefix usage | Trivial | developer → applier → test-runner |

**Bundling recommendation:** Quick-1, Quick-2, Quick-4, Quick-5, C, and D can land in one “UI polish chain” (all trivial, no spec amendments). Quick-3 can follow in a second chain (small refactor). K should follow after the K1/K2 operator decision is recorded.

---

## Defer to Future

Items recommended for deferral to post-Phase 3:

| Item | Description | Reason | Target |
|---|---|---|---|
| H | Domain/range enforcement | §7.5 explicit deferral; large scope; requires v0.5 schema amendment; batch with I | v0.5 spec / Phase-N |
| I | Functional-property awareness | §7.6 explicit out-of-scope; batch with H for single migration | v0.5 spec / Phase-N |

---

## Operator Decision Queue

Items that require Aaron’s adjudication before any implementation or spec amendment is queued:

| Item | Question | Options |
|---|---|---|
| A | Save semantics: split FR-U003 now vs rename button only | A1: Amend FR-U003, pull persistence to Phase 3 (needs OED-302); A2: Rename “Save” → “Download” now + new FR-U032 for Phase 5 |
| E | Mermaid export: Phase 3 vs Phase 4 as planned | E1: Pull forward to Phase 3 (moderate scope expansion); E2: Defer to Phase 4 |
| G | Delete instance cascade: kernel function vs UI-layer-only | G1: New `deleteInstance()` kernel function + UI call; G2: UI-layer-only cascade |
| J | Canonical reserved-name list location | J1: Declare in SPEC §5.7 (governs validator + emitter + UI); J2: Hard-code in UI only |
| K | Duplicate \`@prefix\` in Turtle output | K1: Accept duplicate declarations (ship now); K2: Restructure TBox prepend (additional effort) |
| B+L | Creation-dialog design pass | BL1: Single “enhanced creation dialog” design covers both B (iao:isAbout wizard) and L (class picker); BL2: Handle independently |

Items B, F, G, J, and L each also require an operator-authored or operator-delegated FR delta (new or amended) before developer chains can be queued. The operator should author or delegate FR drafts as part of adjudicating these items.
