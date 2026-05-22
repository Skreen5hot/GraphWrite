# Stakeholder Feedback — First Pass

**Reviewer:** Aaron (product owner)
**Date:** 2026-05-21
**Site under review:** https://skreen5hot.github.io/GraphWrite/
**Build:** commit `727c431` (Phase 2 + Pages deploy + demo)
**Walkthrough used:** [WALKTHROUGH.md](WALKTHROUGH.md)

Aaron asked me to pause and not dispatch anything until he thinks through the bigger items. This doc captures the feedback verbatim so it doesn't get lost. No action taken yet.

---

## Section-by-section (verbatim)

### Section 1 — First impressions (empty new project)

> What is "MISSING_REALSIT_ANCHOR" even mean. I just opened the app and it is yelling at me that I did somethign wrong. This is no clear resolution. I click Add subject IRI and I se iao:isAbout ecm:UnspecifiedSubjectMatter... so now what? How about before throwing an error have a popup to select what the graph is about.

### Section 2 — Loading the demo project

> Loads with no erros. The visual graph is present but NO labels on the nodes or predicates. The predicate edgres have no arrow head representing direction.
>
> When I click a node I see it is an instance of an author but NO literal Assertions no labels. Why is that in the relation only?

### Section 3 — Inspecting an existing relation

> I see the Subject Predicat and Object but the Subject is and IRI (no label) the predicate is a dropdown of labels (no IRI) and the Object is a IRI no label. I like the plain language and the tripple. I guess I would like to see plan language next to IRIs in the Subject  and Object section too. Object Properties have no visible domain and range restrictions.

### Section 4 — Editing a relation

> Save = download is NOT obvious Save should be saving to IndexedDB or Local Storage. I should then see a project menu to see saved items. I thought that was in the spec. Download is Download NOT saving.

### Section 5 — Creating a new instance

> RDFS:Label (and other RDFS and OWL properties should be defalut opptions) Label should be visible on the graphical node. Double-click was NOT discoverable I had to read it. It is good to have but I was trying to DRAG a class onto the canvase. How do I delete a node once I make it?

### Section 6 — Drawing a relation between nodes

> Easy to draw relation, but missing directional arrow head. I am concerned that I am not seeing the Plain Lanugage as if it is not "reading" it properly. Where did the book example get "dune"?

Inspector content Aaron observed (newly-created instances, both labeled "New Instance"; literal assertion "name" set to "Robin" and "Aaron"):

```
Relation
Subject: urn:uuid:e22b02a7-80d3-4bab-a131-50e6ea5cc9c3
Predicate: (unassigned)
Object: urn:uuid:1e4ed383-fe52-463d-b27e-f5166b432ad7

Plain language (FR-C008): New Instance () ecm:UnassignedPredicate New Instance ()
IRI triple: <urn:uuid:e22b02a7-80d3-4bab-a131-50e6ea5cc9c3> <ecm:UnassignedPredicate> <urn:uuid:1e4ed383-fe52-463d-b27e-f5166b432ad7> .

Instance: urn:uuid:e22b02a7-...
Class Assignments: No class assignments. [person] [Assign]
Literal Assertions:
  name = Robin

Instance: urn:uuid:1e4ed383-...
Class Assignments: No class assignments. [person] [Assign]
Literal Assertions:
  name = Aaron
```

### Section 7 — Adding a literal assertion

> I was able to add the new literal but the popup is top left not center page.

### Section 8 — Adding a new term (Genre)

> same issues do not see value of the genre "sciFi" in relation

Inspector content Aaron observed:

```
Relation
Subject: urn:uuid:11111111-...-aaaaaaaa0001 (Dune)
Predicate: hasGenre
Object: urn:uuid:2d1ea806-...

Plain language (FR-C008): Dune (Book) hasGenre New Instance ()
IRI triple: <urn:uuid:11111111-...-aaaaaaaa0001> <urn:uuid:a5850d4e-...> <urn:uuid:2d1ea806-...> .
```

### Section 9 — Project Settings (iao:isAbout)

> THis is confusing lable. This is the Subject of the graph.

### Section 10 — Save → reload bytewise round-trip

> perfect

### Section 11 — Turtle export

> Works fine

### Section 12 — Migration notice

> fine

### UI notes (from Aaron, additional)

> the section `<div>` gw-outputs is taking up too much realestate can we limt it to 75px
>
> I am assuming we have not gotten to key functionality. Project Save to IndexedDB or Local. mermaid diagram Export. ect.

---

## Triage (Claude's reading; pending Aaron's review)

### Quick UX fixes (5 items; can land in one chain when greenlit)

1. **Canvas node labels** — show `rdfs:label` on each node; falls back to IRI tail if no label. Currently nodes render as UUIDs.
2. **Edge arrow heads** — React Flow `markerEnd` config; direction should be visible.
3. **Inspector subject/object labels** — show resolved label alongside the IRI in Subject/Object rows of relation-mode Inspector (currently only Triple Preview resolves labels).
4. **Bottom panel sizing** — `gw-outputs` div constrained to ~75px max-height.
5. **Add-Literal dialog centering** — currently top-left; should be center-page (likely a CSS bug in the dialog primitive's position rules).

### Spec-level decisions (7 items; need Aaron's adjudication)

A. **Save semantics: download vs IndexedDB persistence.** FR-U003 currently says "canonical serialize → browser download as project.jsonld". Aaron's reaction suggests this was wrong / he wants IndexedDB persistence + a Projects menu / a separate Download action. Possible SPEC §10.x amendment.

B. **First-time iao:isAbout wizard.** Instead of MISSING_REALIST_ANCHOR error indicator on every new project, prompt for subject at New-project time. FR-U001 amendment.

C. **`iao:isAbout` naming.** User-facing label should be "Subject" or "What is this graph about?" rather than raw ontology shortname.

D. **MISSING_REALIST_ANCHOR vocabulary.** Plain-language version: "This project needs a subject — what real-world thing is it about?" etc.

E. **Mermaid export.** Phase 1 deferred to `ft-112-test-emitter-typefix-2`. Pull forward to Phase 3?

F. **Drag-from-sidebar-to-canvas** as alternative to double-click for node creation. FR amendment.

G. **Delete-node affordance.** Currently no way to delete an instance from canvas. New FR.

### Pattern observation (Claude's read of the rdfs:label vs literal-assertion mental-model mismatch)

Aaron's "Robin" and "Aaron" literals + the "Where did Dune come from" question reveal a real conceptual ambiguity: the app distinguishes between `rdfs:label` (display name; how the entity is rendered in the UI) and **literal assertions** (factual claims like "this person has the name 'Robin'"). The demo fixtures set `rdfs:label` explicitly (so Dune renders as "Dune"), but new instances created via double-click get default `rdfs:label: "New Instance"` until edited via Edit dialog. Aaron's "name=Robin" literal assertion did not update the display label.

This is technically correct per SPEC §5.x semantics, but the UX surface doesn't make the distinction obvious. **Suggested resolution path:**
- Add an inline "Label" field at the top of Inspector instance-mode (separate from literal assertions)
- The Add Instance dialog (if one is added per item F) could prompt for label upfront
- Phase 3 candidate; ties to item F

### Items Aaron flagged as "key functionality not yet built"

- Project Save → IndexedDB / Local Storage (item A)
- Mermaid diagram export (item E)
- "etc." — implies there may be more once Aaron reviews

---

## Realist Graph Critique (Aaron forwarded; 2026-05-21)

Aaron shared a critique of his Turtle export (`Downloads/project (1).ttl`) from a separate Realist-graph reviewer. The critique surfaced data quality and emitter issues. Most of the "data errors" are downstream effects of UX gaps already in items A–G — the app didn't prevent the bad data entry. Three of the critique's points add genuinely new items.

### App-level UX gaps the critique reveals (mostly already in A–G; new items H–L below)

- **Isaac Asimov assigned hasISBN = "1234"** — domain enforcement gap (new: item H below). Aaron's own data-entry error during Section 7 testing, but a domain-aware UI would have warned.
- **"Science Fiction" genre instance assigned hasISBN = "science fiction"** — same domain-enforcement gap; user picked the wrong DP from the dropdown because there was no constraint.
- **Dune has two ISBNs** ("978-0-441-17271-9" + "12345") — functional-property awareness gap (new: item I below).
- **Custom DP labeled "rdfs:label"** — name-collision-with-canonical-property gap (new: item J below; ties to item E in Section 5 RDFS/OWL defaults).
- **"Science Fiction" genre instance not classified as BookGenre** — required-class-assignment gap (new: item L below).

### Emitter quality (Phase 1 residue; ft-112 territory)

- **Turtle prefix abandonment** (new: item K below). Phase 1 `src/emit/turtle.ts` writes long-form URIs (`<https://edgecanonical.org/ns/modeler#Project>`) instead of using declared `@context` prefixes (`ecm:Project`). Makes manual reading hard.

### New spec-level items from the critique

H. **Domain/range enforcement.** `owl:ObjectProperty` and `owl:DatatypeProperty` should declare domain/range; UI should restrict the Add Literal dropdown + Add Relation predicate dropdown to compatible properties (or warn on assignment). Aaron's Section 3 already noted "Object Properties have no visible domain and range restrictions" — this is the same gap, with the critique showing the data-quality consequence.

I. **Functional-property awareness.** Properties marked functional (e.g., hasISBN, hasPublicationYear) should warn when adding a second value to the same subject. Maybe a `owl:FunctionalProperty` type marker that the UI recognizes.

J. **`rdfs:label` and core RDFS/OWL properties as first-class.** Currently a user can create a custom `DatatypeProperty` labeled `"rdfs:label"` (Aaron's own error during Section 5 testing). The app should:
   - Pre-populate the term-list with standard RDFS + OWL properties (rdfs:label, rdfs:comment, owl:sameAs, etc.) as system-starter-example sources
   - Detect when user tries to create a property named like a canonical one and offer to use the canonical instead

K. **Turtle emitter prefix usage.** `src/emit/turtle.ts` should use declared `@context` prefixes (ecm:, iao:, cco:, owl:, rdfs:, xsd:) rather than long-form URIs in the output. Aaron's `@prefix ecm: ...` block at the top of the export is correct — but the body abandons them. Phase 1 quality issue; likely belongs with ft-112 emitter cleanup.

L. **Required class assignment for instances.** When creating an instance, the UI should require (or strongly default to) picking a class at creation time. Currently double-click creates a class-less instance and the user has to remember to use the class-assignment UI afterward.

### Critique's "fixed" Turtle suggestion

The critique provides a manually-cleaned Turtle ABox with proper prefix usage, corrected data, and consolidated subject-blocks. Useful as a reference for what the emitter SHOULD produce after item K lands.

### Aaron's intent on the critique (no action requested)

Aaron shared this as "FYI" alongside his Section-by-section feedback. Per his earlier "pause; let me think about A–G before any more work" instruction, items H–L are documented here but no chain is dispatched. The list now totals 12 spec-level items (A–L) plus 5 quick UX fixes plus the rdfs:label/literal-assertion mental-model pattern observation. Awaiting Aaron's adjudication of which to prioritize for Phase 3 vs further-out.
