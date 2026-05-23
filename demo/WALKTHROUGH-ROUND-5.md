# GraphWrite Round 5 Walkthrough — Test Round 4 Implementation

Companion to prior walkthroughs. This one covers **what changed since you reviewed in Round 4** — the implementation of your atomic items A through L plus the Property Creation Module per your Refined Mini Spec.

This is also the **first walkthrough produced under Spec 08 v0.3** (semantic-sme review inserted for every ontology-content item). 16 ratified items across 4 implementation chains; SME caught 2 active defects in shipped code (SA1 OWL Full violation; SA3 silent annotation-property drop) — both now fixed.

---

## Setup

1. Open **https://skreen5hot.github.io/GraphWrite/** (Pages redeploys ~2 min after each push; current build is `d6a89c3` + R4-4 commit).
2. Re-download fresh `library-catalog.jsonld` — the fixture was migrated to `{text, lang}` label shape + `ecm:OntologyDesignPattern` type.

---

## What changed by Round 4 chain

### R4-1: SPEC + ADR amendments (foundational)

Documentation only. ADR-008 (rdfs:label as `{text, lang}` object shape — your Phase 05a "cleaner" pick), ADR-009 (rdfs:range emission on `owl:DatatypeProperty` gated on §7.1/§7.5 amendment — your gate-on-amendment pick). FR-U033 (Property Creation Module) added per your Refined Mini Spec. §5.7 lists 4 term types now (added `owl:AnnotationProperty`). §6.1 allowlist + predicate allowlist extended.

### R4-2: Starter terms cleanup + AnnotationProperty type-system (BLOCKING fix)

**Test this:**
1. Click **New** → fill Title + Subject → Create.
2. Look at the Term Sidebar. You should see **3 entries only** (was 16 before this round): `rdfs:label`, `rdfs:comment`, `rdfs:seeAlso` — all under a NEW **Annotation Properties** section (4th section; was 3 before).
3. Click each. They should be **read-only** (starter terms; not editable).

**SA1 + SA3 active defects fixed:**
- Every Turtle export now emits `rdfs:label rdf:type owl:AnnotationProperty` (was `owl:DatatypeProperty` — invalid OWL 2 DL).
- User-created annotation properties are now actually included in semantic exports (was being silently dropped from JSON-LD + Turtle).

### R4-3: Label shape migration `string → {text, lang}` (clean break)

**Test this:**
1. Click a project-created term (e.g., the Book class in the demo). Inspector opens with the Label input pre-filled with the existing text.
2. Change the label to something else. Save. Open the downloaded `.jsonld`. The label field is now an object: `"rdfs:label": { "text": "<new text>", "lang": "en" }` instead of a plain string.
3. Click **Download Turtle**. Open the .ttl. You should see `rdfs:label "<text>"@en` (the language tag).

**Backward compat:** if you have a pre-Round-4 v0.4 file with plain-string labels, opening it auto-coerces labels to `{text, lang: "en"}` on load. So existing project files still open.

### R4-4: Property Creation Module — per your Refined Mini Spec (the new feature)

**Test this:**
1. New project. Open the Term Sidebar.
2. Click **+** on the **Annotation Properties** section. A new dialog opens: **Property Creation**.
3. Fields:
   - **Property Type** radio: Annotation Property (default) / Datatype Property. Switching to Datatype reveals the bottom **Target Data Type** dropdown.
   - **Prefix / Namespace** dropdown: `ex:`, `foaf:`, `schema:` (no `rdf:` — your coworker was right that it's W3C reserved).
   - **Local Name**: regex-masked (`^[a-zA-Z_][a-zA-Z0-9_.-]*$`); async uniqueness check against existing IRIs.
   - **Label** text + **Language Tag** (default `en`; BCP 47 regex).
   - **Target Data Type** (only when Datatype Property selected): XSD primitives — `xsd:string`, `xsd:boolean`, `xsd:integer`, `xsd:decimal`, `xsd:double`, `xsd:date`, `xsd:dateTime`, `xsd:anyURI`. (`rdf:langString` removed — SME caught: it's RDF, not XSD.)
4. Submit. New term appears under the appropriate section (Annotation or Datatype Properties).
5. **Verify Turtle output:** Download Turtle. Find your new property. Should look like:

   - **AnnotationProperty:** `ex:myProp a owl:AnnotationProperty ; rdfs:label "My Prop"@en .`
   - **DatatypeProperty:** `ex:hourlyRate a owl:DatatypeProperty ; rdfs:label "Hourly Rate"@en ; rdfs:range xsd:decimal .`

This matches your Refined Mini Spec section 4 verbatim.

**Feedback hooks:**
- [ ] Does the Property Type radio default feel right?
- [ ] Is the Prefix selector list complete? Anything else you'd want to add?
- [ ] Does the Local Name validation feel responsive (regex masking)?
- [ ] Does the Target Data Type conditional reveal feel natural?

---

## For the Realist Graph Critique loop

Forward your new Turtle export to your coworker for re-review. Notable changes since their last critique:
- `obo:IAO_0000136` is the canonical "is about" predicate (Round 3 R3-S5-01 fix; ADR-007)
- `ecm:OntologyDesignPattern` replaces `iao:OntologyDesignPattern` everywhere (Round 4 ADR-007 propagation cleanup)
- `rdfs:label` is now properly typed `owl:AnnotationProperty` (was `owl:DatatypeProperty` — OWL 2 DL violation; SA1 fix)
- User-created annotation properties now actually appear in semantic exports (SA3 fix)
- New properties use `rdf:langString` (via `rdfs:label "Text"@en`)
- `foaf:` + `schema:` prefixes available for property creation

---

## Substrate-side notes (informational)

- **Spec 08 v0.3 applied for first time:** semantic-sme inserted upstream of developer for every ontology-content chain (R4-1 / R4-2 / R4-3a / R4-4). SME found defects neither you nor the architect would have caught (SA1, SA3, plus 4 lesser findings across the round).
- **Substrate stalls (Event 11/12) fired ~7 times** during Round 4 implementation. Each required operator-action forward-fix. Your Event 13 daemon-notification primitive proposal + the CPS-sequence fix for Event 12 are the highest-leverage substrate work in queue for v3.2/v3.3.
- **Pending: Spec 08 v0.3 formal amendment + AP-7 anti-pattern** (ontology-content-without-SME-review). After this round closes.

---

## Numbers

- Spec tests: **130/130 pass** (was 129 pre-Round-4; +1 from new starter-terms shape validation)
- Playwright tests: **47/47 pass**
- TypeScript: clean build + clean ui-typecheck
- Bundle: ~402 KB JS / 23 KB CSS
- Validator coverage: 4 of 26 codes; remaining 22 stay at `ft-097-test-validator-2`
- Forward-tracks open: ft-r3-s2-03 (handle directionality), ft-r3-s2-05 (narration empty class), ft-r3-s4-01 (label-text collision; subsumed by starter terms)
- Operator-mediation events logged: 13 across rounds

---

## Feedback consolidation

Same shape as prior rounds. Drop responses in chat or `demo/FEEDBACK-ROUND-5.md`.

The Spec 08 v0.3 protocol will run for any new feedback: capture → atomic decomposition → **SME review** → categorize + completeness map → your Phase 05a adjudication → implementation chains (each ontology-content chain with SME upstream) → Phase 07 reconciliation.

Suggested prompts:

1. **What feels best about Round 4 deliverables?**
2. **What did the Property Creation Module miss?**
3. **What feedback from your coworker on the new Turtle output?**
4. **Anything in the still-deferred forward-tracks you'd want to pull forward?**
