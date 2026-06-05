---
name: recovery-dispatcher
description: Deterministic system agent. Consumes a fixer agent's `recovery_chain` output, validates it via fnsr_chain_validator (PRED-1 through PRED-6), and append-tasks on PASS. Runs as Python in the orchestrator, NOT as a Claude subagent. Escalates on FAIL or on `escalate: true`.
required_outputs: [dispatched, validator_report, escalated, summary]
---

# recovery-dispatcher — system agent

The recovery-dispatcher is the third system agent with externally-visible side effects (after the applier writes files, the retro-applier writes retro state, and the git-committer creates git commits). It mutates `state.jsonld` by appending the recovery chain to the task list, gated by the chain-validator.

System agents differ from worker agents per the established applier / retro-applier / mojibake-repair / question-resolver / test-runner / verification-ritual / git-committer pattern:

| | Worker agents | System agents |
|---|---|---|
| Implementation | Markdown contract + Claude LLM dispatch | Python function in `fnsr_daemon.py` |
| Invocation | `claude --agent <name> --output-format json` | Direct function call inside `invoke_agent` |
| Determinism | Non-deterministic (LLM) | Deterministic |

The recovery-dispatcher is paired with the **fixer** worker agent. The fixer produces `outputs.recovery_chain` as a list of task dicts (parallel to a hand-written chain JSON file). The recovery-dispatcher reads that list, runs the chain-validator, and append-tasks if and only if the chain passes.

## Operating contract

1. INPUTS schema:

   ```
   source_task : str   <- @id of an upstream fixer task whose outputs
                          contain `recovery_chain` + `escalate` + `diagnosis`.
                          MUST be present in this task's depends_on for
                          UPSTREAM resolution (parallel to applier).
   anchor_task : str?  <- the originally-failing task that triggered the
                          fixer dispatch (informational; recorded in
                          audit-event payload).
   ```

2. Behavior:

   - Read the source_task's outputs from UPSTREAM (parallel to applier).
   - **v3.7.5 auto-resolution gate (runs first when `escalate == true`):** if the Fixer's outputs include a well-formed `auto_resolution: {execution_mode: "no-execution-required", reason: "<non-empty>"}`, do NOT escalate to operator. Return:
     ```
     {dispatched: 0, escalated: false, auto_resolved: true,
      execution_mode: "no-execution-required", reason: "<fixer's reason>",
      summary: "Fixer self-classified as auto-resolvable (no-execution-required); no operator surface emitted."}
     ```
     The daemon commits with `status=done`. Only `no-execution-required` is honored auto-resolved in v3.7.5; other execution_modes fall through to the normal escalate path.
   - If `outputs.escalate == true` and no `auto_resolution` (or malformed): do NOT dispatch. Return:
     ```
     {dispatched: 0, escalated: true, summary: "fixer requested escalation",
      validator_report: null}
     ```
     The orchestrator-Agent or operator surfaces this for human decision.
   - If `outputs.recovery_chain` is empty/null AND escalate is false: treat as no-op recovery. Return:
     ```
     {dispatched: 0, escalated: false, summary: "fixer proposed no recovery",
      validator_report: null}
     ```
   - Otherwise: invoke `fnsr_chain_validator.validate_chain(recovery_chain, current_state)`.
     - If `verdict == "PASS"`: append the recovery_chain tasks to `state.jsonld`. Return:
       ```
       {dispatched: N, escalated: false,
        validator_report: {...summary...}, summary: "recovery dispatched"}
       ```
     - If `verdict == "FAIL"`: do NOT dispatch (the chain has structural defects the fixer should have caught). Return:
       ```
       {dispatched: 0, escalated: true,
        validator_report: {...findings...},
        summary: "fixer's recovery_chain failed validator; escalating"}
       ```
     The orchestrator surfaces validator failure for human review (fixer agent may need refinement).

3. CPS-veto-eligible: if `outputs.dispatched: 0 AND escalated: false AND validator_report: null` is the entire output, that's a contract violation — the dispatcher MUST always populate one of the three outcomes (dispatched / escalated / no-op).

## Composition with the Fixer + validator

The full recovery chain shape:

```
Stalled task X
    ↓
Daemon detects stall (Spec 09 stall_detected event)
    ↓
Daemon auto-queues:
  fixer task (anchor_task=X) → recovery-dispatcher task (source_task=fixer)
    ↓
Fixer runs (read-only diagnosis; opus); outputs {diagnosis, recovery_chain, escalate, ...}
    ↓
Recovery-dispatcher runs (deterministic Python):
  - escalate==true: surface; no dispatch
  - validator FAIL: surface; no dispatch
  - validator PASS: append-tasks
    ↓
Recovery chain tasks dispatch normally through daemon picker
```

## Audit chain semantics

Every recovery-dispatcher run emits a `recovery_dispatched` audit event payload:

```json
{
  "anchor_task": "<originally-failing task @id>",
  "source_task": "<fixer task @id>",
  "dispatched": <count of new tasks appended; 0 on escalate/fail>,
  "escalated": <bool>,
  "validator_summary": {...severity_counts...},
  "recovery_chain_ids": ["urn:fnsr:task:N1", "urn:fnsr:task:N2", ...]
}
```

Future Fixer dispatches can walk audit for `recovery_dispatched` events anchored on the same task to enforce the recursion bound (per Fixer contract: `prior_recovery_attempts >= 2` → escalate).

## Safety guarantees

- **No state.jsonld mutation if validator FAILS.** The dispatcher is fail-safe: bad recovery_chains never enter the queue.
- **No retry on validator failure.** If a fixer produces a malformed chain, the situation escalates — don't loop the fixer to try again. Trying again would require a different fixer prompt; same prompt won't fix it.
- **Per-task contract: idempotent.** Re-running the dispatcher on the same source_task should produce the same outcome (modulo PRED-5 @id-collision once the first run has appended; the second run would FAIL validator on PRED-5 and escalate). This is by design — protects against accidental double-dispatch.

## Relationship to other primitives

| Primitive | Recovery-dispatcher relationship |
|---|---|
| `fnsr_chain_validator` | Gate predicate — dispatcher uses it on every recovery_chain |
| `applier` | Parallel system agent; applier writes files, dispatcher writes tasks |
| Spec 09 stall_detected | Trigger — daemon's stall detection auto-queues the fixer + dispatcher pair |
| Spec 03 brief-confirmation | Fixer can propose brief-confirmation chains; dispatcher honors `brief_confirmation: true` on applier tasks within the recovery chain |
| AP-PLO-2 (close requires drift-reconciled) | Fixer cannot bypass; recovery_chains touching phase-close transitions auto-fail at the daemon's existing AP-PLO-2 enforcement |
| AP-SVG-3 (canonical-docs never contradict audit) | Fixer is forbidden from proposing canonical-doc edits per its contract; dispatcher does not need a redundant guard |
