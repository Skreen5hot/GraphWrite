<!-- SUPERSEDED: Renamed to surfaces/feedback-rounds/surface-spec.md per Spec 08 v0.2 (F8). Content below this line is the superseded v0.1 body; see surface-spec.md for the current specification. -->

# FNSR Protocol Spec 08 -- Stakeholder Feedback Round Protocol

**Status**: Draft. Empirical motivation: demo/FEEDBACK.md Item J + OPERATOR-MEDIATION-LOG.md Events 9--12.
**Implementation target**: v3.2+ (state_admin commands, agent contracts, and daemon hooks are downstream chains).

## Purpose

Stakeholder feedback typically arrives as a bundled payload -- a single artifact listing multiple concerns, proposals, and requests. Ad-hoc processing introduces predictable failure modes: provisions get partially implemented, provision halves get lost, and no mechanism verifies that every stated concern was honored before the phase closes.

This protocol defines the **Stakeholder Feedback Round** -- a surface-level discipline for processing feedback payloads with the same rigor that Pass 2a/2b applies to individual changes. Two structural guarantees:

1. **Atomic decomposition before adjudication.** The payload must be decomposed into atomic, independently-trackable provisions before any adjudication or implementation chain is dispatched.
2. **Reconciliation after implementation.** After chains run, a reconciliation pass verifies that every provision's completeness map was honored.

**Distinct from:**

- **Retro surface (MAREP v2.2)**: retros are backwards-looking deliberation about a body of completed work. Feedback rounds are external-input processing with forward-looking adjudication and implementation tracking.
- **Pass 2a/2b (Spec 03)**: Pass 2a gates individual changes at the architectural level. Feedback rounds operate at the payload level -- decomposing payloads into items, each of which then follows the normal Pass 2a/2b chain.
- **Banking (Spec 05)**: bankings record observations about the protocol. Feedback rounds process stakeholder input into implemented provisions.

## Empirical motivation

Item J in demo/FEEDBACK.md contained two independent provisions: J1 (rdfs:label collision detection in AddTermDialog.tsx) and J2 (starter-term population via buildNewDocument() in App.tsx). Both were classified under one "Amend" heading in FEEDBACK-RESPONSE.md without atomic decomposition.

The developer chain ran against the bundled item. J1 landed in Phase 3 (confirmed by WALKTHROUGH-PHASE-3.md and OPERATOR-MEDIATION-LOG.md Event 12 work log). J2 has no Phase 3 committed-work record -- no test-count attribution, no walkthrough step, no commit mention. No completeness map existed to make the gap visible. No reconciliation pass ran to detect the missing provision.

This is the canonical empirical instance of the failure mode this protocol prevents. The protocol's three mandatory phases -- Atomic Decomposition (Phase 2), Completeness Map (Phase 4), and Reconciliation (Phase 7) -- each address a structural cause of the J2 loss.

OPERATOR-MEDIATION-LOG.md Events 9 and 12 document two additional substrate failure modes (wrong escalation shape via outputs.error; awaiting_operator_decision bypass not honoring the required_outputs skip specified in CLAUDE.md section 7.6). These inform the anti-patterns section and the scope_constraints of this authoring chain.

## Phases

Eight phases in order. Per-phase spec files live under `surfaces/feedback-rounds/phases/` (stub files; v1 scope is this surface-spec.md only).

| Phase | Name | Entry | Exit |
|---|---|---|---|
| 01-capture | Capture | Round initiated; feedback payload artifact identified | All feedback items recorded verbatim in STATE.jsonld; no interpretation yet |
| 02-decompose | Atomic Decomposition | Phase 1 done | Every bundled item split into atomic single-provision units; each has a unique item_id + parent_item_id |
| 03-categorize | Categorize + Scope | Phase 2 done | Each item has: kind classification + effort estimate (S/M/L/XL) + initial priority |
| 04-completeness-map | Completeness Map | Phase 3 done | Each item has an explicit completeness_map listing every artifact path that must be updated |
| 05-adjudicate | Adjudication | Phase 4 done | Operator has made a per-item decision: ratify / amend / defer; deferred items become Spec 07 forward-tracks (State A) |
| 06-implement | Implementation | Phase 5 done; all ratified items have completeness maps | Each ratified/amended item has dispatched a Pass 2a/2b chain; all chains completed |
| 07-reconcile | Reconciliation | Phase 6 done | Each item's completeness_map entries verified: every listed artifact confirmed updated; reconciliation_gaps recorded for any discrepancy |
| 08-close | Phase-Close Consumption | Phase 7 done; no open gaps OR all gaps explicitly deferred with forward-tracks | Canonical docs updated; round archived; phase-boundary may proceed |

**Critical ordering constraint**: Phase 02-decompose MUST complete before Phase 05-adjudicate. Adjudication over bundled items allows partial implementation; adjudication over atomic items forces independent tracking of every provision. This is the direct structural prevention of the Item J failure mode.

Phase transitions are operator-committed via `state_admin feedback-round phase-transition`. A feedback-round BAO orchestrator proposes transitions but does not commit them (BAO bound #4 per `surfaces/_primitives/bounded-authority-orchestrator.md`). In v1, transitions are entirely operator-driven.

## Agent roles

| Agent | Phase(s) | Role | Substrate agent |
|---|---|---|---|
| `feedback-decomposer` | 02-decompose | Splits bundled payload into atomic single-provision items; read-only-by-contract; output: item_id + parent_item_id + provision + kind per item | New role candidate; may be a mode of `reconnaissance` or a dedicated agent (downstream decision) |
| `feedback-reconciler` | 07-reconcile | Verifies each implemented item's completeness map; records reconciliation_gaps; read-only-by-contract; MUST NOT propose fixes | New role candidate; may be a mode of `reconnaissance` or a dedicated agent (downstream decision) |
| `reconnaissance` | 04-completeness-map | Investigates which canonical artifact paths are touched by each atomic item | `.claude/agents/reconnaissance.md` |
| `architect` | 05-adjudicate, 06-implement | Adjudication ratification decisions per atomic item; Pass 2a gating for each item's implementation chain | `.claude/agents/architect.md` mode: ratification |
| `developer` | 06-implement | Change proposals per ratified atomic item | `.claude/agents/developer.md` |
| `applier` | 06-implement | Apply developer changes to subject codebase | System agent |
| `feedback-round-orchestrator` | Phase transitions + coordination | BAO instance over the feedback-round surface (downstream); operator-driven in v1 | New BAO instance |

Full per-role permitted_sections are defined in `surfaces/feedback-rounds/agents/` (stub files; downstream chain).

### feedback-decomposer (new role candidate)

Takes a raw feedback payload; emits a list of atomic items. Each item carries: `item_id`, `parent_item_id` (the source feedback item this was decomposed from), `provision` (the single claim or request in plain text), and `kind` (bug-report | enhancement-request | spec-gap | editorial | data-discipline | ux-concern).

The agent MUST NOT adjudicate, MUST NOT modify canonical docs, and MUST NOT produce implementation proposals. Its sole output is the decomposed item list. This is the read-only-by-contract pattern per Spec 03's reconnaissance precedent.

### feedback-reconciler (new role candidate)

Verifies, after implementation, that each atomic item's completeness map was honored. For each item with `adjudication: ratify | amend`, it checks whether every artifact in the completeness_map was updated consistently with the item's provision. On discrepancy: records a `reconciliation_gap` -- never silently passes. MUST NOT propose fixes; a reconciliation_gap triggers a new implementation chain. Also read-only-by-contract.

## State persistence

State file path: `feedback-rounds/<round-id>/STATE.jsonld`.

Chain-hashed via the substrate's `hiri_sign` mechanism; append-only; one file per feedback-round instance. Parallel structure to `retros/<retro-id>/RETRO_STATE.jsonld`. Override directory via `FNSR_FEEDBACK_ROUND_DIR` env var (implementation-time decision; analog of `FNSR_RETRO_DIR`).

### Top-level shape

```
{
  "@context": "https://fnsr.io/feedback-round/v0.1",
  "@id": "urn:fnsr:feedback-round:<round-id>",
  "status": "active | closed | archived",
  "phase": "01-capture | 02-decompose | 03-categorize | 04-completeness-map | 05-adjudicate | 06-implement | 07-reconcile | 08-close",
  "source_payload_path": "<path to feedback artifact>",
  "items": [],
  "audit": []
}
```

### Item shape

```
{
  "item_id": "<string>",
  "parent_item_id": "<string | null>",
  "provision": "<plain-text single provision>",
  "kind": "bug-report | enhancement-request | spec-gap | editorial | data-discipline | ux-concern",
  "effort": "S | M | L | XL | null",
  "priority": "high | medium | low | deferred | null",
  "adjudication": "ratify | amend | defer | null",
  "adjudication_note": "<string | null>",
  "completeness_map": [
    {
      "artifact_path": "<path>",
      "artifact_kind": "spec-section | fr | roadmap | impl-plan | source-module | spec-test | playwright-test | demo-material | walkthrough-doc | other",
      "section_ref": "<string | null>",
      "verified": false,
      "verified_by_task": "<task-id | null>"
    }
  ],
  "implementation_task_ids": [],
  "reconciliation_status": "pending | verified | gap | skipped | null",
  "reconciliation_gaps": [
    {
      "artifact_path": "<path>",
      "gap_description": "<what was expected vs what was found>"
    }
  ],
  "forward_track_id": "<string | null>"
}
```

## Audit event shapes

All events appended to `STATE.jsonld.audit[]`; chain-hashed per `hiri_sign`. All events include `round_id`, `timestamp` (ISO-8601), and `chain_hash` (sha-256).

| Event | Required fields (beyond common) |
|---|---|
| `feedback_round_initiated` | anchor_task_id, source_payload_path, phase_origin |
| `atomic_item_decomposed` | item_id, parent_item_id, provision, kind, decomposed_by_task |
| `completeness_map_declared` | item_id, completeness_map[], declared_by_task |
| `item_adjudicated` | item_id, adjudication (ratify / amend / defer), adjudication_note, adjudicated_by |
| `item_implemented` | item_id, implementation_task_ids[] |
| `item_reconciled` | item_id, reconciliation_status, reconciliation_gaps[] |
| `feedback_round_closed` | items_ratified, items_deferred, items_verified, items_with_gaps, forward_track_ids[] |

The six events `feedback_round_initiated`, `atomic_item_decomposed`, `item_adjudicated`, `item_implemented`, `item_reconciled`, and `feedback_round_closed` are the primary named events per this spec. `completeness_map_declared` is a required additional event for Phase 4 traceability.

## Operator commands

Full implementation is downstream substrate work (v3.2+). This section is the command-surface contract spec for implementers.

```
state_admin feedback-round init <round-id>
    --anchor-task <task-id> --source-payload <path> [--phase-origin <phase-id>]
```
Initializes STATE.jsonld; emits `feedback_round_initiated`; sets status=active, phase=01-capture.

```
state_admin feedback-round phase-transition <round-id>
    --to-phase <phase> --rationale "..."
```
Operator-commits a phase transition after confirming exit criteria. Analog of `state_admin retro phase-transition`.

```
state_admin feedback-round decompose <round-id> --from-task <task-id>
```
Merges feedback-decomposer agent output into STATE.jsonld items[]; emits `atomic_item_decomposed` per item. Operator reviews before committing.

```
state_admin feedback-round map <round-id> --item-id <id> --from-task <task-id>
```
Merges completeness map from reconnaissance agent output; emits `completeness_map_declared`.

```
state_admin feedback-round adjudicate <round-id>
    --item-id <id> --decision {ratify|amend|defer} [--note "..."]
```
Records operator adjudication for a single atomic item; emits `item_adjudicated`. Deferred items require a `forward-track` sub-command before `close` is allowed.

```
state_admin feedback-round implement <round-id>
    --item-id <id> --task-ids <id1,id2,...>
```
Records the implementation chain task IDs for a ratified item; emits `item_implemented`.

```
state_admin feedback-round reconcile <round-id> --from-task <task-id>
```
Merges feedback-reconciler agent output; emits `item_reconciled` per item.

```
state_admin feedback-round close <round-id> --anchor-task <task-id>
```
Closes the round; emits `feedback_round_closed`; sets status=closed. **Refuses** if any item has `reconciliation_status: gap` without an explicit forward-track.

```
state_admin feedback-round forward-track <round-id>
    --item-id <id> --deliberation-cycle <cycle-id>
```
Creates a Spec 07 forward-track (State A) for a deferred item with `subject.type: feedback-round-item`, `declaration_kind: operator_deliberate_deferral`; links the item's `forward_track_id` field.

```
state_admin feedback-round status <round-id>
```
Read-only display: current phase, per-item status table, open reconciliation gaps.

```
state_admin feedback-round list [--include-archived]
```
Lists all feedback rounds with phase + status summary.

## Integration with Spec 07 (Forward-Track Surface)

### Deferred items become forward-tracks

When an atomic item is adjudicated `defer`, it MUST become a Spec 07 forward-track in State A via `state_admin feedback-round forward-track`. The item's `forward_track_id` field provides bidirectional traceability between the STATE.jsonld item record and the forward-track audit event in state.jsonld.

### Sub-surface placement

Deferred items map to one of the two existing Spec 07 sub-surfaces: `consumer-closure-path` (provisions that are consumer-facing -- features, fixes, UX concerns visible to end users) or `internal-methodology-refinement` (provisions that are protocol-internal). Spec 07's open question "Sub-surface emergence governance" explicitly anticipates a stakeholder-feedback queue as a possible third sub-surface distinct from both; if usage patterns demonstrate a distinct audience semantic, register via `awaiting_operator_decision` per that section.

### Phase-boundary inheritance

At a phase boundary, unresolved feedback-round forward-tracks inherit via `state_admin forward-track inherit`. Recommended sequence at phase-close: `feedback-round close` then `forward-track inherit` then `phase-boundary`.

## Integration with Spec 07 (Phase-Boundary)

When a feedback round is tied to a phase-close:

1. `state_admin feedback-round close` MUST precede `state_admin phase-boundary` for the associated phase.
2. The `close` command **refuses** if any item has `reconciliation_status: gap` without an explicit forward-track -- this blocks the phase-boundary declaration.
3. Once all gaps are either verified or forward-tracked as deferred, `close` succeeds; `phase-boundary` may proceed.

**Principle**: a phase cannot close while its feedback round has open, unaccounted provisions. This is the substrate-level enforcement of the lesson from Item J's Phase 3 close.

## Substrate primitives this surface uses

- **Bounded-Authority Orchestrator (BAO)** -- `surfaces/_primitives/bounded-authority-orchestrator.md`. The `feedback-round-orchestrator` role is a BAO instance over the feedback-round surface. Downstream; operator-driven in v1.
- **Forward-Track Surface (Spec 07)** -- deferred atomic items become State-A forward-tracks; phase-boundary inheritance applies at phase-close.
- **Pass 2a / Pass 2b Sequencing (Spec 03)** -- each ratified atomic item's implementation follows the standard reconnaissance -> ratification -> commit-finalize chain.
- **Episodic -> Semantic Promotion** -- `surfaces/_primitives/episodic-to-semantic-promotion.md`. The CPS `_check_no_semantic_memory_mutation` constraint applies substrate-wide; `surfaces/` is in `_SEMANTIC_MEMORY_PATHS`. Promotions from closed rounds follow the deliberate-promotion path.
- **Anti-Pattern Enforcement** -- `surfaces/_primitives/anti-pattern-enforcement.md`. The five retro-surface anti-pattern detectors are candidates for feedback-round surface tasks; exact enforcement mapping is a downstream authoring decision.

## Anti-patterns and failure modes

### AP-1: Premature bundling (root cause of Item J)

**Pattern**: A feedback item containing multiple independent provisions enters adjudication as a single unit. One provision lands; the others are implicit and untracked.

**Instance**: demo/FEEDBACK.md Item J -- J1 (collision detection) and J2 (starter-term population) classified under one "Amend" heading in FEEDBACK-RESPONSE.md. J1 implemented in Phase 3; J2 lost.

**Prevention**: Phase 02-decompose is mandatory and MUST complete before Phase 05-adjudicate. Items without a `parent_item_id` tracing to a `atomic_item_decomposed` audit event are not valid STATE.jsonld entries.

### AP-2: Lost completeness map (no per-item artifact tracking)

**Pattern**: No explicit record of which artifacts a provision requires updating. The developer chain runs; some artifacts updated; others missed silently.

**Instance**: No completeness map existed for J2. The absence of an entry for buildNewDocument() in App.tsx made the gap structurally invisible until post-hoc audit.

**Prevention**: Phase 04-completeness-map is mandatory and MUST complete before Phase 06-implement. An item without a non-empty `completeness_map` MUST NOT advance to the implementation phase.

### AP-3: No reconciliation pass (no verification of completeness map honor)

**Pattern**: Implementation chains run; the phase closes; no agent verifies that every artifact listed in every item's completeness map was actually updated.

**Prevention**: Phase 07-reconcile is mandatory. The `feedback-reconciler` agent (read-only-by-contract) verifies each item's map. Items with `reconciliation_status: gap` block the `close` command.

### AP-4: Manual-only triage (no atomic-decomposition agent)

**Pattern**: The operator or a triage agent processes the payload by intuition, grouping related concerns informally. Compound items pass into adjudication as if they were atomic.

**Instance**: FEEDBACK-RESPONSE.md's adjudication table treated Item J as a single "Amend" unit rather than two independently-tracked provisions.

**Prevention**: The `feedback-decomposer` role MUST be dispatched for every non-trivial feedback payload. The agent's output is the authoritative decomposition; informal human annotation is input to the agent, not a substitute for a formal decomposition record.

### AP-5: Gap-16 gating risk (architect denial not blocking downstream)

**Pattern**: Architect ratification in Phase 05-adjudicate returns `ruling: denied` for an atomic item. Downstream applier dispatches anyway because the daemon checks task `status` (done/blocked) rather than `outputs.ruling`.

**Context**: OPERATOR-MEDIATION-LOG.md Event 11 documents this gap (gap-16 v3.2 candidate). Proposed fix: architect emits `outputs.error: "ratification_denied"` on denial, blocking the chain via the existing CPS veto mechanism at zero daemon change cost.

**Mitigation (v1)**: Operator MUST review architect ratification outputs before any applier dispatch for each atomic item's implementation chain. This is operator-discipline backstop until gap-16 is resolved. The `state_admin feedback-round adjudicate` command SHOULD NOT be shipped before gap-16 is addressed.

## Open questions (v1 draft)

1. **feedback-decomposer / feedback-reconciler agent shape**: New dedicated agent contracts or modes of the existing `reconnaissance` agent? The reconnaissance agent is read-only-by-contract; output shapes differ (decomposed items vs. findings + evidence_paths). Dedicated contracts are cleaner; defer to the agent-contract authoring chain.

2. **feedback-round-orchestrator BAO**: v1 is operator-driven throughout. A BAO instance for phase-transition proposals follows the retro-surface pattern. Scope deferred to the BAO-agent-contract chain.

3. **Sub-surface registration for stakeholder feedback**: Spec 07 open question "Sub-surface emergence governance" anticipates a third sub-surface for stakeholder-feedback items if usage patterns show a distinct audience semantic. Register via `awaiting_operator_decision` when evidence accumulates; not in v1 scope.

4. **Gap-16 resolution timing**: AP-5 identifies that adjudication phase integrity depends on gap-16 being resolved. Recommend resolving gap-16 (architect contract + CPS sequence fix) before shipping `state_admin feedback-round adjudicate` in v3.2.

5. **Companion entry in project/Routing/**: Recon finding F1 notes that FNSR Protocol Spec docs 01--07 all have entries in `project/Routing/` using the prose-frontmatter convention. This spec lives at `surfaces/feedback-rounds/spec.md` (surface-level convention per recon F4). Whether to add a companion `project/Routing/08-stakeholder-feedback-round-spec.md` for numbering-convention completeness is a v1.1 authoring consideration; not in v1 scope.

6. **FNSR_FEEDBACK_ROUND_DIR env var**: The state file path `feedback-rounds/<round-id>/STATE.jsonld` is relative to the project root. An env var override (analog of `FNSR_RETRO_DIR`) is expected; implementation-time decision for the state_admin chain.

## v1 scope

This document is the **protocol specification only**. The following are downstream separate chains and are NOT in v1 scope:

- `surfaces/_primitives/stakeholder-feedback-round.md` (primitive doc)
- Agent contract files for `feedback-decomposer`, `feedback-reconciler`, `feedback-round-orchestrator`
- `state_admin feedback-round` command implementations in state_admin.py
- Per-phase spec files under `surfaces/feedback-rounds/phases/`
- Role binding files under `surfaces/feedback-rounds/agents/`
- Daemon hooks for feedback-round surface tasks
- Pass 2a gating fix for gap-16 (architect contract change)
