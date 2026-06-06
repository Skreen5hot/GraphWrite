# Architecture Decision Records

<!--
  Log decisions here so they survive between AI sessions.
  An AI agent has no memory of yesterday. This file IS its memory.

  Format: Date | Decision | Context | Consequences
-->

## ADR-001: Use JSON-LD Deterministic Service Template

**Date:** [TODAY]

**Decision:** Adopt the JSON-LD Deterministic Service Template as the base architecture.

**Context:** We need a service that produces deterministic, reproducible transformations on structured data. The template provides a pure kernel with spec tests, layered boundaries (kernel/composition/adapters), and zero runtime dependencies.

**Consequences:**
- All transformation logic lives in `src/kernel/transform.ts` as pure functions
- Kernel MUST NOT perform I/O, reference time, randomness, or environment state
- Infrastructure (HTTP, persistence, scheduling) lives in `src/adapters/`
- Spec tests (determinism, no-network, snapshot, purity) MUST pass before any merge

---

<!--
  Add new decisions below. Use the format:

  ## ADR-NNN: [Decision Title]

  **Date:** YYYY-MM-DD

  **Decision:** One sentence stating the choice.

  **Context:** Why this decision was needed. What alternatives were considered.

  **Consequences:** What follows from this decision. What is now easier or harder.
-->

## ADR-002: Excise SPEC §31 Item 14 (Second-Compliant-Implementation DoD)

**Date:** 2026-05-16

**Decision:** Remove the requirement for a second conformant implementation from the v0.4 Definition of Done.

**Context:** SPEC §31 item 14 required a second independent implementation to demonstrate conformance before v0.4 could be declared complete. No second v0.4-conformant implementation is planned; the kgModeler POC (github.com/Skreen5hot/kgModeler) targets a different schema version and is not v0.4-conformant. Retaining the requirement would permanently block the v0.4 exit gate with no actionable path to satisfaction.

**Consequences:**
- The v0.4 DoD no longer requires a second implementation; all remaining exit-gate items are achievable with the primary codebase
- If a conformant second implementation emerges later, interoperability testing can be added as a separate workstream rather than a gate
- Reduced risk of the project stalling on an externally-dependent criterion

---

## ADR-003: Phase 1 Stubs Phase 3/4 CLI Commands

**Date:** 2026-05-16

**Decision:** `import-ontology` and `export --format zip` return exit code 2 in Phase 1 with a stderr message of ‘not yet implemented; available in Phase N’ rather than being fully implemented.

**Context:** These CLI commands belong to Phase 3 (`import-ontology`) and Phase 4 (`export --format zip`) according to the roadmap. Implementing them in Phase 1 would pull in out-of-scope dependencies and inflate the Phase 1 surface area. Alternatives considered: omitting the commands entirely (breaks discoverability), or raising exit code 1 (conflicts with POSIX convention for ‘usage error’; exit code 2 is the standard for ‘not implemented / unavailable in this build’).

**Consequences:**
- Phase 1 CLI is shippable without implementing future-phase features
- Callers receive a predictable, machine-readable signal (exit code 2) rather than a crash or silent no-op
- Phase 3 and Phase 4 must replace the stubs with real implementations before their respective exit gates close
- Stub behaviour must be covered by Phase 1 CLI integration tests to prevent silent regression

---

## ADR-004: Move OED-303 to Phase 1 Exit Gate

**Date:** 2026-05-16

**Decision:** Advance OED-303 (validation report retention policy) from the Phase 3 exit gate to the Phase 1 exit gate.

**Context:** OED-303 defines how validation reports are retained and referenced by golden files. It was originally deferred to Phase 3 on the assumption that validation outputs would not be committed until later. However, Phase 1 golden files now commit real validation outputs, making the retention policy a prerequisite for those files to be meaningful and reproducible. Without the policy in place at Phase 1, golden-file comparisons in CI would be non-deterministic or incomplete.

**Consequences:**
- Phase 1 cannot close until OED-303 is resolved and the policy is documented
- Phase 1 golden files can commit real, policy-compliant validation outputs from day one
- Phase 3 exit gate is simplified by one item
- The retention policy must be designed conservatively enough to remain valid through Phases 2–4 without requiring a breaking change

---

## ADR-005: Create OED-313 (Conformance Fixture Set Scope)

**Date:** 2026-05-16

**Decision:** Introduce OED-313 to track which input fixtures belong in Phase 1 versus Phase 4 golden files, designated as a joint Phase 1 and Phase 4 exit gate.

**Context:** As the conformance fixture set grew it became unclear which fixtures must pass before Phase 1 closes versus which may be deferred to Phase 4. Without an explicit decision record, contributors were making ad-hoc choices that risked either over-committing Phase 1 scope or leaving Phase 4 with an unverified fixture set. OED-313 creates a named, trackable decision item rather than leaving fixture assignment implicit. Status is Open pending fixture enumeration.

**Consequences:**
- Phase 1 exit gate will not close until OED-313 is resolved with an agreed fixture list
- Phase 4 exit gate will not close until all Phase 4 fixtures in OED-313 have passing golden files
- Fixture scope is now an explicit, auditable decision rather than an implicit engineering choice
- The OED-313 resolution task must be queued before either Phase 1 or Phase 4 can be declared complete

---

## ADR-006: VMP Canonical Serializer Uses Custom Recursive Key-Sorter

**Date:** 2026-05-19

**Decision:** Implement the VMP canonical serializer (`serializeVmp`) as a custom recursive key-sorter operating on plain JS objects, not via JSON-LD library expansion/compaction.

**Context:** SPEC.md §5.3 defines a deterministic serialization form requiring positional top-level key ordering, named-array sorting by element `id`, IRI-array lexicographic sorting, and ISO 8601 timestamp normalization. Two strategies were available: (1) use a `jsonld` npm library expansion/compaction pipeline; (2) implement a purpose-built recursive sorter over plain JS objects. Option 1 adds a runtime dependency, carries remote-context-fetch risk (mitigated by the bundled context, but the library's compaction pipeline may emit non-deterministic key orderings across versions), and diverges from the zero-runtime-dependency constraint established by ADR-001. Option 2 requires no new dependency, is fully transparent, and produces stable output entirely determined by this codebase. IMPLEMENTATION_PLAN.md §1.1 explicitly constrains the approach: "Implement as a custom recursive key-sorter on plain JS objects, not via JSON-LD expansion/compaction. Use the JSON-LD library only at the semantic-export boundary."

**Consequences:**
- Zero runtime dependency added; the kernel zero-dependency constraint (ADR-001) is preserved
- The normative §5.2 `@context` is bundled as `VMP_CONTEXT` in `src/kernel/canonicalize.ts` — no remote fetch occurs at any point in the serialization path
- Serialization output is fully determined by `serializeVmp`; no library-version variance
- Timestamp normalization (strip fractional seconds, replace offsets with `Z`) is the serializer's responsibility, not the caller's; callers may pass non-canonical timestamps and receive normalized output
- The JSON-LD library (if adopted) is deferred to Phase 1 task 1.5 (semantic-export boundary) where expansion/compaction semantics are required

---

## ADR-007: Re-home ecm:OntologyDesignPattern and Fix iao:isAbout IRI Expansion

**Date:** 2026-05-22

**Decision:** Rename `iao:OntologyDesignPattern` to `ecm:OntologyDesignPattern` throughout the codebase, and fix the `iao:isAbout` JSON-LD property to expand to the canonical IAO IRI `http://purl.obolibrary.org/obo/IAO_0000136` via an `@id` alias binding in `VMP_CONTEXT`.

**Context:** Reconnaissance (task urn:fnsr:task:322-recon-r3-delta) identified two issues. First, `iao:OntologyDesignPattern` used the vestigial `iao:` prefix (`http://purl.obolibrary.org/obo/iao#`), a speculative namespace that does not match the actual IAO numeric-IRI pattern (`IAO_NNNNNNN`). Keeping the term under `iao:` risks a naming collision if IAO ever defines a native ODP class. Re-homing under `ecm:` removes that ambiguity and makes the term's provenance explicit. Second, `iao:isAbout` as used in the codebase expanded to `http://purl.obolibrary.org/obo/iao#isAbout`, which is wrong; the canonical IAO property is `http://purl.obolibrary.org/obo/IAO_0000136`. The fix uses an `@id` alias binding (`"@id": "obo:IAO_0000136"`) in `VMP_CONTEXT` and replaces the `iao:` prefix entry with `obo: http://purl.obolibrary.org/obo/` in both `VMP_CONTEXT` and `PREFIX_MAP`. The `"iao:isAbout"` property key is preserved unchanged in all JSON-LD documents so no user-visible key migration is required.

**Consequences:**
- All project documents, fixtures, and tests referencing `iao:OntologyDesignPattern` in `type` arrays must be updated to `ecm:OntologyDesignPattern`; this is a one-time coordinated change across ~17 files
- The canonical serialized `type` array order changes from `["ecm:Project", "iao:OntologyDesignPattern"]` to `["ecm:OntologyDesignPattern", "ecm:Project"]` (lexicographic sort: 'O'=79 < 'P'=80 within the shared `ecm:` namespace)
- The `iao:isAbout` property key is unchanged in all compact JSON-LD; only its RDF expansion changes (transparent to callers)
- The Turtle emitter gains a `JSON_KEY_TO_RDF_PRED` constant mapping `"iao:isAbout"` to `"obo:IAO_0000136"` so RDF serialization uses the correct predicate IRI
- The `iao:` prefix is removed from `VMP_CONTEXT` and `PREFIX_MAP`; no remaining term in scope uses this prefix after the OntologyDesignPattern re-homing

---

## ADR-008: rdfs:label Shape — { text, lang } Object

**Date:** 2026-05-23

**Decision:** Store `rdfs:label` on all term objects as a `{ "text": <string>, "lang": <BCP-47-tag> }` object with a default language tag of `"en"`, rather than as a plain string or via a sibling `ecm:labelLang` field.

**Context:** Round 4 feedback identified that plain-string labels cannot carry language tags without a parallel field, making multi-language scaling awkward and departing from RDF’s native `rdf:langString` modeling. Two alternatives were considered: (1) keep plain strings and add a sibling `ecm:labelLang` field alongside the existing `rdfs:label`; (2) promote the label to an inline `{ text, lang }` object collocating value and tag. Option 1 requires callers to join two separate fields to reconstruct a language-tagged literal, diverges from canonical RDF langString representation, and complicates the Turtle emitter. Option 2 mirrors RDF langString structure, keeps value and tag together, and scales naturally to multi-label scenarios in future versions. The operator selected option 2 at Phase 05a adjudication.

**Consequences:**
- All term objects in `ecm:terms` store `rdfs:label` as `{ "text": <string>, "lang": <tag> }` instead of a bare string
- The Turtle and N-Triples emitters MUST emit `rdfs:label "<text>"@<lang>` using this shape
- Existing v0.3 fixtures with plain-string `rdfs:label` values are migrated on load via the §10.4 migration path; Chain R4-3 updates all golden fixtures to the new shape
- The Property Creation Module (FR-U033) collects label and language tag as two separate form fields and assembles the `{ text, lang }` object before writing to the project document

---

## ADR-009: rdfs:range Emission Authorized on owl:DatatypeProperty

**Date:** 2026-05-23

**Decision:** Authorize `rdfs:range` as a first-class TBox field on `owl:DatatypeProperty` terms, with the constraint that the range value MUST be an XSD datatype IRI or OWL DataRange expression, NOT an `owl:Class` IRI.

**Context:** The §7.5 deferral ("The MVP does not model rdfs:domain / rdfs:range as first-class TBox fields") was appropriate at v0.3 but blocks the Round 4 Property Creation Module (FR-U033), which must capture a target data type for datatype properties. The semantic-SME finding confirms the hard constraint: in OWL 2 DL, the range of an `owl:DatatypeProperty` must be a data range (XSD type or OWL DataRange), not a class IRI. Emitting an `owl:Class` IRI as the range of a datatype property produces an OWL 2 DL violation. Two paths were considered at Phase 05a adjudication: (1) ship the Target Data Type Dropdown in the UI immediately without amending the SPEC; (2) gate the entire item on a SPEC §7.1/§7.5 amendment first. The operator selected path 2 so that the validator constraint is normatively established before any emitter code lands. `rdfs:range` on `owl:ObjectProperty` and `owl:AnnotationProperty` terms remains deferred.

**Consequences:**
- `rdfs:range` is added to the §6.1 semantic predicate allowlist, gated to `owl:DatatypeProperty` terms
- The validator MUST enforce the XSD/DataRange constraint and emit `RANGE_CLASS_ON_DATATYPE_PROPERTY` (severity: error) on violation (Chain R4-4)
- The Turtle emitter must emit `rdfs:range <xsd-IRI>` for `owl:DatatypeProperty` terms that carry a non-null `rdfs:range` field (Chain R4-4: `src/emit/turtle.ts`)
- `src/projection/index.ts` must add `rdfs:range` to `SEMANTIC_PREDICATE_ALLOWLIST` (Chain R4-4)
- `rdfs:domain` and `rdfs:range` on `owl:ObjectProperty` and `owl:AnnotationProperty` remain deferred to a future version

---

## ADR-010: Resolve OED-313 â€” Conformance Fixture Set Enumeration

**Date:** 2026-06-06

**Decision:** Close OED-313 by enumerating the agreed Phase 1 and Phase 4 conformance fixture sets, correcting the SPEC Â§21.3 canonical subdirectory name from `canonical-v0.3/` to `canonical-v0.4/`, and releasing the joint Phase 1 and Phase 4 exit gate dependency.

**Context:** ADR-005 created OED-313 as a joint Phase 1 and Phase 4 exit gate, with the agreed fixture list deferred pending explicit enumeration. Reconnaissance (2026-06-06) confirmed that `test/fixtures/` contains exactly three on-disk fixture files: `canonical-v0.4/minimal.jsonld`, `malformed/missing-realist-anchor.jsonld`, and `malformed/invalid-spec-version.jsonld`. The subdirectories `legacy-v0.2/` and `ontologies/` are absent; `test/golden/` does not exist. SPEC Â§21.3 names the canonical subdirectory `canonical-v0.3/`, but the codebase targets v0.4 and the on-disk directory is `canonical-v0.4/` â€” this ADR corrects that mismatch. The Phase 1 and Phase 4 fixture partitioning derives directly from ROADMAP.md scope commitments: Phase 1 owns canonical JSON-LD, validation-report, and all emitter format goldens; Phase 4 exclusively owns `manifest.jsonld` and ZIP layout goldens. Per-code malformed fixture completion for all Â§17.2 codes is tracked separately via ft-097-test-validator-2 and is not a prerequisite for OED-313 close.

**Phase 1 conformance fixture set (`test/fixtures/`):**

- `canonical-v0.4/minimal.jsonld` â€” minimal canonical v0.4 project (exists); golden set: `project.jsonld`, `graph.ttl`, `graph.nt`, `graph.jsonld`, `default.mmd`, `model-summary.md`
- `test/golden/project-tbox.ttl` â€” TBox Turtle golden derived from `src/tbox/project-tbox.ttl`
- `legacy-v0.2/<fixture>.jsonld` â€” one v0.2 project file for migration testing, plus a committed `expected-v0.4.jsonld` migration output alongside it
- `malformed/missing-realist-anchor.jsonld` â€” exists; triggers `MISSING_REALIST_ANCHOR`
- `malformed/invalid-spec-version.jsonld` â€” exists; triggers `INVALID_SPEC_VERSION`

`ontologies/` fixtures are deferred to Phase 3; ontology-import testing is not Phase 1 scope. UUID convention for all committed fixtures: all-zeros URN with sequential ten-digit suffix (e.g., `urn:uuid:00000000-0000-0000-0000-000000000010`).

**Phase 4 fixture additions:**

- `manifest.jsonld` golden for the `canonical-v0.4/minimal.jsonld` project package (new in Phase 4)
- ZIP package layout verification fixture (new in Phase 4)
- Any Phase 1 emitter goldens whose canonical shape changes due to Phase 4 TBox-in-packaging requirements MUST be updated in the same PR per Â§21.1

**Consequences:**
- OED-313 is closed; Phase 1 and Phase 4 may proceed to exit-gate close once their respective fixture golden files are committed and CI byte-comparison checks pass
- SPEC Â§21.3 is amended: `canonical-v0.3/` corrected to `canonical-v0.4/`; `ontologies/` subdirectory requirement noted as deferred to Phase 3
- The two existing malformed fixtures retain the pre-ADR-007 type array form `["ecm:Project", "iao:OntologyDesignPattern"]`; neither fixture's validation error depends on type-array ordering, so updating to the ADR-007 canonical form is deferred as a follow-up cleanup task
- Per-code malformed fixture completion for the remaining Â§17.2 codes beyond the two existing fixtures is not gated on OED-313; delivery tracked via ft-097-test-validator-2
- Phase 1 exit gate (OED-313 component): complete when the five fixture items above exist with passing CI byte-comparison checks
- Phase 4 exit gate (OED-313 component): complete when the two Phase 4 addition items above exist with passing CI checks

---

## ADR-011: Mermaid ABox Emit Format for RDF Round-Trip

**Date:** 2026-06-06

**Decision:** Emit ABox Mermaid diagrams using `graph TD` syntax with round-trip labels. Node format: `N<i>["<rdfs:label>:<type-local><br><type-IRI>[<br><type-IRI-N>...]"]` where `type-local` is the local name (fragment after `#`, last path segment after `/`, or last colon-delimited segment) of the first `rdf:type` IRI, and subsequent `<br>`-separated lines carry each type IRI. Edge format: `N<i> -- "<predicate-label><br><property-IRI>" --> N<j>`. Instance `rdfs:label` values MUST NOT contain literal `:` characters (reserved for the label:type separator); a `LABEL_CONTAINS_COLON` hard error blocks export when this constraint is violated. Embedded Mermaid in Markdown contexts is wrapped in triple-backtick fences with `mermaid` lang tag; standalone `.mmd` files are raw (no fences). Node ordering is lexicographic by IRI for deterministic output.

**Context:** The prior format (`flowchart LR` with bare labels and pipe-delimited edge labels) was one-way: RDF → render only. It carried no type or predicate IRI information, so the Mermaid diagram could not be used to recover the originating RDF graph. The new format is round-trippable: a future Mermaid importer can parse the inline type and predicate IRIs to reconstruct ABox triples without the source JSON-LD document. Lexicographic IRI ordering ensures byte-identical re-exports regardless of `ecm:instances` array order. The colon character is structurally reserved as the separator between the display label and the type local name; instance labels containing a colon must be rejected by the validator before export is attempted. OED-301 (Mermaid edge label truncation policy) is resolved by this ADR: edge labels carry the full predicate IRI inline and are not truncated.

**Consequences:**
- `emitMermaid` in `src/emit/mermaid.ts` is rewritten to produce `graph TD` with the new node/edge label format and lexicographic IRI ordering
- `LABEL_CONTAINS_COLON` is added to `src/validate/codes.ts` (18th hard error) and emitted by `src/validate/index.ts` when any `ecm:Instance` `rdfs:label` contains a literal colon; blocks export per §17.2
- SPEC §17.2 hard-error table gains a `LABEL_CONTAINS_COLON` row; OED-301 is closed
- `emitMarkdown` in `src/emit/markdown.ts` embeds the ABox diagram in a `## Diagram` section wrapped in triple-backtick `mermaid` code fences
- A future Mermaid importer closes the round-trip loop by parsing the new format back to ABox triples (deferred)
