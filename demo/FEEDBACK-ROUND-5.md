# Stakeholder Feedback — Round 5

**Reviewer:** Aaron (product owner) + Realist Graph Critique (coworker, strict CCO user)
**Date:** 2026-05-23
**Site under review:** https://skreen5hot.github.io/GraphWrite/
**Build:** commit `d6a89c3` + R4-4 / R4-2 / R4-3 chain landings + this-session substrate fixes (Events 11, 12, 13)
**Walkthrough used:** [WALKTHROUGH-ROUND-5.md](WALKTHROUGH-ROUND-5.md)
**Protocol:** FNSR Spec 08 v0.3 (semantic-sme review now mandatory upstream of developer for ontology-content items per AP-7; first formal Round-N application post-amendment-landing)

**Aaron's note:** "I have other feedback but lets get through this first." — this Round-5 batch is incremental. Round-5b (more feedback after these items land) is anticipated.

---

## Part A — UI feedback (Aaron, direct)

### A1 — Add Property modal: Prefix dropdown extensibility

> Add Property modal: looks good but my direction for the Prefix should include type your own prefix. Later when we addd ontologies it shoudl pick up prefixes from the imported ontologies.

Two related sub-items:
- **A1a (now-scope):** Add "type your own prefix" affordance to the Prefix dropdown. Free-text input alongside the existing `ex:` / `foaf:` / `schema:` curated list.
- **A1b (forward-track):** When ontology-import feature lands, the Prefix dropdown should auto-populate from imported ontologies' declared prefixes. This is a hook-point for future work, not a Round-5 implementation item.

### A2 — Default Annotation Properties always present

> Everything else in Property modal looks good.
>
> Upload Library-catalog.jsonld
> The default system Annotation Properties should ALWAYS be present on upload or new.

The 3 starter annotation properties (`rdfs:label`, `rdfs:comment`, `rdfs:seeAlso`) are added on **New project** but apparently NOT injected when loading an existing JSON-LD file that doesn't already contain them. Defect: upload-path doesn't initialize starter terms.

### A3 — Instance inspector: split DataType Assertion / Annotation Assertion sections

> The Instance gw-inspector:
> Should now have a DataType Assertion AND a Annotation Assertion section. Label shoudl be part of the Annotation Assertion seciton.

Currently the Instance inspector groups all property assertions under one section. Aaron wants:
- **DataType Assertion section** — for `owl:DatatypeProperty`-typed assertions (e.g., `hourlyRate: 50.00`)
- **Annotation Assertion section** — for `owl:AnnotationProperty`-typed assertions (e.g., `rdfs:label`, `rdfs:comment`, `rdfs:seeAlso`, user-created annotation properties)
- The instance's `rdfs:label` belongs in **Annotation Assertion**, not in a separate Label-input region at the top of the inspector.

This is the UI surface of the OWL 2 DL Annotation-vs-Datatype distinction Aaron drilled into in Round 4. The split mirrors how the Term Sidebar split Annotation Properties and Datatype Properties — the Inspector should follow the same partition.

---

## Part B — Realist Graph Critique (coworker, strict CCO user)

The coworker re-reviewed the latest Turtle export (`project (7).ttl`). Verbatim:

> I reviewed `project (7).ttl`. It **parses successfully as Turtle** and still contains **56 triples**, so the revision did not introduce a syntax problem.

### What improved

> The prefix issue is mostly fixed. You now have:
>
> ```ttl
> @prefix obo: <http://purl.obolibrary.org/obo/> .
> ```
>
> and the project aboutness assertion is now:
>
> ```ttl
> obo:IAO_0000136 <https://example.org/subjects/LibraryCatalog>
> ```
>
> That is much better than `iao:isAbout`.
>
> Also, `ecm:OntologyDesignPattern`, `ecm:Project`, and `ecm:Serialization` are all explicitly classified as subclasses of `cco:ont00000958`, **Information Content Entity**. CCO defines Information Content Entity as a generically dependent continuant that generically depends on some Information Bearing Entity and stands in aboutness to some Entity.

### Main remaining issues (B1–B6)

#### B1 — Under strict CCO reuse, prefer `cco:ont00001808` over `obo:IAO_0000136`

> Your current use of:
>
> ```ttl
> obo:IAO_0000136
> ```
>
> is canonical IAO. But in the attached CCO files, the reusable object property is:
>
> ```ttl
> cco:ont00001808
> ```
>
> with label **"is about"**, domain `cco:ont00000958`, and range `obo:BFO_0000001`. The CCO property cites `http://purl.obolibrary.org/obo/IAO_0000136` as its source.
>
> So for this project's rules, I would use:
>
> ```ttl
> <urn:uuid:11111111-1111-4111-8111-111111110001>
>     a ecm:OntologyDesignPattern, ecm:Project ;
>     cco:ont00001808 <https://example.org/subjects/LibraryCatalog> .
> ```
>
> That is more CCO-native than using `obo:IAO_0000136` directly.

#### B2 — `ecm:Serialization` is now acceptable, but the word "concrete" still creates some tension

> This is now not a classification error, given your intent. The axiom says it is an ICE:
>
> ```ttl
> ecm:Serialization rdfs:subClassOf cco:ont00000958 .
> ```
>
> That is formally clear. My remaining concern is only with the comment:
>
> ```ttl
> "An Information Content Entity that is a concrete encoding..."
> ```
>
> Because CCO treats format, language, and medium as bearer-side features rather than the basis for ICE subtyping, the word "concrete" can still invite the bearer reading. CCO's ICE scope note explicitly says subtyping should be based on the entity the ICE is about, rather than characteristics such as format, language, measurement scale, or media.
>
> I would revise the comment to:
>
> ```ttl
> rdfs:comment "An Information Content Entity that represents a project according to the syntax of some serialization format." .
> ```
>
> That preserves your intended ICE reading without implying "file" or "byte stream."

#### B3 — `ecm:isSerializationOf` is a new object property and needs justification

> You added:
>
> ```ttl
> ecm:isSerializationOf a owl:ObjectProperty ;
>     rdfs:label "is serialization of" ;
>     rdfs:domain ecm:Serialization ;
>     rdfs:range ecm:OntologyDesignPattern .
> ```
>
> This is coherent, but under your reuse-first rules it needs either a CCO replacement or a fuller justification. The nearest existing CCO relation is likely `cco:ont00001808` **is about**, since a serialization ICE can be about the project/ODP it serializes.
>
> If you keep `ecm:isSerializationOf`, add a definition:
>
> ```ttl
> ecm:isSerializationOf
>     skos:definition "s is serialization of p iff s is an Information Content Entity that represents p according to the syntax of some serialization format." .
> ```
>
> But if strict CCO compliance is the priority, I would model it as:
>
> ```ttl
> :someSerialization cco:ont00001808 :someProject .
> ```

#### B4 — `ecm:UnspecifiedSubjectMatter` comment is stale

> The comment still says:
>
> ```ttl
> "Its presence in iao:isAbout produces..."
> ```
>
> But there is no longer an `iao:` prefix, and you moved to `obo:IAO_0000136`.
>
> Change that to either:
>
> ```ttl
> "Its presence as the object of cco:ont00001808 produces..."
> ```
>
> or, if you keep direct IAO:
>
> ```ttl
> "Its presence as the object of obo:IAO_0000136 produces..."
> ```

#### B5 — `ecm:Instance` is used but not declared

> Several individuals are typed as:
>
> ```ttl
> a ecm:Instance, <urn:uuid:...BookClass>
> ```
>
> But `ecm:Instance` is not declared in this file. If `ecm:Instance` is UI/modeler metadata, I would avoid using it as an ontological type for domain individuals. Otherwise every book, author, and publisher becomes an instance of a modeling-tool class.
>
> Better:
>
> ```ttl
> <urn:uuid:...aaaaaaaa0001>
>     a <urn:uuid:...cccccccc0001> ;
>     rdfs:label "Dune" .
> ```
>
> If the tool needs to know it is an instance node, use an annotation or a separate modeler metadata graph.

#### B6 — The local `Book` class should still reuse CCO `Book`

> The graph still creates a local UUID class labeled `"Book"@en`. CCO already has `cco:ont00000064` **Book**, defined as an Information Bearing Artifact designed to bear some specific Information Content Entity.
>
> So this:
>
> ```ttl
> <urn:uuid:11111111-1111-4111-8111-cccccccc0001> a owl:Class ;
>     rdfs:label "Book"@en .
> ```
>
> should either be replaced by:
>
> ```ttl
> cco:ont00000064
> ```
>
> or subclass it if this is a project-specific book category:
>
> ```ttl
> <urn:uuid:11111111-1111-4111-8111-cccccccc0001>
>     a owl:Class ;
>     rdfs:subClassOf cco:ont00000064 ;
>     rdfs:label "Book"@en .
> ```

### Coworker verdict

> This revision is a real improvement. The biggest win is eliminating the broken `iao:isAbout` pattern and adding `obo:`. The graph is parseable and the `Serialization` classification is acceptable given your intended reading.
>
> The next changes I would make are:
>
> ```ttl
> # Prefer CCO-native aboutness
> cco:ont00001808
>
> # Clean stale comment
> # "iao:isAbout" -> "cco:ont00001808" or "obo:IAO_0000136"
>
> # Avoid tool class as domain type
> # remove ecm:Instance from domain individuals unless it is intentionally ontological
>
> # Reuse CCO Book
> cco:ont00000064
> ```
>
> The remaining design question is whether the exported graph is meant to be a **CCO-compliant domain graph** or a **modeler interchange graph**. If it is interchange, the local `ecm:*` scaffolding is understandable. If it is domain ontology output, the CCO reuse expectations should be stricter.

### Coworker's foundational scope question (Q-R5-X)

The coworker's closing paragraph raises a project-foundational scope question:

> Is the exported graph meant to be a **CCO-compliant domain graph** or a **modeler interchange graph**?

This decision shapes how Part B items B1, B3, B5, B6 get prioritized. It belongs in Aaron's Phase 05a adjudication packet as a top-of-decomposition question — the answer cascades through every Part B implementation chain.

---

## Capture protocol notes

- **Spec 08 v0.3 (first formal application post-amendment):** semantic-sme review must run upstream of developer for every item with `touches_ontology_content: true`. AP-7 enforces.
- **Decomposition** moves to [FEEDBACK-ROUND-5-DECOMPOSITION.md](FEEDBACK-ROUND-5-DECOMPOSITION.md). Each item gets atomic-ID, `touches_ontology_content` boolean, and (post-SME-review) `sme_verdict` + `sme_verdict_note`.
- **Round-5b expected** per Aaron's "I have other feedback but lets get through this first" signal; this batch lands cleanly first.
