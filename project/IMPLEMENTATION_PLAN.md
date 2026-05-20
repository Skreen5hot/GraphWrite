# GraphWrite Implementation Plan

**Spec:** [SPEC.md](./SPEC.md) v0.4 (Engineering-Ready)  
**Roadmap:** [ROADMAP.md](./ROADMAP.md)  
**Produced:** 2026-05-16

This document is the per-phase tactical companion to ROADMAP.md. It provides sub-tasks, falsifiable acceptance criteria, exit gates, OED dependency tracking, and risk callouts. ROADMAP.md says "what to build and when"; this document says "how to verify each task."

**Priority key:** P1 = must-have for phase exit; P2 = should-have within phase; P3 = spike/optional.

---

## Phase 1: Core JSON-LD Engine

**Goal:** Deliver the deterministic Node.js core that validates VMP projects and emits every required artifact.

**Depends on:** No predecessors.

**Status:** Substantively Complete — all 12 Phase 1 tasks (1.1–1.12) shipped at substrate-side with 106/106 tests passing across 14 spec test files. Per-task closure canonical-doc updates (this section's per-task Status reflections) deferred to v3.2 via the H2 preventive-deferral pattern per PLAYBOOK §7.5 Property 4; the canonical-doc closure chains re-dispatch as v3.2's first 12 validation tasks once contract-visibility refinement lands. Known follow-ups tracked in [V3.2-GAP-REGISTRY.md](../V3.2-GAP-REGISTRY.md): per-code fixtures for structural-validator's remaining 24 codes (ft-097-test-validator-2); emitter scope-split for semantic-jsonld + mermaid + markdown (ft-112-test-emitter-typefix-2); OED-303 + OED-313 closure pending; coverage AC (§21.2) wired to CI when CI lands.

**OED gates:**
- OED-306 must close before Phase 1 golden files are committed.
- OED-307 must close before CLI integration tests for stub commands are authored.
- OED-301 must close before Mermaid golden files are committed; structural (non-golden) Mermaid tests may proceed.
- OED-303 must close before Phase 1 exits; the retention-policy ruling governs the `ecm:validationReports` shape committed to Phase 1 golden files.
- OED-313 must close before any golden files are committed. Conformance fixture set — exact input fixture set for Phase 1 vs Phase 4 golden files. Resolution required before any golden files are committed.

---

### 1.1 VMP Canonical Serializer (P1)

**SPEC refs:** §5.2, §5.3, §5.4, NFR-004, NFR-012, FR-C014

**Sub-tasks:**
- Bundle the §5.2 normative `@context` as a local constant. No remote fetch.
- Emit top-level key order: `@context`, `id`, `type`, `ecm:specVersion`, then remaining keys alphabetically (§5.3 rule 2).
- Emit nested-object keys alphabetically at every level (§5.3 rule 3).
- Sort `ecm:terms`, `ecm:instances`, `ecm:relations`, `ecm:literalAssertions`, `ecm:ontologies`, `ecm:layouts`, `ecm:snapshots`, `ecm:serializations` by element `id` lexicographically (§5.3 rule 4).
- Sort IRI arrays `ecm:classIris`, `iao:isAbout`, `rdfs:subClassOf`, `rdfs:subPropertyOf` lexicographically (§5.3 rule 5).
- Emit two-space indent, LF line endings, no trailing whitespace, one terminating newline, UTF-8 no BOM (§5.3 rules 6–8).
- Emit timestamps as ISO 8601 UTC, no offset, no fractional seconds: `2026-05-14T12:00:00Z` (§5.3 rule 8).
- Use aliases `id`/`type` not `@id`/`@type` in compact form (§5.2).
- Emit project `type` as lexicographically sorted array: `["ecm:Project", "iao:OntologyDesignPattern"]` (§5.4).

**Implementation note:** Implement as a custom recursive key-sorter on plain JS objects, not via JSON-LD expansion/compaction. Use the JSON-LD library only at the semantic-export boundary.

**Acceptance criteria:**
- `serialize(parse(file))` equals `file` bytewise for any already-canonical file. Verified by round-trip unit tests against Phase 1 conformance fixtures.
- `serialize(serialize(doc))` equals `serialize(doc)` bytewise. Verified by property-based test.
- The strings `@id` and `@type` do not appear in any emitted compact document. Verified by string scan.
- `@context` is always the first key and matches §5.2 exactly. Verified by golden-file comparison.

---

### 1.2 Project TBox Bundle (P1)

**SPEC refs:** §5.14, NFR-014, §31 items 2, 4

**Sub-tasks:**
- Commit TBox as `src/tbox/project-tbox.ttl` declaring all five §5.14 axioms.
- Implement `getProjectTBoxTurtle(): string` (for prepending to Turtle/N-Triples exports).
- Implement `getProjectTBoxNodes(): object[]` (TBox as JSON-LD node objects for `@graph` insertion in semantic JSON-LD export).

**Acceptance criteria:**
- `getProjectTBoxTurtle()` parses cleanly under N3.js with zero errors. Verified by unit test.
- Parsed TBox triple set contains all five §5.14 declarations (by IRI and property). Verified by set-equality assertion.
- Output is byte-identical to `test/golden/project-tbox.ttl`. Verified by golden-file test.

---

### 1.3 Structural Validator (P1)

**SPEC refs:** §17.1–§17.4, §5.13, FR-C001

**Sub-tasks:**
- Implement `validate(project): ValidationReport` producing §5.13-shaped output.
- Detect all 16 §17.2 hard errors; all 7 §17.3 warnings; all 3 §17.4 info findings.
- Each finding carries: `ecm:severity`, `ecm:code`, `ecm:message`, `ecm:target`, `ecm:acknowledged: false`.
- `MISSING_REALIST_ANCHOR`: fires when `iao:isAbout` is absent, empty, or contains only `ecm:UnspecifiedSubjectMatter`.
- `INVALID_SPEC_VERSION`: fires when `ecm:specVersion` is absent, malformed, or > `"0.4"`.

**Acceptance criteria:**
- Each §17.2 error code is triggered by a dedicated malformed fixture with the correct `ecm:target`. Verified individually per code.
- A fully valid v0.4 project produces an empty `ecm:findings` array. Verified by unit test.
- `MISSING_REALIST_ANCHOR` fires for `iao:isAbout: ["ecm:UnspecifiedSubjectMatter"]` and does NOT fire for `iao:isAbout` containing at least one non-placeholder IRI. Two separate unit tests.
- A document with `ecm:specVersion: "0.5"` triggers `INVALID_SPEC_VERSION`. Verified by unit test.
- Core-layer branch coverage â‰¥ 85% (§21.2). Verified by coverage tool in CI.
- Every finding in the output has all required §5.13 fields. Verified by schema assertion.

---

### 1.4 Semantic Projection / Editor-Layer Stripping (P1)

**SPEC refs:** §6.1–§6.4, §8.2–§8.3, FR-C002

**Sub-tasks:**
- Implement `projectSemantic(project)` following §6.3 steps 1–6.
- Retain only entities in the semantic type allowlist (§6.1); retain only predicates in the semantic predicate allowlist (§6.1).
- Rewrite `ecm:RelationAssertion` to bare `{subject, predicate, object}` triples; discard relation `id`, timestamps, label (§8.3).
- Collapse duplicate s/p/o tuples to one triple (§8.2).
- Project root retained but `ecm:specVersion`, `ecm:createdAt`, `ecm:updatedAt` stripped.
- Prepend TBox (1.2); apply canonical serializer (1.1).

**Acceptance criteria:**
- Output contains no `ecm:CanvasLayout`, `ecm:CanvasNode`, or `ecm:CanvasEdge` objects. Verified by unit test.
- Two relations with identical s/p/o yield one triple in output. Verified by unit test.
- Property-based test (§21.1): adding/removing a canvas layout entry produces no change in semantic JSON-LD export. â‰¥ 50 samples.
- Project root in output is typed `iao:OntologyDesignPattern` with `iao:isAbout` intact. Verified by parsing expanded output.
- `ecm:specVersion`, `ecm:createdAt`, `ecm:updatedAt` absent from output. Verified by string scan.

---

### 1.5 Emitters: Turtle, N-Triples, Semantic JSON-LD, Mermaid, Markdown (P1)

**SPEC refs:** §6.3, §7.1, §9.1, §17.6, FR-C003–FR-C008

**Sub-tasks:**
- **Turtle (FR-C003):** semantic projection → Turtle via N3.js; prepend TBox.
- **N-Triples (FR-C004):** semantic projection → N-Triples via N3.js; prepend TBox as N-Triples.
- **Semantic JSON-LD (FR-C005):** semantic projection → compact JSON-LD; insert TBox node-objects into `@graph`; apply canonical serializer. (Note: 'insert into `@graph`' means TBox appears as node-objects, not literal file-level prepend — the SPEC §6.3 step 5 / §31 item 2 ambiguity is tracked; TBox-in-`@graph` is the implementation assumption pending OED clarification.)
- **Mermaid (FR-C006):** instances as nodes (label), directed relations as edges (predicate label). Truncation policy per OED-301 resolution; stub until then.
- **Markdown (FR-C007):** human-readable sections for terms, instances, relations, literal assertions.
- **Triple narration (FR-C008):** `"{subjectLabel} ({className}) {predicateLabel} {objectLabel} ({objectClassName})"` template.

**Acceptance criteria:**
- Turtle output parses cleanly under N3.js (zero errors) for all golden fixtures. Verified by CI parse check (§17.6).
- N-Triples output parses cleanly under N3.js for all golden fixtures. Same CI check.
- Turtle, N-Triples, and semantic JSON-LD outputs byte-identical to committed golden files (once OED-306 and OED-313 close). Verified by golden-file tests.
- Mermaid: every instance label appears as a node; every relation appears as a directed edge. Verified by structural content check (non-byte golden until OED-301 closes).
- Markdown output contains all term labels, instance labels, and at least one sentence per relation. Verified by substring checks.
- Any emitter called twice with identical input returns identical output (§9.1). Verified by calling each emitter twice and byte-comparing.
- Turtle output contains `iao:OntologyDesignPattern` and `ecm:isSerializationOf` (TBox present). Verified by string search.

---

### 1.6 IRI Generation (P1)

**SPEC refs:** §9.2, §9.3, §13.9, §5.5, FR-C009

**Sub-tasks:**
- Implement `generateIri(policy, context): string` in two modes: `ecm:uuid-urn` (UUIDv4) and `ecm:deterministic` (UUIDv5 from seed + context string).
- Accept `--seed` and `--clock` CLI flags; thread through IRI and timestamp production.
- Persisted IRI is never regenerated on load or save (§13.9).

**Acceptance criteria:**
- `ecm:uuid-urn` mode returns string matching `^urn:uuid:[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$`. Verified by regex unit test.
- `ecm:deterministic` mode with same seed + context returns identical IRI on two calls. Verified by unit test.
- Same seed but different contexts produce different IRIs. Verified by unit test.
- Deterministic CI job (§21.4): `export --deterministic --seed myseed --clock 2026-01-01T00:00:00Z` produces output byte-identical to committed golden. Verified by CI golden comparison.

---

### 1.7 Cascading IRI Update with Collision Detection (P1)

**SPEC refs:** §13.1–§13.9, FR-C010

**Sub-tasks:**
- Implement `refactorIri(project, oldIri, newIri): RefactorResult`.
- Update all `ecm:classIris`, `ecm:predicateIri`, `ecm:subjectIri`, `ecm:objectIri` occurrences of `oldIri`.
- Pre-apply collision check: if `newIri` exists on another entity, return collision report without modifying the project.
- Return refactor report: old IRI, new IRI, affected reference count, affected entity types.
- Do NOT modify `ecm:snapshots` (§13.7).
- Property-based tests (§21.1): reversibility (`A→B` then `B→A` â‰¡ no-op) and idempotency (`A→A` â‰¡ no-op).

**Acceptance criteria:**
- After successful refactor A→B, no occurrence of IRI A remains in any `ecm:classIris`, `ecm:predicateIri`, `ecm:subjectIri`, `ecm:objectIri`. Verified by full-document traversal.
- Collision case: result carries error, input project unchanged bytewise. Verified by unit test.
- Reversibility property-based test passes â‰¥ 50 samples.
- Idempotency property-based test passes â‰¥ 50 samples.
- `result.project["ecm:snapshots"]` is bytewise identical to `input["ecm:snapshots"]`. Verified by unit test.

---

### 1.8 Export-Manifest Data Structure (P1)

**SPEC refs:** §5.15, §19, FR-C012, NFR-014

**Sub-tasks:**
- Implement `generateManifestEntries(project, artifacts): SerializationEntry[]`.
- Each entry: `id` (new `urn:uuid:`), `type: "ecm:Serialization"`, `ecm:format` (MIME), `ecm:filename`, `ecm:contentHash` (`sha256-` + hex), `ecm:byteLength`, `ecm:generatedAt`, `ecm:isSerializationOf` = project root `id`.
- The `manifest.jsonld` RDF document is a Phase 4 deliverable (§4.5 below); this task covers the data structure.

**Acceptance criteria:**
- Each entry has all six required §5.15 fields. Verified by schema assertion per entry.
- `ecm:isSerializationOf` equals project root `id`. Verified by unit test.
- `ecm:contentHash` for a known UTF-8 string equals `sha256-` + SHA-256 hex of that string. Verified by reference hash comparison.
- `ecm:byteLength` equals UTF-8 byte length of artifact content. Verified by unit test.

---

### 1.9 Legacy Migration (P1)

**SPEC refs:** §10.3, §10.4, §10.5, FR-C013

**Sub-tasks:**
- Implement `migrate(doc, targetVersion): {document, migrationReport}` for v0.2→v0.3→v0.4 chain.
- v0.2→v0.3: add `ecm:specVersion: "0.3"`, init `ecm:literalAssertions: []`, `ecm:settings` defaults, subclass/subproperty stubs.
- v0.3→v0.4: update `ecm:specVersion` to `"0.4"`, expand `@context` with `iao:`/`cco:`, update root `type` to `["ecm:Project", "iao:OntologyDesignPattern"]`, init `iao:isAbout: ["ecm:UnspecifiedSubjectMatter"]`, init `ecm:serializations: []`, emit `LEGACY_REALIST_ANCHOR_PLACEHOLDER` info finding.
- Migration report lists all added/removed/transformed fields.
- Reject `ecm:specVersion` > `"0.4"` with `INVALID_SPEC_VERSION` (§10.2).

**Acceptance criteria:**
- `migrate(v0.2Fixture, "0.4")` output has `ecm:specVersion: "0.4"` and `iao:isAbout: ["ecm:UnspecifiedSubjectMatter"]`. Verified by parsing result.
- `migrate(v0.3Fixture, "0.4")` chained with `validate()` produces zero hard errors (only `LEGACY_REALIST_ANCHOR_PLACEHOLDER` info finding). Verified by unit test.
- Migration report from v0.3→v0.4 lists `type`, `iao:isAbout`, `ecm:specVersion`, `ecm:serializations`, `@context` as changed. Verified by field-list assertion.
- `migrate(v0.2Fixture, "0.4")` output byte-identical to committed `test/fixtures/legacy-v0.2/expected-v0.4.jsonld` (once OED-306 closes). Verified by golden-file test.
- `ecm:specVersion: "0.5"` input returns `INVALID_SPEC_VERSION` error. Verified by unit test.

---

### 1.10 Canonical Normalization on Load (P1)

**SPEC refs:** §5.3, FR-C014

**Sub-tasks:**
- Implement `normalizeOnLoad(doc): {document, wasNormalized}`. If canonical serializer output differs bytewise from input, set `wasNormalized: true`.
- When `wasNormalized: true`, `validate()` emits `NORMALIZED_ON_SAVE` info finding.

**Acceptance criteria:**
- Calling `normalizeOnLoad` twice: second call returns `wasNormalized: false`. Verified by unit test.
- A non-canonically-ordered valid fixture returns `wasNormalized: true` on first call. Verified by unit test.
- `NORMALIZED_ON_SAVE` present in `validate()` output when and only when `wasNormalized` was true. Verified by unit test.

---

### 1.11 Node CLI Surface (P1)

**SPEC refs:** §23, §12.2, OED-307

**Sub-tasks:**
- `validate <file>`: exit 0 (success), 1 (validation errors), 3 (malformed/parse failure), 4 (unsupported version).
- `export <file> --format <fmt> --out <outfile>`: formats `turtle`, `n-triples`, `json-ld`, `mermaid`, `markdown`. `--format zip` is a Phase 1 stub: exits 2, writes `not yet implemented; available in Phase 4` to stderr; full ZIP packaging implemented in Phase 4 (§4.4).
- `import-ontology <project> <ontology> --out <outfile>`: Phase 1 stub; exits 2, writes `not yet implemented; available in Phase 3` to stderr; full implementation in Phase 3 (§3.5).
- `migrate <file> --out <outfile>` and `refactor-iri <file> --old <IRI> --new <IRI> --out <outfile>`.
- `--deterministic --seed <seed> --clock <timestamp>` flags on `export`.
- Path containment (§12.2): reject `..` escapes outside CWD with exit 2 unless `--allow-outside-cwd`.

**Acceptance criteria:**
- `validate canonical-v0.4/minimal.jsonld` exits 0. CLI integration test.
- `validate malformed/missing-realist-anchor.jsonld` exits 1 and prints `MISSING_REALIST_ANCHOR`. CLI integration test.
- `validate` on a v0.5 file exits 4. CLI integration test.
- `export fixture.jsonld --format turtle --out graph.ttl` writes file byte-identical to `test/golden/graph.ttl`. CLI integration test.
- `export --deterministic --seed myseed --clock 2026-01-01T00:00:00Z` produces byte-identical deterministic golden. CI determinism job.
- Path `../../etc/passwd` exits 2 without file access. CLI integration test.
- `export --format zip` exits 2 and writes `not yet implemented; available in Phase 4` to stderr. CLI integration test (stub behavior is sufficient for Phase 1 close; full implementation deferred to Phase 4).
- `import-ontology` exits 2 and writes `not yet implemented; available in Phase 3` to stderr. CLI integration test (stub behavior is sufficient for Phase 1 close; full implementation deferred to Phase 3).

---

### 1.12 Test Harness (P1)

**SPEC refs:** §21.1–§21.4

**Sub-tasks:**
- Configure Vitest/Jest with TypeScript + coverage.
- Unit tests for all Phase 1 sub-tasks.
- Property-based tests (fast-check): cascade reversibility, cascade idempotency, canonical idempotency, semantic-projection stability. â‰¥ 50 samples each.
- Commit `test/fixtures/`: `legacy-v0.2/`, `canonical-v0.3/`, `canonical-v0.4/`, `malformed/` (one fixture per §17.2 code), `ontologies/` (subclass hierarchy, datatype properties, blank nodes, > 10k-term synthetic fixture).
- Commit Phase 1 golden files after OED-306 closes. Phase 1 golden files MUST commit `ecm:validationReports` per the OED-303 retention policy ruling.
- Deterministic CI job: `export --deterministic ...` → byte-compare to committed goldens.
- Core-layer branch coverage â‰¥ 85% enforced in CI.

**Acceptance criteria:**
- `npm test` zero failures.
- All four property-based invariants pass â‰¥ 50 samples.
- Phase 1 golden files pass byte-comparison once committed.
- Deterministic CI job passes.
- Coverage â‰¥ 85%.

---

### Phase 1 Exit Gate

All must be true before Phase 2 begins:

1. `npm test` zero failures; `npm run build` zero TypeScript errors.
2. Each §17.2 error code unit-tested against its dedicated malformed fixture.
3. Each §17.3 warning and §17.4 info code has at least one unit test.
4. All golden Turtle and N-Triples files parse cleanly under N3.js in CI.
5. Canonic
al round-trip bytewise for all conformance fixtures.
6. All four property-based invariants pass.
7. CLI integration tests pass for `validate`, `export` (non-stub formats), `migrate`, `refactor-iri`.
8. Deterministic CI job passes (§21.4).
9. Core-layer branch coverage â‰¥ 85%.
10. OED-306 and OED-313 closed; Phase 1 golden files committed and byte-comparison passing.
11. OED-307 closed; `import-ontology` stub (exit 2, stderr `not yet implemented; available in Phase 3`) and `export --format zip` stub (exit 2, stderr `not yet implemented; available in Phase 4`) both pass CLI integration tests.
12. OED-301 open is acceptable; structural Mermaid test (non-golden) must pass.
13. Phase 1 goldens record `ecm:validationReports: []` as documented.
14. §30 Risk 4 (constrained VMP, local context, no remote resolution) and Risk 8 (CI determinism job) mitigations implemented.

---

## Phase 2: Browser UI Foundation

**Goal:** Make the kernel interactive in the browser with minimum modeling and editing flows.

**Depends on:** Phase 1 complete.

**OED gates:** No blocking OEDs for core Phase 2 scope. FR-U028 acknowledgement-persistence interaction with OED-303 is deferred to Phase 3.

---

### 2.1 React Shell and New/Open/Save (P1)

**SPEC refs:** §26, FR-U001–FR-U003, NFR-001–NFR-002, §10.4, FR-U029

**Sub-tasks:**
- React + TypeScript browser bundle (Vite). No server-side runtime required.
- §26 layout: header, left sidebar, center canvas, right inspector, bottom outputs panel.
- FR-U001 New project: minimal valid v0.4 document with `iao:isAbout: ["ecm:UnspecifiedSubjectMatter"]`.
- FR-U002 Open project: `<input type="file">`, calls `migrate()` + `normalizeOnLoad()` + `validate()`, shows FR-U029 migration notice if migrated.
- FR-U003 Save project: canonical serialize → browser download as `project.jsonld`.

**Acceptance criteria:**
- App loads in Chromium â‰¥ 110 with no JS console errors (four layout panels rendered). Playwright smoke test.
- New → Save → parse: downloaded file has `ecm:specVersion: "0.4"`, `type: ["ecm:Project", "iao:OntologyDesignPattern"]`, `iao:isAbout: ["ecm:UnspecifiedSubjectMatter"]`. Playwright test.
- Open v0.4 fixture → Save → re-parse: bytewise identical to original fixture. Playwright test.
- Opening a v0.3 fixture shows migration notice before any user action. Playwright test.
- Bundle loads from static file server only (no dynamic routes). Verified by Playwright setup using static server.

---

### 2.2 Term Sidebar (P1)

**SPEC refs:** §26, FR-U004–FR-U005

**Sub-tasks:**
- Three sections: Classes, Object Properties, Datatype Properties.
- Each entry: label, source indicator (`ecm:imported-ontology`, `ecm:project-created`, `ecm:system-starter-example`) as visual badge.
- Sidebar reads from canonical project document state.

**Acceptance criteria:**
- Project with 2 classes, 1 object property, 1 datatype property shows exactly those entries in correct sections. Playwright test (count items per section).
- A `ecm:project-created` term shows a "project-created" indicator (CSS class or aria-label assertion). Playwright test.

---

### 2.3 Term CRUD (P1)

**SPEC refs:** FR-U006–FR-U010, §13.8

**Sub-tasks:**
- Add class (FR-U006), add object property (FR-U007), add datatype property (FR-U008): form with label + optional IRI override; IRI auto-generated per policy.
- Edit project-created term (FR-U009): label, comment, IRI; IRI edit shows "Refactor IRI" confirmation dialog listing affected reference count before applying.
- Block imported term edit (FR-U010): imported terms render read-only (no edit controls or controls disabled). Stub in Phase 2; fully realized in Phase 3.

**Acceptance criteria:**
- Add class → Save → parse: new entry in `ecm:terms` with `type: "owl:Class"` and a valid IRI matching the generation policy. Playwright test.
- Edit class label → Save → parse: `rdfs:label` updated in `ecm:terms`. Playwright test.
- Edit class IRI: confirmation dialog appears showing affected reference count before commit. Playwright test.
- Imported term (stub fixture): no edit affordance is visible or interactable. Playwright test.

---

### 2.4 React Flow Canvas (P1)

**SPEC refs:** §15.3, §4.2, §5.11, §6.2, FR-U011–FR-U012, NFR-010

**Sub-tasks:**
- React Flow canvas in center panel; nodes bound to `ecm:instances`, edges to `ecm:relations`.
- Node positions/dimensions read from and written back to `ecm:CanvasLayout` (§5.11).
- Canvas state is derived; source of truth is the project document.
- FR-U011 Create instance: drag or double-click → new `ecm:Instance` + `ecm:CanvasNode` in project document.
- FR-U012 Edit instance: click → inspector shows label, IRI, class assignments, comment; edits update canonical document.

**Acceptance criteria:**
- Project with 3 instances and 2 relations renders 3 nodes and 2 edges. Playwright test.
- Create instance → Save → parse: new entry in `ecm:instances` with valid IRI. Playwright test.
- Move node → Save → reload: node position in `ecm:CanvasLayout` preserved. Playwright test.
- Saved `project.jsonld` contains no keys matching `/__rf_|__reactflow/` (React Flow internal state absent). Verified by JSON-scan in Playwright test.
- Semantic JSON-LD export of a project with canvas layout contains no `ecm:CanvasLayout` type nodes. Playwright test (export → parse → assert).

---

### 2.5 IRI Field Affordances (P1)

**SPEC refs:** §13.8, FR-U013

**Sub-tasks:**
- Auto-generate IRI on entity creation per active IRI generation policy.
- Manual override: user may type a custom IRI.
- IRI preview: show full IRI before committing.
- Regenerate IRI: confirmation dialog if entity already has references.
- Duplicate warning: inline warning if typed IRI matches an existing entity IRI.

**Acceptance criteria:**
- New term without custom IRI has IRI matching generation policy pattern. Unit test + Playwright test.
- Typing a duplicate IRI shows a visible inline warning before save is allowed. Playwright test.
- Clicking "Regenerate IRI" on an entity with references shows a confirmation dialog. Playwright test.

---

### 2.6 Object-Property Relation CRUD (P1)

**SPEC refs:** §8, §13.2, §13.4, FR-U014–FR-U017

**Sub-tasks:**
- FR-U014 Draw relation: drag from one instance to another → new `ecm:RelationAssertion` in `ecm:relations`.
- FR-U015 Select predicate: dropdown of `owl:ObjectProperty` terms updates `ecm:predicateIri`.
- FR-U016 Reverse relation: swaps `ecm:subjectIri` and `ecm:objectIri`.
- FR-U017 Delete relation: removes from `ecm:relations`.

**Acceptance criteria:**
- Draw relation → Save → parse: new entry in `ecm:relations` with correct `ecm:subjectIri` and `ecm:objectIri`. Playwright test.
- Select predicate → Save → parse: `ecm:predicateIri` updated. Playwright test.
- Reverse → Save → parse: `ecm:subjectIri` and `ecm:objectIri` are swapped. Playwright test.
- Delete → Save → parse: entry absent from `ecm:relations`. Playwright test.

---

### 2.7 Literal-Property Assertion CRUD (P1)

**SPEC refs:** §5.10, FR-U018–FR-U019

**Sub-tasks:**
- FR-U018 Add literal assertion: select datatype property, enter value, optional language tag → new `ecm:LiteralAssertion`.
- FR-U019 Edit and delete literal assertions.

**Acceptance criteria:**
- Add → Save → parse: entry in `ecm:literalAssertions` with correct `ecm:subjectIri`, `ecm:predicateIri`, `ecm:value`, `ecm:datatype`. Playwright test.
- Entry with `ecm:language: "en"` saved correctly. Playwright test.
- Delete → Save → parse: entry absent from `ecm:literalAssertions`. Playwright test.

---

### 2.8 Triple Previews (P1)

**SPEC refs:** FR-U020, NFR-009

**Sub-tasks:**
- On relation selection in inspector: plain-language narration using FR-C008 template; RDF-like triple `<subjectIri> <predicateIri> <objectIri> .`.
- On literal-assertion selection: same format adapted for literals.

**Acceptance criteria:**
- Select relation → inspector shows subject label, predicate label, object label in plain language. Playwright text-content assertion.
- Inspector shows IRI strings in angle-bracket notation. Playwright text-content assertion.

---

### 2.9 `iao:isAbout` Declaration UI (P1)

**SPEC refs:** §5.4.1, §17.2, FR-U031, NFR-014

**Sub-tasks:**
- Project-settings UI: display declared `iao:isAbout` IRIs; allow add/edit/remove.
- `MISSING_REALIST_ANCHOR` shown prominently (not buried in log) with affordance to add a subject IRI.
- `LEGACY_REALIST_ANCHOR_PLACEHOLDER` shown with "Set real subject" affordance.

**Acceptance criteria:**
- New project shows prominent `MISSING_REALIST_ANCHOR` indicator before any `iao:isAbout` is set. Playwright test.
- Add subject IRI → Save → parse: `iao:isAbout` contains the new IRI. Playwright test.
- `MISSING_REALIST_ANCHOR` indicator absent after at least one non-placeholder IRI declared. Playwright test.
- Migrated v0.3 project shows `LEGACY_REALIST_ANCHOR_PLACEHOLDER` indicator with "Set real subject" affordance. Playwright test.

---

### 2.10 Validation Report Panel and Acknowledgement (P1)

**SPEC refs:** §17.5, §5.13, FR-U028

**Sub-tasks:**
- Panel shows all findings: severity badge, code, message, target IRI.
- Per-finding acknowledge button for warnings and info; updates `ecm:acknowledged: true` in canonical document.
- Acknowledged findings visually suppressed but remain in report.
- Errors show no acknowledge affordance (§17.1).
- Note: acknowledgement-persistence interaction with OED-303 is unresolved; implement §17.5 as specified and document the open question in code comments.

**Acceptance criteria:**
- Project with 1 error, 1 warning, 1 info finding: all three appear in validation panel. Playwright test.
- Acknowledge warning → Save → parse: that finding's `ecm:acknowledged` is `true`. Playwright test.
- Acknowledged finding has distinct visual style (CSS class or aria-label check). Playwright test.
- Error finding has no acknowledge affordance (button absent or disabled). Playwright test.

---

### 2.11 Migration Notice (P1)

**SPEC refs:** §10.3, §10.4, FR-U029

**Sub-tasks:**
- Dismissible banner shown when a v0.2 or v0.3 document is migrated on open.
- Banner text includes source version: "Project was migrated from v0.X to v0.4."

**Acceptance criteria:**
- Opening a v0.3 fixture: migration notice visible with version text before user action. Playwright text-content assertion.
- Dismissing notice removes it from DOM. Playwright test.

---

### 2.12 Playwright Smoke Test Suite (P1)

**SPEC refs:** §21.1, §21.2

**Smoke flows:**
1. New project → add class → add object property → create instance → assign class → draw relation → set predicate → save → reload → assert state preserved.
2. Open v0.4 fixture → edit label → save → reload → assert label persisted.
3. Open v0.3 fixture → migration notice visible → set `iao:isAbout` → save → parse: `iao:isAbout` updated.
4. New project → attempt save without setting `iao:isAbout` real IRI → `MISSING_REALIST_ANCHOR` indicator visible.

**Acceptance criteria:**
- All four flows pass headlessly in CI with zero assertion failures.

---

### Phase 2 Exit Gate

All must be true before Phase 3 begins:

1. All four Playwright smoke flows pass headlessly in CI.
2. Open → Save round-trip bytewise for canonical v0.4 fixture.
3. React Flow internal state (`__rf_*` keys) absent from `project.jsonld` on save.
4. `iao:isAbout` UI updates canonical document; `MISSING_REALIST_ANCHOR` shows for new projects.
5. `LEGACY_REALIST_ANCHOR_PLACEHOLDER` shown for migrated v0.3 projects.
6. Validation panel shows all findings; acknowledgement updates `ecm:acknowledged`.
7. Migration notice shown for v0.3 opens.
8. `npm run build` zero TypeScript errors; `npm test` zero failures.
9. §30 Risk 1 (canonical state not in React Flow internals) verified by smoke test 2.4 assertion.

---

## Phase 3: Ontology Import and Term Management

**Goal:** Let users bring Turtle ontologies into a project and manage the resulting term population without losing the imported/project-created distinction.

**Depends on:** Phase 2 complete.

**OED gates:** No blocking OEDs for core Phase 3 scope. OED-303 moved to Phase 1 gate (see Phase 1 OED gates); retention-policy ruling governs Phase 1 golden files and Phase 2 acknowledgement-persistence behavior.

---

### 3.1 Turtle Import via N3.js (P1)

**SPEC refs:** §14.1, §12.2, FR-C011

**Sub-tasks:**
- Implement `importOntology(turtleSource, fileName, projectId): ImportResult`.
- Extract explicit `owl:Class`, `rdfs:Class` (normalized to `owl:Class`), `owl:ObjectProperty`, `owl:DatatypeProperty`.
- Preserve `rdfs:label`, `rdfs:comment`, `rdfs:subClassOf`, `rdfs:subPropertyOf` verbatim.
- Produce `ecm:ImportedOntology` record (§5.6): `id`, `type`, `ecm:projectId`, `ecm:name`, `ecm:sourceFileName`, `ecm:format: "text/turtle"`, `ecm:contentHash` (SHA-256 of source bytes), `ecm:content`, `ecm:createdAt`, `ecm:importStatus: "ecm:parsed"`.
- Hard-reject source > 50 MB before parsing (§12.2).
- Do NOT follow `owl:imports` references (§12.2).

**Acceptance criteria:**
- `importOntology(smallOntology.ttl)` produces â‰¥ 1 `owl:Class` term. Unit test.
- `rdfs:Class` in input → `owl:Class` in output. Unit test.
- `rdfs:subClassOf` values preserved verbatim. Unit test.
- `ecm:contentHash` = `sha256-` + SHA-256 of input bytes. Unit test.
- 51 MB input returns error result without parsing. Unit test (mocked large input).
- `owl:imports` NOT followed; terms only from supplied file. Unit test.

---

### 3.2 Imported-Term Immutability and Remap Workflow (P1)

**SPEC refs:** §13.3, §13.6, FR-U010

**Sub-tasks:**
- Mark extracted terms `ecm:source: "ecm:imported-ontology"` and `ecm:ontologyId` pointing to ontology entry `id`.
- UI: imported terms render read-only (no edit/delete affordances).
- Implement "Remap references" workflow (§13.6): user creates project-created term, invokes remap, all `ecm:classIris`/`ecm:predicateIri` references to imported IRI rewritten to new IRI. Imported ontology record unchanged.

**Acceptance criteria:**
- Imported term has `ecm:source: "ecm:imported-ontology"` in saved project. Playwright test.
- Clicking imported term in sidebar shows read-only inspector (no edit controls visible/enabled). Playwright test.
- Remap A→B: zero occurrences of imported IRI A in `ecm:classIris`/`ecm:predicateIri` after remap. Unit test.
- Imported ontology record (with IRI A) remains in `ecm:ontologies` after remap. Unit test.

---

### 3.3 Large-Import Handling (P1)

**SPEC refs:** §14.2, §12.2, §17.3

**Sub-tasks:**
- After parsing, count extracted terms. If > 10,000: emit `LARGE_IMPORT` warning; show import UI with term count; offer "Continue in degraded mode" / "Cancel."
- Degraded mode: virtualized term list (no full DOM render of all terms); search-only navigation; `ecm:importStatus: "ecm:degraded"` in ontology record.
- 50 MB hard-reject handled in 3.1.

**Acceptance criteria:**
- Ontology with 10,001 terms triggers `LARGE_IMPORT` warning in `validate()` output. Unit test with generated synthetic fixture.
- Import warning UI shows extracted term count. Playwright test with synthetic fixture.
- "Cancel" leaves project document unchanged. Playwright test.
- "Continue in degraded mode" sets `ecm:importStatus: "ecm:degraded"` in saved project. Playwright test.
- In degraded mode, DOM node count for term list â‰¤ 200 regardless of term count (virtualization). Playwright DOM assertion.

---

### 3.4 Term Search and Filter UI (P2)

**SPEC refs:** §14.2, §26

**Sub-tasks:**
- Search input in term sidebar: case-insensitive substring match on label and IRI.
- Scope filter: "All," "Project-created only," "Imported only."
- In degraded mode, search is the only navigation mechanism.

**Acceptance criteria:**
- Typing "person" shows only terms with "person" in label (case-insensitive). Playwright test.
- "Project-created only" filter hides all imported terms. Playwright test.
- Degraded mode: zero non-virtualized term DOM nodes beyond the visible viewport. Playwright node-count assertion.

---

### 3.5 CLI `import-ontology` Command (P1)

**SPEC refs:** §23, FR-C011

**Sub-tasks:**
- Implement `node index.js import-ontology project.jsonld ontology.ttl --out updated-project.jsonld` using core `importOntology` function.

**Acceptance criteria:**
- Valid Turtle input produces updated project that passes `validate` with zero errors. CLI integration test.
- 51 MB input file exits 2 with clear message. CLI integration test.

---

### 3.6 OED-303 Retention Policy Integration

*Moved to Phase 1 per ADR-004 (2026-05-17). See the Phase 1 OED-303 exit gate.*

---

### Phase 3 Exit Gate

1. Turtle import unit tests pass for all term types, subclass/subproperty, and blank-node preservation.
2. Imported terms are read-only in the UI (Playwright test).
3. `LARGE_IMPORT` warning fires for > 10,000-term synthetic fixture.
4. 50 MB hard-reject verified by unit test and CLI test.
5. Term search and filter functional (Playwright test).
6. `import-ontology` CLI passes integration test.
7. OED-303 closed and retention policy implemented.
8. Phase 1 golden files updated if OED-303 ruling required it; CI golden comparison green.
9. Phase 2 acknowledgement-persistence re-verified against OED-303 ruling.
10. `npm test` and `npm run build` zero failures.
11. §30 Risk 2 (browser crashes on large ontologies) mitigation verified: degraded mode and 50 MB limit work.

---

## Phase 4: Export and Packaging

**Goal:** Produce every shareable artifact format, anchored by an RDF-typed export manifest.

**Depends on:** Phase 1 complete, Phase 2 complete. Independent of Phase 3.

**OED gates:** OED-304 (ZIP manifest signing) must be addressed before public release; Phase 4 may exit with SHA-256 only, with OED-304 documented as deferred. OED-313 must close before Phase 4 golden files are committed.

---

### 4.1 Turtle, N-Triples, Semantic JSON-LD Download Flows (P1)

**SPEC refs:** FR-U023–FR-U024, FR-E001–FR-E004

**Sub-tasks:**
- Wire Phase 1 emitters to UI download buttons with correct MIME types and filenames (`graph.ttl`, `graph.nt`, `graph.jsonld`).

**Acceptance criteria:**
- "Download Turtle" triggers browser download named `graph.ttl`. Playwright test.
- Downloaded `graph.ttl` parses cleanly under N3.js. Playwright test (Node subprocess parse after download).
- Downloaded `graph.jsonld` contains project root typed `iao:OntologyDesignPattern`. Parse + assertion.

---

### 4.2 Mermaid Copy and Download (P1)

**SPEC refs:** FR-U021–FR-U022, FR-E005

**Sub-tasks:**
- Render Mermaid text in outputs panel via Mermaid.js.
- "Copy Mermaid" → clipboard; "Download .mmd" → browser download `default.mmd`.

**Acceptance criteria:**
- "Download .mmd" triggers download named `default.mmd`. Playwright test.
- Content contains every instance label as a node and every relation as a directed edge. Playwright content assertion.

---

### 4.3 Markdown Summary Download (P1)

**SPEC refs:** FR-E006

**Sub-tasks:**
- "Download Markdown" → browser download `model-summary.md` from Phase 1 Markdown emitter.

**Acceptance criteria:**
- Download named `model-summary.md` triggered. Playwright test.
- File contains all term labels and instance labels from fixture. Content assertion.

---

### 4.4 ZIP Packaging Adapter (P1)

**SPEC refs:** §19, FR-S005, FR-E007, FR-U025

**Sub-tasks:**
- Implement `packageZip(project, artifacts): Uint8Array` using JSZip or equivalent.
- ZIP layout per §19 exactly: `/project.jsonld`, `/contexts/project-context.jsonld`, `/tbox/project-tbox.ttl`, `/ontologies/<files>`, `/rdf/graph.ttl`, `/rdf/graph.nt`, `/rdf/graph.jsonld`, `/diagrams/default.mmd`, `/docs/model-summary.md`, `/reports/validation-report.jsonld`, `/manifest.jsonld`.
- `/tbox/project-tbox.ttl` = Project TBox from §5.14.
- Wire FR-U025 "Download ZIP" button; implement `node index.js export --format zip --out package.zip`.

**Acceptance criteria:**
- "Download ZIP" triggers ZIP download. Playwright test.
- Unzipped ZIP contains exactly the §19 file list (no extra, no missing). Verified by node-side unzip + file-list assertion.
- `/tbox/project-tbox.ttl` in ZIP parses cleanly under N3.js. Test.
- `/rdf/graph.ttl` in ZIP byte-identical to standalone Turtle export. Test.
- `node index.js export --format zip --out package.zip` produces a valid ZIP. CLI integration test.

---

### 4.5 `manifest.jsonld` RDF Document (P1)

**SPEC refs:** §19, §5.15, NFR-014

**Sub-tasks:**
- Implement `generateManifestJsonld(project, artifacts): string` producing valid JSON-LD.
- Content: project IRI typed `["ecm:Project", "iao:OntologyDesignPattern"]` with `iao:isAbout` and `ecm:name`; one `ecm:Serialization` per artifact (all §5.15 fields); Project TBox declarations inline or referenced.
- Include as `/manifest.jsonld` in ZIP.
- Commit `test/golden/manifest.jsonld`.

**Acceptance criteria:**
- `manifest.jsonld` is valid JSON-LD (parses with `jsonld.js`). Test.
- Project IRI in manifest has `type: ["ecm:Project", "iao:OntologyDesignPattern"]`. Parse assertion.
- Each file in ZIP has a corresponding `ecm:Serialization` node in manifest. Count assertion.
- Each serialization's `ecm:isSerializationOf` equals project root `id`. Assertion.
- `manifest.jsonld` byte-identical to `test/golden/manifest.jsonld`. Golden-file test.
- No Phase 1 golden file broken by Phase 4 TBox-in-packaging changes; if changed, both updated in same PR (golden-file governance). CI golden comparison green.

---

### 4.6 Export-Time Enforcement (P1)

**SPEC refs:** §17.2, §17.4, §5.4.1

**Sub-tasks:**
- Run `validate()` before every export. Block and show UI error if `MISSING_REALIST_ANCHOR` or `LEGACY_REALIST_ANCHOR_PLACEHOLDER` is present.

**Acceptance criteria:**
- Export attempt with `iao:isAbout: ["ecm:UnspecifiedSubjectMatter"]`: blocked, error message shown. Playwright test.
- After setting real `iao:isAbout` IRI: export succeeds. Playwright test.
- Both trigger conditions block export: empty `iao:isAbout` array (unit test) and placeholder value (unit test).

---

### 4.7 Generated-Artifact Validity CI Check (P1)

**SPEC refs:** §17.6

**Sub-tasks:**
- CI step: parse all golden Turtle and N-Triples files under `test/golden/` with N3.js; assert zero errors.

**Acceptance criteria:**
- All golden Turtle and N-Triples files parse cleanly in every CI run. CI step fails the build if any file fails parsing.

---

### 4.8 Phase 4 Conformance Goldens (P1)

**SPEC refs:** §21.1, NFR-013

**Sub-tasks:**
- Commit `test/golden/manifest.jsonld` for Phase 4 conformance fixture.
- Add ZIP layout verification test: assert ZIP contains exact §19 file list.
- Update any Phase 1 golden files affected by TBox-in-packaging changes (same PR, per governance).

**Acceptance criteria:**
- `test/golden/manifest.jsonld` committed and byte-comparison passing in CI.
- ZIP layout test asserts exact §19 file list (no more, no fewer files). Test.
- CI golden-file comparison for all Phase 1 golden files remains green.

---

### Phase 4 Exit Gate

1. All download flows (Turtle, N-Triples, JSON-LD, Mermaid, Markdown, ZIP) tested by Playwright.
2. Downloaded Turtle and N-Triples parse cleanly under N3.js.
3. OED-313 closed; `manifest.jsonld` golden committed and byte-comparison passing.
4. ZIP layout test asserts exact §19 file list.
5. Export-time enforcement blocks export for both `MISSING_REALIST_ANCHOR` conditions.
6. All Phase 4 Playwright and CLI integration tests pass.
7. `npm test` and `npm run build` zero failures.
8. All Phase 1 golden files still passing (no silent breaks).
9. OED-304 documented as deferred; no blocking requirement for Phase 4 exit.

---

## Phase 5: Local Persistence Adapters

**Goal:** Make project state durable and resilient across sessions, tabs, and file-system surfaces.

**Depends on:** Phase 2 complete. Independent of Phase 3 and Phase 4 for core adapter scope.

**OED gates (each gates its sub-task):**
- OED-302: IndexedDB adapter (5.3) MUST NOT be implemented until closed.
- OED-308: FSA derived-artifact caching (5.4) gated until closed.
- OED-309: BroadcastChannel implementation (5.5) gated until closed.
- OED-310: FSA permission-revocation recovery UX (5.4) gated until closed.
- OED-311: Audit log rotation (5.8) gated until closed.

---

### 5.1 In-Memory State Adapter (P1)

**SPEC refs:** FR-S001

**Sub-tasks:**
- `InMemoryAdapter` with `load(doc)`, `save(doc)`, `getProject()`. No I/O dependencies.

**Acceptance criteria:**
- `save(doc)` then `getProject()` returns same document bytewise. Unit test.
- Adapter has no dependency on DOM, IndexedDB, FSA, or `fs`. Verified by import analysis.

---

### 5.2 File Save/Load Adapter (P1)

**SPEC refs:** FR-S002, §11.3, §15.9.5

**Sub-tasks:**
- **Browser:** `<input type="file">` open; blob URL download for Save As.
- **Node:** `fs.readFile`/`fs.writeFile` with advisory file locking: POSIX `flock` for mutating operations, `LockFileEx` Windows best-effort (§11.3). Lock failures reported to stderr, not swallowed.
- Read-only operations (export) do not lock.

**Acceptance criteria:**
- Node: `save(path, doc)` → `load(path)` round-trips bytewise. Unit test.
- Node: advisory lock acquired before write, released after. Unit test (mocked lock API).
- Node: mocked lock failure emits warning to stderr and does not silently continue. Unit test.
- Browser: save triggers file download with `filename="project.jsonld"`. Playwright test.
- Export commands do not attempt to acquire lock. Unit test asserting no lock calls.

---

### 5.3 IndexedDB Adapter (P1, gated on OED-302)

**SPEC refs:** FR-S003–FR-S004

**Sub-tasks (after OED-302 closes):**
- `IndexedDBAdapter`: stores canonical project document losslessly per OED-302 schema.
- Schema version, object-store layout, index structure, upgrade callback per OED-302 resolution.
- Project picker (FR-S004): list stored projects by name; open one.

**Acceptance criteria:**
- `save(doc)` → `load(projectId)` round-trips bytewise. Unit test using `fake-indexeddb`.
- DB `version` matches OED-302 resolution. Assertion in test.
- Project picker shows all stored projects. Playwright test: save two projects → picker → both listed.
- Schema upgrade N→N+1 preserves existing data. Unit test if OED-302 specifies upgrade.

---

### 5.4 File System Access API Integration (P1, gated on OED-308 and OED-310)

**SPEC refs:** FR-S006, §15.9.1–§15.9.5, §11.4

**Sub-tasks (after OED-308 and OED-310 close):**
- Three-tier hybrid (§15.9.1): FSA = system of record, OPFS = derived caches (policy per OED-308), IndexedDB = directory handle + indexes.
- On-disk layout per §15.9.2.
- Atomic writes (§15.9.3): `writeBytes` either fully replaces or leaves previous content intact.
- Path sanitization (§15.9.3): NFC normalize; reject control chars, path separators, Windows reserved names (`CON`, `PRN`, `NUL`, `COM1–9`, `LPT1–9`), trailing dots/spaces; cap 200 chars/segment, ~380 total.
- Permission lifecycle: `granted`/`prompt`/`denied`; reconnect UX; picker invoked exactly once at first run (§15.9.3).
- Adoption semantics: prompt user if folder has pre-existing `.app/` dir.
- Safari/Firefox fallback (§15.9.5): feature-detect `showDirectoryPicker`; fall back to per-file open + Save As download; surface fallback to user (not silent).

**Acceptance criteria:**
- Atomic write: mocked mid-stream write failure leaves previous `project.jsonld` intact. Unit test.
- Path sanitization rejects `CON` and `../` and trailing dot. Unit tests using §15.9.4 guide Appendix C corpus.
- FSA picker invoked once; second session reconnects via stored `FileSystemDirectoryHandle`. Playwright test (Chromium).
- `showDirectoryPicker` mocked as unavailable → app shows fallback notice; open/save still work via file input. Playwright test.
- On-disk layout: `project.jsonld` at `projects/<name>/project.jsonld`, audit log at `.app/audit.log`. Verified by path checks after save.

---

### 5.5 BroadcastChannel Multi-Tab Coordination (P2, gated on OED-309)

**SPEC refs:** FR-S007, §11.4

**Sub-tasks (after OED-309 closes):**
- Implement `BroadcastChannel` coordination per OED-309 protocol. Tab receiving "project updated" message reloads from IndexedDB.

**Acceptance criteria:**
- Save in Tab A → Tab B reloads in-memory state within 500 ms. Playwright multi-tab test.
- No spurious broadcast if project document unchanged. Unit test with `postMessage` spy.

---

### 5.6 Snapshots (P1)

**SPEC refs:** §5.12, §10.5, §13.7, §15.9.2

**Sub-tasks:**
- Create snapshot: embed full project copy as `ecm:Snapshot` in `ecm:snapshots`.
- Externalize: if inline snapshot size exceeds configurable threshold, write new snapshots as separate files at `snapshots/<snapshot-id>.jsonld`.
- Restore: migrate snapshot's `ecm:projectState` if its `ecm:specVersion` differs (§10.5); show migration report before commit.
- Warn on restore if restored state introduces IRIs renamed in current project (§13.7).

**Acceptance criteria:**
- Create snapshot → parse project: entry in `ecm:snapshots` with `ecm:specVersion`, `ecm:name`, `ecm:createdAt`, `ecm:projectState`. Unit test.
- Restore v0.3 snapshot in v0.4 project triggers migration and shows migration report. Playwright test.
- Restore warning shown when restored state contains a renamed IRI. Unit test.
- Threshold+1 snapshot: newest snapshot written as external file, not inline. Unit test.

---

### 5.7 Stale-Save Detection (P1)

**SPEC refs:** §11.2, FR-U030, §17.3

**Sub-tasks:**
- On save, compare in-memory `ecm:updatedAt` to persisted `ecm:updatedAt`; if persisted is newer, emit `STALE_SAVE_TARGET` warning and offer three choices.
- Three options: save anyway (last-write-wins), save as new project (new `id`), discard and reload.

**Acceptance criteria:**
- Stale detection fires when persisted file has newer `ecm:updatedAt` than load-time value. Unit test (mocked persisted file).
- All three options present in UI when stale. Playwright test.
- "Save anyway" overwrites. Playwright test.
- "Save as new project" produces file with different `id`. Playwright test.

---

### 5.8 Audit Log (P2, gated on OED-311)

**SPEC refs:** §15.9.2–§15.9.3

**Sub-tasks (after OED-311 closes):**
- Structured audit line to `.app/audit.log` for every write, rename, remove, mkdir with timestamp, action, path.
- Rotation per OED-311 policy; bounded retention.
- Audit log visible read-only in Settings UI.
- `.app/` namespace non-writable through public storage API.

**Acceptance criteria:**
- After save, `.app/audit.log` contains entry with `action: "write"`, `path`, `timestamp`. Test by reading file.
- Write via public storage API to `.app/` is rejected. Unit test.
- Rotation fires at OED-311 trigger; rotated log at `.app/audit-001.log`. Unit test.
- Audit log readable in Settings panel. Playwright test.

---

### Phase 5 Exit Gate

1. In-memory and Node file adapters: round-trip bytewise tests pass.
2. IndexedDB adapter implemented and tested (gated on OED-302).
3. FSA integration: atomic writes, path sanitization, permission lifecycle implemented and tested (gated on OED-308, OED-310).
4. Safari/Firefox fallback implemented and tested.
5. Snapshot create, externalize, and restore-with-migration tested.
6. Stale-save detection and three options tested by Playwright.
7. BroadcastChannel multi-tab tested (gated on OED-309).
8. Audit log and rotation tested (gated on OED-311).
9. All OED gates for this phase (302, 308, 309, 310, 311) closed.
10. `npm test` and `npm run build` zero failures.

---

## Phase 6: Onboarding Content, Semantic Linting, and v0.4 DoD Verification

**Goal:** Ship the starter content, help, and pattern affordances that complete the v0.4 baseline and verify the Definition of Done.

**Depends on:** All prior phases complete; OED-312 closed before modeling hints; OED-305 closed before help loader; second-implementation decision made by Human Orchestrator.

---

### 6.1 Three MVP Starter Examples (P1)

**SPEC refs:** §24, FR-U026, §31 items 1, 15

**Sub-tasks:**
- Author canonical v0.4 `project.jsonld` for each: Customer Places Order, Author Wrote Book, Employee Works At Company.
- Each has `iao:isAbout` with a real (non-placeholder) subject IRI and explanatory text.
- Generate and commit per-starter golden files: `project.jsonld`, `graph.ttl`, `graph.nt`, `graph.jsonld`, `default.mmd`, `model-summary.md` (6 files Ã— 3 starters = 18 golden files).
- Wire "Load starter" affordance in UI (FR-U026).

**Acceptance criteria:**
- All three starter `project.jsonld` files pass `validate` with zero hard errors. CI validate run.
- Each has `iao:isAbout` with at least one non-placeholder IRI. Parse assertion.
- All 18 golden files pass byte-comparison in CI. Golden-file tests.
- "Load starter" in UI loads selected starter without validation errors. Playwright test.

---

### 6.2 Four Optional Advanced Starters (P2)

**SPEC refs:** §24

**Sub-tasks:**
- Author canonical v0.4 projects: Person participates in Act, Document is about Entity, Sensor makes Observation, Permit authorizes Activity.
- Each has `iao:isAbout`. Available via "Advanced examples" menu.
- Commit all golden files (6 Ã— 4 = 24 additional golden files).

**Acceptance criteria:**
- All four validate with zero hard errors. CI validate run.
- All four appear in "Advanced examples" menu. Playwright test.
- All 24 golden files pass byte-comparison. Golden-file tests.

---

### 6.3 Contextual Help Content (P1)

**SPEC refs:** §25, FR-U027, NFR-008, OED-305

**Sub-tasks (after OED-305 closes):**
- Author Markdown fragments for all 19 required §25 entries under `content/help/<slug>.md`.
- Author three additional entries for realist-anchoring concepts: `iao-ontology-design-pattern.md`, `iao-is-about.md`, `ecm-serialization.md`.
- Implement help loader per OED-305 resolution; loader must not preclude future localization.
- Wire help display in inspector panel for each relevant concept.

**Acceptance criteria:**
- All 22 `.md` files exist under `content/help/`. Verified by CI file-system check.
- Each file is non-empty (> 50 characters). Verified by CI file-size check.
- Clicking help affordance for "IRI" shows content from `content/help/iri.md`. Playwright test.
- Help loader supports a future locale-aware path without code changes. Documented extension point in loader code. Code-review check.

---

### 6.4 Initial Pattern-Template Gallery (P2)

**SPEC refs:** §3.3

**Sub-tasks:**
- Author â‰¥ 2 pattern templates as canonical `project.jsonld` files with `iao:isAbout` and explanatory text.
- Loadable via "Patterns" menu item in UI.

**Acceptance criteria:**
- â‰¥ 2 templates load without validation errors. Playwright test.
- Templates are distinct from MVP starters (different `id` and content). Assertion.

---

### 6.5 Modeling Hints and Semantic-Linter Warnings (P1, gated on OED-312)

**SPEC refs:** §17.4, §17.5, §5.13, Phase 6 Scope

**Sub-tasks (after OED-312 closes):**
- Register each new `ecm:code` value in the §17.4 closed enumeration per OED-312 resolution.
- Implement heuristic detector for each new code.
- Each finding: `ecm:code`, `ecm:severity: "ecm:info"`, `ecm:target`, `ecm:acknowledged: false`.
- Confirm Phase 2 suppression UI handles new codes without code changes.

**Acceptance criteria:**
- Each new code registered in central enumeration file and documented. Code inspection.
- Each detector fires against a synthetic fixture that triggers the heuristic. Unit test per code.
- New info findings can be acknowledged via Phase 2 validation panel without UI code changes. Playwright test.

---

### 6.6 Pattern Comparison Spike (P3)

**SPEC refs:** §3.3

**Sub-tasks:**
- Investigate pattern comparison approaches; produce written recommendation (not production code).

**Acceptance criteria:**
- `docs/pattern-comparison-spike.md` committed with: approaches evaluated, semantic equivalence definition used, prototype results if any, recommendation. File existence check in CI.

---

### 6.7 Final v0.4 DoD Verification (P1)

**SPEC refs:** §31, §22, §9.1, NFR-013

**Sub-tasks:**
- Evaluate all 17 §31 DoD items; document pass/fail/deferred with rationale.
- §31 item 14 (byte-identical across two implementations): record Human Orchestrator's decision (scope / relax / defer).
- Verify all 27 user-facing + 6 developer-facing MVP flows in §22.
- Confirm all CI jobs pass including Phase 6 starter golden files.
- Document §30 risk mitigations status; file follow-up tasks for any unimplemented mitigations.

**Acceptance criteria:**
- `docs/dod-v04-verification.md` committed with all 17 §31 items addressed (pass / fail / deferred + rationale). File existence + section check in CI.
- All 33 MVP flows in §22 checked off as working or explicitly deferred. Documented in verification file.
- All CI jobs pass: `npm run build`, `npm test`, Playwright, golden-file comparisons (all phases), deterministic CI job, N3.js parse checks.
- §31 item 14 disposition recorded (scope/relax/defer) per Human Orchestrator. Documented in verification file.
- No §31 item silently omitted. Manual review gate.

---

### Phase 6 Exit Gate (= v0.4 Definition of Done)

1. All three MVP starters: zero errors, 18 golden files byte-comparison passing.
2. All four advanced starters: zero errors, 24 golden files byte-comparison passing.
3. All 22 contextual help entries exist and are non-empty.
4. Help display wired in UI and tested by Playwright.
5. All OED-312 info codes registered, unit-tested, and acknowledged via Phase 2 UI (no UI code changes required).
6. DoD verification document committed with all 17 §31 items addressed.
7. All 33 MVP flows in §22 verified.
8. All CI jobs pass across all phases.
9. §30 Risk 7 (divergent output) disposition recorded; NFR-013 golden-file suite passes; §31 item 14 disposition per Human Orchestrator.
10. OED-305 and OED-312 closed. Second-implementation decision made by Human Orchestrator.

---

## Cross-Cutting Concerns

### Golden-File Governance (§21.1, ROADMAP Cross-Cutting)

Any phase that modifies canonical output shape MUST update all affected golden files in the same PR. The CI byte-comparison check is the enforcement mechanism: any PR that changes canonical output without updating goldens fails CI. Before opening such a PR, search `test/golden/` and all test files referencing the changed golden.

### OED Tracking

| OED | Phase | Blocks | Status |
|-----|-------|--------|---------|
| OED-301 | 1 | Mermaid golden files only | Open |
| OED-302 | 5 | IndexedDB adapter | Open |
| OED-303 | 1 | Phase 1 exit gate | Open |
| OED-304 | 4 | Public release (not Phase 4 exit) | Open |
| OED-305 | 6 | Help loader | Open |
| OED-306 | 1 | Phase 1 golden files | Open |
| OED-307 | 1 | CLI integration tests for stub commands | Open |
| OED-308 | 5 | FSA derived-cache implementation | Open |
| OED-309 | 5 | BroadcastChannel implementation | Open |
| OED-310 | 5 | FSA permission-revocation UX | Open |
| OED-311 | 5 | Audit log implementation | Open |
| OED-312 | 6 | Modeling hints implementation | Open |
| OED-313 | 1, 4 | Phase 1 and Phase 4 exit gates | Open |

### §30 Risk Register Mitigations by Phase

| Risk | Phase | Verification point |
|------|-------|--------------------|
| Risk 1 (canonical state leaks into React Flow) | 2 | 2.4 canvas acceptance criteria: React Flow internal state absent from saved file |
| Risk 2 (browser crashes on large ontologies) | 3 | 3.3 degraded mode + 50 MB hard-reject; Phase 3 exit gate item 11 |
| Risk 3 (IRI changes break graph integrity) | 1 | 1.7 property-based reversibility + collision-detection tests |
| Risk 4 (JSON-LD complexity slows MVP) | 1 | Constrained VMP profile; bundled local context; no remote resolution — verified by NFR-002 unit test |
| Risk 5 (tool becomes only RDF editor) | 6 | Starters, help content, triple narration, pattern templates |
| Risk 6 (drift toward infrastructure) | 1 | CLI proof; NFR-001/002 assertions; no server required for any test |
| Risk 7 (divergent output) | 6 | NFR-013 golden-file suite passes; §31 item 14 disposition recorded |
| Risk 8 (determinism overpromise) | 1 | §9 documented; deterministic CI job passes (§21.4) |
| Risk 9 (spec version breaks user files) | 1 | Migration tests; `INVALID_SPEC_VERSION` unit test; non-destructive backup per §10.3 |
