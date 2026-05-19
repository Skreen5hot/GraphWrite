---
phase_id: 06-compression
name: Final Compression
entry_criteria: Phase 5 exit conditions satisfied (every confirmed issue has actions; promotion_candidates populated or explicitly empty)
exit_criteria: All deliverables (per MAREP §19) produced and validated; retro state promoted to episodic memory via `state_admin retro archive`
status: v3.0 final
canonical_reference: ariadne/archive/specs/MAREP-v2.2/MAREP_v2.2.md §12.6 + §13 + §16.4
---

# Phase 6 — Final Compression

Per MAREP v2.2 §12.6 + §13 + §16.4: Orchestrator archives discussion history (logical relocation preserving append-only invariant), preserves canonical findings, generates final summary and action manifest. Retro state promotes to episodic memory at FNSR archive (`<fnsr-archive>/archive/retrospectives/`) via `state_admin retro archive <retro-id>`.

The promotion to episodic memory is **automatic at retro close**. The promotion to **semantic memory** (CLAUDE.md / PLAYBOOK.md / ADR updates / spec amendments / primitive doc additions) is **deliberate, not automatic** per the Episodic→Semantic discipline (`surfaces/_primitives/episodic-to-semantic-promotion.md`). Each promotion candidate gets a separate `state_admin promote-candidate` dispatch, followed by the standard ratification chain (reconnaissance → ratification → commit-finalize).

The substrate's `_check_no_semantic_memory_mutation` CPS check refuses any retro-surface task that attempts to mutate semantic-memory paths directly. The promotion path is the only path.

## Operating contract

The operator dispatches `marep-orchestrator` in `final-compression` mode. The orchestrator produces:

- `retro_summary_text`: 3000-char-max summary for RETRO_SUMMARY.md
- `archive_paths`: destination paths for each deliverable
- `deliverables`: inventory (RETRO_BOARD.md regenerable from state; RETRO_SUMMARY.md finalized; ACTION_ITEMS.jsonld extracted)
- `summary` field: surfaces promotion candidates for operator E→S deliberation

The operator then runs `state_admin retro archive <retro-id>` to commit the episodic promotion. The archive command surfaces the promotion_candidates[] for review; the operator then dispatches `state_admin promote-candidate` for each one to be deliberately promoted (or documents the `--no-promote` rationale for those not promoted).

## Per-role permitted_sections

| Role | May propose | Must not touch |
|---|---|---|
| `@Orchestrator` (only) | `retro_summary_text`, `archive_paths`, `deliverables`, final `summary` with promotion candidates surfaced | direct mutation of `issues[]`, `actions[]`, `risks[]`, `votes[]`, `decisions[]` (these are frozen at Phase 6 entry; compression is logical relocation only per MAREP §13) |
| All analytical roles | (do not operate in Phase 6; compression is orchestrator-scoped) | all sections |

## Exit gate (= retro close)

`state_admin retro archive <retro-id>` once:

- `RETRO_SUMMARY.md` deliverable produced (or marked regenerable-from-state)
- `ACTION_ITEMS.jsonld` extracted (or absent if no actions)
- Orchestrator's `final-compression` dispatch returns deliverables + archive_paths
- Operator has reviewed `promotion_candidates[]` and decided on each

After archive: any E→S promotions go through `state_admin promote-candidate` then the standard ratification chain. The retro itself is closed; further mutations to its archived state are refused (the archived RETRO_STATE.jsonld is read-only).
