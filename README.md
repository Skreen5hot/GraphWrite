# GraphWrite

Deterministic JSON-LD authoring + transformation tooling for Visual Modeler Profile (VMP) projects, anchored on a pure-kernel + adapter architecture. Built on the [JSON-LD Deterministic Service Template](https://github.com/Skreen5hot/AgenticDev).

## Phase 1: Core JSON-LD Engine (substantively complete)

All 12 Phase 1 tasks shipped at substrate-side with **106/106 tests passing across 14 spec test files**. See [project/IMPLEMENTATION_PLAN.md](project/IMPLEMENTATION_PLAN.md) for the task list + acceptance criteria, [project/ROADMAP.md](project/ROADMAP.md) for the six-phase plan, and [project/SPEC.md](project/SPEC.md) v0.4 for the normative contract.

Phase 1 ships a Node.js CLI with: canonical VMP serializer (`§5.3`), Project TBox bundle (`§5.14`), structural validator (`§17`), semantic projection (`§6.3`), emitters (Turtle / N-Triples / Markdown / Triple Narration; semantic-jsonld + Mermaid deferred per scope-split), IRI generation (UUIDv4 + UUIDv5), cascading IRI refactor with collision detection, export manifest data structure (`§5.15`), legacy migration (v0.2 → v0.4), canonical normalization on load, CLI surface (validate / export / migrate / refactor-iri + Phase 3/4 stubs + path containment), and test harness (hand-rolled + fast-check property-based).

## Quick Start

**Prerequisites:** Node.js >= 22

```bash
npm install
npm run build
npm test                  # 106/106 expected
```

### Walk the CLI surface

```bash
# Windows PowerShell:
pwsh scripts/demo.ps1

# POSIX bash:
bash scripts/demo.sh
```

The demo validates clean + malformed fixtures, exports to Turtle and N-Triples, exercises the deterministic flag, demonstrates the Phase 3/4 stubs, and runs the full spec suite.

### Manual CLI examples

```bash
# Validate a canonical v0.4 fixture (exit 0)
node dist/cli/index.js validate test/fixtures/canonical-v0.4/minimal.jsonld

# Validate a malformed fixture (exit 1; prints MISSING_REALIST_ANCHOR)
node dist/cli/index.js validate test/fixtures/malformed/missing-realist-anchor.jsonld

# Export Turtle (TBox prepended; deterministic)
node dist/cli/index.js export test/fixtures/canonical-v0.4/minimal.jsonld --format turtle --out graph.ttl

# Deterministic export with frozen clock + seed (UUIDv5)
node dist/cli/index.js export <file> --format turtle --out graph.ttl --deterministic --seed myseed --clock 2026-01-01T00:00:00Z
```

## Phase 1 deferrals (tracked in [V3.2-GAP-REGISTRY.md](V3.2-GAP-REGISTRY.md))

- Per-task closure canonical-doc updates deferred via H2 preventive-deferral pattern; 12 forward-tracks at `v3.2-design` cycle pending substrate refinement.
- Structural validator ships MISSING_REALIST_ANCHOR + INVALID_SPEC_VERSION (2 of 26 SPEC codes); remaining 24 codes + per-code fixtures deferred (`ft-097-test-validator-2`).
- Emitters: Turtle + N-Triples + Markdown + Triple Narration shipped; Semantic JSON-LD + Mermaid deferred (`ft-112-test-emitter-typefix-2`).
- Comprehensive fixture set + golden file commits gated on OED-306 + OED-313.

The audit chain in `state.jsonld` carries the full provenance from gap-surfacing through gap-resolution.

## Conformance Checklist

Three spec tests and a purity check verify architectural compliance:

| Test | What it verifies | Command |
|------|-----------------|---------|
| Determinism | Same input produces identical output across invocations | `npm test` |
| No-Network | Kernel executes without any network API calls | `npm test` |
| Snapshot | Example input produces expected output exactly | `npm test` |
| Kernel Purity | No imports from outside `src/kernel/` in kernel code | `npm run test:purity` |

Run everything:

```bash
npm test
npm run test:purity
```

## Project Structure

```
src/kernel/
  canonicalize.ts    # Deterministic JSON serialization
  transform.ts       # Pure transformation function (edit this)
  index.ts           # CLI entry point
src/composition/
  concepts/          # Domain Concepts (Layer 1, optional)
  synchronizations/  # Event-driven orchestration (Layer 1, optional)
src/adapters/
  integration/       # HTTP, file, queue adapters (Layer 2, optional)
  persistence/       # Storage adapters (Layer 2, optional)
  orchestration/     # Scheduling, retries, deployment (Layer 2, optional)
tests/
  determinism.test.ts
  no-network.test.ts
  snapshot.test.ts
  run-tests.ts       # Test runner with JSON reporting
scripts/
  ensure-kernel-purity.ts  # Static import analysis
examples/
  input.jsonld              # Example input document
  expected-output.jsonld    # Expected output (update when transform changes)
  event-normalization/      # Real-world Schema.org Event example
docs/
  ARCHITECTURE.md           # Core design contract (6 principles)
  COMPUTATION_MODEL.md      # Kernel specification
  COMPOSITION_GUIDE.md      # Building on the kernel (optional)
  ADAPTER_BOUNDARIES.md     # Integration rules
  CONTRIBUTING.md           # How to contribute
  TEMPLATE_INTENT.md        # Why this template is minimal
  TESTING_GUIDE.md          # How to write domain-specific tests
  COOKBOOK.md                # Practical recipes for common tasks
project/
  ROADMAP.md                # Your implementation roadmap (edit this)
  SPEC.md                   # Your domain-specific technical spec (edit this)
  DECISIONS.md              # Architecture decision log
CLAUDE.md                   # AI agent governance (Barcode System directives)
```

## How to Use This Template

1. Clone or use as a GitHub template
2. Define your roadmap in `project/ROADMAP.md` and your domain spec in `project/SPEC.md`
3. Edit `src/kernel/transform.ts` — replace the identity transform with your domain logic
4. Update `examples/expected-output.jsonld` to match your new output
5. Run `npm test` to verify conformance
6. Build adapters outside `src/kernel/` for persistence, networking, etc.

## Documentation

- [Architecture Principles](docs/ARCHITECTURE.md) — the normative design contract
- [Computation Model](docs/COMPUTATION_MODEL.md) — kernel specification and contracts
- [Composition Guide](docs/COMPOSITION_GUIDE.md) — optional patterns for building on the kernel
- [Adapter Boundaries](docs/ADAPTER_BOUNDARIES.md) — rules for infrastructure integration
- [Contributing](docs/CONTRIBUTING.md) — how to contribute and the spec test checklist
- [Template Intent](docs/TEMPLATE_INTENT.md) — why this template is intentionally minimal
- [Testing Guide](docs/TESTING_GUIDE.md) — how to write domain-specific tests
- [Cookbook](docs/COOKBOOK.md) — recipes for HTTP APIs, databases, context resolution, and more
- [CLAUDE.md](CLAUDE.md) — AI agent governance directives (Barcode System)
- [Project Space](project/) — your roadmap, technical spec, and decision log

## License

[MIT](LICENSE)
