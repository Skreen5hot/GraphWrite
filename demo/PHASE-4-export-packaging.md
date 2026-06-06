# Phase 4 Demo -- Export and Packaging

**Stakeholder review:** the export and packaging surface lands as a complete deliverable for v0.4. Five serialization emitters, the SPEC sec. 19 manifest builder, a pure-TypeScript STORE-mode ZIP adapter, and the export-time realist-anchor gate ship in commit `a7db153`. ZIP packaging is CLI-only; per-format downloads are wired into the browser UI.

Companion to the Phase 3 demo set (`demo/PHASE-3-*.md`). Phase 4 closes the v0.4 trajectory: artifacts now leave the system in operator-deliverable shapes (Turtle, N-Triples, semantic JSON-LD, Mermaid, Markdown, ZIP).

---

## What this chain delivers

Seven new/activated production files plus two golden fixtures.

| File | Purpose |
|---|---|
| `src/emit/json-ld.ts` | `emitJsonLd(project)` -- FR-C005 semantic JSON-LD emitter (delegates to `projectSemantic`) |
| `src/emit/mermaid.ts` | `emitMermaid(project)` -- FR-C006 Mermaid `flowchart LR` emitter; instances become nodes, relations become labeled edges |
| `src/manifest/build.ts` | `buildManifestJsonLd(project, artifacts, opts?)` -- SPEC sec. 19 manifest.jsonld with 5 TBox nodes + 1 `ecm:Serialization` node per artifact |
| `src/manifest/index.ts` | `generateManifestEntries()` -- SHA-256 content hashes (`sha256-` prefix) + `ecm:isSerializationOf` back-link to the project IRI (FR-C012) |
| `src/adapters/zip.ts` | `packageZip(project, artifacts, opts)` -- STORE-mode ZIP, pure-TS CRC-32, deterministic 1980-01-01 DOS timestamp (FR-E007 / FR-S005) |
| `src/validate/export-gate.ts` | `checkExportGate(doc)` -- code-based blocking on `MISSING_REALIST_ANCHOR` + `LEGACY_REALIST_ANCHOR_PLACEHOLDER` (SPEC sec. 17.2 / 17.4) |
| `src/cli/index.ts` | `cmdExport` activates `--format zip` (replacing the Phase 1 stub from ADR-003) |
| `src/ui/App.tsx` | 6 new header buttons: `gw-btn-save-turtle`, `gw-btn-save-ntriples`, `gw-btn-save-semantic-jsonld`, `gw-btn-save-markdown`, `gw-btn-copy-mermaid`, `gw-btn-save-mermaid` |

CLI surface:

```
graphwrite export <input.jsonld> --format turtle      --out graph.ttl
graphwrite export <input.jsonld> --format n-triples   --out graph.nt
graphwrite export <input.jsonld> --format json-ld     --out graph.jsonld
graphwrite export <input.jsonld> --format mermaid     --out default.mmd
graphwrite export <input.jsonld> --format markdown    --out model-summary.md
graphwrite export <input.jsonld> --format zip         --out project.zip
```

---

## Acceptance criteria

Drawn from Phase 4 ROADMAP (sec. 132-156) plus SPEC sec. 17 / 19 / 21.1 normative requirements. Every row is green against `npm test` at build_ref `a7db153`.

| Requirement | Behavior | Test |
|---|---|---|
| FR-C005 | Semantic JSON-LD emitter is pure, byte-identical to projection | pre-Phase-4 emit tests retained green |
| FR-C006 | Mermaid emitter produces `flowchart LR` with labeled nodes/edges | pre-Phase-4 emit tests retained green |
| FR-C012 / SPEC sec. 19 | Manifest carries `sha256-` content hashes + `ecm:isSerializationOf` linkage; 5 TBox nodes; project typed `["ecm:OntologyDesignPattern", "ecm:Project"]` | `tests/manifest-jsonld.test.ts` AC1-AC6 |
| FR-E007 / FR-S005 | ZIP is STORE-mode, deterministic 1980 DOS timestamp, byte-identical layout golden | `tests/zip-adapter.test.ts` AC1-AC6 + `tests/zip-layout-golden.test.ts` AC1-AC4 |
| SPEC sec. 17.2 | Export blocks when `MISSING_REALIST_ANCHOR` present | `tests/export-gate.test.ts` |
| SPEC sec. 17.4 | Export blocks when `LEGACY_REALIST_ANCHOR_PLACEHOLDER` present (code-based, not severity-based) | `tests/export-gate.test.ts` |
| SPEC sec. 17.6 | Generated Turtle and N-Triples parse cleanly under N3.js | `tests/n3-validity.test.ts` NV1-NV6 |
| SPEC sec. 21.1 | Phase 4 does NOT alter Phase 1 emitter goldens | structural invariant noted in `tests/zip-layout-golden.test.ts` |
| CLI | `export --format zip --out <f>` exits 0; output starts with `PK\x03\x04` | `tests/cli-integration.test.ts` AC6 |
| FR-U021 / U022 / U023 / U024 + FR-E006 | Browser download buttons present for Turtle, N-Triples, semantic JSON-LD, Markdown, Mermaid (copy + save) | unit coverage via `src/ui` test-ids; one Playwright spec for `gw-btn-save-turtle` in `tests/playwright/canvas.spec.ts` AC5; remaining five are PO-verifiable by manual click |

---

## How to verify

Prereqs: Node.js >= 22; `npm install` once.

```bash
npm run build
npm test
```

CLI smoke test (canonical v0.4 fixture):

```bash
# Real project: passes the export gate
node dist/cli/index.js export test/fixtures/canonical-v0.4/minimal.jsonld \
  --format zip --out /tmp/project.zip
unzip -l /tmp/project.zip
# Expect: manifest.jsonld, contexts/project-context.jsonld, tbox/project-tbox.ttl,
#         serializations/{graph.ttl, graph.nt, graph.jsonld, default.mmd, model-summary.md}

# Placeholder project: gate blocks, exit 1
node dist/cli/index.js export test/fixtures/placeholder-subject.jsonld \
  --format zip --out /tmp/blocked.zip
echo "exit: $?"
# Expect: exit 1; stderr cites MISSING_REALIST_ANCHOR or LEGACY_REALIST_ANCHOR_PLACEHOLDER
```

Manifest inspection (key PO acceptance step, since the manifest golden excludes UUID-bearing Serialization nodes per SPEC sec. 9.2):

```bash
unzip -p /tmp/project.zip manifest.jsonld | head -80
# Expect in @graph:
#   - 1 project node typed ["ecm:OntologyDesignPattern", "ecm:Project"]
#   - 5 TBox nodes (ecm:Project, ecm:OntologyDesignPattern, ecm:Serialization,
#                   ecm:UnspecifiedSubjectMatter, ecm:isSerializationOf)
#   - 5 ecm:Serialization nodes carrying sha256- hash, byteLength, generatedAt,
#     and ecm:isSerializationOf pointing at the project IRI
```

Browser walkthrough:

1. `npm run dev`; open the served URL
2. Open **Project Settings**; set a real `iao:isAbout` subject IRI (NOT the placeholder)
3. Click each new header button: Download Turtle, Download N-Triples, Download Semantic JSON-LD, Download Markdown, Copy Mermaid, Download Mermaid
4. Confirm downloaded file content matches project state; confirm Copy Mermaid puts the diagram source on the clipboard

---

## What works end-to-end right now

- All six formats round-trip via CLI; five non-ZIP formats round-trip via the browser UI
- ZIP bundles all five artifact serializations plus the project TBox (`tbox/project-tbox.ttl`) and JSON-LD context (`contexts/project-context.jsonld`)
- Manifest entries carry `sha256-` content hashes and `ecm:isSerializationOf` back-links to the project IRI
- ZIP archives are byte-deterministic: STORE-mode (no compression), fixed 1980-01-01 00:00:00 DOS timestamp in every local + central directory header, sorted `@graph`
- Export gate is defense-in-depth: `cmdExport` checks the gate AND exits 1 BEFORE invoking `packageZip`; `packageZip` itself re-checks and throws if called directly with a blocked project
- Realist-anchor blocking is code-based, not severity-based: `LEGACY_REALIST_ANCHOR_PLACEHOLDER` carries `ecm:info` severity but unconditionally blocks export
- N3.js parses every generated Turtle and N-Triples output cleanly (SPEC sec. 17.6)
- No Phase 1 emitter golden files required updating (SPEC sec. 21.1 governance preserved -- `emitTurtle` already prepends the TBox; the TBox bundled in the ZIP is the identical static constant from `src/tbox/index.ts`)

---

## What is NOT yet in scope

Deliberately deferred or scoped out:

- **FR-U025 (browser ZIP download button).** ZIP packaging is CLI-only in v0.4. The browser UI ships per-format downloads but no "Download ZIP" button. Rationale: ZIP-from-browser belongs to v0.5 once the worker-thread / streaming-blob path stabilizes.
- **Full SPEC sec. 19 layout granularity.** The shipped layout uses a flat `serializations/` prefix for all artifacts. SPEC sec. 19 illustrates granular `/rdf/`, `/diagrams/`, `/docs/` paths plus `/project.jsonld`, `/ontologies/`, `/reports/validation-report.jsonld`; the implementation explicitly labels itself a "v0.4 subset". Full granular layout deferred to v0.5+.
- **Playwright e2e in CI for the new buttons.** Five of the six new download buttons (all except `gw-btn-save-turtle`) have no Playwright spec. The Phase 3 retro deliberately scoped Playwright e2e out of `npm test` for CI cost reasons; manual click coverage is the v0.4 contract.
- **OED-304 manifest signing.** Detached signatures / cryptographic attestation of the manifest are not in v0.4; deferred until a signing-key workflow has an owner.
- **OED-313** was Phase 4's entry gate and was **closed by ADR-010 BEFORE Phase 4 implementation began**. No demo surface; called out so the PO sees the resolution chain.
- **Restrictions, property chains, cardinality, SHACL** in exports -- still deferred per SPEC sec. 14.1 (out of scope for v0.4 MVP).

---

## Sign-off prompt

Four review questions toward **pass / revise / pivot**:

1. **Does it work?** Run `npm test` and the CLI smoke test above. If the test suite is green and the manifest inspection shows the expected node shape, the engine works.
2. **Is the scope right?** FR-U025 (browser ZIP button) is the one ROADMAP item that did not land in Phase 4. Accept for v0.4 and defer to v0.5, or add the button before Phase 4 exit?
3. **Is the v0.4 layout subset acceptable?** The flat `serializations/` prefix differs from SPEC sec. 19's granular `/rdf/`, `/diagrams/`, `/docs/`. Land as-is and update SPEC at the next doc-pass, or refactor the layout to match SPEC?
4. **Pass / revise / pivot?**
   - **Pass** -- Phase 4 closes; queue the Phase 4 retro
   - **Revise** -- name the items to add (FR-U025 button, granular layout, Playwright coverage, etc.) and re-queue
   - **Pivot** -- re-shape the v0.4 export scope (e.g., drop one format, add another, change packaging contract)

---

## For the substrate-audit-curious

Phase 4 implementation landed under a single commit (`a7db153`) without the multi-cycle recovery loop Phase 3 needed. Two discipline notes worth surfacing:

- The export gate operates at the **package boundary**, not the per-emitter boundary. Per-emitter Turtle / N-Triples / JSON-LD downloads from the CLI or browser bypass the gate by design -- the formats themselves are not the place to assert realist anchoring; the gate fires when a project is **packaged for delivery** (ZIP). The browser per-format downloads therefore work for placeholder projects (useful during authoring); ZIP export will refuse until the realist anchor is set.
- The `iao:OntologyDesignPattern` (ROADMAP / IMPLEMENTATION_PLAN sec. 4.5) vs `ecm:OntologyDesignPattern` (SPEC sec. 19) discrepancy was resolved in code in favor of SPEC; see comment in `src/manifest/build.ts:62`. Forward-track candidate: ROADMAP / IMPLEMENTATION_PLAN sec. 4.5 to be reconciled to match SPEC at the next doc-pass.

Full Phase 4 task chain in [state.jsonld](../state.jsonld); the recon at task `1077-reconnaissance-phase-4-demo-doc` enumerates the 20 findings underlying this demo.