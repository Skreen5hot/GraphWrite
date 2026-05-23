# GraphWrite Round 4 Walkthrough — Test the Round 3 Implementation

Companion to [WALKTHROUGH.md](WALKTHROUGH.md) and [WALKTHROUGH-PHASE-3.md](WALKTHROUGH-PHASE-3.md). This focuses on **what changed from your Round 3 feedback** (atomic items + 1 substrate-spec).

This is also the **first walkthrough produced under FNSR Spec 08 discipline** — each section maps back to a specific atomic item from `demo/FEEDBACK-ROUND-3-DECOMPOSITION.md` so you can verify the round-trip without losing items.

---

## Setup

1. Open **https://skreen5hot.github.io/GraphWrite/** (Pages will have redeployed from commit `880d53c`; ~2 min after the push).
2. (Optional) Re-download the demo project: [demo/library-catalog.jsonld](library-catalog.jsonld) — has been updated for the IAO IRI fix (`type` array now uses `ecm:OntologyDesignPattern`).

---

## What you should look at — by Round 3 chain

### Chain α — New project flow (atomic items S1-01, S1-02, S1-03, S1-04)

**Objective:** Verify the new-project experience is no longer accusatory.

**Try this:**
1. Click **New**.
2. A dialog should open asking for **Project Title** and **Subject of the graph**. Fill both, or click **Skip — use placeholder**.
3. Look at the result: the project loads. No red banner yelling about missing realist anchor.
   - If you Skip: a muted soft-guidance line appears: *"No subject set. Add a subject in Project Settings."*
   - If you fill the Subject: no banner at all.
4. Open **Project Settings**, add or change a subject, click Save.
5. Confirm the bottom validation panel reflects the new state immediately (no stale MISSING_REALIST_ANCHOR).

**Feedback hooks:**
- [ ] Does the new dialog feel like a guide rather than a gate?
- [ ] Does the soft-guidance phrasing read better than the previous banner?
- [ ] Does the bottom panel update fast enough that it doesn't feel stale?
- [ ] Anything still feel accusatory?

### Chain β — Instance + edge labels (atomic items S2-01, S2-02, S2-04)

**Objective:** Verify instances and relations are now readable on the canvas without opening anything.

**Try this:**
1. Open `library-catalog.jsonld` (or load a fresh fixture).
2. Look at the canvas: **node labels** show "Dune", "Frank Herbert", etc. (not UUIDs).
3. **Edge labels** show "writtenBy" / "publishedBy" (not blank).
4. **Arrowheads** are visible on edges (already shipped in Round 2; verify still works).
5. Click a node ("Dune"). Inspector shows an inline **Label** input. Change it to something else. The canvas node label updates. Save the project → download → reopen → verify the new label persisted.
6. Click a relation edge. Inspector's Subject / Object rows now show both the label AND the IRI (the Round 2 label-resolution shipped here too).

**Feedback hooks:**
- [ ] Are labels readable at default zoom?
- [ ] Does inline label editing feel natural?
- [ ] Are edge labels positioned readably?
- [ ] Anything still feel locked or unreachable?

### Chain γ — Starter terms (atomic item S4-02; recurrence of Round 1 Item J)

**Objective:** Verify standard RDFS / OWL vocabulary is available without you having to mint it.

**Try this:**
1. Click **New** → fill the dialog → Create Project.
2. Look at the **Term Sidebar** on the left. Even though the project is empty, you should see ~16 entries already present with the **"system-starter-example"** badge:
   - **Datatype Properties:** rdfs:label, rdfs:comment, rdfs:seeAlso, rdfs:isDefinedBy
   - **Object Properties:** rdfs:subClassOf, rdfs:subPropertyOf, rdfs:domain, rdfs:range, owl:sameAs, owl:differentFrom, owl:equivalentClass, owl:equivalentProperty, owl:inverseOf
   - **Classes:** owl:Class, owl:ObjectProperty, owl:DatatypeProperty
3. Try clicking one — it should render as **read-only** (system-starter terms aren't editable; same model as imported terms).

**Feedback hooks:**
- [ ] Is the 16-entry set right? Anything missing that you'd reach for?
- [ ] Anything in the list that shouldn't be there?
- [ ] Should some be in different sections (e.g., is `rdfs:label` better classified as something other than DatatypeProperty)?

### Chain δ — IAO IRI fix (atomic item S5-01; your δ-a + ecm:OntologyDesignPattern decision)

**Objective:** Verify the Turtle export uses the canonical IAO IRI per your coworker's review.

**Try this:**
1. Open `library-catalog.jsonld`.
2. Click **Download Turtle**.
3. Open the .ttl file in any text editor.
4. Find the `@prefix` block at the top — you should see:
   ```turtle
   @prefix obo: <http://purl.obolibrary.org/obo/> .
   @prefix ecm: <https://edgecanonical.org/ns/modeler#> .
   ```
5. Find the project's "is about" triple. It should now use **`obo:IAO_0000136`** as the predicate (the canonical IAO IRI), not `iao:isAbout`.
6. Find the project's `a` type. It should be **`ecm:Project, ecm:OntologyDesignPattern`** (no more `iao:OntologyDesignPattern` — we re-homed that to ecm: per your recommendation).

**Feedback hooks:**
- [ ] Is the Turtle output now what you'd hand to a Realist-graph reviewer?
- [ ] Does the prefix structure feel honest?
- [ ] Forward this version to your coworker — any new objections?

---

## What was deliberately deferred (not in this build)

These are forward-tracks created from your Round 3 P3-priority items — recorded in the substrate audit chain as `forward_track` audit events with `phase_origin: phase3`:

| Forward-track ID | Item | Reason for defer |
|---|---|---|
| `ft-r3-s2-03-handle-directionality` | React Flow handles single-direction | Phase 4+ (substantial React Flow custom handle work) |
| `ft-r3-s2-05-narration-classless` | Plain-language narration empty class parens | Depends on L (class picker at instance creation) landing first; resolves automatically when L lands |
| `ft-r3-s4-01-label-text-collision` | Reserved-name collision check on label text | Subsumed by starter terms — Aaron's stated preference was "I do NOT want this functionality AT ALL; I want defaults". Tracked for completeness; expected unused. |

Other items not in this round (out of scope by ratified Phase boundary):
- **A1 IndexedDB persistence + Projects menu** — Phase 5 work (per FR-U003 amendment intent)
- **Mermaid emitter** — Phase 4 / `ft-112-test-emitter-typefix-2`
- **H + I (domain/range; functional properties)** — v0.5 spec work
- **Validator codes 5-26** — `ft-097-test-validator-2`; 4 of 26 currently shipped

---

## What's new in the substrate (informational; not for testing)

For your awareness — Round 3 also formalized substrate process:

- **FNSR Spec 08 Stakeholder Feedback Round Protocol** — first formally-ratified protocol for stakeholder rounds. Lives at [surfaces/feedback-rounds/surface-spec.md](../surfaces/feedback-rounds/surface-spec.md). Defines 8 phases (Capture → Atomic Decomposition → Categorize → Completeness Map → Adjudicate → Implement → Reconcile → Phase-Close Consume). Anti-pattern AP-1 cites Round 1's Item J as the motivating case for atomic decomposition.

- **Event 13 substrate-gap proposal** — your "Daemon sending a message to the coordinator" framing sketched as FNSR Spec 09 candidate. Detection conditions (architect-denied + applier-ran, developer token-overflow, ready-tasks-with-blocked-deps); emission as audit events; integration with forward-tracks for resolution lifecycle. Largest single v3.2+ substrate proposal so far.

---

## Numbers under the hood

- Spec tests: **129/129 pass** (was 126 pre-Round-3; +3 from starter-terms)
- Playwright tests: **47/47 pass** (was 41; +6 across Round 3 chains)
- TypeScript: clean build + clean ui-typecheck
- Bundle: **396 KB JS** / 23 KB CSS (~+1% from Round 3 additions)
- Validator coverage: 4 of 26 codes (MISSING_REALIST_ANCHOR + INVALID_SPEC_VERSION + LEGACY_REALIST_ANCHOR_PLACEHOLDER + CANONICAL_RESERVED_NAME_COLLISION); remaining 22 stay at `ft-097-test-validator-2`
- Operator-mediation events logged: 13 across 3 rounds + 2 phases
- Forward-tracks open: 3 (Round 3 deferrals) + prior session items

---

## Feedback consolidation

Same shape as prior rounds — drop responses in chat, inline here, or in `demo/FEEDBACK-ROUND-4.md` (the protocol will create it via the decomposition chain when you send feedback).

Suggested prompts:

1. **What feels best about this build?** (Helps me know what to preserve)
2. **What still feels rough?** (Specific to this round's deliverables OR pre-existing surfaces)
3. **What's the next thing you'd reach for that isn't here yet?**
4. **Any UX patterns from another tool you'd want stolen?**
5. **For the Realist Graph Critique loop — anything your coworker should re-review now that the IAO IRI is fixed?**

When you respond, I'll run the same Spec 08 protocol: capture verbatim → atomic decomposition → categorize + completeness map → your Phase 05a adjudication → implementation chains → Phase 07 reconciliation. Item-loss-by-bundling is now a documented anti-pattern.
