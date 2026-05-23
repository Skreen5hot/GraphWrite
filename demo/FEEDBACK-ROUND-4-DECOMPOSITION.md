---
document_kind: stakeholder-feedback-round-decomposition
round-number: 4
date: 2026-05-23
protocol: FNSR Spec 08 v0.2 + v0.3-amendment-in-effect (semantic-sme review for ontology-content items)
companion: demo/FEEDBACK-ROUND-4.md
---

# Feedback Round 4 — Atomic Item Decomposition

**Source:** demo/FEEDBACK-ROUND-4.md (Aaron, 2026-05-23, commit `cca2e65`)  
**Protocol chain:** recon (urn:fnsr:task:342-recon-r4) → semantic-sme (urn:fnsr:task:343-sme-r4-ontology-check) → this decomposition (urn:fnsr:task:344-dev-r4-decomposition) → Phase 05a operator adjudication  
**Status:** Pending Phase 05a Operator Adjudication

---

## Summary

**Total atomic items: 19**

| Section | Count | Item IDs |
|---|---|---|
| A. Meta / Protocol | 3 | R4-META-1 – R4-META-3 |
| B. Chain γ — Starter Terms Corrections | 5 | R4-STARTER-1 – R4-STARTER-5 |
| C. Type-System Gaps | 3 | R4-TYPESYS-1 – R4-TYPESYS-3 |
| D. Refined Mini Spec — Property Creation | 8 | R4-MINISPEC-1 – R4-MINISPEC-8 |

| Kind | Count | Items |
|---|---|---|
| observation | 8 | R4-META-1–3, R4-STARTER-1–5 |
| gap | 11 | R4-TYPESYS-1–3, R4-MINISPEC-1–8 |

**Ontology-content items:** 16 of 19 (R4-META-2 and R4-META-3 are positive confirmations with no action; R4-META-1 is a process/protocol concern)

**Semantic-sme verdict breakdown (ontology-content items only):**
- confirm: 6 (R4-STARTER-3, R4-TYPESYS-2, R4-MINISPEC-1, R4-MINISPEC-3, R4-MINISPEC-6, R4-MINISPEC-8)
- confirm-with-detail: 10 (R4-STARTER-1, R4-STARTER-2, R4-STARTER-4, R4-STARTER-5, R4-TYPESYS-1, R4-TYPESYS-3, R4-MINISPEC-2, R4-MINISPEC-4, R4-MINISPEC-5, R4-MINISPEC-7)
- dispute: 0

**Blocking-severity items (semantic-sme classification):** R4-STARTER-4 (SA1/S4 — active OWL Full output defect on every exported project) and R4-TYPESYS-1 (SA3/S5 — silent annotation-property data loss in projection pipeline). These two items must land as an atomic set; partial application leaves the type system in an inconsistent state.

---

## Section A: Meta / Protocol

### R4-META-1: Spec 08 AP-6 numbering collision + semantic-sme amendment proposal

- **Atomic claim:** Aaron's meta-concern identifies a structural gap in Spec 08 v0.2: ontology-content atomic items have no mandatory semantic-sme review step in the Phase 06 implementation chain. The feedback document labels the proposed fix "AP-6 in Spec 08 v0.3 work", but AP-6 in the current `surfaces/feedback-rounds/surface-spec.md` (lines 335–341) is already defined for the substrate-escalation-shape anti-pattern.
- **Evidence:** "This triggers a **Spec 08 amendment proposal**: ontology-content atomic items MUST have a semantic-sme review step inserted between Phase 02 (Atomic Decomposition) and Phase 06 (Implementation). Captured as anti-pattern candidate AP-6 in Spec 08 v0.3 work." (demo/FEEDBACK-ROUND-4.md lines 12–18). Conflict: `surfaces/feedback-rounds/surface-spec.md` lines 335–341 (AP-6 already assigned).
- **Kind:** observation
- **Effort estimate:** Medium (surface-spec.md amendment; numbering resolution)
- **Initial priority:** high
- **Touches ontology content:** false
- **Completeness map:**
  - `surfaces/feedback-rounds/surface-spec.md` — resolve AP-6 numbering collision; assign non-colliding number (AP-7 candidate) to the semantic-sme routing amendment
- **Dependencies:** none (process item; does not block implementation chains)
- **Cross-reference to prior rounds:** Anti-pattern AP-1 was motivated by Round 1 Item J's provision-half loss (WALKTHROUGH-ROUND-4.md line 117). This amendment closes the content-domain classification gap that caused Round 3 Chain γ's type errors.

---

### R4-META-2: Chain α — new project flow (positive confirmation)

- **Atomic claim:** Aaron confirms the new project creation flow introduced in Round 3 Chain α is satisfactory. No action items.
- **Evidence:** "The new flow is good" (demo/FEEDBACK-ROUND-4.md line 26)
- **Kind:** observation
- **Effort estimate:** null
- **Initial priority:** null
- **Touches ontology content:** false
- **Completeness map:** (empty)
- **Dependencies:** none
- **Cross-reference to prior rounds:** Round 3 Chain α (R3-S1-01 through R3-S1-04) — closed.

---

### R4-META-3: Chain β — instance + edge labels (positive confirmation)

- **Atomic claim:** Aaron confirms edge labels are now rendering correctly. No action items.
- **Evidence:** "Edge labels are now showing, good." (demo/FEEDBACK-ROUND-4.md line 30)
- **Kind:** observation
- **Effort estimate:** null
- **Initial priority:** null
- **Touches ontology content:** false
- **Completeness map:** (empty)
- **Dependencies:** none
- **Cross-reference to prior rounds:** Round 3 Chain β — closed.

---

## Section B: Chain γ — Starter Terms Corrections

> All items in this section: **Touches ontology content: true**. All relate to the 16 STARTER_TERMS entries introduced by Round 3 Chain γ (R3-S4-02). Semantic-sme review was absent from the Round 3 chain — the v0.3 amendment (R4-META-1) addresses this gap going forward.

### R4-STARTER-1: Remove three owl:Class meta-entries from STARTER_TERMS

- **Atomic claim:** STARTER_TERMS contains 3 entries typed `owl:Class` (with ids `owl#Class`, `owl#DatatypeProperty`, `owl#ObjectProperty`). These are OWL meta-vocabulary built-ins, not domain-ontology terms. Aaron directs removal.
- **Evidence:** "Remove the Classes and Object Properties defaults" (demo/FEEDBACK-ROUND-4.md lines 34–35). Confirmed: `src/validate/starter-terms.ts` lines 127–152.
- **Kind:** observation
- **Effort estimate:** Small
- **Initial priority:** high
- **Touches ontology content:** true
- **Semantic-sme verdict:** confirm-with-detail (SME finding S1 — major severity). Removal is correct. Additional SME finding: `owl:DatatypeProperty` and `owl:ObjectProperty` are themselves typed `owl:Class` in STARTER_TERMS — a further type-assignment error independent of the inappropriateness concern. Per OWL 2 Structural Specification Table 6.1, these are not instances of `owl:Class`. No reclassification is viable.
- **Completeness map:**
  - `src/validate/starter-terms.ts` — remove 3 entries (lines 127–152)
  - `tests/starter-terms.test.ts` — update AC1 count threshold (coordinates with R4-STARTER-2, -4, -5)
  - `semantic-sme review at Phase 06` — complete (this task)
- **Dependencies:** Coordinate with R4-STARTER-2, R4-STARTER-4, R4-STARTER-5 for final AC1 threshold
- **Cross-reference to prior rounds:** Round 3 Chain γ (R3-S4-02) introduced these entries. Round 1 Item J (FEEDBACK-RESPONSE.md line 215) identified the need for standard vocabulary defaults but did not specify meta-vocabulary exclusion.

---

### R4-STARTER-2: Remove nine owl:ObjectProperty entries from STARTER_TERMS

- **Atomic claim:** STARTER_TERMS contains 9 entries typed `owl:ObjectProperty`: four RDFS structural meta-properties (rdfs:domain, rdfs:range, rdfs:subClassOf, rdfs:subPropertyOf) and five OWL built-in axiom predicates (owl:differentFrom, owl:equivalentClass, owl:equivalentProperty, owl:inverseOf, owl:sameAs). Aaron directs removal of all.
- **Evidence:** "we should have NO default OWL or RDF classes or Object properties they do not exist. You are using owl:properties this is not appropriate for this tool." (demo/FEEDBACK-ROUND-4.md lines 34–35). Confirmed: `src/validate/starter-terms.ts` lines 59–120 (RDFS terms) and 153–197 (OWL terms).
- **Kind:** observation
- **Effort estimate:** Small
- **Initial priority:** high
- **Touches ontology content:** true
- **Semantic-sme verdict:** confirm-with-detail (SME findings S2 + SA2 — major severity). Removal is correct. Additional SME finding (SA2): the four RDFS meta-properties have canonical type `rdf:Property` in the RDFS specification — not `owl:ObjectProperty`. This is a metaclass confusion: assigning `owl:ObjectProperty` implies they can be used as ABox predicates relating individuals, which is semantically incoherent. The five OWL built-in predicates (owl:sameAs etc.) operate at TBox/ABox identity level and must not appear as user-selectable domain relations. No correct reclassification exists for any of the 9 entries. Note: the existing handling of rdfs:subClassOf and rdfs:subPropertyOf as structural predicates on class/property term nodes in SPEC §5.7 is correct and unaffected.
- **Completeness map:**
  - `src/validate/starter-terms.ts` — remove 9 entries (lines 59–120, 153–197)
  - `tests/starter-terms.test.ts` — update AC1 count threshold
  - `semantic-sme review at Phase 06` — complete (this task)
- **Dependencies:** Coordinate with R4-STARTER-1, -4, -5 on AC1 threshold. R4-STARTER-3 documents the distinct TBox/ABox rationale for the 4 RDFS structural meta-properties within this set.
- **Cross-reference to prior rounds:** Round 3 Chain γ (R3-S4-02). Round 1 Item J listed `rdfs:domain`, `rdfs:range`, `rdfs:subClassOf` as desirable defaults — this is now reversed based on semantic correctness.

---

### R4-STARTER-3: RDFS structural meta-properties — distinct ABox/TBox rationale for removal

- **Atomic claim:** The four RDFS meta-properties rdfs:domain, rdfs:range, rdfs:subClassOf, rdfs:subPropertyOf warrant a distinct semantic rationale beyond type-assignment error: they operate at TBox schema level (their domains and ranges are rdfs:Class and rdf:Property) and cannot meaningfully serve as user-selectable ABox predicates in a visual graph editor. A triple `<ex:Person rdfs:subClassOf ex:Project>` emitted by the tool would be a class-subsumption axiom, not an instance-level relation, collapsing the ABox/TBox distinction.
- **Evidence:** Same as R4-STARTER-2. `src/validate/starter-terms.ts` lines 59–120.
- **Kind:** observation
- **Effort estimate:** Small (covered by R4-STARTER-2 implementation)
- **Initial priority:** high
- **Touches ontology content:** true
- **Semantic-sme verdict:** confirm (SME finding S3 — major severity). The distinct semantic rationale is confirmed. The TBox/ABox distinction is relevant for SPEC §5.7 rationale documentation.
- **Completeness map:**
  - Implementation covered by R4-STARTER-2
  - `project/SPEC.md` — rationale note for §5.7 explaining RDFS structural meta-property exclusion (advisory; may be deferred to Phase 06 SPEC amendment)
  - `semantic-sme review at Phase 06` — complete (this task)
- **Dependencies:** R4-STARTER-2 (same implementation action)
- **Cross-reference to prior rounds:** Consistent with SPEC §7.5 rdfs:domain/range export deferral. Round 3 Chain γ did not surface this rationale.

---

### R4-STARTER-4: Reclassify rdfs:label, rdfs:comment, rdfs:seeAlso from owl:DatatypeProperty to owl:AnnotationProperty

- **Atomic claim:** Three STARTER_TERMS entries (rdfs:label, rdfs:comment, rdfs:seeAlso) are currently typed `owl:DatatypeProperty` but must be reclassified to `owl:AnnotationProperty` per their declared OWL 2 built-in type. Aaron's table specifies these as the default Annotation Property built-ins.
- **Evidence:** "The current DataType Properties are Annotation Properties." (demo/FEEDBACK-ROUND-4.md lines 34–36). Aaron's table: "Default Built-ins: Annotation Properties: `rdfs:label`, `rdfs:comment`, `rdfs:seeAlso` | Datatype Properties: None" (lines 44–48). Confirmed: `src/validate/starter-terms.ts` lines 50–58 (rdfs:comment), 78–86 (rdfs:label), 95–103 (rdfs:seeAlso) — all typed `owl:DatatypeProperty`.
- **Kind:** observation
- **Effort estimate:** Small (per-entry; cross-cuts multiple files)
- **Initial priority:** high
- **Touches ontology content:** true
- **Semantic-sme verdict:** confirm-with-detail (SME findings S4 + SA1 — **blocking** severity). Reclassification is CORRECT AND MANDATORY. OWL 2 RDF-Based Semantics Table 6.2 declares rdfs:label, rdfs:comment, rdfs:seeAlso as `rdf:type owl:AnnotationProperty`. The current typing violates OWL 2 DL Structural Specification §3.3: annotation property and data property IRI sets must be pairwise disjoint. **Active output defect (SA1):** every new project's Turtle export currently emits `rdfs:label rdf:type owl:DatatypeProperty`, `rdfs:comment rdf:type owl:DatatypeProperty`, `rdfs:seeAlso rdf:type owl:DatatypeProperty` — directly conflicting with the OWL 2 built-in declarations and rendering every exported ontology OWL Full rather than OWL 2 DL. This affects all existing projects. BFO/CCO/IAO grounding (SA5): clean — no new grounding required. Precision note: "Completely ignored by semantic reasoners" in Aaron's table is practically correct but imprecise; canonical statement: annotation property assertions do not participate in the OWL 2 DL consequence relation and do not cause inconsistencies. **Must land atomically with R4-TYPESYS-1.**
- **Completeness map:**
  - `src/validate/starter-terms.ts` — change type to `owl:AnnotationProperty` for rdfs:comment (line 52), rdfs:label (line 79), rdfs:seeAlso (line 97); add `| "owl:AnnotationProperty"` to EcmTermType union (lines 13–16)
  - `tests/starter-terms.test.ts` — add `owl:AnnotationProperty` to VALID_TYPES set (lines 36–40); update AC1 count
  - `project/SPEC.md` — add `owl:AnnotationProperty` to §5.7 allowed type values (line 463) and §6.1 semantic type allowlist (lines 691–695)
  - `src/projection/index.ts` — add `owl:AnnotationProperty` to SEMANTIC_TYPE_ALLOWLIST (co-required with R4-TYPESYS-1)
  - `semantic-sme review at Phase 06` — complete (this task)
- **Dependencies:** R4-TYPESYS-1 — **atomic co-deployment required** (partial application leaves type system inconsistent). Enables R4-TYPESYS-3, R4-MINISPEC-7.
- **Cross-reference to prior rounds:** Round 3 Chain γ (R3-S4-02) introduced the incorrect type assignments. Round 1 Item J provision-half is the root cause of the original omission.

---

### R4-STARTER-5: Remove rdfs:isDefinedBy from STARTER_TERMS

- **Atomic claim:** STARTER_TERMS contains `rdfs:isDefinedBy` typed `owl:DatatypeProperty`. Aaron's table specifies Datatype Property defaults as "None" — this entry must be removed.
- **Evidence:** Aaron's table: "Default Built-ins: ... Datatype Properties: **None** (user-defined or standard vocab like `foaf:age`)" (demo/FEEDBACK-ROUND-4.md lines 44–48). Confirmed: `src/validate/starter-terms.ts` lines 68–76.
- **Kind:** observation
- **Effort estimate:** Small
- **Initial priority:** high
- **Touches ontology content:** true
- **Semantic-sme verdict:** confirm-with-detail (SME finding S7 — major severity). Removal is correct. Additional SME finding: rdfs:isDefinedBy is declared `rdf:type owl:AnnotationProperty` in OWL 2 (RDF-Based Semantics Table 6.2) and is `rdfs:subPropertyOf rdfs:seeAlso`. Its current typing as `owl:DatatypeProperty` is the same OWL 2 DL pairwise-disjointness violation as R4-STARTER-4. The SPEC §5.7.1 reserved-name constraint on rdfs:isDefinedBy must be preserved regardless.
- **Completeness map:**
  - `src/validate/starter-terms.ts` — remove entry lines 68–76
  - `tests/starter-terms.test.ts` — update AC1 count threshold
  - `semantic-sme review at Phase 06` — complete (this task)
- **Dependencies:** Coordinate with R4-STARTER-1, -2, -4 on final AC1 threshold. SPEC §5.7.1 reserved-name list entry preserved.
- **Cross-reference to prior rounds:** Round 3 Chain γ (R3-S4-02). Round 1 Item J listed rdfs:isDefinedBy as a desired default — reversed based on Aaron's corrected table and semantic confirmation.

---

## Section C: Type-System Gaps

### R4-TYPESYS-1: owl:AnnotationProperty absent from EcmTermType, AddTermType, SPEC §5.7, §6.1, and SEMANTIC_TYPE_ALLOWLIST

- **Atomic claim:** `owl:AnnotationProperty` is structurally absent from five locations: (1) `EcmTermType` union in `starter-terms.ts` lines 13–16, (2) `AddTermType` in `AddTermDialog.tsx` lines 17–20, (3) SPEC §5.7 allowed type values (line 463), (4) SPEC §6.1 semantic type allowlist (lines 691–695), (5) `SEMANTIC_TYPE_ALLOWLIST` in `src/projection/index.ts` lines 29–39. The type cannot be represented, validated, displayed, or exported anywhere in the current system.
- **Evidence:** `EcmTermType`: `"owl:Class" | "owl:ObjectProperty" | "owl:DatatypeProperty"` (starter-terms.ts lines 13–16). SPEC §5.7 line 463: `owl:AnnotationProperty` absent. SPEC §6.1 lines 691–695: absent. `src/projection/index.ts:29–39`: `SEMANTIC_TYPE_ALLOWLIST` — `owl:AnnotationProperty` absent.
- **Kind:** gap
- **Effort estimate:** Medium (5 co-required locations across 4 files)
- **Initial priority:** high
- **Touches ontology content:** true
- **Semantic-sme verdict:** confirm-with-detail (SME findings S5 + SA3 — **blocking** severity). Gap confirmed across all five layers. Critical additional finding (SA3): `projectSemantic()` at `src/projection/index.ts` lines 96–99 applies SEMANTIC_TYPE_ALLOWLIST as a step-2 type filter. Any ecm:terms entry typed `owl:AnnotationProperty` is **silently dropped** before reaching the Turtle emitter. User-created annotation properties are accepted by the UI, stored in the project document, and then silently absent from all semantic exports (JSON-LD and Turtle). This silent data-loss defect is independent of the EcmTermType union gap — fixing EcmTermType alone does not fix the export. All five locations must land atomically with R4-STARTER-4.
- **Completeness map:**
  - `src/validate/starter-terms.ts` — add `| "owl:AnnotationProperty"` to EcmTermType (lines 13–16)
  - `src/ui/AddTermDialog.tsx` — add `| "owl:AnnotationProperty"` to AddTermType (lines 17–20); add `TERM_TYPE_LABEL` entry `"owl:AnnotationProperty": "Annotation Property"`
  - `src/projection/index.ts` — add `"owl:AnnotationProperty"` to SEMANTIC_TYPE_ALLOWLIST (lines 29–39)
  - `project/SPEC.md` — add `owl:AnnotationProperty` to §5.7 allowed type values (line 463) and §6.1 semantic type allowlist (lines 691–695); amend FR-U004, §26, §29 to list 4 term types
  - `tests/starter-terms.test.ts` — add `owl:AnnotationProperty` to VALID_TYPES set (lines 36–40)
  - `semantic-sme review at Phase 06` — complete (this task); end-to-end Turtle pipeline re-verify recommended post-implementation
- **Dependencies:** R4-STARTER-4 — **atomic co-deployment required**. Enables R4-TYPESYS-2, R4-MINISPEC-1, R4-MINISPEC-7.
- **Cross-reference to prior rounds:** Round 3 Chain γ (R3-S4-02) missed this gap. Round 1 Item J did not specify annotation properties as a distinct type.

---

### R4-TYPESYS-2: TermSidebar 3-bucket partition missing annotationProperties bucket

- **Atomic claim:** `partitionTerms` in `TermSidebar.tsx` returns a 3-bucket object (`{ classes, objectProperties, datatypeProperties }`) with no `annotationProperties` bucket. The sidebar renders exactly 3 `<TermSection>` components. SPEC FR-U004 (line 1327) and §26 (line 1629) both specify only 3 term types — these specs are themselves out-of-date with the corrected ontology model.
- **Evidence:** `partitionTerms` return type: `{ classes: TermEntry[]; objectProperties: TermEntry[]; datatypeProperties: TermEntry[] }` (TermSidebar.tsx lines 50–70). FR-U004: "Display a term sidebar with classes, object properties, and datatype properties." (SPEC.md line 1327). §26 line 1629: 3 term types in left sidebar.
- **Kind:** gap
- **Effort estimate:** Medium
- **Initial priority:** high
- **Touches ontology content:** true
- **Semantic-sme verdict:** confirm (SME finding S6 — major severity). 4-bucket partition is correct. FR-U004, §26, and §29 in SPEC.md must be amended to list 4 term types including annotation properties.
- **Completeness map:**
  - `src/ui/TermSidebar.tsx` — extend `partitionTerms` return type to add `annotationProperties: TermEntry[]`; add filter on `type === "owl:AnnotationProperty"`; add 4th `<TermSection title="Annotation Properties" .../>` after Datatype Properties section
  - `project/SPEC.md` — amend FR-U004 (line 1327), §26 (line 1629), §29 Phase 2 (line 1684) to list 4 term types
  - `tests/starter-terms.test.ts` — VALID_TYPES set update (covered by R4-TYPESYS-1)
  - `semantic-sme review at Phase 06` — complete (this task)
- **Dependencies:** R4-TYPESYS-1 (owl:AnnotationProperty must exist in type system first)
- **Cross-reference to prior rounds:** Round 3 Chain γ introduced the 3-section sidebar. SPEC §29 Phase 2 may track this as a planned extension.

---

### R4-TYPESYS-3: rdfs:seeAlso serialized as plain string literal instead of IRI node (new SME finding)

- **Atomic claim (new SME finding — not in recon F1–F18):** `rdfs:seeAlso` has range `rdfs:Resource` in the RDFS specification — it links resources to related resources (typically IRI references), not to plain string literals. `turtle.ts` lines 202–210 treat it as a string-literal predicate, calling `literal(val)`. If a user provides a URI as the rdfs:seeAlso value, the emitter produces a `xsd:string`-typed literal instead of an IRI node, which are semantically distinct in RDF.
- **Evidence (SME finding SA4):** `src/emit/turtle.ts:202–210` (rdfs:seeAlso in string-literal predicates list; `literal(val)` called without IRI detection). RDFS Specification §3.3: `rdfs:seeAlso rdfs:range rdfs:Resource`.
- **Kind:** gap
- **Effort estimate:** Small
- **Initial priority:** medium
- **Touches ontology content:** true
- **Semantic-sme verdict:** confirm-with-detail (SME finding SA4 — minor severity). Gap confirmed. Correction: separate `rdfs:seeAlso` from the string-literal predicates block in `turtle.ts nodeToQuads`. Apply IRI detection: if value matches URL/IRI pattern, emit as `namedNode(expandIri(val))`; otherwise emit as `literal(val)`.
- **Completeness map:**
  - `src/emit/turtle.ts` — separate rdfs:seeAlso from string-literal predicates; add IRI-detection branch
  - `semantic-sme review at Phase 06` — complete (this task)
- **Dependencies:** R4-STARTER-4 (rdfs:seeAlso must be reclassified to AnnotationProperty first so the serialization path is confirmed)
- **Cross-reference to prior rounds:** No prior round equivalent. Surfaced by semantic-sme review — exactly the class of issue the v0.3 amendment (R4-META-1) is designed to catch.

---

## Section D: Refined Mini Spec — Property Creation Module

> All items in this section: **Touches ontology content: true; Kind: gap**. Aaron's verbatim Refined Mini Spec is in demo/FEEDBACK-ROUND-4.md §§1–4 (lines 40–98). Cross-reference: Round 3 Chain γ was silent on dialog internals; these are first-appearance items in Round 4.

### R4-MINISPEC-1: AddTermDialog missing Property Type Toggle (internal state vs prop-driven type)

- **Atomic claim:** `AddTermDialog.tsx` currently receives a fixed `termType` prop from TermSidebar's `setAddDialogType()` calls (lines 249/258/268). Aaron's spec requires an internal Property Type Toggle (Radio Group or Segmented Control, defaulting to `Annotation Property`) that dynamically mounts/unmounts the Target Data Type container when switching to `Datatype Property`.
- **Evidence:** "**Property Type Toggle (Mandatory)** — Radio Group or Segmented Control. Defaults to `Annotation Property`. Switching dynamically mounts/unmounts the **Target Data Type** container." (demo/FEEDBACK-ROUND-4.md line 55). `AddTermDialogProps` interface: `termType: AddTermType` as fixed prop (AddTermDialog.tsx lines 22–28).
- **Kind:** gap
- **Effort estimate:** Medium
- **Initial priority:** medium
- **Touches ontology content:** true
- **Semantic-sme verdict:** confirm (SME finding S8 — minor severity). Defaulting to Annotation Property is ontologically sound: annotation property axioms are opaque to the OWL 2 DL consequence relation and cannot cause logical inconsistencies — the safer default for non-expert users. Conditional Target Data Type rendering for DatatypeProperty only is correct: `owl:AnnotationProperty` range is `rdfs:Literal` (open), so no XSD range picker is needed for annotation properties.
- **Completeness map:**
  - `src/ui/AddTermDialog.tsx` — replace fixed `termType` prop with internal state `useState<'owl:AnnotationProperty' | 'owl:DatatypeProperty'>('owl:AnnotationProperty')`; render toggle control; conditionally render Target Data Type container (R4-MINISPEC-5)
  - `src/ui/TermSidebar.tsx` — review `setAddDialogType` call sites; Class creation path may retain pre-determined initializer
  - `project/SPEC.md` — FR-U006, FR-U007, FR-U008 (lines 1329–1331): update for toggle-based property creation
  - `semantic-sme review at Phase 06` — complete (this task)
- **Dependencies:** R4-TYPESYS-1 (owl:AnnotationProperty must be in type system)
- **Cross-reference to prior rounds:** No prior round equivalent.

---

### R4-MINISPEC-2: AddTermDialog missing Prefix/Namespace Selector

- **Atomic claim:** `AddTermDialog.tsx` has only a plain free-text "IRI override" field (lines 143–157) with no namespace decomposition. Aaron's spec requires a mandatory searchable Prefix/Namespace Selector dropdown pre-populated with app-configured namespaces (`ex:`, `foaf:`, `schema:`, `rdf:`).
- **Evidence:** "**Prefix/Namespace Selector (Mandatory)** — Searchable dropdown. Data source: pre-populated array of app-configured namespaces (`ex:`, `foaf:`, `schema:`, `rdf:`)." (demo/FEEDBACK-ROUND-4.md line 56). Current field: plain free-text IRI override (AddTermDialog.tsx lines 143–157).
- **Kind:** gap
- **Effort estimate:** Medium
- **Initial priority:** medium
- **Touches ontology content:** true
- **Semantic-sme verdict:** confirm-with-detail (SME finding S9 — minor severity). Namespace selector is ontologically necessary. **SME correction:** the `rdf:` prefix must be removed from the dropdown — it is a W3C reserved namespace; adding user-created properties under `rdf:` violates the RDF specification's reserved-prefix contract. Corrected namespace list: `[{ prefix: "ex", ns: "http://example.org/" }, { prefix: "foaf", ns: "http://xmlns.com/foaf/0.1/" }, { prefix: "schema", ns: "https://schema.org/" }]`. Also: `foaf:` and `schema:` are currently absent from PREFIX_MAP in `turtle.ts` lines 33–41 and must be added so composed IRIs serialize with short-form prefixes.
- **Completeness map:**
  - `src/ui/AddTermDialog.tsx` — replace IRI override field with Prefix/Namespace Selector + Local Name fields (coordinates with R4-MINISPEC-3); omit `rdf:` from namespace list
  - `src/emit/turtle.ts` — add `foaf:` and `schema:` to PREFIX_MAP (lines 33–41)
  - `project/SPEC.md` — §5.7 Term Object shape; §5.7.1 Canonical Reserved Names interaction note
  - `semantic-sme review at Phase 06` — complete (this task)
- **Dependencies:** R4-MINISPEC-3 (local name field is sibling input); R4-MINISPEC-6 (payload shape)
- **Cross-reference to prior rounds:** No prior round equivalent.

---

### R4-MINISPEC-3: AddTermDialog missing Local Name field with regex masking

- **Atomic claim:** `AddTermDialog.tsx` performs only a full-IRI duplicate check against `collectExistingIris()` (lines 45–57) with no local-name extraction or regex masking. Aaron's spec requires a mandatory Property Name / Technical ID text input with real-time regex masking (`^[a-zA-Z_][a-zA-Z0-9_.-]*$`) and async uniqueness check on the Namespace + Property Name composite key.
- **Evidence:** "**Property Name / Technical ID (Mandatory)** — real-time regex masking. Validation: `^[a-zA-Z_][a-zA-Z0-9_.-]*$`. Async uniqueness check against active graph (`Namespace + Property Name`)." (demo/FEEDBACK-ROUND-4.md line 57). `collectExistingIris()` lines 45–57; IRI duplicate check lines 80–88 (AddTermDialog.tsx).
- **Kind:** gap
- **Effort estimate:** Medium
- **Initial priority:** medium
- **Touches ontology content:** true
- **Semantic-sme verdict:** confirm (SME finding S10 — minor severity). The regex `^[a-zA-Z_][a-zA-Z0-9_.-]*$` is ontologically sound as a practical ASCII-subset NCName constraint. The composite-key uniqueness check (namespace + localName = composed IRI) is correct — two terms with the same local name but different namespaces are distinct IRIs. Implementation note: the uniqueness check should operate on the composed IRI (expandedNamespace + localName), consistent with the existing `collectExistingIris()` approach.
- **Completeness map:**
  - `src/ui/AddTermDialog.tsx` — add local name text input with real-time regex validation; update uniqueness check to operate on composed IRI
  - `project/SPEC.md` — FR-U013 (line 1336); §5.7 Term Object
  - `semantic-sme review at Phase 06` — complete (this task)
- **Dependencies:** R4-MINISPEC-2 (namespace selector provides the prefix/namespace half of the composite key)
- **Cross-reference to prior rounds:** No prior round equivalent.

---

### R4-MINISPEC-4: AddTermDialog missing language-tagged rdfs:label field

- **Atomic claim:** `AddTermDialog.tsx` captures a plain label string (lines 130–143) with no language tag, emitting `"rdfs:label": trimmedLabel` in the term object (lines 89–99). `turtle.ts` lines 202–210 emit `rdfs:label` as a plain `xsd:string` literal. Aaron's spec requires a mandatory Human Label & Language Tag field: text input paired with `@en`/`@es`/`@fr` dropdown, generating a language-tagged `rdfs:label` triple.
- **Evidence:** "**Human Label & Language Tag (Mandatory)** — Text input paired with small language dropdown (`@en`, `@es`, `@fr`). Generates `rdfs:label` triple. Defaults to `@en`." (demo/FEEDBACK-ROUND-4.md line 58). `literal(val)` call for `rdfs:label` in turtle.ts lines 202–210 (no language tag).
- **Kind:** gap
- **Effort estimate:** Medium
- **Initial priority:** medium
- **Touches ontology content:** true
- **Semantic-sme verdict:** confirm-with-detail (SME finding S11 — minor severity). Language-tagged `rdfs:label` is canonical OWL 2 usage: `rdfs:label` range is `rdfs:Literal` which includes `rdf:langString`. Additional precision: the correct RDF datatype for language-tagged strings is `rdf:langString`, not `xsd:string`. After this change the emitter should call `literal(val, lang)` in N3.js, which produces `rdf:langString` automatically. Storage decision required at Phase 05a: add `ecm:labelLang` field (default `"en"`) alongside `rdfs:label` on term objects, or adopt `{ text, lang }` object shape in SPEC §5.7.
- **Completeness map:**
  - `src/ui/AddTermDialog.tsx` — add language dropdown paired with label input; include `ecm:labelLang` (or equivalent) in newTerm shape
  - `src/emit/turtle.ts` — update rdfs:label predicate handling to call `literal(val, lang)` when lang field is present
  - `project/SPEC.md` — §5.7 Term Object shape (rdfs:label field); §7.1 language-tagged strings
  - `semantic-sme review at Phase 06` — complete (this task)
- **Dependencies:** R4-TYPESYS-1 (annotation property type system); R4-MINISPEC-7 (Turtle output uses language tag)
- **Cross-reference to prior rounds:** No prior round equivalent.

---

### R4-MINISPEC-5: AddTermDialog missing conditional Target Data Type dropdown

- **Atomic claim:** No Target Data Type dropdown exists in `AddTermDialog.tsx`. Aaron's spec requires a conditional field visible only when `Datatype Property` is selected, offering XSD primitives: `xsd:string`, `xsd:integer`, `xsd:decimal`, `xsd:boolean`, `xsd:date`, `xsd:dateTime`. SPEC §5.7 Term Object shape has no `rdfs:range` field.
- **Evidence:** "**Target Data Type Dropdown (Conditional)** — Visible only if `Datatype Property` selected. Options: XSD primitives." (demo/FEEDBACK-ROUND-4.md line 59). No data-type dropdown in AddTermDialog.tsx form JSX (lines 114–196). SPEC §5.7 lines 447–463: no `rdfs:range` field.
- **Kind:** gap
- **Effort estimate:** Small (UI field) / Medium (if rdfs:range export is in scope)
- **Initial priority:** medium
- **Touches ontology content:** true
- **Semantic-sme verdict:** confirm-with-detail (SME finding S12 — minor severity). Conditional dropdown is ontologically correct: `owl:DatatypeProperty rdfs:range` must be an XSD datatype IRI or OWL DataRange (OWL 2 DL §9.3). **Critical constraint:** `rdfs:range` on `owl:DatatypeProperty` MUST reference an XSD datatype IRI — not an `owl:Class` IRI; validator must enforce this. Implementing rdfs:range export conflicts with SPEC §7.5, which explicitly defers it. **Operator decision required (Phase 05a):** build UI field + store rdfs:range on term object now (deferring Turtle emission to R4-MINISPEC-8 / SPEC amendment), OR gate the entire item on SPEC §7.1/§7.5 amendment.
- **Completeness map:**
  - `src/ui/AddTermDialog.tsx` — add conditional XSD dropdown; include `rdfs:range` in newTerm shape when DatatypeProperty selected
  - `project/SPEC.md` — §5.7 Term Object shape: add `rdfs:range` field; §7.1/§7.5 amendment (if rdfs:range export ratified)
  - `src/emit/turtle.ts` — rdfs:range emission (gated on SPEC §7.5 amendment; see R4-MINISPEC-8)
  - `semantic-sme review at Phase 06` — complete (this task)
- **Dependencies:** R4-MINISPEC-1 (type toggle controls conditional visibility); R4-MINISPEC-8 (Turtle emission of rdfs:range)
- **Cross-reference to prior rounds:** SPEC §7.5 explicit v0.3 deferral (direct conflict requiring operator adjudication). No prior round equivalent.

---

### R4-MINISPEC-6: Frontend-to-Backend JSON payload shape mismatch

- **Atomic claim:** The current `newTerm` object in `AddTermDialog.tsx` (lines 89–99) is flat: `{ "ecm:createdAt", "ecm:ontologyId", "ecm:source", "ecm:updatedAt", id, "rdfs:label", type }`. Aaron's Refined Mini Spec defines a structured payload: `{ propertyType, namespace, prefix, localName, label: { text, lang }, range }` with namespace/localName decomposition and structured label.
- **Evidence:** Aaron's JSON payload schema (demo/FEEDBACK-ROUND-4.md lines 63–74). Current `newTerm` construction (AddTermDialog.tsx lines 89–99).
- **Kind:** gap
- **Effort estimate:** Small (integration point; follows from R4-MINISPEC-2/3/4/5)
- **Initial priority:** medium
- **Touches ontology content:** true
- **Semantic-sme verdict:** confirm (SME finding S13 — advisory severity). Payload shape is ontologically well-formed. The namespace + localName decomposition correctly models IRI construction. `label: { text, lang }` correctly models `rdf:langString`. `range` as XSD IRI for DatatypeProperty and null for AnnotationProperty correctly reflects the ontological distinction.
- **Completeness map:**
  - `src/ui/AddTermDialog.tsx` — update `newTerm` construction: IRI = namespace + localName; `rdfs:label` = label.text with `ecm:labelLang` = label.lang; `rdfs:range` = range IRI or null
  - `project/SPEC.md` — §5.7 Term Object shape: align with structured payload
  - `semantic-sme review at Phase 06` — complete (this task)
- **Dependencies:** R4-MINISPEC-2, R4-MINISPEC-3, R4-MINISPEC-4, R4-MINISPEC-5 (this item is the integration point for all four)
- **Cross-reference to prior rounds:** No prior round equivalent.

---

### R4-MINISPEC-7: Turtle serialization missing for owl:AnnotationProperty terms

- **Atomic claim:** User-created annotation property terms cannot reach the Turtle emitter under the current pipeline: `SEMANTIC_TYPE_ALLOWLIST` in `projection/index.ts` silently drops them before `nodeToQuads` is called. Additionally, language-tagged `rdfs:label` is not yet emitted (calls `literal(val)` with no lang). Target Turtle: `ex:internalNote a owl:AnnotationProperty ; rdfs:label "Internal Note"@en .`
- **Evidence:** `src/projection/index.ts:29–39` (SEMANTIC_TYPE_ALLOWLIST: owl:AnnotationProperty absent). `src/emit/turtle.ts:175–178` (type field emitted as rdf:type — correct once terms reach this code). `src/emit/turtle.ts:202–210` (rdfs:label as plain literal — no language tag). Target Turtle: demo/FEEDBACK-ROUND-4.md lines 79–87.
- **Kind:** gap
- **Effort estimate:** Small (prerequisite work covered by R4-TYPESYS-1 and R4-MINISPEC-4)
- **Initial priority:** medium
- **Touches ontology content:** true
- **Semantic-sme verdict:** confirm-with-detail (SME finding S14 — major severity). Turtle target is correct OWL 2 syntax. The `a owl:AnnotationProperty` triple requires no new turtle.ts code — lines 175–178 already emit `rdf:type` from the `type` field; once annotation property terms pass projection, the declaration triple is automatic. Gap 1: SEMANTIC_TYPE_ALLOWLIST (prerequisite, blocking — covered by R4-TYPESYS-1). Gap 2: language-tagged rdfs:label — covered by R4-MINISPEC-4.
- **Completeness map:**
  - `src/projection/index.ts` — add `owl:AnnotationProperty` to SEMANTIC_TYPE_ALLOWLIST (co-required; covered by R4-TYPESYS-1)
  - `src/emit/turtle.ts` — `literal(val, lang)` for rdfs:label (covered by R4-MINISPEC-4); no other changes needed for annotation property declaration triple
  - `semantic-sme review at Phase 06` — complete (this task)
- **Dependencies:** R4-TYPESYS-1 (blocking prerequisite); R4-MINISPEC-4 (language-tagged label)
- **Cross-reference to prior rounds:** Round 3 Chain γ (R3-S4-02) did not surface this because `owl:AnnotationProperty` was not in the type system at all.

---

### R4-MINISPEC-8: Turtle serialization missing rdfs:range for owl:DatatypeProperty terms

- **Atomic claim:** `turtle.ts` IRI-valued predicates loop (lines 191–200) does not include `rdfs:range`. SPEC §5.7 has no `rdfs:range` field. SPEC §7.1 explicitly defers rdfs:range export ("not exported as rdfs:domain / rdfs:range triples in v0.3"). Target Turtle: `ex:hourlyRate a owl:DatatypeProperty ; rdfs:label "Hourly Rate"@en ; rdfs:range xsd:decimal .`
- **Evidence:** Target Turtle (demo/FEEDBACK-ROUND-4.md lines 89–97). `turtle.ts:191–200`: rdfs:range absent from IRI-valued predicates list. SPEC §7.1 lines 763–764 + §7.5 lines 784–785: explicit deferral.
- **Kind:** gap
- **Effort estimate:** Small (once SPEC amendment is ratified)
- **Initial priority:** medium
- **Touches ontology content:** true
- **Semantic-sme verdict:** confirm (SME finding S15 — minor severity). Turtle target is ontologically correct OWL 2 DL. `rdfs:range` is optional per OWL 2 — omission is valid but omits type-checking information. Implementation requires SPEC §7.1/§7.5 amendment. **Ontological hard constraint for implementation:** when `rdfs:range` is present on `owl:DatatypeProperty`, the value MUST be an XSD datatype IRI or OWL DataRange — not an `owl:Class` IRI. Validator must enforce this.
- **Completeness map:**
  - `project/SPEC.md` — §7.1 and §7.5 amendment (prerequisite; requires operator ratification at Phase 05a)
  - `src/emit/turtle.ts` — add `rdfs:range` to IRI-valued predicates loop at line 191 (gated on SPEC amendment)
  - `src/projection/index.ts` — add `rdfs:range` to SEMANTIC_PREDICATE_ALLOWLIST (lines 55–76)
  - `project/SPEC.md` — §5.7 Term Object shape: add `rdfs:range` field on DatatypeProperty terms
  - `semantic-sme review at Phase 06` — complete (this task)
- **Dependencies:** R4-MINISPEC-5 (UI captures range value); SPEC §7.5 operator adjudication required before implementation
- **Cross-reference to prior rounds:** SPEC §7.5 explicit v0.3 deferral (direct conflict requiring adjudication). No prior round equivalent.

---

## Spec 08 Amendment Summary

**Round 4 triggered the Spec 08 v0.3 amendment proposal.**

**Root cause:** Round 3 Chain γ (R3-S4-02) introduced 16 STARTER_TERMS entries without semantic-sme review. The developer made structural classification errors: rdfs:label/comment/seeAlso typed `owl:DatatypeProperty` instead of `owl:AnnotationProperty`; OWL/RDFS meta-vocabulary included as project-domain terms. The errors were not caught because Spec 08 v0.2 triggers semantic-sme review by file extension (`.jsonld`, `.ttl`, `.owl`) rather than content domain. A TypeScript source file defining ontology vocabulary content was not routed for semantic review.

**Proposed amendment (v0.3):** Ontology-content atomic items — regardless of file extension — MUST have a semantic-sme review step inserted between Phase 02 (Atomic Decomposition) and Phase 06 (Implementation). Classification is by content domain (does this item define or modify ontology vocabulary, type assignments, or semantic predicates?), not by file extension. This is what this decomposition operationalises: all 16 ontology-content items carry semantic-sme verdicts from task 343.

**AP numbering issue:** The feedback document labels the proposed amendment "AP-6 in Spec 08 v0.3 work." However, AP-6 in the current `surfaces/feedback-rounds/surface-spec.md` (lines 335–341) is already assigned to the substrate-escalation-shape anti-pattern. Resolution required at Phase 05a adjudication (see R4-META-1): assign AP-7 or re-examine numbering.

**Why Round 1 Item J matters here:** Round 1 Item J provision-half (FEEDBACK-RESPONSE.md line 215) was the first statement of the "pre-populate standard vocabulary" requirement. It was not extracted as an atomic item and fell through to Round 3. Round 3 Chain γ implemented the provision but with wrong type assignments, because no semantic-sme was in the chain. Round 4 corrects the type assignments. The v0.3 amendment closes the loop: the SME is now a mandatory step for this class of content.

---

## Pending Phase 05a Operator Adjudication Queue

Per FNSR Spec 08: **ratify** (proceed to Phase 06 chain as scoped), **amend** (operator provides scope amendment before queuing), **defer** (move to backlog).

| Item | Short title | Priority | SME severity | Adjudication (2026-05-23) |
|---|---|---|---|---|
| R4-META-1 | AP-6 numbering collision; assign AP-7? | high | N/A | **acknowledged** — assign AP-7 in Spec 08 v0.3 amendment chain |
| R4-META-2 | Chain α positive confirmation | N/A | N/A | acknowledged |
| R4-META-3 | Chain β positive confirmation | N/A | N/A | acknowledged |
| R4-STARTER-1 | Remove 3 owl:Class meta-entries | high | major | **ratify** — Chain R4-2 |
| R4-STARTER-2 | Remove 9 owl:ObjectProperty entries | high | major | **ratify** — Chain R4-2 |
| R4-STARTER-3 | RDFS TBox/ABox rationale in SPEC §5.7 | high | major | **ratify** — Chain R4-1 (SPEC amendment) |
| R4-STARTER-4 | Reclassify rdfs:label/comment/seeAlso to AnnotationProperty **(blocking OWL Full defect)** | high | **blocking** | **ratify** — atomic with R4-TYPESYS-1 in Chain R4-2 |
| R4-STARTER-5 | Remove rdfs:isDefinedBy | high | major | **ratify** — Chain R4-2 |
| R4-TYPESYS-1 | 5-location AnnotationProperty type-system fix **(silent data-loss defect; atomic with R4-STARTER-4)** | high | **blocking** | **ratify** — Chain R4-2 (atomic w/ R4-STARTER-4) |
| R4-TYPESYS-2 | TermSidebar 4th bucket + SPEC FR-U004/§26/§29 update | high | major | **ratify** — Chain R4-1 (SPEC) + Chain R4-2 (UI) |
| R4-TYPESYS-3 | rdfs:seeAlso IRI-detection in turtle.ts | medium | minor | **ratify** — Chain R4-2 |
| R4-MINISPEC-1 | Property Type Toggle inside AddTermDialog | medium | minor | **ratify** — Chain R4-4 |
| R4-MINISPEC-2 | Prefix/Namespace Selector; confirm rdf: removal | medium | minor | **ratify** — Chain R4-4 (per SME SA5 — rdf: removed; foaf:+schema: added to PREFIX_MAP) |
| R4-MINISPEC-3 | Local Name field + regex masking | medium | minor | **ratify** — Chain R4-4 |
| R4-MINISPEC-4 | Language-tagged rdfs:label | medium | minor | **ratify** — Aaron picked `{text, lang}` object shape; fixture migration required (Chain R4-3) |
| R4-MINISPEC-5 | Conditional Target Data Type dropdown; UI-now vs gate-on-§7.5-amendment? | medium | minor | **ratify** — Aaron picked: gate entire item on SPEC §7.1/§7.5 amendment first (Chain R4-1 spec; Chain R4-4 UI) |
| R4-MINISPEC-6 | Structured JSON payload shape | medium | advisory | **ratify** — Chain R4-4 |
| R4-MINISPEC-7 | AnnotationProperty Turtle output path | medium | major | **ratify** — auto-resolves after R4-TYPESYS-1 (Chain R4-2) |
| R4-MINISPEC-8 | rdfs:range Turtle emission; SPEC §7.1/§7.5 amendment scope | medium | minor | **ratify** — gated on R4-MINISPEC-5; lands in Chain R4-4 after SPEC §7.5 amendment in Chain R4-1 |

### Chain dependency order

- **Chain R4-1** (SPEC + ADR amendments): §5.7 AnnotationProperty + label-as-{text,lang} shape; §7.1/§7.5 rdfs:range emission; §FR-U004/§26/§29 TermSidebar 4-bucket; §5.7.3 (or similar) RDFS TBox/ABox rationale; new FR-U for Property Creation Module spec; DECISIONS.md ADR-008 for label-shape decision; ADR-009 for rdfs:range emission. **Must land first.**
- **Chain R4-2** (Type-system + starter-terms BLOCKING batch): R4-STARTER-1/2/4/5 + R4-TYPESYS-1/2/3. Touches src/validate/starter-terms.ts + src/projection/index.ts + src/emit/turtle.ts + src/ui/TermSidebar.tsx + new EcmTermType. **Atomic batch — must land together.** Depends on Chain R4-1.
- **Chain R4-3** (Fixture migration): every existing fixture's `rdfs:label` plain-string → `{text, lang}` object shape. Touches test/fixtures/canonical-v0.4/* + tests/playwright/fixtures/* + demo/library-catalog.jsonld + Phase 1 spec tests asserting on label. Depends on Chain R4-1.
- **Chain R4-4** (Property Creation Module / AddTermDialog redesign): R4-MINISPEC-1 through 8. Full new dialog UX per Aaron's Refined Mini Spec. Depends on Chains R4-1 + R4-2 + R4-3.

**Round 4 implementation chain count: 4 chains in strict dependency order.**

**Open questions from recon (task 342) — disposition:**

1. **AP-6 numbering collision** — unresolved; surfaced in R4-META-1 and Spec 08 Amendment Summary above.
2. **AC1 threshold after removals** — after R4-STARTER-1 + R4-STARTER-2 + R4-STARTER-4 + R4-STARTER-5: remaining STARTER_TERMS = rdfs:label, rdfs:comment, rdfs:seeAlso typed `owl:AnnotationProperty` (3 entries). AC1 must be updated. Operator to confirm whether additional annotation properties are planned for the final set.
3. **SPEC §7.1 rdfs:range export** — surfaced in R4-MINISPEC-5 and R4-MINISPEC-8. Requires explicit SPEC version bump or targeted §7.1/§7.5 amendment. Operator adjudication at Phase 05a.
4. **AddTermDialog prop vs internal state** — addressed in R4-MINISPEC-1 (toggle replaces fixed prop for property creation path; Class creation may retain initializer).
5. **Language-tagged rdfs:label storage shape** — addressed in R4-MINISPEC-4. Operator to decide: `ecm:labelLang` field alongside `rdfs:label` string, or `{ text, lang }` object shape in SPEC §5.7.
6. **Reserved-name constraint vs starter-term entries** — no interaction issue: rdfs:label/comment/seeAlso remain in `ecm:terms` as `ecm:source: ecm:system-starter-example`; SPEC §5.7.1 reserved-name constraint applies to user-reminting, not to starter entries.
