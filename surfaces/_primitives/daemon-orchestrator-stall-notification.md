---
primitive_id: daemon-orchestrator-stall-notification
short_name: Daemon→Orchestrator Stall Notification
status: draft / candidate (v3.2+ substrate primitive)
introduced_in: pending (this doc establishes the primitive; implementation deferred to v3.2+)
enforcement_target: v3.2+ (daemon stall-detection hook + notification channel)
canonical_reference: OPERATOR-MEDIATION-LOG.md Event 13 (2026-05-22; "Recurring chain-stall pattern + proposed daemon-notification substrate primitive") + Aaron's "Have we considered the Daemon sending a message to you the coordinator?" framing
---

# Daemon→Orchestrator Stall Notification — substrate primitive (draft)

## Status

**v3.1.0-bridge implementation landed (2026-05-24)** — the operational watchdog form of this primitive ships as [`fnsr_stall_watch.py`](../../fnsr_stall_watch.py) (read-only probe over state.jsonld + fnsr.pid; emits `fnsr.stall_status.json`). Triggered by Aaron's operational request: *"Can we make a small listener that when it is done it posts a status to you the orchestrator. IF the state has stopped and we are in a demo that is fine but if we have ready work and we have stop you investigate and fix if you can?"*

The bridge form implements detection categories A (dispatch-impossible by deps), B (hung in_progress), and C (Pass 2a gated). Category D (developer truncation) is deferred to v3.2.

**v3.2 candidate (deferred):** daemon-side emission — the daemon's main loop calls `_detect_stalls(state)` and writes structured `stall_detected` audit events when the picker returns None. The bridge watchdog is a read-only probe; v3.2 promotes it into the chain-hashed audit trail as first-class events.

## What it is

A **substrate-emitted push notification** from the deterministic daemon (`fnsr_daemon.py`) to the orchestrator-Agent (the operator-Agent running Claude Code) when a chain enters a stall state — a structural condition where progress cannot proceed without operator intervention but no agent-level error has fired.

The primitive closes a loop the substrate has historically left open: chain stalls (Pass 2a denied without Pass 2b gating; depends-on-blocked; hung in-progress; developer token-overflow truncation) reach a terminal-but-stuck condition where the next ready task picker returns `None`, but no signal reaches the orchestrator. The orchestrator-Agent discovers the stall only by manually polling `state_admin status` or — more commonly observed in practice — by the human operator asking "did we stop again?".

This primitive makes stalls **visible at substrate boundary** instead of invisible.

## Why this is a substrate primitive (not just operator discipline)

A polling discipline imposed on the orchestrator-Agent ("check `state_admin status` every N minutes") would be operator-process, not a substrate primitive. What makes daemon-orchestrator-stall-notification a substrate primitive is the property the substrate guarantees: **the daemon emits a structured `stall_detected` audit event with a recovery-options payload whenever the picker enters a non-progressing terminal state**, so the orchestrator-Agent's notification channel surfaces the stall without explicit polling.

The primitive's three properties (parallel construction with surface-audience's three-property structure):

1. **Detection is daemon-side, not orchestrator-side.** The daemon already iterates the task list at every `next_ready_task` call; stall detection is a deterministic predicate over that same iteration. The orchestrator-Agent does not run a stall-detection loop.
2. **Emission is a chain-hashed audit event.** Stalls become first-class events in the audit chain (same shape as `completed` / `recovered_from_in_progress` / `operator_resolution`). The audit trail becomes the canonical record of every stall the substrate has ever recognized; queries like "how many stalls of kind X has this substrate produced?" become answerable.
3. **Recovery is orchestrator-decided, not daemon-decided.** The daemon SHOULD NOT auto-rollback, auto-abandon, or auto-re-dispatch on stall detection. Recovery actions are deliberate operator-Agent choices, mediated by the existing `state_admin` family (`resolve`, `abandon`, `append-tasks`).

## Stall detection categories

The daemon runs the detector at every `next_ready_task` invocation (cheap; the iteration is already happening) AND at a periodic heartbeat (e.g., every 60s) when the daemon is otherwise idle. Four detection categories ship in v3.2 draft scope:

### Category A — Dispatch-impossible by depends-on

A task in `status: ready` whose `depends_on` includes any task in `{blocked, failed, abandoned}`. The picker filters these out (deps-not-done), so they accumulate silently. Pre-Event 11-fix, this was the primary observed stall shape: applier blocked → downstream test-runner stays ready forever.

**Payload:**
```json
{
  "stall_kind": "dispatch_impossible_deps",
  "anchor_task": "<task @id>",
  "evidence": {
    "blocked_dep_ids": ["<dep @id 1>", "<dep @id 2>"],
    "blocked_dep_statuses": {"<dep @id 1>": "blocked", "<dep @id 2>": "failed"}
  },
  "suggested_recovery_options": [
    "state_admin abandon <task @id> --reason '...'",
    "state_admin reset <blocked-dep @id> # if the dep is fixable",
    "state_admin append-tasks # if a forward-fix chain is needed"
  ]
}
```

### Category B — Hung in-progress

A task in `status: in_progress` whose latest history transition is older than a configurable threshold (default 30 minutes; tunable via `FNSR_STALL_HUNG_MINUTES` env var). Indicates the daemon process crashed mid-dispatch or the agent invocation hung without returning.

**Payload:**
```json
{
  "stall_kind": "hung_in_progress",
  "anchor_task": "<task @id>",
  "evidence": {
    "in_progress_since_iso": "<timestamp>",
    "minutes_elapsed": 47,
    "agent_invoked": "<agent name>"
  },
  "suggested_recovery_options": [
    "Wait — long-running agent dispatches can legitimately exceed the threshold",
    "state_admin reset <task @id> # if daemon crashed; revives to ready",
    "Restart daemon # crash-recovery path handles in_progress revival"
  ]
}
```

### Category C — Pass 2a gate violation territory (largely obsolete post-Event-11-fix)

An architect task in `status: done` with `outputs.ruling ∈ {denied, deferred}` whose downstream applier task is `status: ready` and getting filtered by the Event 11 fix. Without the notification, the operator has no signal that the picker is skipping a task by design (Pass 2a gating) rather than by error. With Event 11's fix landing in `_architect_ratification_block`, this category becomes the substrate's primary signal that operator-action is required.

**Payload:**
```json
{
  "stall_kind": "pass_2a_gated",
  "anchor_task": "<applier task @id>",
  "evidence": {
    "architect_dep_id": "<architect task @id>",
    "ruling": "denied",
    "rationale_excerpt": "<first 200 chars of architect's outputs.rationale>",
    "editorial_verdict": "<editorial | substantive>",
    "referenced_evidence": [...]
  },
  "suggested_recovery_options": [
    "state_admin abandon <applier @id> --reason 'ratification denied per <architect-id>'",
    "state_admin append-tasks # if a follow-up developer/architect chain is needed to address the denial",
    "Operator-fix the specific objection + re-dispatch (preserves audit-chain alignment with architect's finding)"
  ]
}
```

This category is **expected to be the most common signal** post-Event-11 — the picker correctly filters the gated applier, and the notification tells the operator-Agent "I correctly refused to land changes the architect denied; here's what the architect actually said; here are recovery shapes."

### Category D — Developer token-overflow truncation

A developer task in `status: done` whose `outputs.summary` (or `outputs.changes[].after` content) contains continuation-style language ("C38-C63", "continuation output", "...continuing from prior task", "remaining changes:", etc.) AND whose `outputs.changes[]` count is below the count implied by the continuation language. This is the silent-truncation gap surfaced in Event 13(b): the model's max-tokens cap silently truncates the developer's full proposal; the tail makes it back; the substrate has no signal half the proposal is missing.

**Payload:**
```json
{
  "stall_kind": "developer_output_truncated",
  "anchor_task": "<developer task @id>",
  "evidence": {
    "continuation_markers": ["C38-C63 (26 changes)", "Continuation output"],
    "returned_changes_count": 26,
    "implied_total_count": 63,
    "summary_excerpt": "<first 300 chars of outputs.summary>"
  },
  "suggested_recovery_options": [
    "state_admin abandon <task @id> + re-dispatch as N narrower chains per the developer's implicit suggested_split",
    "Re-dispatch the developer task with explicit max-scope guidance (e.g., 'C1-C20 only; remainder will be separate task')",
    "Architect Pass 2a will catch the missing changes via file-level evidence reconnaissance — accept the cost and proceed if the partial work is independently sound"
  ]
}
```

The token-overflow detection is heuristic (continuation markers + change-count anomaly). False positives are acceptable because the operator-Agent's review of the notification is cheap; false negatives are the real risk and motivate continuing refinement of the marker list.

## Emission and channel

**Emission.** When a detection category fires, the daemon appends a `stall_detected` event to the task's history (via the standard `hiri_sign` chain-hashing path). The event is structurally identical to existing audit events (`event` key + payload + chain-hash); the operator's `state_admin verify` command verifies it like any other.

**Channel.** The audit event surfaces to the orchestrator-Agent via the substrate's existing notification mechanism — the same channel by which `Bash run_in_background` task completions reach the Agent. The daemon writes a structured line to its stdout / stderr that the orchestrator-Agent's harness recognizes as a stall signal. (Implementation choice: stdout JSON line vs sidecar notification file vs OS-level signal — deferred to v3.2 implementation.)

The notification mechanism MUST be push, not pull. Pull (orchestrator-Agent polls state.jsonld every N seconds) defeats the primitive's purpose: the substrate already has the information at the moment of detection; the cost is the channel, not the detection.

## Anti-pattern guardrails

Per Spec 08 v0.3 anti-pattern enforcement primitive (`surfaces/_primitives/anti-pattern-enforcement.md`), three anti-patterns govern this primitive's operational discipline:

**AP-S1: Daemon SHOULD NOT auto-act on stall detection.** No auto-rollback. No auto-re-dispatch. No auto-abandon. The daemon's role is detection + emission; the orchestrator-Agent (and beyond, the human operator) decides recovery. The substrate's separation-of-concerns commitment (CLAUDE.md §2: "no reasoning in the daemon") extends to: no recovery-decision in the daemon either.

**AP-S2: Operator-Agent SHOULD NOT poll state.jsonld for stalls once notification ships.** Once the push-notification channel exists, manual polling is anti-pattern — it bypasses the substrate's contract. Manual polling is acceptable ONLY when the daemon is not running OR the notification channel is known-broken; both conditions should be diagnosed and fixed rather than worked around.

**AP-S3: Stall events SHOULD NOT be classified as developer/architect/applier failures.** Stalls are STRUCTURAL conditions, not agent-output failures. CPS vetoes already cover agent-output failures (null outputs, structured-error shape, missing required keys). Stalls fire on conditions where every agent in the chain operated correctly per its contract but the chain as a whole cannot progress.

## Integration with existing primitives

**With Spec 07 (forward-tracks).** Every `stall_detected` event SHOULD optionally fork a forward-track in state A (candidate) with `subject_type: stall_detection` and `subject_id: <stall_kind>`. This means: stalls accumulate as resolvable items the operator can transition via standard `state_admin forward-track transition` once recovery lands. The forward-track surface becomes the queryable index of "every stall this substrate has detected" — replacing ad-hoc OPERATOR-MEDIATION-LOG bookkeeping with substrate-native discipline.

**With Spec 05 (banking).** Stall events that recur with the same `stall_kind` SHOULD be bankable as `category: pattern-observation` events anchored on the most recent stall instance. A pattern of N stalls of the same kind across M sessions is evidence-of-recurrence and a candidate for substrate refinement (e.g., the Event 11 cluster across this very session would have banked itself automatically post-primitive).

**With Spec 03 (Pass 2a).** Category C (`pass_2a_gated`) is the primary signal that Pass 2a gating fired correctly. The notification surfaces the architect's denial rationale at the moment the picker refuses dispatch — eliminating the "why did the chain stop?" diagnostic step that currently consumes 2-3 conversation turns per occurrence.

**With Spec 02 (verification ritual).** Stall events from verification-ritual vetoes (Cat 1-8 deterministic vetoes; Cat 9 LLM vetoes) MAY emit stall_detected events to signal "ritual blocked dispatch; here's the category that fired; here's recovery." This integration is optional in v3.2 scope; v3.3+ candidate.

## v3.2+ implementation split

**v3.2 draft scope:**

- Detection categories A, B, C, D implemented in `fnsr_daemon.py` as a `_detect_stalls(state)` helper called from `next_ready_task` when the picker returns None AND from the daemon's idle-heartbeat path
- Audit event emission: `stall_detected` events appended via the standard `hiri_sign` chain
- Notification channel: stdout JSON-line format `{"event": "stall_detected", "payload": {...}}` recognized by the orchestrator-Agent's harness as a signal
- `state_admin status` command updated to surface unresolved stall_detected events at top of output
- Regression tests in `tests/test_stall_detection.py` covering each category's predicate + the false-positive boundaries

**v3.3+ candidates:**

- Forward-track auto-fork from stall events (Spec 07 integration)
- Recurrence-pattern banking auto-emit (Spec 05 integration)
- Verification-ritual veto stall-events (Spec 02 integration)
- LLM-judge-based stall classification when deterministic detection ambiguous (parallels Cat 9's deterministic→LLM escalation pattern)

## Open questions (deferred to v3.2 implementation)

1. **Notification-channel implementation choice.** stdout JSON-line vs sidecar file vs OS signal? Each has tradeoffs (stdout simpler but coupled to daemon's logging; sidecar more flexible but adds I/O path; OS signal cleanest but platform-specific). Recommend stdout JSON-line for v3.2 simplicity.

2. **Idle-heartbeat cadence.** 60s is the OPERATOR-MEDIATION-LOG Event 13 sketch value; should it be configurable? Recommend `FNSR_STALL_HEARTBEAT_SECONDS` env var with 60s default; allow operators to tune for noisy vs quiet sessions.

3. **Deduplication.** If a stall persists across multiple detection iterations (likely for Category A and C), how does the substrate avoid spamming the orchestrator-Agent with the same stall event every heartbeat? Recommend: emit at first detection per task; suppress re-emission until task transitions out of the stall condition; emit closure event when the stall resolves.

4. **Cross-chain stall classification.** Some stalls are chain-level (e.g., Chain α and Chain δ both stuck for different reasons in the same session). Does the substrate group these or emit per-task? Recommend per-task at v3.2; cross-chain summarization is a v3.3+ candidate via the forward-track integration.

5. **Token-overflow detection robustness.** The continuation-marker list is heuristic; the implied-vs-actual change count requires upstream context. False-positive rate vs false-negative rate tradeoff is operator-empirical and SHOULD be tuned across early v3.2 deployment.

## Trajectory closure relationship

This primitive is **post-trajectory-closure work** (v3.1.0 was the originally-scoped trajectory's terminal release). Whether it lands in v3.2 depends on whether substrate evolution continues beyond the originally-scoped trajectory or whether the substrate stabilizes while FNSR-larger-scope work consumes the v3.1.0 foundation.

The Event 13 evidence — 7+ chain stalls in Round 4 implementation; each costing 2-3 conversation turns of diagnostic friction — argues for v3.2 prioritization regardless of the larger trajectory decision. The primitive is a **discipline-clarity refinement** (the substrate's promised separation-of-concerns extends to operator-feedback channels) rather than a capability expansion, aligning with the v3.2 framing established at Round 4 close.

## References

- OPERATOR-MEDIATION-LOG.md Event 13 (2026-05-22): canonical source for this primitive's motivation
- OPERATOR-MEDIATION-LOG.md Event 11 (closed 2026-05-23 via Pass 2a gating fix): Category C's primary use case
- OPERATOR-MEDIATION-LOG.md Event 12 (closed 2026-05-23 via CPS-sequence fix): demonstrates that not all stalls are this primitive's territory — agent-contract bugs are CPS's territory
- `surfaces/_primitives/anti-pattern-enforcement.md`: AP-S1, AP-S2, AP-S3 anti-patterns established above
- `surfaces/_primitives/surface-audience.md`: parallel three-property primitive shape; conservative-default precedent
- CLAUDE.md §2 "Separation of concerns": the substrate-discipline commitment this primitive operationalizes
- CLAUDE.md §7 "The Barcode Flow": the next_ready_task picker where Category A/C detection naturally inserts
