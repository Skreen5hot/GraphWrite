---
document_kind: stakeholder-feedback-round-decomposition
round-number: 3
date: 2026-05-22
protocol: FNSR Spec 08 (v0.1 draft)
companion: demo/FEEDBACK-ROUND-3.md
---

# Feedback Round 3 — Atomic Decomposition

**Source:** demo/FEEDBACK-ROUND-3.md (Aaron, 2026-05-22, commit 32af9c9)  
**Protocol:** FNSR Spec 08 (v0.1 draft) — Phase 02 Atomic Decomposition + Phase 03 Categorize/Scope + Phase 04 Completeness Map  
**Produced by:** developer agent (task urn:fnsr:task:314-dev-r3-decomposition); grounded by reconnaissance task urn:fnsr:task:313-recon-r3  
**Status:** Pending Phase 05a Operator Adjudication

---

## Summary

**Total atomic items: 12**

| Section | Item count | Item IDs |
|---|---|---|
| Section 1 — Empty new project + banner | 4 | R3-S1-01 through R3-S1-04 |
| Section 2 — Load demo + canvas | 5 | R3-S2-01 through R3-S2-05 |
| Section 3 — Delete instance | 0 | (Aaron: “Perfect” — no items) |
| Section 4 — Canonical-name collision | 2 | R3-S4-01, R3-S4-02 |
| Section 5 — Turtle export | 1 | R3-S5-01 |

| Kind | Count | Items |
|---|---|---|
| UI bug | 2 | R3-S1-04, R3-S2-05 |
| UI polish | 1 | R3-S1-01 |
| Design philosophy | 1 | R3-S1-03 |
| Missing feature | 4 | R3-S1-02, R3-S2-01, R3-S2-02, R3-S2-03 |
| Data discipline | 1 | R3-S4-01 |
| Recurrence-of-prior-item | 2 | R3-S2-04, R3-S4-02 |
| Spec amendment | 1 | R3-S5-01 |

| Priority | Count | Items |
|---|---|---|
| P1 ship-blocking | 2 | R3-S1-04, R3-S5-01 |
| P2 Phase-3-close | 7 | R3-S1-01, R3-S1-02, R3-S1-03, R3-S2-01, R3-S2-02, R3-S2-04, R3-S4-02 |
| P3 Phase-4+ | 3 | R3-S2-03, R3-S2-05, R3-S4-01 |
| P4 backlog | 0 | — |

---

## Atomic Items

### R3-S1-01: Banner tone too aggressive

- **Atomic claim:** The anchor banner text accuses the user of an omission rather than guiding them toward adding a realist anchor; Aaron finds the current phrasing too aggressive and contrary to his design philosophy of giving objectives rather than error verdicts.
- **Evidence:** “Banner is still too aggressive. I do not like to be explicit I like giving objectives and the team discovers how to meet them.” (demo/FEEDBACK-ROUND-3.md line 16)
- **Kind:** UI polish
- **Effort estimate:** Small (2–8hr)
- **Initial priority:** P2 Phase-3-close
- **Completeness map:**
  - SPEC sections: §26 (UI layout), §17.2 (MISSING_REALIST_ANCHOR), FR-U031
  - FR numbers: FR-U031
  - Source modules: `src/ui/App.tsx` lines 291–310 (banner text string)
  - Spec tests: none directly
  - Playwright tests: any test asserting anchor-banner text content (update text assertions after copy change)
  - Demo materials: none
  - ROADMAP: no new entry needed (UI copy change)
  - IMPLEMENTATION_PLAN: Phase 2 §2.10 (ValidationPanel), Phase 3 UX
- **Dependencies:** R3-S1-03 (governs the design philosophy constraining what the replacement text should communicate; must be adjudicated first).
- **Cross-reference to prior rounds:** None — first occurrence. Banner phrasing was not reviewed in Round 1.

---

### R3-S1-02: New project should open Title+Subject modal

- **Atomic claim:** Clicking “New” should open a modal dialog prompting for a project Title and Subject before the blank project is created, eliminating the blank-project-plus-immediate-error pattern.
- **Evidence:** “But I’ll give you a hint. when a user clicks new open a popup with Title and Subject.” (demo/FEEDBACK-ROUND-3.md lines 16–17)
- **Kind:** Missing feature
- **Effort estimate:** Small (4–8hr)
- **Initial priority:** P2 Phase-3-close
- **Completeness map:**
  - SPEC sections: §17.2 (MISSING_REALIST_ANCHOR), §26 (layout/UX), FR-U001
  - FR numbers: FR-U001 (amendment: SHOULD → MUST prompt; modal at creation time)
  - Source modules: `src/ui/App.tsx` lines 101–106 (`handleNew`); `src/ui/NewProjectDialog.tsx` (new file required)
  - Spec tests: none directly
  - Playwright tests: New → dialog appears → title + subject fields → project created with anchor set
  - Demo materials: demo/WALKTHROUGH-PHASE-3.md Section 1 (update walkthrough step)
  - ROADMAP: Phase 3 UX polish entry needed
  - IMPLEMENTATION_PLAN: no current entry; add Phase 3 UX item
- **Dependencies:** R3-S1-03 (design philosophy governs the modal’s tone and interaction model; must be adjudicated first).
- **Cross-reference to prior rounds:** None — first occurrence. FR-U001 existed but the SHOULD-level prompt was never enforced at the implementation level.

---

### R3-S1-03: Design philosophy — prevent invalid states, do not report errors

- **Atomic claim:** Aaron’s stated design philosophy is that the correct UX pattern is to prevent invalid states at creation time rather than detecting and displaying errors after the fact; this governs how R3-S1-01, R3-S1-02, and R3-S1-04 should be implemented.
- **Evidence:** “No more errors. Humans hate to be told they did something wrong.” (demo/FEEDBACK-ROUND-3.md line 17)
- **Kind:** Design philosophy
- **Effort estimate:** N/A — no standalone implementation; governs R3-S1-01, R3-S1-02, R3-S1-04 implementation shape
- **Initial priority:** P2 Phase-3-close (must be adjudicated before Phase 06 chains for R3-S1-01 and R3-S1-02 are queued)
- **Completeness map:**
  - SPEC sections: §17 (Validation), §17.1 (Severity Levels), §17.2 (Hard Errors) — spec amendment may be required if philosophy change alters severity-level semantics
  - FR numbers: FR-U001, FR-U028, FR-U031
  - Source modules: none directly (philosophy; downstream implementation is in R3-S1-01 and R3-S1-02)
  - Spec tests: none directly
  - Playwright tests: none directly
  - Demo materials: none
  - ROADMAP: Phase 3 — UX validation philosophy decision
  - IMPLEMENTATION_PLAN: no current entry
- **Dependencies:** None — this item governs others; it has no upstream dependency.
- **Cross-reference to prior rounds:** Indirectly related to Round 1 Item A (“preventing bad state” concern; FEEDBACK-RESPONSE.md Item A). Item A was operator-decision-required and was not resolved in Round 1.
- **Open question flagged by recon:** Does this philosophy require a formal SPEC §17.1 amendment (removing or demoting hard-error severity levels), or do the implementation-level changes in R3-S1-01 and R3-S1-02 satisfy the intent without a spec edit? Operator must adjudicate before Phase 06 chains for R3-S1-01 or R3-S1-02 are queued.

---

### R3-S1-04: Validation panel does not clear after realist anchor is added via Project Settings

- **Atomic claim:** After the user adds a realist anchor via Project Settings and saves, the MISSING_REALIST_ANCHOR error in the ValidationPanel remains visible because the `onSave` handler calls `setProject(updated)` but omits `setValidationReport(validate(updated))`.
- **Evidence:** “The bottom error messages do not seem to be ‘passable’ I added a ‘realist Anchor’ but the original error is still there.” (demo/FEEDBACK-ROUND-3.md line 19). Confirmed: `onSave` in ProjectSettingsDialog handler (`src/ui/App.tsx` lines 346–355) calls `setProject(updated)` but does not call `setValidationReport(validate(updated))`.
- **Kind:** UI bug
- **Effort estimate:** Trivial (<2hr)
- **Initial priority:** P1 ship-blocking
- **Completeness map:**
  - SPEC sections: §17.5 (Suppression), §17.2 (MISSING_REALIST_ANCHOR), FR-U028
  - FR numbers: FR-U028
  - Source modules: `src/ui/App.tsx` lines 346–355 (`onSave` missing `validate` call); also audit lines 314–326 for any other project-mutation callbacks that similarly omit re-validation
  - Spec tests: `tests/*.test.ts` — validate-on-mutation regression test needed
  - Playwright tests: Add anchor via Project Settings → ValidationPanel clears MISSING_REALIST_ANCHOR
  - Demo materials: none
  - ROADMAP: no entry needed (bug fix)
  - IMPLEMENTATION_PLAN: no entry needed
- **Dependencies:** None — standalone fix; no open questions.
- **Cross-reference to prior rounds:** None — first occurrence. Project Settings save path was added in the Phase 3 build under review.

---

### R3-S2-01: Instance label edit affordance missing (FR-U012 unimplemented)

- **Atomic claim:** When a new canvas instance is created via double-click, its `rdfs:label` is hardcoded to `"New Instance"` and no UI affordance exists in the Inspector or elsewhere to change that label; FR-U012 (edit instance) is unimplemented.
- **Evidence:** “Labels are good BUT for new nodes it says ‘New Instance’ I cannot find any way to change it.” (demo/FEEDBACK-ROUND-3.md line 22). Confirmed: `src/ui/CanvasView.tsx` line 249 hardcodes `"rdfs:label": "New Instance"`; `Inspector.tsx` has no label-edit field in instance mode.
- **Kind:** Missing feature
- **Effort estimate:** Moderate (8–24hr)
- **Initial priority:** P2 Phase-3-close
- **Completeness map:**
  - SPEC sections: §5.8 (ecm:Instance), §15.3 (Canvas Library), FR-U012
  - FR numbers: FR-U012
  - Source modules: `src/ui/CanvasView.tsx` line 249 (hardcoded label); `src/ui/Inspector.tsx` (add label-edit field in instance mode); `src/ui/EditInstanceDialog.tsx` (new file) or inline edit within Inspector
  - Spec tests: none directly
  - Playwright tests: Create instance → label shows “New Instance” → edit label → canvas node updates
  - Demo materials: demo/WALKTHROUGH-PHASE-3.md Section 2 (update)
  - ROADMAP: Phase 3 — FR-U012 implementation entry needed
  - IMPLEMENTATION_PLAN: no current entry; add Phase 3 item
- **Dependencies:** None blocking. R3-S2-04 resolves automatically once this item lands (same `rdfs:label` value propagates to the relation inspector).
- **Cross-reference to prior rounds:** None — first occurrence. FR-U012 was specified but not implemented in Phases 1–2.

---

### R3-S2-02: Relation edges display no predicate label on the canvas

- **Atomic claim:** Relation edges on the React Flow canvas have no visible label showing the predicate name; `deriveEdges()` produces edge objects without a `label` property.
- **Evidence:** “Relations do NOT have labels at all, I should see them.” (demo/FEEDBACK-ROUND-3.md line 24). Confirmed: `deriveEdges()` (`src/ui/CanvasView.tsx` lines 168–185) produces edge objects with no `label` field; the `data` bag carries `predicateIri` but that value is never surfaced as a visible label.
- **Kind:** Missing feature
- **Effort estimate:** Small (2–8hr)
- **Initial priority:** P2 Phase-3-close
- **Completeness map:**
  - SPEC sections: §5.9 (ecm:RelationAssertion), §15.3 (Canvas Library), FR-U014
  - FR numbers: FR-U014
  - Source modules: `src/ui/CanvasView.tsx` lines 168–185 (`deriveEdges` — add label lookup from `ecm:terms` via `predicateIri`)
  - Spec tests: none directly
  - Playwright tests: Load demo → relation edges display predicate label on canvas
  - Demo materials: none
  - ROADMAP: no new entry needed
  - IMPLEMENTATION_PLAN: no entry needed
- **Dependencies:** Predicate label resolution requires looking up the predicate term’s `rdfs:label` from `ecm:terms`; confirm `src/ui/label-resolution.ts` handles predicate IRIs (not just instance IRIs).
- **Cross-reference to prior rounds:** None — first occurrence. Round 1 Quick-2 fixed arrowhead directionality; edge labels were not part of that fix.

---

### R3-S2-03: React Flow connection handles locked to single directionality

- **Atomic claim:** React Flow’s default single-handle-per-side configuration means edges can only be drawn source-bottom to target-top; users cannot draw top-to-top or bottom-to-bottom relations, which is unintuitive for a semantic modeling tool.
- **Evidence:** “Arrowheads are clear and in the correct direction BUT they are Locked in a directionality. Meaning the direction ONLY works when the Subject Node relation is on the bottom and the Object Node relation is on the Top. This is NOT intuitive and will frustrate people. A user should be able to start and end a relation from top to top or bottom to bottom.” (demo/FEEDBACK-ROUND-3.md lines 26–27)
- **Kind:** Missing feature
- **Effort estimate:** Moderate (8–24hr)
- **Initial priority:** P3 Phase-4+
- **Completeness map:**
  - SPEC sections: §15.3 (Canvas Library), FR-U014 (amendment: clarify multi-directional connection affordance)
  - FR numbers: FR-U014
  - Source modules: `src/ui/CanvasView.tsx` (add custom `<Handle>` components at multiple positions per node, replacing the default single-handle configuration)
  - Spec tests: none directly
  - Playwright tests: Draw relation top-to-top → relation created; draw bottom-to-bottom → relation created
  - Demo materials: none
  - ROADMAP: Phase 3 — canvas UX entry (or Phase 4 depending on adjudication)
  - IMPLEMENTATION_PLAN: no current entry
- **Dependencies:** May benefit from R3-S2-01 (instance label) landing first so Playwright test fixtures have named, distinguishable nodes.
- **Cross-reference to prior rounds:** None — first occurrence.

---

### R3-S2-04: Relation inspector shows “New Instance” labels with no in-context edit path

- **Atomic claim:** The relation inspector’s Subject and Object labels are resolved from `rdfs:label` and therefore display “New Instance” for newly created instances; there is no edit affordance reachable from within the relation inspector view itself.
- **Evidence:** “I now see labels for Subject and Object but they are Locked as ‘New Instance’ this may be related to the label issue.” (demo/FEEDBACK-ROUND-3.md lines 29–30). Confirmed: `Inspector.tsx` lines 578–581 call `resolveInstanceDisplay()` which correctly returns the current `rdfs:label` value; the label is correct but “New Instance” is the only value available until R3-S2-01 is implemented.
- **Kind:** Recurrence-of-prior-item
- **Effort estimate:** Trivial (<2hr) as standalone — resolves automatically when R3-S2-01 (instance label edit) is implemented; no separate fix needed unless inspector’s own affordance is desired
- **Initial priority:** P2 Phase-3-close (as a side-effect of R3-S2-01)
- **Completeness map:**
  - SPEC sections: FR-U020 (plain-language / triple preview for relation)
  - FR numbers: FR-U020
  - Source modules: `src/ui/Inspector.tsx` lines 578–581; `src/ui/label-resolution.ts` lines 54–64
  - Spec tests: none directly
  - Playwright tests: Edit instance label → relation inspector shows updated label (can be the same test as R3-S2-01’s Playwright test)
  - Demo materials: none
  - ROADMAP: no separate entry needed
  - IMPLEMENTATION_PLAN: no separate entry needed
- **Dependencies:** R3-S2-01 must land first; this item resolves as a consequence.
- **Cross-reference to prior rounds:** Indirectly related to Round 1 Quick-1 (canvas node labels). The same `rdfs:label` value that Quick-1 surfaced on canvas nodes propagates unchanged to the relation inspector; the inspector was not in scope for Quick-1.

---

### R3-S2-05: Plain-language narration shows empty class parentheses for classless instances

- **Atomic claim:** The FR-C008 plain-language narration renders an empty string in the class slot when an instance has no class assignment, producing output like “New Instance () married to New Instance ()” rather than a fallback label or a prompt to assign a class.
- **Evidence:** “The Plain Language is still missing the class from subject and object: Plain language (FR-C008): New Instance () married to New Instance ()” (demo/FEEDBACK-ROUND-3.md lines 31–32). Confirmed: `Inspector.tsx` lines 116–122 interpolates `''` (empty string) for classless instances with no display fallback.
- **Kind:** UI bug
- **Effort estimate:** Small (2–8hr) — exact fix shape depends on operator adjudication of the open question below
- **Initial priority:** P3 Phase-4+
- **Completeness map:**
  - SPEC sections: FR-C008 (triple narration), FR-U011 (instance creation + class assignment), §17.3 INSTANCE_WITHOUT_CLASS warning (currently unimplemented)
  - FR numbers: FR-C008, FR-U011
  - Source modules: `src/ui/Inspector.tsx` lines 88–123 (`resolveRelationNarration`); `src/emit/triple-narration.ts`
  - Spec tests: `tests/` — narration output for classless instance
  - Playwright tests: Create instance → draw relation → narration shows fallback class text (or prompt) rather than empty parens
  - Demo materials: none
  - ROADMAP: no entry needed
  - IMPLEMENTATION_PLAN: no entry needed
- **Dependencies:** Operator adjudication on the open question must precede Phase 06 dispatch; the fix implementation differs significantly across the three options.
- **Cross-reference to prior rounds:** None — first occurrence.
- **Open question flagged by recon:** Is the correct fix (a) prompt for class assignment at instance creation time (FR-U011 amendment), (b) add a narration fallback label (e.g., “unclassified”) for classless instances without changing FR-U011, or (c) implement the INSTANCE_WITHOUT_CLASS validation warning (§17.3, currently unimplemented) so the user is guided to assign a class themselves? Operator must adjudicate before Phase 06 chain is queued.

---

### R3-S4-01: Reserved-name collision check covers IRI only, not label text

- **Atomic claim:** The existing CANONICAL_RESERVED_NAME_COLLISION guard checks a term’s IRI against a fixed list of canonical IRIs, but does not check whether the human-readable label string the user types resembles a canonical property name; typing `label` as a label with no IRI override creates a UUID-IRI term with no warning.
- **Evidence:** “No warning happened it just made a new ‘label’” (demo/FEEDBACK-ROUND-3.md line 39), accompanied by screenshot of Edit Term dialog showing Label: `label`, IRI: `urn:uuid:4dc2d8d1-...`. Confirmed: `src/validate/reserved-names.ts` exports an IRI-only list; `AddTermDialog.tsx` lines 85–88 checks `iri`, not `trimmedLabel`; `EditTermDialog.tsx` has no reserved-name check at all.
- **Kind:** Data discipline
- **Effort estimate:** Small (2–8hr)
- **Initial priority:** P3 Phase-4+ (lower than R3-S4-02 per Aaron’s stated preference)
- **Completeness map:**
  - SPEC sections: §5.7.1 (reserved canonical names), §17.2 (CANONICAL_RESERVED_NAME_COLLISION)
  - FR numbers: FR-U009 (Edit term — add reserved-name guard), FR-U006/FR-U007/FR-U008 (Add term — extend check to label-text)
  - Source modules: `src/ui/AddTermDialog.tsx` lines 85–88; `src/ui/EditTermDialog.tsx` (no check present); `src/validate/reserved-names.ts` (add label-string set alongside IRI set)
  - Spec tests: `tests/` — collision detection fires on label-text match
  - Playwright tests: Type `label` in label field → inline warning fires before save
  - Demo materials: demo/WALKTHROUGH-PHASE-3.md Section 4 (update expected behavior)
  - ROADMAP: no entry needed
  - IMPLEMENTATION_PLAN: no entry needed
- **Dependencies:** R3-S4-02 adjudication required first (Aaron said he does not want this functionality at all and wants pre-populated defaults instead; operator must decide whether to keep the IRI-based check, enhance it per R3-S4-01, or remove it once R3-S4-02 starter terms are in place).
- **Cross-reference to prior rounds:** None — first occurrence. Canonical-name collision detection was added in the Phase 3 build under review; this is the first feedback on that feature.
- **Open question (joint with R3-S4-02):** Aaron’s stated preference is to not have this functionality at all and instead have pre-populated defaults. Operator must adjudicate jointly with R3-S4-02 before either item’s Phase 06 chain is queued.

---

### R3-S4-02: Pre-populate standard RDFS+OWL+XSD vocabulary as starter terms (recurrence of Round 1 Item J)

- **Atomic claim:** Aaron wants every new project pre-populated with approximately 20–30 standard RDFS, OWL, and XSD vocabulary terms as default starter terms, explicitly rejecting the collision-detection-first approach in favor of having the vocabulary present from the start.
- **Evidence:** “But really I do NOT want this functionality AT ALL I want to see the defaults — pre-populate the standard RDFS + OWL + XSD vocabulary (probably 20-30 properties: rdfs:label/comment/domain/range/subClassOf/subPropertyOf/seeAlso/isDefinedBy + owl:sameAs/equivalentClass/inverseOf/Class/ObjectProperty/DatatypeProperty/etc. + xsd:string/integer/boolean/date/dateTime)” (demo/FEEDBACK-ROUND-3.md lines 47–49)
- **Kind:** Recurrence-of-prior-item
- **Effort estimate:** Moderate (8–24hr)
- **Initial priority:** P2 Phase-3-close
- **Completeness map:**
  - SPEC sections: §5.7 (Term Object schema), §5.7.1 (ecm:source enum including `ecm:system-starter-example`), FR-U005, FR-U026; new FR needed for pre-populate standard RDFS+OWL+XSD on new project
  - FR numbers: FR-U005, FR-U026; new FR number required (operator authors)
  - Source modules: `src/ui/App.tsx` lines 21–39 (`buildNewDocument` — add starter terms array); `src/ui/TermSidebar.tsx` (starter-example badge display)
  - Spec tests: `tests/` — new project contains `rdfs:label` etc. as `ecm:system-starter-example` terms
  - Playwright tests: New project → Term Sidebar shows `rdfs:label`, `rdfs:comment`, etc. with starter-example badge
  - Demo materials: `demo/library-catalog.jsonld` (update if starter terms pre-populate into new projects); `demo/WALKTHROUGH-PHASE-3.md` Section 4
  - ROADMAP: Phase 3 — Starter vocabulary provision entry needed
  - IMPLEMENTATION_PLAN: no current entry; add Phase 3 item
- **Dependencies:** R3-S4-01 adjudication (whether collision check stays or is removed once starter terms are in place); new FR number from operator required before spec amendment can be queued.
- **Cross-reference to prior rounds:** **Round 1 Item J — provision half** (demo/FEEDBACK.md lines 172–173; demo/FEEDBACK-RESPONSE.md lines 172–178). Round 1 Item J bundled two requirements: (1) pre-populate the term-list with standard RDFS+OWL properties and (2) detect when a user creates a property that collides with a canonical one. The FEEDBACK-RESPONSE tracked both under Item J, but the provision-half (pre-populate) was never extracted as a separate atomic item and was not implemented. Aaron re-stated the requirement independently in Round 3, confirming the loss. This is an explicit recurrence — the Spec 08 decomposition discipline exists precisely to prevent this class of loss.

---

### R3-S5-01: Wrong IRI for `iao:isAbout` (§5.2 @context and all derived bindings)

- **Atomic claim:** The `iao:` prefix in SPEC.md §5.2, `VMP_CONTEXT` (canonicalize.ts), `PREFIX_MAP` (turtle.ts), and the TBox (tbox/index.ts) all bind to `http://purl.obolibrary.org/obo/iao#`, causing `iao:isAbout` to expand to `http://purl.obolibrary.org/obo/iao#isAbout` rather than the canonical IAO IRI `http://purl.obolibrary.org/obo/IAO_0000136`.
- **Evidence:** “A coworker pointed out we are using the wrong IRI for is_about: ObjectProperty: is about, Term IRI: http://purl.obolibrary.org/obo/IAO_0000136” (demo/FEEDBACK-ROUND-3.md lines 52–58). Confirmed across four files: `project/SPEC.md` lines 295–296; `src/kernel/canonicalize.ts` line 72; `src/emit/turtle.ts` line 39; `src/tbox/index.ts` line 19 — all bind `iao:` to `http://purl.obolibrary.org/obo/iao#`.
- **Kind:** Spec amendment
- **Effort estimate:** Trivial (lines changed) but substantive (@context change propagates to canonicalize.ts, turtle.ts, tbox/index.ts, spec, and golden files)
- **Initial priority:** P1 ship-blocking — exported Turtle contains a wrong IRI for a core relation; every project’s serialized artifact is semantically incorrect until this is fixed
- **Completeness map:**
  - SPEC sections: §5.2 (Normative Context), §5.4 (`iao:isAbout`), §5.14 (Project TBox), NFR-014
  - FR numbers: FR-U031 (`iao:isAbout` declaration/edit), FR-E002 (Turtle export)
  - Source modules: `project/SPEC.md` lines 295–296 (§5.2 @context `iao:` prefix definition); `src/kernel/canonicalize.ts` line 72 (`VMP_CONTEXT`); `src/emit/turtle.ts` line 39 (`PREFIX_MAP`); `src/tbox/index.ts` line 19 (`@prefix iao:`)
  - Spec tests: `tests/snapshot.test.ts` — golden file (`examples/expected-output.jsonld`) update required if IRI changes; `tests/determinism.test.ts` — re-run after context change
  - Playwright tests: Download Turtle → verify `iao:isAbout` expands to `IAO_0000136` IRI
  - Demo materials: `demo/library-catalog.jsonld` (update if `iao:isAbout` present); `examples/expected-output.jsonld` (golden file update)
  - ROADMAP: Phase 3 — IAO IRI correction entry (substantive @context change)
  - IMPLEMENTATION_PLAN: all phases referencing `iao:isAbout` binding must be reviewed
- **Dependencies:** Operator adjudication on the open question is required before implementation can be queued; semantic-sme review recommended given the ontological nature of the prefix conflict.
- **Cross-reference to prior rounds:** None — first occurrence. The incorrect binding was present from Phase 1 but not surfaced until Aaron’s coworker reviewed the Turtle export.
- **Open question flagged by recon:** The canonical fix requires changing the `iao:` prefix namespace. However the TBox also uses `iao:OntologyDesignPattern` (a spec-introduced term with no OBO numbered ID, per SPEC.md line 323). If `iao:` is changed to the OBO base namespace `http://purl.obolibrary.org/obo/`, then `iao:isAbout` would still resolve incorrectly. The correct IRI `http://purl.obolibrary.org/obo/IAO_0000136` cannot be constructed via any prefix that simultaneously supports `iao:OntologyDesignPattern`. Operator must decide: (a) use two separate prefix bindings — one for OBO numbered terms, one for spec-introduced `iao:` terms; (b) remove the `iao:` prefix and use full IRIs for both `iao:isAbout` and `iao:OntologyDesignPattern`; or (c) some other approach. Semantic-sme review is recommended before the ratification chain is queued.

---

## Pending Phase 05a Operator Adjudication

Aaron adjudicates each item below. Per FNSR Spec 08:
- **Ratify** — proceed to Phase 06 implementation chain as scoped above.
- **Amend** — operator provides a scope amendment (revised FR, spec delta, or changed effort/priority); implementation chain is queued after the amendment is recorded.
- **Defer** — move to P4 backlog; no Phase 06 chain queued this round.

| Item ID | Short title | Initial priority | Adjudication (2026-05-22) | Notes |
|---|---|---|---|---|
| R3-S1-01 | Banner tone too aggressive | P2 | **ratify** | Bundled into Chain α (new-project UX overhaul) with S1-02/03/04 |
| R3-S1-02 | New project Title+Subject modal | P2 | **ratify** | Chain α; reactivates BL1 (B half from Round 1) |
| R3-S1-03 | Design philosophy: prevent not report | P2 | **ratify as governing principle** | Open question 1 answered (b): no SPEC §17 amendment; UX-layer-only changes |
| R3-S1-04 | Validation panel stale after anchor add | P1 | **ratify** | Trivial; bundled into Chain α |
| R3-S2-01 | Instance label edit affordance missing | P2 | **ratify** | Chain β (instance-label + edge-label) |
| R3-S2-02 | Relation edge predicate label missing | P2 | **ratify** | Chain β |
| R3-S2-03 | React Flow handle directionality locked | P3 | **defer** | Forward-track ft-r3-s2-03-handle-directionality (Phase 4+) |
| R3-S2-04 | Relation inspector shows New Instance labels | P2 | **ratify (auto-resolve)** | No separate chain; resolves when S2-01 lands |
| R3-S2-05 | Plain-language narration empty class parens | P3 | **defer** | Open question 2 answered: resolves when L lands (class picker at creation). Forward-track ft-r3-s2-05-narration-classless |
| R3-S4-01 | Reserved-name check: IRI-only, not label | P3 | **defer** | Open question 3 answered: keep IRI check; do not add label-text check (starter terms make it moot). Forward-track ft-r3-s4-01-label-text-collision (likely won't surface) |
| R3-S4-02 | Pre-populate standard RDFS+OWL+XSD vocab | P2 | **ratify** | Chain γ (starter terms) |
| R3-S5-01 | Wrong IAO IRI for `iao:isAbout` | P1 | **HELD — open question 4** | Chain δ blocked on Aaron's prefix-resolution decision (two prefixes vs full IRIs vs other) |

### Open questions — adjudication

1. **R3-S1-03 (design philosophy scope):** **Answered (b)** — implementation-level UX changes in S1-01/S1-02/S1-04 satisfy the intent. §17 stays unchanged (error codes remain for backend/API uses; UX layer governs how they surface to humans).

2. **R3-S2-05 (classless instance narration):** **Answered: defer** — empty class parens are a consequence of class-less instance creation (FR-U011 L-half deferred). Resolves automatically when L (class picker at creation) lands. Forward-tracked.

3. **R3-S4-01 vs R3-S4-02 (collision check fate):** **Answered (variant of a)** — keep the existing IRI-based check as a safety net for IRI-override paths; do NOT add label-text coverage; starter terms (S4-02) make the label-text-collision-by-accident path moot since users see canonical terms in the sidebar from the start. R3-S4-01 forward-tracked but expected unused.

4. **R3-S5-01 (`iao:` prefix conflict):** **HELD — needs Aaron's direct answer.** The conflict: `iao:isAbout` (canonical OBO IRI is `http://purl.obolibrary.org/obo/IAO_0000136`) and `iao:OntologyDesignPattern` (spec-introduced term, no OBO numbered ID) cannot both live under one prefix mapping. Options:
   - (a) **Two separate prefix bindings** — `iao:` stays bound to `http://purl.obolibrary.org/obo/iao#` for spec-introduced terms; introduce new prefix like `obo:` bound to `http://purl.obolibrary.org/obo/` for canonical OBO IRIs. `obo:IAO_0000136` becomes the canonical form for the "is about" predicate. Cleaner separation; more honest about namespace structure.
   - (b) **Full IRIs for both** — drop `iao:` prefix entirely; use `<http://purl.obolibrary.org/obo/IAO_0000136>` and `<https://edgecanonical.org/ns/modeler#OntologyDesignPattern>` directly (or move `OntologyDesignPattern` under `ecm:`). Simpler; less semantic structure.
   - (c) Other approach (Aaron-proposed).

   Implementation propagates through SPEC.md §5.2 + `src/kernel/canonicalize.ts` VMP_CONTEXT + `src/emit/turtle.ts` PREFIX_MAP + `src/tbox/index.ts` + all canonical fixtures with `iao:isAbout`. Semantic-sme review recommended.

After Aaron’s per-item adjudication, Phase 06 implementation chains are dispatched per ratified item via the standard reconnaissance → ratification → commit-finalize chain shape per FNSR Spec 08 §6 and CLAUDE.md §7.8.
