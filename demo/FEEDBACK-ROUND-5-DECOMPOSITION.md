---
document_kind: stakeholder-feedback-round-decomposition
round-number: 5
date: 2026-05-23
protocol: FNSR Spec 08 v0.3 (semantic-sme review mandatory upstream of developer for ontology-content items per AP-7; first formal post-amendment Round-N)
companion: demo/FEEDBACK-ROUND-5.md
---

# Feedback Round 5 — Atomic Item Decomposition

**Source:** demo/FEEDBACK-ROUND-5.md (Aaron + coworker Realist Graph Critique, 2026-05-23)
**Protocol chain:** this decomposition → semantic-sme review (pending dispatch) → Phase 05a operator adjudication → implementation chains
**Status:** Pre-SME-review (Phase 02 complete; Phase 03 SME-review pending)

---

## Summary

**Total atomic items: 10** (3 UI + 6 coworker-CCO + 1 foundational scope question)

| Section | Count | Item IDs |
|---|---|---|
| A. UI items (Aaron direct) | 3 | R5-A1, R5-A2, R5-A3 |
| B. Realist Graph Critique (coworker CCO) | 6 | R5-B1 – R5-B6 |
| Q. Foundational scope question | 1 | Q-R5-X |

| Kind | Count | Items |
|---|---|---|
| observation | 0 | — |
| gap | 9 | R5-A1, R5-A2, R5-A3, R5-B1, R5-B2, R5-B3, R5-B4, R5-B5, R5-B6 |
| foundational scope question | 1 | Q-R5-X |

**Ontology-content items:** 7 of 10 (R5-A3 and all R5-B items + Q-R5-X touch ontology semantics; R5-A1 and R5-A2 are pure UX with no semantic content)

**Forward-track flagged:** R5-A1b (ontology-import-driven prefix population) is a forward-track for the future ontology-import feature; not in this round's implementation scope.

**Semantic-sme verdict breakdown (post-review):** PENDING — semantic-sme dispatch will populate `sme_verdict` + `sme_verdict_note` fields below.

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
- **Recommendation:** **Option γ (hybrid).** GraphWrite is a modeling tool; ecm:* scaffolding is legitimate UI/state terminology. But the exported artifact (Turtle download Aaron's coworker reviews) is the consumer-audience surface, and that audience expects CCO compliance. The hybrid lets the tool keep its internal vocabulary while the *export* respects the consumer's strict-CCO discipline. This matches the surface-audience primitive (`surfaces/_primitives/surface-audience.md` v3.1.0): internal/tool-state vs consumer/exported-artifact are different audiences with different quality bars.
- **Sme_verdict:** PENDING

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
- **Scope:** the file where `ecm:Serialization` is defined (likely `src/kernel/canonicalize.ts` `_starter_classes` or a vocab module). Reword comment per coworker's suggestion.
- **Sme_verdict:** PENDING (likely confirm — coworker's reading is consistent with CCO scope notes)
- **Dependencies:** none (independent editorial)
- **Severity:** low (semantic-clarity refinement; not a defect)
- **Adjudication-independent:** YES — applies under both α and β branches.

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
- **Scope:** the file where `ecm:UnspecifiedSubjectMatter` is defined. Reword comment to reference whichever predicate Q-R5-X selects.
- **Sme_verdict:** PENDING (likely confirm — coworker's catch is straightforward stale-reference cleanup)
- **Dependencies:** Q-R5-X (to pick the new predicate reference)
- **Severity:** low (editorial; correctness-defect risk if left stale because users may try to use `iao:isAbout` which no longer resolves)

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

## Implementation-chain shape (post-Phase-05a)

**If Aaron picks Option γ (hybrid; recommended)**:

| Chain | Items | Order |
|---|---|---|
| R5-Chain-1 (UX) | R5-A1a | independent |
| R5-Chain-2 (upload starter-terms) | R5-A2 | independent |
| R5-Chain-3 (Inspector split) | R5-A3 | independent |
| R5-Chain-4 (editorial cleanups) | R5-B2 + R5-B4 | depends on Chain-5 for predicate name selection |
| R5-Chain-5 (CCO bridge layer) | R5-B1 + R5-B3 + R5-B5 (B6 follow-up) | foundational; touches export pipeline |
| R5-Chain-6 (fixture-update) | R5-B6 | depends on Chain-5 (CCO prefix availability) |

Each ontology-content chain queues per Spec 08 v0.3 chain shape: **semantic-sme → developer → architect-ratification → applier → test-runner**, with the architect-ratification gating Pass 2b applier dispatch per the Event 11 fix.

**If Aaron picks Option α (strict CCO-domain)**: chains 1–4 unchanged; chain 5 becomes wholesale predicate replacement (more work; possibly forward-tracked to add CCO-import as prereq for chain 6).

**If Aaron picks Option β (modeler interchange)**: chains 1–3 unchanged; chains 4–6 become declaration-and-justification chains (declare ecm:Instance, add skos:definitions, no predicate substitution). Smallest scope.

---

## Pre-SME-review pending fields

`sme_verdict` and `sme_verdict_note` for all ontology-content items are PENDING. The next protocol step is to dispatch the `semantic-sme` worker agent (per Spec 08 v0.3 AP-7 enforcement) with this decomposition as UPSTREAM input. The SME will:

1. Confirm / confirm-with-detail / dispute each ontology-content item
2. Add any SME-only findings the coworker + Aaron didn't catch
3. Provide Q-R5-X branch-specific guidance (which option the SME recommends)

Once SME-review returns, this document gets updated with the verdict fields populated, and the result is the Phase 05a adjudication packet for Aaron.
