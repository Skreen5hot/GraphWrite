# Stakeholder Feedback — Round 3

**Reviewer:** Aaron (product owner)
**Date:** 2026-05-22
**Site under review:** https://skreen5hot.github.io/GraphWrite/
**Build:** commit `32af9c9` (Phase 3 round 1 — UI polish + delete + reserved names)
**Walkthrough used:** [WALKTHROUGH-PHASE-3.md](WALKTHROUGH-PHASE-3.md)
**Protocol:** First application of FNSR Spec 08 (stakeholder-feedback-round) discipline — Phases 01 (Capture; this doc) + 02 (Atomic Decomposition; see FEEDBACK-ROUND-3-DECOMPOSITION.md) + downstream phases per Spec 08

---

## Section-by-section (verbatim)

### Section 1 — Empty new project + banner

> Banner is still too aggressive. I do not like to be explicit I like giving objectives and the team discovers how to meet them. But I'll give you a hint. when a user clicks new open a popup with Title and Subject. No more errors. Humans hate to be told they did something wrong.
>
> The bottom error messages do not seem to be "passable" I added a "realist Anchor" but the original error is still there.

### Section 2 — Load demo + canvas

> Labels are good BUT for new nodes it says "New Instance" I cannot find any way to change it.
>
> Relations do NOT have labels at all, I should see them.
>
> Arrowheads are clear and in the correct direction BUT they are Locked in a directionality. Meaning the direction ONLY works when the Subject Node relation is on the bottom and the Object Node relation is on the Top. This is NOT intuitive and will frustrate people. A user should be able to start and end a relation from top to top or bottom to bottom.
>
> In the Right Inspector panel:
> - I now see labels for Subject and Object but they are Locked as "New Instance" this may be related to the label issue.
> - The Plain Language is still missing the class from subject and object:
>   `Plain language (FR-C008): New Instance () married to New Instance ()`

### Section 3 — Delete instance

> Perfect

### Section 4 — Canonical-name collision

> No warning happened it just made a new "label"
>
> ```
> Edit Term
> Label *: label
> Comment: (optional)
> IRI: urn:uuid:4dc2d8d1-5cfb-41ed-9405-b7c4820e967d
> ```
>
> But really I do NOT want this functionality AT ALL I want to see the defaults — pre-populate the standard RDFS + OWL + XSD vocabulary (probably 20-30 properties: rdfs:label/comment/domain/range/subClassOf/subPropertyOf/seeAlso/isDefinedBy + owl:sameAs/equivalentClass/inverseOf/Class/ObjectProperty/DatatypeProperty/etc. + xsd:string/integer/boolean/date/dateTime)

### Section 5 — Turtle export

> Almost perfect. A coworker pointed out we are using the wrong IRI for is_about:
>
> ```
> ObjectProperty: is about
> Term IRI: http://purl.obolibrary.org/obo/IAO_0000136
> Definition: A (currently) primitive relation that relates an information artifact to an entity.
> ```

---

## Protocol notes for this round

This is the **first round** to apply FNSR Spec 08 explicitly. Round 1 (FEEDBACK.md → FEEDBACK-RESPONSE.md) used an ad-hoc chain that skipped atomic decomposition and reconciliation; consequence: Item J's provision-half (pre-populate standard RDFS/OWL vocabulary) got lost. Round 3 explicitly runs through:

- **Phase 01 Capture**: this doc
- **Phase 02 Atomic Decomposition**: FEEDBACK-ROUND-3-DECOMPOSITION.md (next chain produces it; one item per single claim; NO bundling)
- **Phase 03 Categorize + Scope**: same doc; per-item kind + effort + priority
- **Phase 04 Completeness Map**: same doc; per-item list of canonical artifacts that must be updated
- **Phase 05a Operator Adjudication**: Aaron's per-item ratify/amend/defer
- **Phase 06 Implementation**: chains per ratified item
- **Phase 07 Reconciliation**: verify each item's completeness map fully landed
- **Phase 08 Phase-close consumption**: ROADMAP / IMPLEMENTATION_PLAN / demo updates

The point: Item J-style losses should not recur because each atomic claim is tracked through every phase.
