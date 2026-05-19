---
phase_id: 02-merge
name: Canonical Merge
entry_criteria: Phase 1 exit conditions satisfied (every analytical role responded or declined; orchestrator confirmed)
exit_criteria: No duplicate @ids in any retro section; every proposed item conforms to schema; orchestrator confirms merge complete
status: v3.0 final
canonical_reference: ariadne/archive/specs/MAREP-v2.2/MAREP_v2.2.md §12.2
---

# Phase 2 — Canonical Merge

Per MAREP v2.2 §12.2: the MAREP-Orchestrator (BAO) merges findings, normalizes issue identifiers, removes duplicates, and organizes themes. This phase is **orchestrator-only** — analytical roles do not operate here.

## Operating contract

The operator dispatches a single `marep-orchestrator` task with `inputs.mode: phase-transition` (to assess merge readiness) and follows with one or more dispatches in `inputs.mode: conflict-detection` if duplicate detection surfaces unresolved candidate-merges.

The orchestrator proposes merge actions (e.g., "@id `I3` and @id `I7` describe the same defect; merge to @id `I3`"); the operator commits via direct edit to RETRO_STATE.jsonld through a `retro-applier` task with merged proposals.

## Per-role permitted_sections

| Role | May propose | Must not touch |
|---|---|---|
| `@Orchestrator` | merge proposals (input to `retro-applier`); `proposed_issues[]` updates (id renames; theme grouping); `conflict_record[]` entries for unresolved merges | `votes[]`, `decisions[]`, `proposed_actions[]` |
| `@QA`, `@DeliveryManager`, `@RiskAnalyst`, `@Architect`, `@Developer`, `@UserAdvocate`, `@Skeptic` | (do not operate in Phase 2; merge is orchestrator-scoped) | all sections |

The substrate enforces orchestrator-only operation: analytical-role dispatches in Phase 2 with `inputs.phase: 02-merge` are rejected by `retro-applier` as out-of-scope (anti-pattern: out-of-scope mutation per `surfaces/_primitives/anti-pattern-enforcement.md`).

## Exit gate

`state_admin retro phase-transition <retro-id> --to-phase 03-analysis --rationale "..."` once:

- No duplicate @ids remain across `issues[]`, `actions[]`, `risks[]`
- Every item conforms to its schema (id present; required fields populated)
- Orchestrator's `phase-transition` dispatch returns `transition_kind: advance`
