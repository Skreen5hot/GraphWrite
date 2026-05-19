---
phase_id: 04-consensus
name: Consensus Resolution
entry_criteria: Phase 3 exit conditions satisfied (every issue has at least one vote; conflicts recorded)
exit_criteria: No issues remain in contested status; every issue is either confirmed, rejected, or explicitly archived
status: v3.0 final
canonical_reference: ariadne/archive/specs/MAREP-v2.2/MAREP_v2.2.md §12.4 + §15
---

# Phase 4 — Consensus Resolution

Per MAREP v2.2 §12.4 + §15: Orchestrator identifies unresolved conflicts, triggers voting where required, finalizes issue states. Per MAREP v2.2 §15.3 status transition graph, all transitions strictly enforced by substrate CPS.

## Operating contract

The operator dispatches `marep-orchestrator` in `consensus-summary` mode to synthesize the per-issue outcomes from Phase 3 votes. Contested issues are surfaced for operator-mediated voting via `state_admin retro vote <retro-id> --issue-id <id> --voter <role> --vote {confirm|reject|contest}`.

Operator votes carry equal weight to agent-dispatched votes but are explicitly attributed via the `voter` field (typically the operator votes on behalf of a role binding when the role's agent cannot resolve a contested position; the audit trail makes the attribution explicit).

## Issue state transitions (per MAREP v2.2 §15.3)

| From | To | Trigger |
|---|---|---|
| `proposed` | `confirmed` | ≥1 confirm vote AND no contest votes |
| `proposed` | `rejected` | ≥1 reject vote AND no confirm votes |
| `proposed` | `contested` | both confirm and reject votes present |
| `contested` | `confirmed` | operator-mediated tiebreaker vote = confirm |
| `contested` | `rejected` | operator-mediated tiebreaker vote = reject |
| `confirmed` / `rejected` / `contested` | `archived` | operator decision (`state_admin retro vote` with rationale) |

Status transitions are deterministic — the substrate's `retro-applier` computes the new status when votes are added. There is no LLM in the transition path.

## Per-role permitted_sections

| Role | May propose | Must not touch |
|---|---|---|
| `@Orchestrator` | `consensus_outcomes[]` synthesis; conflict triage in `conflict_record[]`; `phase-transition` proposals | direct `decisions[]` mutation; direct `votes[]` mutation (operator commits) |
| All analytical roles | additional `proposed_votes[]` (tiebreaker rounds); refined `evidence_paths[]` | direct `decisions[]` mutation |
| `@Skeptic` | `proposed_votes[]` (final adversarial review of confirmed findings) | direct `decisions[]` mutation |

## Exit gate

`state_admin retro phase-transition <retro-id> --to-phase 05-actions --rationale "..."` once:

- Every issue is in a terminal status (`confirmed`, `rejected`, or `archived`); no `contested` remain
- `decisions[]` records the consensus outcome for each confirmed/archived issue
- Orchestrator's `phase-transition` dispatch returns `transition_kind: advance`
