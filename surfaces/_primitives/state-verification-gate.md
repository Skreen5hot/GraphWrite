---
primitive_id: state-verification-gate
short_name: State Verification Gate (SVG)
status: blueprint / candidate (v3.1.0-bridge → v3.2 substrate integration)
introduced_in: pending (this doc establishes the blueprint; implementation deferred to v3.1.0-bridge + v3.2)
enforcement_target: v3.2+ (daemon-side dispatch gate; block-class drift halts new task dispatch)
canonical_reference: Aaron 2026-05-25 directive — "Reject options (a), (b), and (c). Instead, create a blueprint for an automated State Verification Gate within our Daemon's execution loop. This gate must check active Git/Substrate state against canonical documentation before initiating any new development tasks. Propose how we can implement this structural process change so the system self-alerts or self-reconciles drift moving forward."
---

# State Verification Gate (SVG) — substrate primitive blueprint

## Status

**Blueprint / candidate.** This document establishes the primitive's contract and predicate catalog so v3.1.0-bridge (operator-invocable probe) and v3.2 (daemon-side dispatch gate) implementations can build against a stable specification. No implementation ships in this commit.

## Problem this primitive solves

Documentation drift between **canonical authored docs** (ROADMAP, IMPLEMENTATION_PLAN, SPEC, DECISIONS, surface specs) and **observable substrate state** (git history, audit chain, deployed artifacts, filesystem). Five concrete drift modes observed in the GraphWrite session through 2026-05-25:

1. **Phase doc vs git reality.** ROADMAP says "Phase 2 Not Started" while git log shows multiple Phase 2 commits shipped + Phase 2 UI deployed and stakeholder-iterated (Rounds 3, 4, 5, 5b).
2. **Commit-gap.** Applier writes files to disk; substrate marks chain done; but the operator's git-commit-and-push step is separate. Round 5 source diff sat uncommitted on the working tree for hours; deploy artifact was stale Round-4 code while substrate audit said "Round 5 chains landed."
3. **Push-gap.** Local main ahead of origin/main; uncommitted-but-tested code hasn't reached the deploy artifact.
4. **Banking lifecycle stagnation.** State-1 (verbal-pending) bankings accumulating without state-2 / state-3 transitions per Spec 05; canonical-doc reflection is supposed to fold them in at phase exit but the phase-exit declaration never fires.
5. **Forward-track aging.** State-A (candidate) forward-tracks past their named deliberation cycle without resolution.

The substrate has **no current mechanism to detect any of these**. They surface only when the operator notices manually — too late; deploy was wrong code; phase docs lie about reality; bankings rot.

## What the primitive is

A **deterministic Python gate** that runs in the daemon's execution loop AND/OR as a standalone operator-invocable probe. It composes a **catalog of drift predicates** that compare canonical documentation claims against observable substrate / git / filesystem state, and emits a structured drift report. Severity-graded: some drift **blocks** new task dispatch; some **warns**; some is **informational**.

The gate's three substrate properties (parallel construction with surface-audience + anti-pattern + daemon-orchestrator-stall-notification primitives):

1. **The gate is daemon-side, deterministic, and pre-dispatch.** It runs before `next_ready_task` returns a task to dispatch. No LLM in the gate path; pure Python predicates over state + filesystem + git introspection. Same separation-of-concerns commitment as the rest of the daemon (CLAUDE.md §2).
2. **The gate self-alerts but never self-mutates canonical state.** Per CLAUDE.md §6 ("MUST NOT commit or push without explicit operator instruction") and CLAUDE.md §10 (`state_admin phase-complete-declaration` is operator-authoritative), the gate's role is detection + emission. Reconciliation is operator-decided. The gate emits an audit event + writes a status file; the operator (or orchestrator-Agent in Auto Mode acting on operator-tier feedback memory) acts on it.
3. **Every gate evaluation writes a `state_verification_evaluated` audit event.** The audit chain becomes the canonical record of every gate run; queries like "when did drift X first surface?" become answerable.

## Drift catalog (predicates)

Each predicate is a pure function: `(state, fs_context, git_context) → DriftFinding | None`.

### Category SVG-1: Canonical Doc / Git Reality Drift

**SVG-1.1 — Phase claimed "Not Started" but Phase work shipped.**
- Check: for each phase N in ROADMAP.md / IMPLEMENTATION_PLAN.md:
  - Parse "Status: ..." field
  - If "Not Started" → grep `git log --oneline` for commits matching `^Phase N` or task @ids referencing phase
  - If commits found → drift
- Severity: `warn`
- Example evidence: `git log --oneline | grep "^Phase 2"` returns `4910d78 Phase 2: Browser UI shell + 12 user-flow tasks`
- Reconciliation: operator updates ROADMAP Status field OR formally declares phase boundary via `state_admin phase-boundary phase-1 phase-2 --anchor-task <id>`

**SVG-1.2 — Phase claimed "Complete" but exit-gate OEDs open.**
- Check: ROADMAP says Phase N "Complete" / "Substantively Complete" → scan ROADMAP for OED-NNN entries marked as Phase N exit gates and unresolved → drift
- Severity: `warn`
- Example: ROADMAP Phase 1 says "Substantively Complete" but OED-303 + OED-313 are listed as Phase 1 exit gates and unresolved
- Reconciliation: operator either resolves OEDs (canonical-doc update + `state_admin phase-complete-declaration`) or updates phase Status to be honest about "complete except for OED-303 + OED-313"

**SVG-1.3 — Phase formally complete in substrate but ROADMAP unchanged.**
- Check: `phase_complete_declared` event in audit → phase N → ROADMAP Status field doesn't reflect → drift
- Severity: `warn`
- Reconciliation: operator updates ROADMAP

### Category SVG-2: Commit-Gap Drift

**SVG-2.1 — Applier landed source changes; uncommitted diff present.**
- Check: walk recent done tasks for `agent == "applier"` with `outputs.applied` containing paths under `src/` or `demo/` → `git status --short` shows those files uncommitted → drift
- Severity: `block` (THIS is the discipline failure that ate hours in Round 5)
- Example: 425-apply-r5-c1-c6-only done at T; `git status` at T+N shows `src/ui/PropertyCreationDialog.tsx` modified; never committed
- Reconciliation: operator commits + pushes; gate clears

**SVG-2.2 — Source diff older than threshold while audit-chain says "landed."**
- Check: applier task done > 30 min ago; uncommitted diff persists → escalate severity to `block`
- Severity: graduates from `warn` to `block` as gap ages
- Rationale: a fresh applier-finishes + uncommitted-diff state is normal (operator about to commit). A persistent one means the discipline failed.

### Category SVG-3: Push-Gap Drift

**SVG-3.1 — Local main ahead of origin/main.**
- Check: `git rev-parse HEAD` != `git rev-parse origin/main` (after `git fetch`)
- Severity: `warn`
- Reconciliation: operator pushes

**SVG-3.2 — Pushed commits not in deploy artifact.**
- Check: harder; would require deploy-artifact mtime / hash comparison
- Severity: `info` initially; needs deploy-platform integration
- Phase B candidate

### Category SVG-4: Banking Lifecycle Drift

**SVG-4.1 — State-1 banking past phase boundary.**
- Check: banking events with `state: 1`; anchor task's phase has closed (per `phase_complete_declared` event); banking still in state 1 → should be state 2 (partially-committed) or state 3 (formalized) → drift
- Severity: `warn`
- Reconciliation: operator runs `state_admin transition-banking <banking-id> --to-state 2|3 --reason ...` OR commits the canonical-doc folding pass

**SVG-4.2 — Bankings of `discipline-correction` category older than N days without committed canonical change.**
- Check: banking category == discipline-correction; created > N days ago; no canonical-doc edit (CLAUDE.md / PLAYBOOK.md / spec doc) committed since the banking → drift
- Severity: `info` rising to `warn` with age
- Rationale: discipline corrections that don't become canonical eventually evaporate

### Category SVG-5: Forward-Track Aging

**SVG-5.1 — State-A (candidate) forward-track past deliberation cycle.**
- Check: forward-track events with `state: A`; deliberation_cycle has elapsed (per phase / cycle convention) → drift
- Severity: `warn`
- Reconciliation: operator advances via `state_admin forward-track transition <ft-id> --to-state B --rationale ...`

### Category SVG-6: Substrate Health (composition with Spec 09)

**SVG-6.1 — Stall-watch detected stall_dispatch_impossible with fresh deps.**
- Check: invoke `fnsr_stall_watch.probe_once()`; if `stall_kind == "stall_dispatch_impossible"` with fresh bad-deps → drift
- Severity: `block` (the recon-front cascade pattern)
- Reconciliation: operator cascade-fixes deps via abandon-and-replace pattern

**SVG-6.2 — Daemon dead but ready work exists.**
- Check: `fnsr_stall_watch` reports `daemon_alive == False` and `dispatchable_now > 0` → drift
- Severity: `block`
- Reconciliation: operator restarts daemon

## Integration with daemon execution loop

### Phase A (v3.1.0-bridge): operator-invocable probe + watchdog composition

New file: `fnsr_state_verification.py`. Operator invokes manually: `python fnsr_state_verification.py [--print] [--blocking-only]`. Returns structured JSON drift report, writes `fnsr.svg_status.json`.

`fnsr_stall_watch.py` extends to call SVG predicates as part of its probe and surface block-class drift as part of its recommendation field.

Discipline shift: orchestrator-Agent runs SVG on every conversational turn that could initiate new development work. Operationally equivalent to running `git status` before `git commit` — preflight discipline.

### Phase B (v3.2): daemon-side dispatch gate

`fnsr_daemon.py` integrates SVG as a precondition in `next_ready_task` (or a new wrapper `next_ready_task_with_gate`):

```python
def main_loop():
    while True:
        state = load_state()
        gate_result = state_verification_gate(state, fs_context, git_context)
        # Always emit the gate evaluation as an audit event
        emit_gate_evaluation(gate_result)
        # Block-class drift halts dispatch
        if gate_result.has_blocking_drift():
            log.warning("SVG block: %s", gate_result.blocking_summary())
            time.sleep(POLL_INTERVAL)
            continue
        task = next_ready_task(state)
        if task:
            dispatch(task)
        time.sleep(POLL_INTERVAL)
```

Severity semantics in v3.2:
- `block` → daemon refuses to dispatch new tasks; logs alert; writes to status file; waits for reconciliation
- `warn` → daemon dispatches normally; logs alert; surfaces in status file
- `info` → daemon dispatches normally; aggregated in status file for trend visibility

### Phase C (v3.3+): auto-bank + forward-track auto-fork

Per Spec 07 forward-track integration: when SVG detects drift that persists across N cycles, auto-fork a state-A forward-track with `subject.type == "state_verification_drift"` so the drift accumulates as a deliberable item instead of evaporating.

Per Spec 05 banking integration: SVG can auto-bank repeated drift findings as `pattern-observation` events; if the same predicate fires N times across distinct cycles, that's substrate-discipline evidence worth banking.

## Self-alert vs self-reconcile decision tree

Per CLAUDE.md §6 + §10, the gate **NEVER self-mutates canonical state**. It self-alerts (writes audit events + status file) and surfaces recommended operator commands.

| Drift kind | Self-alert | Self-reconcile? | Why |
|---|---|---|---|
| SVG-1.x (phase doc vs git) | ✅ | ❌ | Phase-close is operator-authoritative |
| SVG-2.x (commit-gap) | ✅ | ❌ | Commits are operator-instructed |
| SVG-3.x (push-gap) | ✅ | ❌ | Pushes are operator-instructed |
| SVG-4.x (banking lifecycle) | ✅ | ❌ | Lifecycle transitions are operator-emit per Spec 05 |
| SVG-5.x (forward-track aging) | ✅ | ❌ | Deliberation is operator-cycle work |
| SVG-6.x (substrate health) | ✅ | ❌ | Substrate-mutation requires operator authority |
| `state_verification_evaluated` audit emission | ✅ | ✅ | Auto-emit is safe; informational; chain-hashed |

The audit-event emission is the ONE self-reconciliation the gate does — and it's safe because audit entries are append-only and chain-hashed; emitting one is a normal substrate operation.

## Operator command surface (proposed)

New `state_admin` subcommands (added in v3.2):

```bash
# List current drift findings
python state_admin.py svg-list [--severity {block,warn,info}]

# Mark a drift as acknowledged (suppresses re-alerting until evidence changes)
python state_admin.py svg-acknowledge <finding-id> --reason "..."

# Force gate evaluation outside the daemon loop (operator probe)
python state_admin.py svg-evaluate [--print]

# Configure gate severity thresholds
python state_admin.py svg-configure --commit-gap-threshold-minutes 30
```

## Composition with existing primitives

| Existing primitive | SVG relationship |
|---|---|
| Verification Ritual (Spec 02) | Parallel structure: categories under `surfaces/state-verification-gate/categories/svg-NN-*.md`; predicates resolved at dispatch time. SVG is the dispatch-PRE gate; verification ritual is the dispatch-POST artifact verifier. |
| Anti-Pattern Enforcement | Anti-patterns gate task content; SVG gates task DISPATCH. Complementary scope. |
| Stall Detection (Spec 09) | Stall detection is one SVG category (SVG-6). Composition, not duplication. |
| Forward-Track Surface (Spec 07) | SVG findings can auto-fork forward-tracks per Phase C; forward-track aging is itself an SVG category (SVG-5). |
| Banking Lifecycle (Spec 05) | Lifecycle drift is an SVG category (SVG-4); SVG findings can themselves be banked. |
| Surface Audience (v3.1.0) | SVG status output is `internal` audience; reconciliation recommendations are `internal`. |

## Substrate impact accounting

Per CLAUDE.md §2 architectural commitments:
- **Deterministic routing** ✅ — gate predicates are pure Python; no LLM
- **JSON-LD canonical state** ✅ — `state_verification_evaluated` events flow through existing audit chain
- **Stdlib-only** ✅ — git introspection via `subprocess.run(['git', '...'])`; no new dependencies
- **Audit trail** ✅ — every gate run emits one chain-hashed event
- **CPS containment hook** ⚠️ — SVG runs BEFORE CPS; the gate's `state_verification_evaluated` event doesn't go through agent dispatch, so CPS doesn't apply to the gate itself
- **Separation of concerns** ✅ — gate is daemon-internal; no agent reasoning
- **Single-worker** ✅ — gate runs within the single daemon process

## v3.1.0-bridge vs v3.2 implementation split

**v3.1.0-bridge (next deliverable; ~1-2 sessions):**

- This blueprint doc (committed; canonical reference)
- `fnsr_state_verification.py` — read-only probe; implements SVG-1, SVG-2, SVG-3 predicates (the highest-frequency drift modes observed)
- Integration with `fnsr_stall_watch.py` (the existing v3.1.0-bridge watchdog) — SVG findings surface via the same `fnsr.svg_status.json` + watchdog `recommendation` field
- Operator invokes: `python fnsr_state_verification.py`
- Manifest extension; sync to AgenticDev

**v3.2 (substrate change):**

- `fnsr_daemon.py` integration: SVG runs as precondition in main loop
- Block-class drift halts dispatch; emits audit event; signals orchestrator
- SVG-4, SVG-5 predicates added (banking + forward-track lifecycle)
- New audit event type: `state_verification_evaluated`
- `state_admin svg-list`, `svg-acknowledge`, `svg-evaluate`, `svg-configure` commands

**v3.3+ (mature):**

- Auto-fork forward-tracks from persistent drift (Phase C)
- Auto-bank repeated drift findings (Spec 05 integration)
- LLM-augmented predicates for ambiguous drift (parallel to Cat 9 LLM-required in verification ritual)

## Open design questions (operator decisions needed before implementation)

1. **Block-class semantics:** in v3.2 daemon integration, should `block` drift FULLY halt dispatch (refuse all new tasks) OR allow read-only operations (status queries, banking) but block write-side dispatch (developer, applier, etc.)?
   - Default recommendation: full halt. Cleaner semantics; the watchdog already surfaces what's blocked.

2. **Where canonical docs are enumerated:** SVG-1 needs a list of "canonical docs to check." Use the existing FNSR_CANONICAL_DOCS env var (CLAUDE.md §7.5) which currently governs ADR-citation CPS checks?
   - Default recommendation: reuse FNSR_CANONICAL_DOCS. Single source of truth for "what counts as canonical."

3. **Acknowledgement persistence:** when operator acknowledges a drift via `svg-acknowledge`, does it persist forever or until evidence changes?
   - Default recommendation: persist until evidence changes (the same predicate fires with materially different evidence → re-alert). Tracked via a content hash of the evidence in the acknowledgement record.

4. **Performance:** running git introspection (`subprocess.run`) on every daemon loop iteration is non-trivial cost.
   - Default recommendation: cache git state with TTL (e.g., 30s); invalidate on state.jsonld mtime change.

5. **First-implementation scope:** in v3.1.0-bridge, ship SVG-1 + SVG-2 + SVG-3 (canonical-doc, commit-gap, push-gap — the three observed this session) and defer SVG-4 + SVG-5 to v3.2?
   - Default recommendation: yes. Three highest-impact categories first.

## Validation strategy

When v3.1.0-bridge ships, verify the gate fires on this session's known-drift state:

- SVG-1.1 should fire: ROADMAP Phase 2 "Not Started" + commit `4910d78` exists
- SVG-1.2 should fire: ROADMAP Phase 1 "Substantively Complete" + OED-303 + OED-313 open
- SVG-2.1 should NOT fire (current state has no uncommitted src/ diff after the R5b-1 push)
- SVG-3.1 should NOT fire (origin/main aligned)

If predicates fire on known-drift evidence and don't fire on known-clean evidence, the gate is validated.

## Anti-pattern guardrails

Per `surfaces/_primitives/anti-pattern-enforcement.md`:

**AP-SVG-1: Gate predicates SHOULD NOT have LLM in the path.** Determinism + speed both demand pure-Python predicates. LLM-augmented predicates are deferred to v3.3+ and follow the Cat 9 / verification-ritual-llm pattern (deterministic predicate defers; LLM judge resolves; second-pass critique).

**AP-SVG-2: Gate SHOULD NOT block on `warn` or `info` severity.** The block / warn / info distinction must be honored. Block-class is reserved for drift that genuinely prevents safe dispatch. Operational confidence: ship v3.1.0-bridge with NO block enforcement (alert only); v3.2 introduces block; v3.3+ tunes.

**AP-SVG-3: Operator SHOULD NOT add canonical-doc edits that contradict the substrate audit chain.** When SVG-1 fires (phase doc vs git drift), the canonical-doc edit must either reflect the substrate audit truth OR a `phase_boundary_declared` / `phase_complete_declared` event must be emitted to align them. Editing ROADMAP to say "Phase 2 Complete" without the corresponding substrate event leaves the audit chain canonical-only-by-convention.

## References

- CLAUDE.md §2 (Architectural Commitments): determinism, audit trail, separation of concerns
- CLAUDE.md §6 (Operational Boundaries): commit / push are operator-instructed
- CLAUDE.md §7.5 (Canonical Documents and the ADR-Citation CPS Check): canonical-doc enumeration
- CLAUDE.md §7.9 (Phase Boundaries): phases are subject-project concepts; phase-boundary is a first-class audit event
- CLAUDE.md §10 (state_admin command list): operator-authoritative phase-complete-declaration
- Aaron 2026-05-25 directive (canonical motivation)
- `surfaces/_primitives/daemon-orchestrator-stall-notification.md`: parallel primitive shape; Spec 09 candidate
- `surfaces/_primitives/anti-pattern-enforcement.md`: AP framework SVG composes with
- `surfaces/_primitives/surface-audience.md`: audience field convention for SVG outputs
- `surfaces/feedback-rounds/surface-spec.md` Spec 08 v0.3: SME upstream pattern; SVG follows precondition-gate analog
