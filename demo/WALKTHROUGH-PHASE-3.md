# GraphWrite Phase 3 Walkthrough — Round 2 Test

Companion to [WALKTHROUGH.md](WALKTHROUGH.md) for testing Phase 3 changes specifically. The first walkthrough covered every feature; this one is focused on **what changed** since you last tested (commit 727c431 → present).

---

## Setup

1. Open **https://skreen5hot.github.io/GraphWrite/** (Pages auto-redeploys on push; give it ~2 min after this commit lands)
2. If you still have the demo file [demo/library-catalog.jsonld](library-catalog.jsonld), use it. If not, re-download from the repo.

---

## Changes shipped (16 items across 8 chains)

| ID | Change | What you'll see |
|---|---|---|
| **Quick-1** | Canvas nodes show `rdfs:label`, not UUIDs | "Dune" / "Frank Herbert" / etc. instead of `urn:uuid:11111111-...` on each node |
| **Quick-2** | Edges now have arrowheads | Direction visible at the target end of each edge |
| **Quick-3** | Inspector Subject/Object rows show labels alongside IRIs | Plain-language name on top line + full IRI on small secondary line |
| **Quick-4** | Outputs panel sized down | Bottom panel reduced (~75px) so canvas gets more space |
| **Quick-5** | Add-Literal dialog centered | Dialog opens centered, not top-left |
| **C** | "iao:isAbout" renamed | Now "Subject of the graph" in user-facing text |
| **D** | MISSING_REALIST_ANCHOR banner plain-language | "This project needs a subject..." instead of jargon code |
| **A2** | Save → Download | Header buttons now say "Download" and "Download Turtle" (was "Save" and "Save as Turtle") |
| **K1** | Turtle export uses short prefixes | `ecm:Project` instead of `<https://edgecanonical.org/ns/modeler#Project>`; `@prefix` block at top |
| **G1** | **Delete instance** affordance | Inspector instance-mode now has a Delete button with cascade confirmation |
| **J1** | Canonical-name collision prevention | Try to create a custom property with IRI `http://www.w3.org/2000/01/rdf-schema#label` → inline warning + Save disabled |
| **SPEC** | FR-U001 amended (B) | Spec now says New project SHOULD prompt for subject — UI implementation deferred to next session |
| **SPEC** | FR-U011 amended (F + L) | Spec now allows drag-from-sidebar + requires class picker at creation — UI implementation deferred |
| **SPEC** | FR-U032 added (G) | Delete instance cascade is now formal spec |
| **SPEC** | §5.7.1 added (J) | Canonical reserved-name list is normative |
| **SPEC** | §17.2 amended | `CANONICAL_RESERVED_NAME_COLLISION` validator code registered |

---

## Test sections (focused on changes)

### Section 1 — Empty New project (Item D verification)

**Action:** Click **New** in header.

**What's different now:**
- The red banner text should NOT say `MISSING_REALIST_ANCHOR` — it should say something like *"This project needs a subject — what real-world thing is it about?"*
- The action button next to it should say *"Set subject"* (not "Add subject IRI")
- Header buttons say **Download** + **Download Turtle** instead of "Save" + "Save as Turtle"

**Feedback:**
- [ ] Is the banner text clearer? Still too aggressive?
- [ ] Does the new wording invite action vs accuse you of doing something wrong?
- [ ] Does the Download naming make the action's effect obvious?

---

### Section 2 — Load demo (Item Quick-1 / Quick-2 / Quick-3 verification)

**Action:** Click **Open**. Load `library-catalog.jsonld`.

**What's different now:**
- **Quick-1**: Nodes show readable labels — "Dune", "Foundation", "Frank Herbert", "Isaac Asimov", "Chilton Books"
- **Quick-2**: Edges have arrowheads pointing toward the target — you can tell at a glance that Dune→FrankHerbert (Dune written_by Frank Herbert)
- **Quick-4**: Validation/Outputs panel at the bottom is smaller

**Action:** Click the edge from Dune to Frank Herbert.

**What's different in the Inspector:**
- **Quick-3**: Subject row now shows **Dune** as the primary text, with the IRI underneath in smaller text. Same for Object (Frank Herbert + IRI). Predicate dropdown still shows "writtenBy" as before.

**Feedback:**
- [ ] Are labels readable on the canvas?
- [ ] Do arrowheads make direction clear?
- [ ] Is the Subject/Object display + IRI combination useful, or too noisy?
- [ ] Did the smaller bottom panel give the canvas enough room?

---

### Section 3 — Delete instance (Item G1 verification)

**Action:** Click on **Dune** (the node) on the canvas. Look at Inspector instance-mode.

**What's new:**
- Inspector should show a **Delete Instance** button (likely at bottom or in a Danger Zone section).

**Action:** Click Delete Instance.

**What you should see:**
- A confirmation dialog like *"Delete Dune? This will remove 1 canvas position + 2 literal assertions + 2 relations involving this instance. Continue?"*

**Action:** Click Confirm.

**What you should see:**
- Dune disappears from the canvas
- The edges from Dune (to Frank Herbert and Chilton Books) also disappear
- The literal assertions for ISBN + year disappear

**Action:** Click **Download** to save. Open the file. Verify `ecm:instances` has only 4 entries (was 5); `ecm:relations` has only 1 (was 3); `ecm:literalAssertions` has only 1 (was 3).

**Feedback:**
- [ ] Is the Delete affordance discoverable? Should it be more/less prominent?
- [ ] Does the cascade preview tell you enough before you confirm?
- [ ] Did anything you didn't expect get deleted?

---

### Section 4 — Canonical-name collision (Item J1 verification)

**Action:** In the **Classes** section of the Term Sidebar, click **+** to open Add Term.

**Action:** Pick "Datatype Property" (or whichever kind opens that dialog). Type "label" as the display label. Now in the IRI override field, paste: `http://www.w3.org/2000/01/rdf-schema#label`

**What you should see:**
- An inline warning text appears: *"That IRI is canonical RDFS/OWL and cannot be used for a project-created term."* (or similar)
- The Save / Submit button becomes **disabled**.

**Action:** Clear the IRI field (leave empty for auto-generation). Submit.

**What you should see:**
- The term is created with an auto-generated `urn:uuid:` IRI, NOT the canonical RDFS one.

**Feedback:**
- [ ] Is the warning clear about why the IRI is rejected?
- [ ] Does the disabled-Save behavior make sense?

---

### Section 5 — Turtle export with prefixes (Item K1 verification)

**Action:** Click **Download Turtle** (was "Save as Turtle"). Open the .ttl file in any text editor.

**What's different:**
- At the top: a `@prefix` block declaring `ecm:`, `iao:`, `owl:`, `rdfs:`, `xsd:`, `rdf:`, `cco:`
- In the body: short forms like `ecm:Project`, `iao:isAbout`, `rdfs:label` instead of the long `<https://...>` URIs
- `urn:uuid:...` IRIs stay in long form (those don't have a prefix match — correct behavior)

**Feedback:**
- [ ] Is the output more readable than before?
- [ ] Compare to what the Realist Graph Critique you forwarded recommended — does this match the expected shape?

---

## What's deliberately NOT in this build (deferred)

These items have ratified SPEC amendments but no UI implementation yet — landed in the next session:

- **B (first-time subject wizard at New)**: SPEC amended (FR-U001); UI dialog blocked on substrate gap (Event 12 — `awaiting_operator_decision` shape bypass not honored). Will dispatch with narrower scope next.
- **L (class picker at instance creation)**: SPEC amended (FR-U011); UI implementation deferred alongside B as a combined design pass.
- **F (drag-from-sidebar to canvas)**: SPEC amended (FR-U011); UI implementation pending — bundles naturally with L.

Other deferrals (out of Phase 3 scope):
- **A1 (IndexedDB persistence + Projects menu)**: deferred to Phase 5; A2 rename done as interim
- **E2 (Mermaid emitter)**: stays at Phase 4 / ft-112-test-emitter-typefix-2
- **H (domain/range enforcement) + I (functional-property awareness)**: deferred to v0.5 spec work
- **Validator codes 3-26**: still ft-097-test-validator-2 territory; 4 of 26 now implemented (MISSING_REALIST_ANCHOR + INVALID_SPEC_VERSION + LEGACY_REALIST_ANCHOR_PLACEHOLDER + CANONICAL_RESERVED_NAME_COLLISION)

---

## Feedback consolidation

Same prompts as round 1:

1. **What's better now than last time you tested?**
2. **What's still rough?** (Items I didn't catch / items the implementation got wrong / items the design needs to revisit)
3. **What's the highest-value next thing to fix?** (Helps me prioritize the next session)
4. **What surprised you?** (Positive or negative)

Drop responses in chat, inline here, or in `demo/FEEDBACK-PHASE-3.md` — whatever's easiest.

---

## Numbers under the hood

- Phase 1 spec tests: **126/126 pass** (was 106; +14 from G1 deleteInstance + 6 from J1 reserved-names)
- Playwright tests: **41/41 pass** (was 39; +2 from G1 delete-instance Playwright)
- TypeScript: clean build + clean ui-typecheck
- Bundle: ~390KB JS (was 386KB; ~+1% for G1+J1 additions)
- Substrate operator-mediation events: **12 logged** (added Events 11+12 during Phase 3 — both are Pass 2a / CPS-bypass substrate refinements)

Phase 3 substantively complete except for BL1 (B+L combined creation dialogs), which is deferred to next session due to substrate gap (Event 12) preventing the developer's correct `awaiting_operator_decision` escalation from being honored.
