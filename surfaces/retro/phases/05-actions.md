---
phase_id: 05-actions
name: Action Assignment
entry_criteria: Phase 4 exit conditions satisfied (no contested issues; decisions[] populated)
exit_criteria: Every confirmed issue has at least one accepted action OR an explicit no_action_required decision; promotion_candidates[] populated for any E→S promotion intent
status: v3.0 final
canonical_reference: ariadne/archive/specs/MAREP-v2.2/MAREP_v2.2.md §12.5
---

# Phase 5 — Action Assignment

Per MAREP v2.2 §12.5: agents propose actions with ownership, outcome criteria, due dates. Per MAREP v2.2 §7.3 action schema enforced by substrate.

## Operating contract

The operator dispatches each analytical role with `inputs.mode: action-proposal` (or equivalent). Each role proposes actions targeting the confirmed issues that fall within their analytical kind. The `@Orchestrator` coordinates ownership assignment and surfaces conflicts when two roles propose actions on the same issue.

This phase is also where **promotion_candidates[]** populate — when an agent observes that an issue's resolution warrants promotion to semantic memory (PLAYBOOK section, ADR, CLAUDE.md amendment, primitive doc), the agent proposes a candidacy entry. The candidacy is a *proposal* — the actual `state_admin promote-candidate` dispatch happens after retro archive, per the deliberate E→S discipline.

## Action schema (proposed_actions[] entries, per MAREP v2.2 §7.3)

```json
{
  "@id": "A<n>",
  "issue_id": "I<n>",
  "owner": "@<role>",
  "description": "<one-paragraph action description>",
  "outcome_criteria": "<measurable outcome>",
  "due_by": "<date or named milestone>",
  "status": "proposed | accepted | declined"
}
```

## Promotion-candidate schema (promotion_candidates[] entries)

```json
{
  "@id": "PC<n>",
  "source_issue_id": "I<n>",
  "to_semantic": "PLAYBOOK.md | project/DECISIONS.md | CLAUDE.md | surfaces/<...>",
  "description": "<one-paragraph: what promotes, why>",
  "rationale": "<rationale for E→S deliberate promotion>"
}
```

## Per-role permitted_sections

| Role | May propose | Must not touch |
|---|---|---|
| All analytical roles | `proposed_actions[]` (on confirmed issues within their kind); `promotion_candidates[]` entries | direct mutation of accepted actions (operator commits via consensus) |
| `@Orchestrator` | action ownership reconciliation (`conflict_record[]` for conflicting ownership claims); `phase-transition` proposals | direct mutation of `proposed_actions[]` |
| `@Skeptic` | challenges to proposed actions (`proposed_votes[]` against actions); risk flags on promotion_candidates | direct mutation of `proposed_actions[]` |

## Exit gate

`state_admin retro phase-transition <retro-id> --to-phase 06-compression --rationale "..."` once:

- Every confirmed issue has either ≥1 accepted action OR a documented `no_action_required` decision
- Action ownership is uncontested (no two accepted actions on the same issue claim conflicting owners)
- `promotion_candidates[]` either contains the retro's E→S intent OR is explicitly empty (orchestrator confirms no candidates surfaced)
- Orchestrator's `phase-transition` dispatch returns `transition_kind: advance`
