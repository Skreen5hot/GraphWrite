---
role: "@Orchestrator"
agent_file: TBD
bao_pattern: true
bao_surface: retro
permitted_sections:
  - retro.phase
  - issues
  - actions
  - decisions
  - votes
  - conflict_record
  - audit
status: stub (v3.0-alpha.1 foundation; full BAO agent contract lands v3.0-alpha.2)
canonical_reference: ariadne/archive/specs/MAREP-v2.2/MAREP_v2.2.md §4.1
---

# `@Orchestrator` — retro-surface BAO role binding (STUB)

First Bounded-Authority Orchestrator instance for the retro surface per MAREP v2.2 §4.1. The MAREP-Orchestrator agent contract lands in v3.0-alpha.2; this file holds the role binding declaration (permitted_sections, BAO classification) for the surface-registry loader.

See `surfaces/_primitives/bounded-authority-orchestrator.md` for the substrate primitive's four bounds. The Orchestrator MUST honor all four.

## Permitted sections (default; per-retro AGENTS.md may override)

The Orchestrator has broad write authority across the retro state — it advances phases, merges findings, resolves conflicts, triggers votes, finalizes decisions. Per the BAO pattern, this elevated scope is bounded by:

- Surface scope: retro surface only
- Substrate enforcement: CPS check applies to every output
- Audit-chain visibility: every Orchestrator decision lands in `audit[]`
- No substrate-level privilege: cannot bypass dispatch, cannot mutate state outside `permitted_sections`

## Mode

To be defined in v3.0-alpha.2. Likely single-mode initially; multi-mode (e.g., `phase-transition` vs `consensus-finalization` vs `compression`) may emerge from production observation.
