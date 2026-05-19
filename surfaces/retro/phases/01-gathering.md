---
phase_id: 01-gathering
name: Independent Gathering
entry_criteria: RETRO_STATE.jsonld initialized via `state_admin retro init`; role bindings declared
exit_criteria: Every analytical agent has submitted findings OR explicitly declined; orchestrator confirms readiness for merge
status: v3.0 final
canonical_reference: ariadne/archive/specs/MAREP-v2.2/MAREP_v2.2.md §12.1
---

# Phase 1 — Independent Gathering

Per MAREP v2.2 §12.1: each agent independently analyzes the sprint, records findings in private scratchpad, and submits compressed findings as `proposed` issues. Purpose: maximize diversity of reasoning; prevent premature convergence (no inter-agent communication during this phase).

## Operating contract

The operator dispatches each analytical role independently with `inputs.surface: retro`, `inputs.retro_state_path: retros/<retro-id>/RETRO_STATE.jsonld`, and `inputs.phase: 01-gathering`. Agents read the retro state (read-only) for context but do NOT see each other's outputs at this phase.

After all analytical agents have responded, the operator dispatches the `retro-applier` system agent with `inputs.proposals` populated from the agents' outputs. The applier merges proposals into the retro state with CAS semantics.

## Per-role permitted_sections

| Role | May propose | Must not touch |
|---|---|---|
| `@QA` | `proposed_issues[]`, `proposed_risks[]` (test-coverage / regression / defect-distribution kinds) | `proposed_actions[]` (Phase 5 only); `votes[]`, `decisions[]` (later phases) |
| `@DeliveryManager` | `proposed_issues[]`, `proposed_risks[]` (predictability / throughput / blocker / coordination / dependency kinds) | `proposed_actions[]`, `votes[]`, `decisions[]` |
| `@RiskAnalyst` | `proposed_risks[]` (latent / coupling / SPOF / operational-exposure kinds), `proposed_issues[]` (when risk surfaces a current issue) | `proposed_actions[]`, `votes[]`, `decisions[]` |
| `@Architect` (review mode) | `proposed_issues[]`, `proposed_risks[]` (structural / boundary / contract kinds) | `proposed_actions[]`, `votes[]`, `decisions[]` |
| `@Developer` | `proposed_issues[]` (implementation-friction / code-quality kinds) | `proposed_actions[]`, `votes[]`, `decisions[]` |
| `@UserAdvocate` | `proposed_issues[]` (workflow / cognitive-load / UX kinds) | `proposed_actions[]`, `votes[]`, `decisions[]` |
| `@Skeptic` | (does not gather; activates in Phase 3) | all sections |
| `@Orchestrator` | (does not gather; activates in Phase 2) | all sections |

The substrate enforces this via the `retro-applier` system agent: when an agent's proposal lands in a section not permitted to its role, the merge rejects that proposal with `reason: out_of_scope_mutation`. Out-of-scope mutation is one of the four substrate-mechanical anti-patterns per `surfaces/_primitives/anti-pattern-enforcement.md`.

## Exit gate

The operator certifies Phase 1 complete via `state_admin retro phase-transition <retro-id> --to-phase 02-merge --rationale "..."` once:

- Every analytical role's agent has dispatched (response collected) OR explicit `declined: true` recorded
- RETRO_STATE.issues, .risks, and (sparse) .actions sections contain the collected proposals
- The orchestrator's `phase-transition` mode (dispatched separately) has assessed phase-exit conditions and returned `transition_kind: advance`

The orchestrator PROPOSES; the operator COMMITS — per BAO bound #4 (no substrate-level privilege).
