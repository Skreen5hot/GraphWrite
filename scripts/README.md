# GraphWrite Demo Scripts

Cross-platform walkthrough scripts that exercise Phase 1's CLI capability surface against committed fixtures.

## Audience

These scripts are for the **CLI capability audience** — grant reviewers, collaborators on the Realist semantic framework, anyone evaluating whether GraphWrite's Phase 1 implementation meets its acceptance criteria. The demo answers the question "does the CLI do what its spec said it would do?" with concrete output.

(For substrate-as-substrate evaluation — the audit chain narrative, gap-surfacing discipline, defer-rather-than-degrade property — see the FNSR-archive Phase 1 retrospective at `ariadne/archive/retrospectives/2026-05-substrate-phase-1.md`. That's a different demonstration for a different audience.)

## Setup

The scripts assume:
- Node.js >= 22 (per [package.json](../package.json) engines field)
- `npm install` has been run (the scripts now check and run it for you if `node_modules` is missing)

## Running

**Windows PowerShell:**
```powershell
pwsh scripts/demo.ps1
# or, to inspect emitted output without auto-cleanup:
pwsh scripts/demo.ps1 -NoCleanup
```

**POSIX bash (Linux / macOS / Git Bash):**
```bash
bash scripts/demo.sh
# or:
bash scripts/demo.sh --no-cleanup
```

## What the demo walks

1. **Build** — Compile TypeScript via `npm run build`
2. **Clean-fixture validation** — Validate `test/fixtures/canonical-v0.4/minimal.jsonld` (expect 0 hard errors)
3. **Malformed-fixture validation** — Demonstrate `MISSING_REALIST_ANCHOR` (exit 1) and `INVALID_SPEC_VERSION` (exit 4); inline note explains that Phase 1 ships 2 of 26 validation codes with the remainder forward-tracked at `ft-097-test-validator-2`
4. **Canonical emission** — Export Turtle and N-Triples (TBox prepended; deterministic; first lines of output displayed inline)
5. **Phase 3/4 stubs** — Demonstrate `import-ontology` (Phase 3 stub) and `export --format zip` (Phase 4 stub); both exit 2 with explicit "not yet implemented" messages — the substrate-discipline of explicit-scope-boundary-signaling rather than silent failure
6. **Deterministic mode** — Export with `--deterministic --seed --clock` flags; this is the substantively load-bearing piece for FNSR-relevant audiences (reproducibility for audit; byte-identical comparison enables drift detection across substrate revisions)
7. **Full spec test suite** — `npm test` (expect 106/106 passing across 14 spec test files)

## What the demo deliberately does NOT show

Surface-area decisions made during Phase 1 produced known scope-splits and OED-gated deferrals. The demo doesn't try to hide these:

- **Validation codes 3–26**: Forward-tracked at `ft-097-test-validator-2`. The two demonstrated codes are the two explicitly named in [IMPLEMENTATION_PLAN.md §1.3](../project/IMPLEMENTATION_PLAN.md#L69) acceptance criteria.
- **Emitters semantic-jsonld + Mermaid**: Deferred per scope-split (`ft-112-test-emitter-typefix-2`); Turtle + N-Triples + Markdown + Triple Narration shipped.
- **Golden files**: Gated on OED-306 + OED-313; the demo verifies emission produces valid Turtle / N-Triples via N3.js parse + structural checks rather than byte-identical golden comparison.
- **Coverage AC (§21.2 85% branch)**: Deferred to CI-setup phase; the demo runs the spec suite but doesn't enforce coverage.

The full deferral inventory + substrate-side gap registry lives in [V3.2-GAP-REGISTRY.md](../V3.2-GAP-REGISTRY.md).

## Where the deeper story lives

| Document | What it covers |
|---|---|
| [project/SPEC.md](../project/SPEC.md) | v0.4 normative contract (the spec the CLI conforms to) |
| [project/IMPLEMENTATION_PLAN.md](../project/IMPLEMENTATION_PLAN.md) | Per-task sub-tasks + acceptance criteria + OED gate context |
| [project/ROADMAP.md](../project/ROADMAP.md) | Six-phase plan; Phase 1 status |
| [project/DECISIONS.md](../project/DECISIONS.md) | ADRs (ADR-006 documents the VMP canonical serializer's custom-recursive-sorter approach) |
| [V3.2-GAP-REGISTRY.md](../V3.2-GAP-REGISTRY.md) | 14 gaps surfaced during Phase 1; framing hypothesis (11 of 14 fit) |
| [PLAYBOOK.md](../PLAYBOOK.md) §7.5 | 4 substrate properties documented (character-level fidelity; partial-application graceful degradation; drift detection; defer-rather-than-degrade with reactive-vs-preventive distinction) |
| [state.jsonld](../state.jsonld) | Substrate audit chain (chain-hashed; full provenance from Phase 1 dispatch through closure) |

## Substrate-as-substrate observation

This demo's existence is itself substrate-property evidence. Twelve Phase 1 tasks shipped substantively complete; cross-platform demo scripts produced on top of that work; the scripts run against committed fixtures with explicit exit-code expectations and full test-suite validation. That's continuous-delivery mode producing both work product and demonstration material for it.
