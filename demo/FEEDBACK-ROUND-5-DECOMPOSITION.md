---
document_kind: stakeholder-feedback-round-decomposition
round-number: 5
date: 2026-05-23
protocol: FNSR Spec 08 v0.3 (semantic-sme review mandatory upstream of developer for ontology-content items per AP-7; first formal post-amendment Round-N)
companion: demo/FEEDBACK-ROUND-5.md
revision: v2 (post-SME revision; SME task 374 returned recommendation: revise)
---

# Feedback Round 5 — Atomic Item Decomposition (v2; post-SME-revision)

**Source:** demo/FEEDBACK-ROUND-5.md (Aaron + coworker Realist Graph Critique, 2026-05-23)
**Protocol chain:** this decomposition → semantic-sme review (task 374; DONE) → Phase 05a operator adjudication → implementation chains
**Status:** Post-SME-revision; ready for Phase 05a operator adjudication

**SME revision log:**
- **SME-R5-01 (major)**: NEW atomic item added — stale `@context` in `demo/library-catalog.jsonld` (pre-ADR-007 `iao:` prefix; would expand `iao:isAbout` to wrong IRI in any non-GraphWrite JSON-LD tool). Hidden-defect; not in original decomposition.
- **SME-R5-02 (major)**: scope-field corrections for R5-B2 and R5-B4 — target file is `src/tbox/index.ts` (BOTH `PROJECT_TBOX_TURTLE` template string AND `getProjectTBoxNodes()` array), NOT `src/kernel/canonicalize.ts` as originally cited. Decomposition v1 would have sent developer to the wrong file.
- **SME-R5-03 (advisory)**: extend R5-B6 scope — Author and Publisher classes need the same CCO anchoring as Book (under Option γ). Advisory because Author/Publisher have less obvious CCO counterparts (Author especially — strict CCO models as Role borne by Person, not class of people; may need operator adjudication).
- **Q-R5-X refinement**: SME confirmed Option γ but reframed — *"Option γ is correct, but NOT as a compromise. The ecm:* vocabulary IS legitimately CCO-anchored (`subClassOf cco:ont00000958`). The real issue is that tool-bookkeeping IRIs (`ecm:Instance` as a per-individual type) leak into consumer-facing output."*
- **R5-B1 refinement**: SME recommends RETAINING `obo:IAO_0000136` even under Option γ (canonical source-IRI principle; better cross-ontology alignment if other CCO-adjacent ontologies are later imported).
- **R5-B3 refinement**: SME recommends NOT replacing `ecm:isSerializationOf` with `cco:ont00001808` even under Option γ — the more specific property preserves information the generic one loses. SME suggests declaring `ecm:isSerializationOf` as a sub-property of an aboutness property + adding skos:definition.
- **R5-B6 correction**: SME notes the decomposition's caution about "CCO-import feature prerequisite" is incorrect — `rdfs:subClassOf cco:ont00000064` only needs the `cco:` prefix declared (which it already is). No import-feature dependency.

---

## Summary

**Total atomic items: 12 chain-bearing + 2 scope-only** (3 UI + 6 coworker-CCO + 2 SME-only-new + 1 foundational scope question + 1 SME-scope-correction-no-new-chain)

| Section | Count | Item IDs |
|---|---|---|
| A. UI items (Aaron direct) | 3 | R5-A1, R5-A2, R5-A3 |
| B. Realist Graph Critique (coworker CCO) | 6 | R5-B1 – R5-B6 |
| SME. SME-only findings | 3 | SME-R5-01 (new chain), SME-R5-02 (scope correction; no chain), SME-R5-03 (extends B6) |
| Q. Foundational scope question | 1 | Q-R5-X |

| Kind | Count | Items |
|---|---|---|
| gap (now-scope) | 10 | R5-A1a, R5-A2, R5-A3, R5-B1, R5-B2, R5-B3, R5-B4, R5-B5, R5-B6, SME-R5-01 |
| forward-track | 1 | R5-A1b |
| foundational scope question | 1 | Q-R5-X |
| SME-scope-correction (folded into B-items) | 2 | SME-R5-02, SME-R5-03 |

**Ontology-content items:** 10 of 12 chain-bearing items + Q-R5-X. R5-A1a is pure UX.

**Forward-track flagged:** R5-A1b (ontology-import-driven prefix population) tracks as ft-R5-A1b via Spec 07 forward-track surface.

**SME verdict roll-up (14 findings; 0 disputes):**
- confirm: 6 (R5-A3, R5-B2, R5-B4, R5-B5, SME-R5-01, SME-R5-02)
- confirm-with-detail: 8 (Q-R5-X, R5-A1a, R5-A1b, R5-A2, R5-B1, R5-B3, R5-B6, SME-R5-03)
- dispute: 0

**SME recommendation:** revise (decomposition v1 had scope-file errors; revised in this v2. Phase 05a can proceed once Aaron confirms v2.)

**Severity classification (post-SME):**
- major (blocking-class for implementation correctness): R5-A2, R5-A3, R5-B5, SME-R5-01, Q-R5-X
- minor (editorial / clean-up): R5-B2, R5-B3, R5-B4, R5-B6
- advisory: R5-A1a, R5-A1b, R5-B1, SME-R5-03

---

## Foundational scope question (must be adjudicated first)

### Q-R5-X — Export-graph audience: CCO-compliant domain graph vs modeler interchange graph

- **Atomic claim:** The coworker's closing paragraph raises a project-foundational question whose answer cascades through every Part B implementation chain: "Is the exported graph meant to be a CCO-compliant domain graph or a modeler interchange graph?"
- **Why this comes first:** Items R5-B1, R5-B3, R5-B5, R5-B6 all hinge on the answer.
  - **If CCO-compliant domain graph**: B1 must replace `obo:IAO_0000136` with `cco:ont00001808`; B3 must replace `ecm:isSerializationOf` with `cco:ont00001808` (re-use, not parallel); B5 must remove `ecm:Instance` from individuals; B6 must reuse `cco:ont00000064` for Book.
  - **If modeler interchange graph**: B1 keeps `obo:IAO_0000136` (canonical IAO is fine for interchange); B3 keeps `ecm:isSerializationOf` with skos:definition justification; B5's `ecm:Instance` is fine as modeler metadata (with a declared class); B6's local Book class is fine (subclass of `cco:ont00000064` for graceful upgrade).
- **Touches ontology content:** YES (foundational)
- **Aaron Phase 05a options:**
  - **Option α: CCO-compliant domain graph** — strict CCO reuse; B1/B3/B5/B6 implement the CCO substitutions; ecm:* scaffolding is minimized.
  - **Option β: Modeler interchange graph** — ecm:* scaffolding remains as the tool's interchange layer; B1/B3/B5/B6 implement the *justification* path (declare ecm:Instance, add skos:definition to ecm:isSerializationOf, etc.); CCO terms are referenced for grounding but not substituted.
  - **Option γ: Hybrid (recommended for investigation)** — interchange graph with CCO-bridge layer. Local ecm:* terms remain for tool-side state, but the *export* path emits CCO-canonical predicates (`cco:ont00001808` for aboutness; `cco:ont00000064`-subclass for Book; ecm:Instance stripped from exported individuals). Two-format-aware export.
- **Recommendation:** **Option γ (hybrid)** — SME-confirmed with refined framing.
- **Sme_verdict:** **confirm-with-detail**
- **Sme_verdict_note (verbatim from task 374):** *"Option γ is the ontologically correct choice, but not because it is a 'compromise.' The ecm:* vocabulary is a legitimate CCO-grounded modeler vocabulary. The real issue is that tool-bookkeeping IRIs (ecm:Instance as a type of domain individuals) are leaking into consumer-facing output. Under Option γ, the consumer-facing Turtle expresses pure domain content anchored in CCO; the internal JSON-LD retains the tool vocabulary needed by the UI and projection layer. This maps cleanly to the surface-audience primitive. The SME discipline rejects conflating 'CCO compliance' with 'remove all ecm: terms' — ecm:OntologyDesignPattern and ecm:Serialization ARE CCO-compliant ICE subclasses and belong in the TBox. Only ecm:Instance as a per-individual domain type is the offender."*
- **Implementation consequences (SME-derived):**
  1. Internal JSON-LD project files retain `ecm:Instance` as a type discriminator (needed by projection + UI layers).
  2. `src/emit/turtle.ts` `nodeToQuads()` must skip `ecm:Instance` when emitting `rdf:type` quads for non-TBox nodes.
  3. `demo/library-catalog.jsonld` fixture Book class gets `rdfs:subClassOf cco:ont00000064`.
  4. `obo:IAO_0000136` is RETAINED as the aboutness predicate (NOT replaced with `cco:ont00001808`) per the canonical-source-IRI principle.
  5. `ecm:isSerializationOf` is RETAINED with a `skos:definition` added (NOT replaced with `cco:ont00001808`).

---

## Section A: UI feedback (Aaron direct)

### R5-A1 — Add Property modal: Prefix dropdown extensibility

#### R5-A1a (now-scope) — "Type your own prefix" affordance

- **Atomic claim:** The Add Property modal's Prefix dropdown currently exposes a closed list (`ex:`, `foaf:`, `schema:`). Aaron wants a "type your own prefix" affordance so the user can declare prefixes outside the curated list.
- **Evidence:** "Add Property modal: looks good but my direction for the Prefix should include type your own prefix." (demo/FEEDBACK-ROUND-5.md A1)
- **Kind:** gap
- **Touches ontology content:** NO (pure UX; the prefix-validation logic and resulting IRI shape are unchanged)
- **Scope:** `src/ui/PropertyCreationDialog.tsx` Prefix selector — add "Custom..." option that reveals a free-text input with regex-validation (`^[a-zA-Z][a-zA-Z0-9-]*$` for valid prefix syntax).
- **Sme_verdict:** N/A (no ontology content)
- **Dependencies:** none
- **Severity:** medium (UX completeness)

#### R5-A1b (forward-track) — Auto-populate from imported ontologies

- **Atomic claim:** When the ontology-import feature ships, the Prefix dropdown should auto-populate with prefixes declared by imported ontologies.
- **Evidence:** "Later when we addd ontologies it shoudl pick up prefixes from the imported ontologies." (demo/FEEDBACK-ROUND-5.md A1)
- **Kind:** forward-track (no current implementation scope)
- **Touches ontology content:** YES (semantic — but forward-deferred)
- **Sme_verdict:** N/A pre-implementation (when the import feature is in scope, an SME review of the import contract will be required per Spec 08 v0.3)
- **Dependencies:** ontology-import feature (not currently scoped)
- **Severity:** N/A (forward-track; track via Spec 07 forward-track surface as ft-R5-A1b)

### R5-A2 — Default Annotation Properties always present (upload path)

- **Atomic claim:** The 3 starter annotation properties (`rdfs:label`, `rdfs:comment`, `rdfs:seeAlso` per R4-2 starter-terms cleanup) are injected on **New project** but are NOT injected when the user uploads an existing JSON-LD file that doesn't already contain them. Result: uploaded projects may render without the starter Annotation Properties section populated, breaking the invariant that "Annotation Properties section always shows the 3 starters."
- **Evidence:** "Upload Library-catalog.jsonld. The default system Annotation Properties should ALWAYS be present on upload or new." (demo/FEEDBACK-ROUND-5.md A2)
- **Kind:** gap (defect — upload-path missing starter-term initialization)
- **Touches ontology content:** YES (the starter terms ARE ontology content; their presence-or-absence in the loaded graph is a semantic property)
- **Scope:** project-load handler in `src/projection/` or `src/composition/` (wherever upload-deserialization lands). Add: after deserialize, if `rdfs:label` / `rdfs:comment` / `rdfs:seeAlso` are absent from the term table, inject them with the same starter-term shape used at New-project time.
- **Sme_verdict:** PENDING (likely confirm-with-detail — the SME should verify the starter-term shape on upload matches the New-project shape exactly, including `owl:AnnotationProperty` typing and read-only-flag)
- **Dependencies:** none (R4-2 starter-terms landed; this is upload-path-only extension)
- **Severity:** high (every uploaded project file silently violates the type-system invariant; user sees inconsistent UI)

### R5-A3 — Instance inspector: split DataType / Annotation Assertion sections

- **Atomic claim:** The Instance inspector currently groups all property assertions under one section (and exposes a Label input region separately at the top). Aaron wants this split into two sections matching the OWL 2 DL Annotation-vs-Datatype distinction:
  - **DataType Assertion** — for `owl:DatatypeProperty`-typed property assertions
  - **Annotation Assertion** — for `owl:AnnotationProperty`-typed property assertions (`rdfs:label`, `rdfs:comment`, `rdfs:seeAlso`, user-created annotation properties). The instance's `rdfs:label` moves INTO this section, not a separate top-of-inspector input.
- **Evidence:** "The Instance gw-inspector: Should now have a DataType Assertion AND a Annotation Assertion section. Label shoudl be part of the Annotation Assertion seciton." (demo/FEEDBACK-ROUND-5.md A3)
- **Kind:** gap
- **Touches ontology content:** YES (the split codifies the OWL DL Annotation-vs-Datatype distinction at the UI surface; the rendering partition reflects ontology semantics)
- **Scope:** `src/ui/Inspector.tsx` (or equivalent) — partition assertion list by property type; relocate Label input from top-of-inspector to Annotation Assertion section.
- **Sme_verdict:** PENDING (likely confirm — the split is the correct UI surface for the Round 4 type-system work)
- **Dependencies:** R4-2 starter-terms (`rdfs:label` typed as `owl:AnnotationProperty` per SA1 fix); R4-3 label `{text, lang}` shape (Label input behavior unchanged, just relocated)
- **Severity:** medium-high (UI consistency with the type system; novice users currently can't visually distinguish the two assertion kinds)

---

## Section B: Realist Graph Critique (coworker CCO; PRE-Q-R5-X-adjudication)

All B-items are gated by Q-R5-X. The decomposition below describes each item's atomic scope under BOTH branches (CCO-compliant Option α and modeler-interchange Option β / hybrid γ), so the SME review and Aaron's adjudication have complete material.

### R5-B1 — Aboutness predicate: `obo:IAO_0000136` vs `cco:ont00001808`

- **Atomic claim:** The Project's aboutness assertion currently uses `obo:IAO_0000136` (canonical IAO). Strict CCO reuse prefers `cco:ont00001808` (CCO's "is about" which cites IAO_0000136 as its source). The coworker recommends `cco:ont00001808` for CCO-native discipline.
- **Evidence:** "Under strict CCO reuse, prefer `cco:ont00001808` over `obo:IAO_0000136`" (demo/FEEDBACK-ROUND-5.md B1).
- **Kind:** gap (dependent on Q-R5-X)
- **Touches ontology content:** YES
- **Scope:**
  - **Option α (CCO-domain):** replace `obo:IAO_0000136` binding in `src/kernel/canonicalize.ts` VMP_CONTEXT with `cco:ont00001808`; update predicate-allowlist; update all consumers (turtle.ts, projection); migrate any existing project files (one-time coercion on load).
  - **Option γ (hybrid):** keep `obo:IAO_0000136` internally; on Turtle export, alias-emit as `cco:ont00001808`. Requires export-time predicate rewriting.
  - **Option β (interchange):** keep `obo:IAO_0000136` as-is; no change.
- **Sme_verdict:** PENDING
- **Dependencies:** Q-R5-X adjudication; ADR-007 (`iao:isAbout` → canonical IAO migration) precedent
- **Severity:** depends on Q-R5-X (under α: blocking for CCO claim; under β: no-op)

### R5-B2 — `ecm:Serialization` comment: remove "concrete" framing

- **Atomic claim:** The `ecm:Serialization` rdfs:comment uses the word "concrete encoding", which CCO treats as bearer-side framing rather than ICE subtyping. Comment should be reworded to avoid the bearer reading.
- **Evidence:** "Because CCO treats format, language, and medium as bearer-side features rather than the basis for ICE subtyping, the word 'concrete' can still invite the bearer reading. ... I would revise the comment to: 'An Information Content Entity that represents a project according to the syntax of some serialization format.'" (demo/FEEDBACK-ROUND-5.md B2)
- **Kind:** gap (editorial-correction-shape under Spec 03; preserves semantics; reword only)
- **Touches ontology content:** YES (the comment IS ontology content)
- **Scope (CORRECTED per SME-R5-02):** `src/tbox/index.ts` — update BOTH locations:
  1. `PROJECT_TBOX_TURTLE` template string at line 37: `rdfs:comment` value → `"An Information Content Entity that represents a project according to the syntax of some serialization format."`
  2. `getProjectTBoxNodes()` array, `ecm:Serialization` entry at line 96: same `rdfs:comment` value.
  - Both mutations required: `PROJECT_TBOX_TURTLE` feeds Turtle/N-Triples prepend; `getProjectTBoxNodes()` feeds JSON-LD `@graph` insertion.
- **Sme_verdict:** **confirm**
- **Sme_verdict_note (verbatim):** *"Coworker's reading is correct per CCO. The phrase 'concrete encoding' conflates the ICE (the content) with its format/medium (the bearer-side feature). The proposed replacement text is ontologically clean: 'represents a project according to the syntax of some serialization format' grounds the ICE in its aboutness relation to the project (what it is about) and names the syntactic-convention relation."*
- **Dependencies:** none (independent editorial)
- **Severity:** minor (semantic-clarity refinement; not a defect)
- **Adjudication-independent:** YES — applies under all three Q-R5-X branches.

### R5-B3 — `ecm:isSerializationOf`: justify or replace

- **Atomic claim:** The new `ecm:isSerializationOf` ObjectProperty needs either a skos:definition justification (if kept) OR replacement with `cco:ont00001808` (if strict CCO).
- **Evidence:** "This is coherent, but under your reuse-first rules it needs either a CCO replacement or a fuller justification." (demo/FEEDBACK-ROUND-5.md B3)
- **Kind:** gap (dependent on Q-R5-X)
- **Touches ontology content:** YES
- **Scope:**
  - **Option α (CCO-domain):** remove `ecm:isSerializationOf` declaration; rewrite serialization-aboutness assertions to use `cco:ont00001808`.
  - **Option γ (hybrid):** keep `ecm:isSerializationOf` internally; on Turtle export, alias-emit as `cco:ont00001808`. Also add skos:definition for tool-internal users.
  - **Option β (interchange):** keep `ecm:isSerializationOf`; add skos:definition per coworker's suggestion.
- **Sme_verdict:** PENDING
- **Dependencies:** Q-R5-X
- **Severity:** medium (under α: blocking; under β/γ: editorial-correction-shape)

### R5-B4 — `ecm:UnspecifiedSubjectMatter` comment: update stale `iao:isAbout` reference

- **Atomic claim:** The `ecm:UnspecifiedSubjectMatter` comment still references the deprecated `iao:isAbout` predicate. Should reference `cco:ont00001808` OR `obo:IAO_0000136` depending on Q-R5-X.
- **Evidence:** "The comment still says: 'Its presence in iao:isAbout produces...' But there is no longer an `iao:` prefix, and you moved to `obo:IAO_0000136`." (demo/FEEDBACK-ROUND-5.md B4)
- **Kind:** gap (editorial-correction-shape; stale-reference cleanup)
- **Touches ontology content:** YES (the comment IS ontology content)
- **Scope (CORRECTED per SME-R5-02):** `src/tbox/index.ts` — update BOTH locations:
  1. `PROJECT_TBOX_TURTLE` line 49: `rdfs:comment "A placeholder subject used when a project has not yet declared what portion of reality it models. Its presence as the object of obo:IAO_0000136 produces a MISSING_REALIST_ANCHOR validation finding."`
  2. `getProjectTBoxNodes()` line 110: same string.
  - Both feed separate output paths; both must be updated.
- **Sme_verdict:** **confirm**
- **Sme_verdict_note (verbatim):** *"Stale reference confirmed by direct inspection. Both the PROJECT_TBOX_TURTLE raw string and the getProjectTBoxNodes() array must be updated — they feed separate output paths. The decomposition's scope field incorrectly identifies src/kernel/canonicalize.ts as the target; the correct file is src/tbox/index.ts."*
- **Dependencies:** Q-R5-X (which predicate to reference) — under recommended Option γ, the predicate stays `obo:IAO_0000136`.
- **Severity:** minor (editorial; correctness-defect risk if left stale because users may try to use `iao:isAbout` which no longer resolves)

### R5-B5 — `ecm:Instance`: declare-as-tool-metadata OR remove from domain individuals

- **Atomic claim:** Individuals are typed `a ecm:Instance, <urn:uuid:...BookClass>`, but `ecm:Instance` is undeclared in the export file. Two paths: (1) declare `ecm:Instance` as tool-modeler-metadata (with explicit comment); (2) remove `ecm:Instance` from individuals entirely (treat as internal-only flag).
- **Evidence:** "Several individuals are typed as: `a ecm:Instance, <urn:uuid:...BookClass>` But `ecm:Instance` is not declared in this file. If `ecm:Instance` is UI/modeler metadata, I would avoid using it as an ontological type for domain individuals." (demo/FEEDBACK-ROUND-5.md B5)
- **Kind:** gap
- **Touches ontology content:** YES
- **Scope:**
  - **Option α (CCO-domain):** strip `ecm:Instance` from exported individuals; track as internal-only flag (e.g., a side-table or JSON-LD `@graph` partition for tool-internal metadata).
  - **Option γ (hybrid):** strip from Turtle export; keep internally in JSON-LD project file.
  - **Option β (interchange):** declare `ecm:Instance a owl:Class ; rdfs:comment "Modeler-tool metadata; not a domain class." ;` in the vocab module so the export is self-consistent.
- **Sme_verdict:** PENDING
- **Dependencies:** Q-R5-X
- **Severity:** medium (under α/γ: semantic-cleanliness; under β: declaration-completeness)

### R5-B6 — Book class: reuse `cco:ont00000064`

- **Atomic claim:** The graph creates a local UUID class labeled "Book" instead of reusing CCO `cco:ont00000064`. Under strict CCO reuse, should either replace with `cco:ont00000064` directly OR declare as subclass.
- **Evidence:** "The graph still creates a local UUID class labeled `'Book'@en`. CCO already has `cco:ont00000064` Book ... should either be replaced by: `cco:ont00000064` or subclass it if this is a project-specific book category" (demo/FEEDBACK-ROUND-5.md B6)
- **Kind:** gap (dependent on Q-R5-X)
- **Touches ontology content:** YES
- **Scope:**
  - **NOTE:** This is fixture-content concern, not type-system concern. The "Book" class is in the `library-catalog.jsonld` demo fixture, not in the GraphWrite type system or vocab. The fix is to update the FIXTURE (and potentially future-imported-CCO behavior) — NOT a GraphWrite source change.
  - **Option α (CCO-domain):** update `examples/library-catalog.jsonld` to reference `cco:ont00000064` directly OR subclass it. Requires CCO prefix in fixture.
  - **Option γ (hybrid):** fixture stays with local UUID for tool-internal stability; export adds CCO subclass annotation.
  - **Option β (interchange):** no change.
- **Sme_verdict:** PENDING
- **Dependencies:** Q-R5-X; potentially a forward-track if "import CCO" is required to make this work (without imported CCO, `cco:ont00000064` is a dangling reference in the fixture)
- **Severity:** depends on Q-R5-X; under α potentially blocked-on-CCO-import-feature

---

## Section SME: SME-only findings (added in v2 revision)

### SME-R5-01 — Stale `@context` in `demo/library-catalog.jsonld` (HIDDEN DEFECT)

- **Atomic claim (SME finding; coworker + Aaron did not catch):** The library-catalog fixture's embedded `@context` is a pre-ADR-007 context. It contains `"iao": "http://purl.obolibrary.org/obo/iao#"` as a prefix entry AND defines `iao:isAbout` WITHOUT the `"@id": "obo:IAO_0000136"` rewrite that ADR-007 established in VMP_CONTEXT. When this file is processed by any JSON-LD tool other than GraphWrite (which unconditionally replaces `@context` on load via `serializeVmp`), the `iao:isAbout` property expands to `http://purl.obolibrary.org/obo/iao#isAbout` — the pre-ADR-007 incorrect IRI — instead of `http://purl.obolibrary.org/obo/IAO_0000136`. The fixture is a publicly distributed demo file; downstream consumers (the coworker is one such) processing it without GraphWrite get the wrong IRI.
- **Evidence:** `demo/library-catalog.jsonld:45-49` (iao: prefix and iao:isAbout context entries without @id binding); `src/kernel/canonicalize.ts:93` (VMP_CONTEXT iao:isAbout @id alias: 'obo:IAO_0000136'); ADR-007 (iao: prefix removed from VMP_CONTEXT; only the iao:isAbout key retained via @id alias).
- **Kind:** gap (hidden defect; pre-ADR-007 residue)
- **Touches ontology content:** YES
- **Scope:** `demo/library-catalog.jsonld` `@context` block. Replace wholesale with the full VMP_CONTEXT from `src/kernel/canonicalize.ts`. Specifically:
  1. Remove the `"iao": "http://purl.obolibrary.org/obo/iao#"` prefix entry
  2. Add the `"obo": "http://purl.obolibrary.org/obo/"` prefix entry
  3. Update the `iao:isAbout` context entry to: `{ "@id": "obo:IAO_0000136", "@type": "@id", "@container": "@set" }`
  4. Ensure all other VMP_CONTEXT entries are present (including the new `text`/`lang` aliases from R4-3a, and the new `cco:` prefix that will be added under R5-B6).
- **Sme_verdict:** **confirm** (SME's own finding)
- **Sme_verdict_note (verbatim):** *"This is a SEPARATE fix from the B1/B4 items — those fix the TBox; this fixes the fixture document context."*
- **Dependencies:** none (independent fixture-content fix; Q-R5-X independent — applies under all three branches)
- **Severity:** major (hidden defect; affects every downstream consumer of the demo fixture)

### SME-R5-02 — Decomposition v1 scope-field errors (FOLDED INTO B2/B4; no separate chain)

This SME finding does NOT produce a new implementation chain. It is a CORRECTION applied above in the R5-B2 and R5-B4 sections — both items' Scope fields were rewritten from `src/kernel/canonicalize.ts` to `src/tbox/index.ts` (both `PROJECT_TBOX_TURTLE` template AND `getProjectTBoxNodes()` array). Without this v2 correction, the developer dispatched on B2/B4 would have looked in the wrong file.

- **Sme_verdict:** **confirm** (SME's own finding; substrate-discipline correction)

### SME-R5-03 — Extend B6 CCO anchoring to Author and Publisher (advisory)

- **Atomic claim:** The decomposition's R5-B6 scope only addresses the Book class. The fixture also contains Author and Publisher classes; under Option γ, consistent CCO anchoring across all three fixture classes should be the goal of the fixture-update chain.
- **Evidence:** `demo/library-catalog.jsonld:226-236` (Author and Publisher class entries; no rdfs:subClassOf).
- **Kind:** gap (advisory extension of R5-B6 scope)
- **Touches ontology content:** YES
- **Scope under Option γ:**
  1. Book class: `rdfs:subClassOf cco:ont00000064` (Information Bearing Artifact; directly applicable).
  2. Author class: SME advisory — strict CCO models authorship as a Role (`obo:BFO_0000023`) borne by a Person; CCO has a Person class. Operator adjudication needed: subclass cco:Person? Treat as Role assertion? Leave as undecorated local class with comment?
  3. Publisher class: SME advisory — `rdfs:subClassOf` a CCO Organization class if one is available. Operator adjudication.
- **Sme_verdict:** **confirm-with-detail**
- **Sme_verdict_note (verbatim):** *"Author and Publisher have less obvious CCO counterparts than Book. The fixture is a demo and exact CCO mappings for Author and Publisher require domain judgment beyond what the SME can determine from the fixture alone."*
- **Dependencies:** Q-R5-X (Option γ); merges with R5-B6 implementation chain
- **Severity:** advisory (Book is the must-fix; Author/Publisher are optional polish)
- **Aaron Phase 05a sub-decision:** how to handle Author/Publisher CCO anchoring? Three options:
  - **Option γ-1**: Book gets cco:ont00000064; Author and Publisher stay as undecorated local classes (minimal change)
  - **Option γ-2**: Book gets cco:ont00000064; Author and Publisher get advisory rdfs:comment notes documenting the strict-CCO Role/Person and Organization patterns (signals intent without committing to model)
  - **Option γ-3**: Full strict-CCO anchoring for all three — Author as Role-borne-by-Person model, Publisher as cco:Organization subclass (more work; requires CCO IRI lookups)

---

## Categorization + completeness map

### By kind

| Kind | Items |
|---|---|
| pure-UX (no ontology content) | R5-A1a |
| forward-track | R5-A1b |
| ontology-content (now-scope) | R5-A2, R5-A3, R5-B1, R5-B2, R5-B3, R5-B4, R5-B5, R5-B6 |
| foundational-scope-question | Q-R5-X |

### By Q-R5-X dependence

| Q-R5-X dependent | Q-R5-X independent |
|---|---|
| R5-B1, R5-B3, R5-B5, R5-B6 | R5-A1a, R5-A2, R5-A3, R5-B2, R5-B4 |

### By severity

| Severity | Items |
|---|---|
| high | R5-A2 (silent invariant violation on every upload), R5-A3 (UI consistency w/ type system) |
| medium | R5-A1a (UX completeness), R5-B1 (under α), R5-B3 (under α), R5-B5 (under α/β), R5-B6 (under α) |
| low | R5-B2 (editorial), R5-B4 (editorial) |

### By editorial-vs-substantive (Spec 03 Pass 2a classification)

| Editorial-correction-shape (Spec 03 editorial chain) | Substantive (default chain) |
|---|---|
| R5-B2 (reword comment; preserves semantics) | R5-A1a, R5-A2, R5-A3 |
| R5-B4 (stale-reference cleanup; preserves semantics) | R5-B1, R5-B3, R5-B5, R5-B6 (all depend on Q-R5-X and have semantic substance) |

---

## Implementation-chain shape under Option γ (SME-recommended; SME-confirmed)

Under SME's γ-refined framing (`ecm:*` vocabulary RETAINED in TBox; only `ecm:Instance` per-individual leaking is the offender; `obo:IAO_0000136` and `ecm:isSerializationOf` RETAINED), the chains are:

| Chain | Items | Q-R5-X-Dep? | Notes |
|---|---|---|---|
| R5-Chain-1 (UX: prefix free-text) | R5-A1a | no | independent; pure UX with SME-flagged IRI-syntax constraints |
| R5-Chain-2 (upload starter-terms) | R5-A2 | no | independent; SME flagged determinism: must use EPOCH timestamp not live timestamp |
| R5-Chain-3 (Inspector DataType/Annotation split) | R5-A3 | no | independent; SME confirms OWL 2 DL conformance |
| R5-Chain-4 (editorial: TBox comments) | R5-B2 + R5-B4 | adjudication-independent (B2); Q-R5-X informs predicate in B4 (γ → `obo:IAO_0000136`) | target: `src/tbox/index.ts` (NOT canonicalize.ts) per SME-R5-02 |
| R5-Chain-5 (ecm:Instance Turtle-strip) | R5-B5 | γ | target: `src/emit/turtle.ts` `nodeToQuads()` — skip `ecm:Instance` when emitting `rdf:type` quads for non-TBox nodes |
| R5-Chain-6 (ecm:isSerializationOf skos:definition) | R5-B3 | γ | minor: add skos:definition; do NOT remove or replace |
| R5-Chain-7 (fixture: @context refresh + CCO Book) | SME-R5-01 + R5-B6 + SME-R5-03 | γ | target: `demo/library-catalog.jsonld`; chain Q-R5-X-decision on Author/Publisher (γ-1 / γ-2 / γ-3) |

**Adjudication-independent (no Q-R5-X gating):** R5-A1a, R5-A2, R5-A3, R5-B2, SME-R5-01. These can dispatch immediately on Phase 05a confirmation.

**SME γ-resolution:** R5-B1 RETAINS `obo:IAO_0000136` (no chain needed); R5-B3 RETAINS `ecm:isSerializationOf` with added `skos:definition` (Chain-6).

Each ontology-content chain queues per Spec 08 v0.3 chain shape: **semantic-sme → developer → architect-ratification → applier → test-runner**, with architect-ratification gating Pass 2b applier dispatch per the Event 11 fix.

**Under Option α (strict CCO-domain; SME-not-recommended):** Chain 4 becomes a wholesale predicate replacement (cco:ont00001808 substitution); Chain 6 removes ecm:isSerializationOf entirely. More work; loses the more-specific relations.

**Under Option β (modeler interchange; SME-not-recommended):** Chain 5 becomes "declare ecm:Instance as tool-metadata class" rather than strip-from-export. Smallest scope but leaves ecm:Instance in consumer-facing output, which SME identifies as the actual OWL 2 DL hygiene violation.

---

## Aaron's Phase 05a sub-decisions

The decomposition is ready for Phase 05a adjudication. Aaron's required calls:

1. **Q-R5-X master decision**: Option γ (SME-recommended; SME-confirmed framing in the refined sense — `ecm:*` IS legitimately CCO-anchored; only `ecm:Instance` per-individual is the leakage), Option α (strict CCO-domain), or Option β (modeler interchange)?
2. **SME-R5-03 sub-decision (if γ chosen)**: γ-1 (Book only), γ-2 (Book + advisory rdfs:comments on Author/Publisher), or γ-3 (full strict-CCO anchoring for Book + Author + Publisher)?
3. **Chain dispatch order**: dispatch the adjudication-independent chains (1, 2, 3, parts of 4, SME-R5-01) immediately while γ-dependent chains queue? Or full sequential dispatch?

Once decided, implementation chains queue via `state_admin append-tasks` per the Spec 08 v0.3 chain shape above. The Event 11 Pass 2a gating fix (commit `6e41cf5`) is now structurally enforcing architect-ratification → applier gating, so chain stalls of the Round-3/4 shape are no longer possible.
