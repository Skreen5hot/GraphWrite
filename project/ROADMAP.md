﻿# Roadmap

**Spec:** [SPEC.md](./SPEC.md) v0.4 (Engineering-Ready)
**Source of Truth:** SPEC.md §29 Delivery Phases is the structural backbone of this roadmap.
**Status:** Phase 1 not started.

This document is the "what to build and when." Per-task acceptance criteria, exit gates, and falsifiable test conditions live in [IMPLEMENTATION_PLAN.md](./IMPLEMENTATION_PLAN.md). **`IMPLEMENTATION_PLAN.md` must be authored and agreed before Phase 1 implementation begins** — it is referenced as the authoritative source for all per-task acceptance criteria and exit gates, but is not currently a scheduled deliverable of any phase. The Human Orchestrator must sequence its creation explicitly.

---

## Cross-Cutting Commitments

These bind every phase. A phase that drops one of these is not done.

- **Realist anchoring (NFR-014, §5.4, §5.14).** Every project document is typed as `iao:OntologyDesignPattern` (a subclass of `cco:InformationContentEntity`), declares one or more `iao:isAbout` subjects, and records each generated serialization as an `ecm:Serialization` linked via `ecm:isSerializationOf`. The Project TBox ships with every implementation.
- **Edge canonical (NFR-001, NFR-002, §0.1, §0.2).** Core computation runs unmodified in browser and Node.js. No required server, database, broker, registry, or cloud service.
- **Determinism (NFR-003, NFR-013, §9).** Two compliant implementations produce byte-identical canonical and derived artifacts for the same input. Creation-time non-determinism is isolated to wall-clock timestamps and UUIDs and is opt-out via `ecm:deterministic` mode.
- **Layering (NFR-005, §4).** Computation is core; state, orchestration, integration, UI, and packaging are adapters. The core MUST NOT depend on DOM, React, IndexedDB, File System Access, or remote APIs.
- **Offline-capable (NFR-006, §16).** Inability to reach external systems is never an error state. No remote `@context` resolution; no `owl:imports` resolution.
- **JSON-LD canonical (NFR-004, §5).** The Visual Modeler Profile is the single normative representation. All other formats are derived artifacts.
- **Open formats (NFR-007).** All export serialization formats MUST be open, non-proprietary, and tool-independent. No vendor lock-in may be introduced through format choice in any phase.
- **Semantic transparency (NFR-008, NFR-009, §25, §26).** The UI explains realist-anchoring and semantic modeling concepts in plain language, and exposes IRIs, RDF terms, and triple-like previews. Complexity is surfaced, not hidden.
- **Understandable canvas (NFR-010, §15).** The canvas prioritizes understandable conceptual modeling; raw RDF graph presentation is secondary.
- **Performance bounds (NFR-011, §14.2, §14.3).** The 50 MB hard-rejection limit and 10,000-term degraded-mode threshold apply from Phase 3 onward and constrain Phase 5 large-project persistence. No phase may relax these bounds without a SPEC revision.
- **Lossless canonical round-trip (NFR-012, §5.3, §6.4).** Serialize → deserialize → re-serialize MUST produce a byte-identical canonical document. This invariant constrains every phase that touches canonical state, not only the canonical serializer phase.
- **Versioning and migration (§10, §10.2, §10.3, §10.5).** Every phase that introduces a new on-disk storage surface or modifies canonical state MUST provide a non-destructive migration path per §10. `ecm:specVersion` coordination is a continuing cross-cutting obligation, not a one-time Phase 1 delivery.
- **Golden-file governance (§21.1).** When a later phase changes canonical output shape (e.g., OED-303 retention policy resolution, Phase 4 TBox-in-packaging), all golden files from earlier phases that capture that output MUST be updated in the same PR. No phase may declare itself done while leaving a prior phase's golden suite broken.
- **Risk register (§30).** Each phase exit gate implicitly verifies the §30 risk mitigations applicable to that phase (Risk 4 → Phase 1 constrained VMP; Risk 2 → Phase 3 import limits; Risk 8 → Phase 1 CI determinism job; Risk 7 → Phase 6). A phase MUST NOT declare itself done if its applicable §30 mitigations are unimplemented.

---

## Phase 1: Core JSON-LD Engine

**Goal:** Deliver the deterministic Node.js core that validates VMP projects and emits every required artifact.

**Status:** Not Started

**Scope:**
- VMP profile and canonical serializer (§5, §5.3).
- Project TBox (§5.14) bundled with the implementation and prepended to Turtle / N-Triples / semantic JSON-LD exports. (For semantic JSON-LD, 'prepend' means TBox node-objects inserted into `@graph`, not file-level prepend — this is a known ambiguity inherited from SPEC §6.3 step 5 and §31 DoD item 2; a SPEC-level clarification is required before the semantic JSON-LD emitter golden files are committed.)
- Structural validator producing every §17.2 hard error (including `MISSING_REALIST_ANCHOR` and `MALFORMED_SERIALIZATION_ENTRY`), every §17.3 warning, and the §17.4 info findings (FR-C001).
- Semantic projection per §6.3, retaining the project root and serialization manifest entries (FR-C002).
- Turtle, N-Triples, semantic JSON-LD, Mermaid, Markdown emitters plus templated triple narration (FR-C003–FR-C008).
- IRI generation in interactive (`ecm:uuid-urn`) and `ecm:deterministic` (UUIDv5 from seed + context) modes (§9.3, §13.9, FR-C009).
- Cascading IRI update with collision detection and abort-with-report (§13, FR-C010).
- Export-manifest generation with SHA-256 content hashes and `ecm:isSerializationOf` linkage (FR-C012, §19).
- Legacy migration: v0.2 → v0.3 → v0.4 on load, non-destructive, with migration report and `LEGACY_REALIST_ANCHOR_PLACEHOLDER` emission (§10.4, FR-C013).
- Canonical-form normalization on save with `NORMALIZED_ON_SAVE` info finding (§5.3, FR-C014).
- Node CLI surface (§23): validate, export (JSON-LD, Turtle, N-Triples, Mermaid, Markdown), migrate, refactor-iri, with deterministic flags `--seed` / `--clock`, exit codes 0–4, and CLI path containment per §12.2. Commands `import-ontology` and `export --format zip` are registered in Phase 1 per the stub strategy resolved in OED-307 (see Decisions Deferred), since their underlying implementations are Phase 3 and Phase 4 deliverables respectively.
- Test harness (§21.1): unit, property-based invariants (cascade reversibility / idempotency, canonical idempotency, semantic-projection stability), round-trip, golden-file (Phase 1 golden set covers canonical JSON-LD, validation-report output, and all emitter format outputs for the §21.3 conformance fixtures defined in OED-306; Phase 4 adds `manifest.jsonld` and ZIP package layout goldens; Phase 6 adds per-starter goldens), CLI integration, conformance, and deterministic-mode CI job (§21.4). Phase 1 golden files MUST record an empty `ecm:validationReports` array as a documented temporary assumption pending OED-303 resolution — see Decisions Deferred.

**NOT in scope:**
- Browser UI — Phase 2.
- Full Turtle term extraction and ontology import workflow — Phase 3.
- ZIP packaging — Phase 4.
- Persistence adapters — Phase 5.
- Starter examples, contextual help, pattern templates — Phase 6.
- SHACL validation engine (§17.7 deferred).
- Named graphs / quads / N-Quads emission (§3.2, §7.4).

**Decisions Deferred:**
- **OED-301 (Mermaid edge label policy).** Truncation length and whether configurable in settings; blocks final Mermaid golden files.
- **OED-303 (Validation report retention) — Phase 1 exit gate.** OED-303 MUST be resolved before Phase 1 closes; it is a Phase 1 exit gate (not Phase 3-only). Phase 1 golden files MUST capture an empty `ecm:validationReports` array as a documented temporary assumption until OED-303 resolves. If OED-303 resolves to latest-only, Phase 1 goldens remain valid. If it resolves to one-per-save, the empty-array assumption must be revisited and Phase 1 goldens updated per the golden-file governance cross-cutting commitment. See Phase 3 for the full OED-303 entry.
- **OED-306 (Conformance fixture set).** The exact set of canonical-v0.4 fixtures (§21.3) must be agreed and this decision closed — tracked in the Barcode audit trail by this identifier — before Phase 1 golden files are committed. See OED-313, which elevates the fixture-set requirement to a joint Phase 1 and Phase 4 exit gate.
- **OED-307 (CLI stub strategy for Phase 3/4 commands) — Resolved.** `import-ontology` (Phase 3) and `export --format zip` (Phase 4) are registered as stubs in Phase 1, returning exit code 2 with an explicit "not yet implemented" message; full implementations are Phase 3 and Phase 4 deliverables respectively.
- **OED-313 (Conformance fixture set) — Phase 1 and Phase 4 joint exit gate.** The agreed conformance fixture set (§21.3) governs Phase 1 golden files and Phase 4 conformance goldens for packaging and manifest artifacts. Neither Phase 1 nor Phase 4 may declare done while OED-313 is open. Opened at kickoff; extends OED-306 with explicit Phase 4 co-ownership.

---

## Phase 2: Browser UI Foundation

**Goal:** Make the kernel interactive in the browser with the minimum modeling and editing flows.

**Status:** Not Started

**Scope:**
- React UI shell with the §26 layout: header, term sidebar, instance canvas, inspector / explanation panel, outputs panel.
- New project / open / save canonical JSON-LD (FR-U001–FR-U003).
- Term sidebar displaying classes, object properties, datatype properties with source indicators (imported / project-created / starter) (FR-U004–FR-U005).
- Project-created class, object property, datatype property add and edit; imported terms read-only (FR-U006–FR-U010).
- React Flow instance canvas bound to the Editor Layer per §15.3; canvas state is derived, not canonical (FR-U011–FR-U012).
- IRI field affordances: auto-generate, manual override, preview, regenerate, duplicate warning (FR-U013).
- Directed object-property relation create, predicate select, reverse, delete (FR-U014–FR-U017).
- Literal-property assertion create, edit, delete with optional language tag (FR-U018–FR-U019).
- Plain-language and RDF-like triple previews on selection (FR-U020, NFR-009).
- `iao:isAbout` declaration UI with prominent surfacing of `MISSING_REALIST_ANCHOR` and `LEGACY_REALIST_ANCHOR_PLACEHOLDER` and obvious affordance to resolve (FR-U031).
- Validation report panel with per-finding acknowledgement (FR-U028, §17.5).
- Migration notice on legacy load (FR-U029).
- Playwright smoke tests covering the MVP user flows that fall in this phase (§21.1).

**NOT in scope:**
- Turtle ontology import — Phase 3.
- Turtle / N-Triples / JSON-LD / Mermaid / Markdown download flows — Phase 4. Canonical-project JSON-LD save is in this phase; semantic and derived exports are not.
- IndexedDB or File System Access persistence — Phase 5; this phase uses in-memory state plus single-file open/save.
- Bundled help content and starter examples — Phase 6 (UI hooks for help may be wired with placeholder content).

**Decisions Deferred:**
- **Acknowledgement persistence (FR-U028, §17.5, OED-303 interaction).** `ecm:acknowledged` is part of the canonical VMP shape (§5.13), meaning acknowledgement state persists in the project document and must survive save/reload. If OED-303 resolves to latest-only in Phase 3, a user's acknowledged findings will be silently discarded on the next save when the validation report is replaced. This interaction is unresolved; no phase currently claims ownership of it. Must be addressed when OED-303 closes in Phase 3.
- Help-content surfaces are stubs until Phase 6.

---

## Phase 3: Ontology Import and Term Management

**Goal:** Let users bring Turtle ontologies into a project and manage the resulting term population without losing the imported / project-created distinction.

**Status:** Not Started

**Scope:**
- Turtle import via N3.js with explicit-term extraction: `owl:Class`, `owl:ObjectProperty`, `owl:DatatypeProperty`, `rdfs:Class` normalized to `owl:Class` (§14.1, FR-C011).
- Preservation of `rdfs:label`, `rdfs:comment`, `rdfs:subClassOf`, `rdfs:subPropertyOf` verbatim.
- Source-ontology and file metadata captured in `ecm:ImportedOntology` (§5.6) including `ecm:contentHash` and `ecm:importStatus`.
- Imported-term immutability enforced; project-local replacement and "remap references" workflow (§13.3, §13.6).
- Large-import warning at 10,000 terms (`LARGE_IMPORT`); degraded mode with virtualized lists and search-only navigation (§14.2).
- Hard rejection at 50 MB file size with clear message (§12.2).
- Term search and filter UI surfaced in the Phase 2 sidebar, including import-aware filtering.
- Visual indicators distinguishing imported, project-created, and starter-example terms (FR-U005 fully realized).

**NOT in scope:**
- OWL restrictions, property chains, cardinality (§3.2, §7.6).
- Equivalent-class reasoning, subsumption inference, imports-closure resolution, blank-node reasoning, class-expression editing, disjointness, consistency checking (§3.2, §14.1).
- `rdfs:domain` / `rdfs:range` as first-class TBox fields (§7.5 deferred).
- SHACL validation engine (§17.7 deferred).
- Blank-node editing UI (§7.3 — preserved-on-round-trip only).
- ZIP import (§3.2 — v0.4 is export only).

**Decisions Deferred:**
- **OED-303 (Validation report retention).** Latest only, or one per save? Affects how the import-time validation report integrates with the project's `ecm:validationReports` array. **Phase 1 and Phase 2 dependency:** Phase 1 golden files assume an empty `ecm:validationReports` array pending this decision (see Phase 1 Decisions Deferred); Phase 2 FR-U028 per-finding acknowledgement persistence interacts with the retention policy. OED-303 MUST be resolved before Phase 3 closes, and the resolution MUST include a ruling on whether Phase 1 golden files and Phase 2 acknowledgement-persistence behavior require retrospective updates.

---

## Phase 4: Export and Packaging

**Goal:** Produce every shareable artifact format, anchored by an RDF-typed export manifest that makes the realist anchoring operational at the package boundary.

**Status:** Not Started

**Scope:**
- Turtle, N-Triples, semantic JSON-LD download flows (FR-U023–FR-U024, FR-E001–FR-E004).
- Mermaid copy and `.mmd` download (FR-U021–FR-U022, FR-E005).
- Markdown summary download (FR-E006, FR-C007).
- ZIP packaging adapter with the §19 layout, including `/tbox/project-tbox.ttl` and `/contexts/project-context.jsonld` so the package is self-contained (FR-S005, FR-U025, FR-E007).
- `manifest.jsonld` emitted as a small RDF document: project typed `["ecm:Project", "iao:OntologyDesignPattern"]` with `iao:isAbout` and `ecm:name`; one `ecm:Serialization` per artifact with `ecm:format`, `ecm:filename`, SHA-256 `ecm:contentHash`, `ecm:byteLength`, `ecm:generatedAt`, and `ecm:isSerializationOf` pointing back to the project IRI; Project TBox declarations inlined or referenced (§19, NFR-014).
- Export-time enforcement: `MISSING_REALIST_ANCHOR` and `LEGACY_REALIST_ANCHOR_PLACEHOLDER` unconditionally block export (§17.2, §17.4).
- Generated-artifact validity check: Turtle and N-Triples parse cleanly under N3.js with no errors (§17.6).
- Conformance goldens for Phase 4 artifacts not covered in Phase 1: `manifest.jsonld` golden (new in this phase) and ZIP package layout verification; byte-comparison CI checks updated for any format outputs whose canonical shape changes due to Phase 4 TBox-in-packaging requirements, per the golden-file governance cross-cutting commitment (§21.1, NFR-013).

**NOT in scope:**
- ZIP import (§3.2).
- Named-graph / N-Quads emission (§3.2, §7.4).
- Detached manifest signing — see OED-304.

**Decisions Deferred:**
- **OED-304 (ZIP manifest signing).** Is the SHA-256 manifest hash sufficient for v0.4, or are detached signatures required? Resolve before public release; spec defers to a later version.
- **OED-313 (Conformance fixture set) — Phase 1 and Phase 4 joint exit gate.** The agreed conformance fixture set governs which artifacts Phase 4 conformance goldens must cover (packaging layout, `manifest.jsonld`). Phase 4 MUST NOT declare done while OED-313 is open. See Phase 1 Decisions Deferred for the full OED-313 entry.

---

## Phase 5: Local Persistence Adapters

**Goal:** Make project state durable and resilient across sessions, tabs, and file-system surfaces while keeping FSA folders the user-owned system of record.

**Status:** Not Started

**Scope:**
- In-memory state adapter for browser and Node (FR-S001).
- File save/load adapter for Node file I/O and browser download/upload (FR-S002).
- IndexedDB adapter with lossless canonical-document storage and recent-projects project picker (FR-S003–FR-S004).
- File System Access API integration per §15.9 (FR-S006): three-tier hybrid (FSA system of record, OPFS derived caches, IndexedDB indexes + persisted `FileSystemDirectoryHandle`), the recommended on-disk layout (§15.9.2), atomic writes, NFC + Windows-reserved-name path sanitization, permission lifecycle (granted/prompt/denied + reconnect UX), adoption semantics for pre-existing app folders, audit log with rotation, lock-ordered per-path concurrency.
- BroadcastChannel multi-tab coordination (FR-S007, §11.4).
- Snapshots (§5.12): inline up to a configurable threshold, externalized to `snapshots/<snapshot-id>.jsonld` thereafter (§15.9.2); snapshot migration on restore (§10.5).
- Stale-save detection with last-write-wins, save-as-new-project, discard-and-reload options (FR-U030, §11.2); `STALE_SAVE_TARGET` warning emission.
- Audit log surfaced read-only in Settings; the `.app/` namespace is non-writable through the public storage API (§15.9.3).
- Safari / Firefox fallback to per-file `<input type="file">` open and explicit Save As downloads, with the fallback explicitly surfaced to the user (§15.9.5).
- Node-side advisory file locking (`flock` POSIX; `LockFileEx` Windows best-effort) for mutating CLI operations (§11.3).

**NOT in scope:**
- Cloud or server-hosted sync (§3.2).
- Multi-user simultaneous editing (§3.2).
- Cross-machine integrity / sync (§12.3).
- Encryption at rest (§12.3 — OS responsibility).
- Atomicity across multiple operations or linearizability of concurrent saves (§11.5 explicit non-promise).

**Decisions Deferred:**
- **OED-302 (IndexedDB schema versioning).** How IndexedDB schema migrations are coordinated with `ecm:specVersion` bumps. **Gate:** The IndexedDB adapter (FR-S003–FR-S004) MUST NOT be implemented until OED-302 is closed; schema version number, object-store layout, index structure, and upgrade callback logic all depend on this decision.
- **OED-308 (OPFS / IndexedDB derived-artifact caching policy).** For the FSA three-tier hybrid (§15.9): which derived artifacts are cached in OPFS vs. served on-demand? What is the cache invalidation trigger?
- **OED-309 (BroadcastChannel coordination protocol).** Message schema, leader-election strategy (if any), and conflict-resolution behavior for concurrent-tab saves (FR-S007, §11.4).
- **OED-310 (Mid-session FSA permission revocation behavior).** If the user revokes File System Access permission mid-session: what is the recovery UX, what in-memory state is preserved, and is a fallback storage mode engaged?
- **OED-311 (Audit log rotation policy).** Trigger (entry count, byte size, or time window), rotation format, and whether rotated logs remain accessible through the Settings read-only surface (§15.9.3).

---

## Phase 6: Onboarding Content, Semantic Linting, and v0.4 DoD Verification

**Goal:** Ship the starter content, help, and pattern affordances that complete the v0.4 baseline and verify the Definition of Done.

**Status:** Not Started

**Scope:**
- Three MVP starter examples — Customer Places Order, Author Wrote Book, Employee Works At Company — each with declared `iao:isAbout`, explanatory text, generated Mermaid, generated Turtle, generated Markdown summary (§24, FR-U026).
- Optional advanced starters loaded via an "Advanced examples" menu: Person participates in Act, Document is about Entity, Sensor makes Observation, Permit authorizes Activity (§24).
- Per-starter committed golden files: `project.jsonld`, `graph.ttl`, `graph.nt`, `graph.jsonld`, `default.mmd`, `model-summary.md` (§21.1).
- Contextual help content (§25, FR-U027, NFR-008): every required entry authored as a Markdown fragment under `content/help/<slug>.md`, including the realist-anchoring concepts (`iao:OntologyDesignPattern`, `iao:isAbout`, `ecm:Serialization`).
- Initial pattern-template gallery.
- Modeling hints and early semantic-linter warnings beyond the §17 validator — heuristics surfaced as new registered `ecm:code` values at info severity. New codes MUST be enumerated and registered in the §17.4 closed enumeration before implementation begins; the §17.5 suppression interaction (per-finding, per-target acknowledgement per §5.13) MUST be specified; and each finding MUST carry the `ecm:code`, `ecm:severity`, `ecm:target`, and `ecm:acknowledged` fields required by §5.13. Code enumeration and suppression design are resolved in OED-312 (see Decisions Deferred).
- Pattern comparison spike (non-shipping investigation, output is a written recommendation).
- Final v0.4 Definition of Done verification per §31: realist-anchored conformance fixtures pass; TBox prepending and manifest realist-typing verified; byte-identical golden suite green within the single implementation (§31 item 14 — byte-identical outputs across two independent implementations — is deferred pending the second-implementation decision in Phase 6 Decisions Deferred); every MVP user flow in §22 demonstrably working.

**NOT in scope:**
- Community pattern submission with maturity status (§3.3 future scope).
- SPARQL query interface (§3.2).
- Full OWL reasoning, ontology alignment, formal governance workflow, centralized model repository (§3.2).
- Help-content localization beyond English shipping content (mechanism must not preclude future localization).

**Decisions Deferred:**
- **OED-305 (Help-content localization mechanism).** v0.4 ships English-only; the loading mechanism MUST NOT preclude localization. Resolve choice (filename suffix `<slug>.<locale>.md` vs. directory `<locale>/<slug>.md` vs. translation manifest) before the help loader lands.
- **OED-312 (Semantic-linter info finding codes and suppression design).** Before the Phase 6 modeling-hints feature is implemented: enumerate the new `ecm:code` values and register them in the §17.4 closed enumeration; specify the §17.5 suppression interaction (per-finding, per-target acknowledgement per §5.13); confirm that the Phase 2 suppression UI handles the new finding surface without change. Must close before any modeling-hints implementation begins.
- **Second implementation (§31 item 14).** §31 item 14 requires byte-identical canonical and derived outputs across two compliant implementations. No second implementation is scheduled anywhere in this ROADMAP. The Human Orchestrator must decide before Phase 6 begins: (a) scope a second implementation workstream, (b) relax §31 item 14 for v0.4, or (c) formally defer this item to a post-v0.4 release. Phase 6 DoD verification of §31 item 14 is aspirational until this decision closes.

---

## Phase Dependency Map

The six phases are presented in logical execution order. Not all phase transitions are strictly serial; the table below documents which phases may proceed in parallel.

| Phase | Depends On | Parallelism Note |
|---|---|---|
| Phase 1: Core JSON-LD Engine | — | No phase predecessors. Exit gates: OED-303 and OED-313 MUST close before Phase 1 declares done. |
| Phase 2: Browser UI Foundation | Phase 1 complete | — |
| Phase 3: Ontology Import and Term Management | Phase 2 complete; OED-303 closed | — |
| Phase 4: Export and Packaging | Phase 1 complete, Phase 2 complete; OED-313 closed | **Independent of Phase 3.** Phase 4 contains no import-dependent features and may begin as soon as Phase 2 is complete. OED-313 is a joint exit gate with Phase 1. |
| Phase 5: Local Persistence Adapters | Phase 2 complete; OED-302, OED-308, OED-309, OED-310, OED-311 closed | **Independent of Phase 3 and Phase 4** for core adapter scope. Persistence adapters wrap the canonical document and do not require export-format flows or ontology import. |
| Phase 6: Onboarding Content, Semantic Linting, and v0.4 DoD Verification | All prior phases complete; OED-312 closed; second-implementation decision made | — |

**Notes:**
- All OED closures in the Depends On column are gates, not suggestions. Phases MUST NOT begin implementation of OED-gated features before their OED closes.
- The Phase 5 independence from Phase 3 and Phase 4 applies to the core adapter scope (FR-S001–FR-S004, FR-S006–FR-S007). If Phase 5 work requires downloading derived artifacts through browser flows (Phase 4), adjust accordingly.
