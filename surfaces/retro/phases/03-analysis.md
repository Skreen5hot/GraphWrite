---
phase_id: 03-analysis
name: Structured Analysis
entry_criteria: Phase 2 exit conditions satisfied (no duplicate @ids; orchestrator confirmed merge)
exit_criteria: Every issue has reached confirmed, rejected, or contested status with supporting evidence
status: v3.0 final
canonical_reference: ariadne/archive/specs/MAREP-v2.2/MAREP_v2.2.md §12.3
---

# Phase 3 — Structured Analysis

Per MAREP v2.2 §12.3: agents take turns evaluating themes, challenging assumptions, validating evidence, refining root causes. All analytical roles operate. The `@Skeptic` role activates in this phase, challenging confirmed findings via adversarial-critic dispatch (`mode: review-second-pass`).

## Operating contract

The operator dispatches each analytical role (typically in round-robin or parallel; the Orchestrator coordinates via `conflict-detection` mode between rounds). Each role reads RETRO_STATE.jsonld (read-only), evaluates the existing proposed_issues, and emits:

- Vote casts (`confirm` / `reject` / `contest`) in `proposed_votes[]`
- New supporting/dissenting evidence (`evidence_paths`, embedded in their proposed envelope)
- Optional refined-root-cause re-statements (`proposed_issues[]` updates, scoped by role permission)

The substrate's anti-pattern enforcement (persona theater, redundant affirmation, freeform brainstorm drift) is most active in this phase — agents are reading each other's outputs and may otherwise drift.

## Per-role permitted_sections

| Role | May propose | Must not touch |
|---|---|---|
| All analytical roles (`@QA`, `@DeliveryManager`, `@RiskAnalyst`, `@Architect`, `@Developer`, `@UserAdvocate`) | `proposed_votes[]` (on issues within their analytical kind); `evidence_paths[]` for confirmed/disputed positions; optional refined `proposed_issues[]` updates (same kind only) | `decisions[]`, `proposed_actions[]`, sections outside their analytical kind |
| `@Skeptic` (adversarial-critic in `review-second-pass`) | `proposed_votes[]` (contesting any confirmed finding); `conflict_record[]` entries with adversarial framing; refined position statements | `decisions[]`, `proposed_actions[]`, `proposed_issues[]` direct edits |
| `@Orchestrator` | `conflict_record[]` synthesis between rounds; `phase-transition` proposals | `proposed_votes[]`, `proposed_actions[]`, direct `decisions[]` mutation |

## Vote schema (proposed_votes[] entries)

```json
{
  "@id": "vote-<retro-id>-<n>",
  "issue_id": "I<n>",
  "voter": "@QA | @Architect | ...",
  "vote": "confirm | reject | contest",
  "rationale": "<text; required for contest>",
  "evidence_paths": ["<path-or-ref>"]
}
```

## Exit gate

`state_admin retro phase-transition <retro-id> --to-phase 04-consensus --rationale "..."` once:

- Every issue in `proposed_issues[]` has at least one vote (confirm / reject / contest)
- Issues with conflicting votes are recorded in `conflict_record[]` (orchestrator-synthesized)
- Orchestrator's `phase-transition` dispatch returns `transition_kind: advance`
