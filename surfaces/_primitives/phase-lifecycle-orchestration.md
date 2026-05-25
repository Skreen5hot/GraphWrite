---
primitive_id: phase-lifecycle-orchestration
short_name: Phase Lifecycle Orchestration (PLO)
status: blueprint / candidate (v3.1.0-bridge → v3.2 daemon-side auto-chain → v3.3+ planner integration)
introduced_in: pending (this doc establishes the blueprint; implementation deferred)
enforcement_target: v3.2+ (daemon-side post-`po-satisfied` chain auto-queue with operator-confirmation gates)
canonical_reference: Aaron 2026-05-25 directive — "The process is actually the most important thing. Draft the Phase Lifecycle Orchestration with the automation we discussed." Confirming the four-claim model: phase delivered with demo → PO iterates until satisfied → retro happens → drift alignment happens → next phase starts automatically.
---

# Phase Lifecycle Orchestration (PLO) — substrate primitive blueprint

## Status

**Blueprint / candidate.** Establishes the formal phase-state machine + auto-chain composition + operator-gate locations so v3.1.0-bridge (operator commands + state recording) and v3.2 (daemon-side auto-queue) implementations can build against a stable specification. No implementation ships in this commit.

## Problem this primitive solves

GraphWrite's phase transitions (Phase 1 → Phase 2 → Phase 3 ...) are operationally a multi-step discipline:

1. Phase implementation chains land work
2. Phase demo is deployed (UI / artifact reaches stakeholder)
3. Product Owner iterates feedback rounds against the demo
4. PO eventually signals satisfaction
5. Retro deliberates the phase's bankings + outcomes
6. Drift between canonical docs and substrate is reconciled
7. Phase-close declaration is emitted
8. Next phase begins scaffolding

The substrate today has **primitives for individual steps** (chain dispatch; `state_admin retro init`; SVG probe; `state_admin phase-complete-declaration`) but **no first-class lifecycle state** that ties them together. Operator must remember the sequence; missing a step produces:

- Phase that "completes" without retro (bankings rot in state 1)
- Phase that "closes" with drift (canonical docs lie; SVG fires forever)
- Phase that ends without next-phase scaffolding (queue goes idle; project drifts in time)

This primitive provides the **formal phase-state machine** + **auto-chain composition with operator-confirmation gates** so the discipline runs structurally instead of by-memory.

## What the primitive is

A **substrate-tracked phase-state machine** with seven states, six operator-emit transitions, and a daemon-side auto-chain that pre-queues the post-satisfaction work (retro → drift reconciliation → close → next-phase scaffold) with **operator-confirmation gates at each step**.

The primitive's three substrate properties (parallel construction with surface-audience + anti-pattern + daemon-orchestrator-stall-notification + state-verification-gate primitives):

1. **Phase state is explicit, audited, and operator-authoritative.** Every transition emits a `phase_state_changed` audit event with chain-hashed signature. The substrate tracks current state per phase; queries like "what state is phase-2 in?" or "when did phase-1 enter `po-satisfied`?" become answerable without inference.

2. **Auto-chain pre-queues but does NOT auto-execute.** When `phase-po-satisfied` is emitted, the daemon pre-queues the canonical post-satisfaction chain (retro-init task → SVG probe task → next-phase-scaffold draft) — but EACH task in that chain has an `awaiting_operator_decision` shape (CLAUDE.md §7.6) so the operator confirms before each step proceeds. The substrate eliminates the "remember to type the next command" failure mode without removing operator authority.

3. **PLO composes with all existing primitives.** SVG (new SVG-7 category: phase-state-vs-substrate-evidence drift); banking lifecycle (Spec 05; auto-suggests state transitions when phase closes); MAREP retro surface (§7.12; auto-init at `po-satisfied`); planner agent (next-phase scaffold draft); forward-track surface (Spec 07; unresolved FTs surface at phase close).

## The seven phase states

| State | Meaning | Operator can emit (transitions out) | Auto-suggests |
|---|---|---|---|
| **planned** | Phase exists in ROADMAP; no implementation chains dispatched yet | `phase implementing` | — |
| **implementing** | Implementation chains running; pre-demo OR post-feedback iteration loop | `phase demo-released` | — |
| **demo-released** | Phase artifact deployed; stakeholder-accessible; PO feedback window open | `phase implementing` (re-enter for new chain), `phase po-satisfied` | Encourages feedback-round protocol per Spec 08 |
| **po-satisfied** | Product Owner has signaled completion of iteration; pre-close work begins | (auto-chain pre-queued; operator confirms each step) | Auto-queue: retro-init task; SVG probe task |
| **retro-complete** | Retro deliberation finished; bankings deliberated; canonical edits identified | `phase reconcile-drift-begin` (auto-queued; operator confirms) | Auto-queue: SVG probe + reconciliation packet |
| **drift-reconciled** | SVG drift cleared OR explicitly accepted-with-rationale; canonical docs align with substrate | `phase close` (auto-queued; operator confirms) | Auto-queue: phase-complete-declaration + next-phase scaffold |
| **closed** | Phase formally complete via `phase-complete-declaration`; next phase scaffolding in flight | `phase implementing` (on next phase) | Next phase enters `planned` (if ROADMAP knows about it) |

State transitions are append-only audit events; no state-rewrites. Re-entering `implementing` from `demo-released` is a new event, not a state mutation.

## Operator command surface

New `state_admin` subcommand family `phase`:

```bash
# Transition emissions (each emits a phase_state_changed audit event)
python state_admin.py phase implementing <phase-id> [--reason "..."]
python state_admin.py phase demo-released <phase-id> [--build-ref <commit-sha>] [--deploy-url <url>]
python state_admin.py phase po-satisfied <phase-id> [--notes "..."]
python state_admin.py phase close <phase-id>  # only allowed when state == drift-reconciled

# Query
python state_admin.py phase status [<phase-id>]
python state_admin.py phase history <phase-id>

# Auto-chain operator gates (v3.2)
python state_admin.py phase confirm-retro-init <phase-id>
python state_admin.py phase confirm-drift-reconcile <phase-id> [--accept-deferred OED-XXX,OED-YYY]
python state_admin.py phase confirm-close <phase-id>
python state_admin.py phase confirm-next-scaffold <next-phase-id>
```

Constraint: `phase close` refuses unless the substrate-tracked state is `drift-reconciled` (graduates the "no canonical-doc edits that contradict the audit chain" guardrail into hard enforcement).

## Auto-chain composition (the automation piece)

When `phase po-satisfied <phase-N>` is emitted, the daemon pre-queues a chain of tasks with operator-confirmation gates. Each task uses the `awaiting_operator_decision` shape per CLAUDE.md §7.6:

```
phase-N po-satisfied event
    ↓
Task A: marep-orchestrator (retro init for phase-N)
   inputs.mode: "phase-retro-init"
   inputs.phase: "phase-N"
   inputs.anchor_task: <last completed phase-N task>
   outputs.status: "awaiting_operator_decision"
   options: [
     "Proceed with retro chain (queues marep-orchestrator phases 01-gathering through 06-compression)",
     "Defer retro to next cycle (skip Task A; advance to Task B with note)"
   ]
    ↓ (operator runs: state_admin phase confirm-retro-init phase-N)
Task B: state_admin retro init + auto-chain MAREP six phases
   (operator commits each MAREP phase transition per CLAUDE.md §7.12)
    ↓
Task C: fnsr_state_verification probe + drift report task
   Produces drift findings; presents reconciliation packet to operator
   outputs.status: "awaiting_operator_decision"
   options: [reconcile suggestions per finding]
    ↓ (operator runs: state_admin phase confirm-drift-reconcile phase-N)
Task D: phase-complete-declaration emission
   outputs.status: "awaiting_operator_decision"
   options: ["Emit close declaration", "Block close; reopen reconciliation"]
    ↓ (operator runs: state_admin phase confirm-close phase-N)
Task E: planner agent draft of next-phase IMPLEMENTATION_PLAN scaffold
   inputs.mode: "phase-scaffold-draft"
   inputs.next_phase: "phase-(N+1)"
   outputs.status: "awaiting_operator_decision"
   options: ["Accept scaffold; enter phase-(N+1) planned", "Revise scaffold inputs"]
    ↓ (operator runs: state_admin phase confirm-next-scaffold phase-(N+1))
phase-(N+1) enters state: planned
```

Each task carries the lifecycle marker `inputs.plo_chain: <phase-N-chain-id>` so the daemon recognizes it as part of an auto-queued sequence and surfaces it differently from regular development chains.

**The automation is the queuing.** The decisions stay operator-authoritative. The system stops asking the operator to remember the next step; it presents the next step pre-composed for confirmation. This is the "operator-review-before-queuing" pattern (PLAYBOOK §4.10) inverted: the substrate queues; the operator reviews.

## Integration with existing primitives

### With SVG (state-verification-gate)

New category **SVG-7: Phase-State-vs-Substrate-Evidence Drift**.

**SVG-7.1** — phase claims state `demo-released` but no Pages-deploy commit / no successful deploy artifact since the demo-released event timestamp.

**SVG-7.2** — phase claims state `po-satisfied` but no stakeholder-feedback-round artifact (per Spec 08) referenced in the satisfaction event.

**SVG-7.3** — phase claims state `closed` but `phase_complete_declared` event is missing OR canonical docs (ROADMAP / IMPLEMENTATION_PLAN) Status field doesn't reflect closure.

**SVG-7.4** — phase auto-chain Task A/B/C/D/E in `awaiting_operator_decision` > N hours without resolution → operator-attention drift.

These predicates make the lifecycle's own state drift detectable.

### With Banking Lifecycle (Spec 05)

When a phase enters `retro-complete`, the substrate auto-suggests state transitions for bankings anchored on that phase's tasks:

- State-1 bankings whose content has been deliberated in the retro → suggest transition to state-2 (partially-committed)
- State-2 bankings whose canonical-doc folding pass has landed → suggest transition to state-3 (formalized)

Operator confirms via `state_admin transition-banking`. PLO doesn't auto-transition (Spec 05 lifecycle remains operator-authoritative per §7.7) but presents the candidates.

### With MAREP Retro Surface (CLAUDE.md §7.12)

`phase po-satisfied` auto-queues retro init Task A. The retro chain runs through MAREP's six phases (`01-gathering` through `06-compression`). MAREP-Orchestrator is the BAO instance per §7.12; PLO is the **scheduler** that ties retro init to phase transition rather than depending on the operator to remember.

### With Forward-Track Surface (Spec 07)

When a phase enters `drift-reconciled`, the substrate surfaces unresolved State-A and State-B forward-tracks anchored on phase tasks. These become deliberables in the next phase's `planned` scaffold OR are explicitly carried via `state_admin forward-track inherit`.

### With Planner Agent

New planner mode `phase-scaffold-draft` consumes:
- ROADMAP phase entries for the next phase
- IMPLEMENTATION_PLAN tasks
- Open OEDs / forward-tracks blocked-on-prior-phase
- Bankings from the closing phase's retro

Produces a draft IMPLEMENTATION_PLAN scaffold for operator review.

## v3.1.0-bridge vs v3.2 vs v3.3+ implementation split

### v3.1.0-bridge (smallest viable; ~1-2 sessions)

- This blueprint doc (committed; canonical reference)
- New audit event type: `phase_state_changed` with payload `{phase_id, from_state, to_state, anchor_task, build_ref?, deploy_url?, notes?}`
- Operator commands: `state_admin phase implementing | demo-released | po-satisfied | close | status | history`
- No auto-chain; operator types each command. Same shape as today's discipline but with substrate state-tracking + audit.
- SVG-7.1, SVG-7.3, SVG-7.4 predicates (the state-vs-evidence checks)

### v3.2 (the automation piece)

- Daemon-side auto-chain pre-queue on `phase-po-satisfied` event (Tasks A-E above)
- New operator commands: `phase confirm-retro-init | confirm-drift-reconcile | confirm-close | confirm-next-scaffold`
- Constraint enforcement: `phase close` refuses unless state == drift-reconciled
- SVG-7.2 predicate (po-satisfied without feedback-round artifact)
- v3.2 also lands the SVG daemon-side dispatch gate (separate primitive) — these compose: PLO emits state changes; SVG checks them in the daemon loop

### v3.3+ (planner integration; mature)

- Planner agent mode `phase-scaffold-draft` (auto-draft next-phase IMPLEMENTATION_PLAN scaffold)
- LLM-augmented drift-reconciliation suggestions (operator confirms; AI proposes)
- Phase-velocity metrics surfaced from `phase_state_changed` event timestamps (time-in-state per phase)
- Cross-phase pattern detection from banking accumulation

## Anti-pattern guardrails

Per `surfaces/_primitives/anti-pattern-enforcement.md`:

**AP-PLO-1: Substrate MUST NOT auto-execute lifecycle transitions.** Auto-queuing tasks is allowed; auto-executing them is forbidden. Every Task A-E in the auto-chain has `outputs.status: awaiting_operator_decision`. The operator confirms each. The substrate eliminates the "type the next command" failure mode without eliminating the "operator decides" guarantee.

**AP-PLO-2: `phase close` MUST refuse unless state == drift-reconciled.** This is the structural enforcement of AP-SVG-3 ("operator SHOULD NOT add canonical-doc edits that contradict the substrate audit chain"). Closing without reconciling drift is exactly the failure mode that produced the Phase 2 "Not Started" lie this session.

**AP-PLO-3: State transitions MUST emit `phase_state_changed` audit events.** No state mutation outside the audit chain. Querying current phase state walks the audit history; the substrate doesn't keep a mutable state cache that could diverge from the chain.

**AP-PLO-4: `po-satisfied` MUST be operator-emit, never agent-inferred.** The PO-satisfaction judgment is by definition stakeholder discretion. No LLM agent should ever emit this event. v3.3+ "AI proposes" suggestions are explicitly excluded from this transition.

## Open design questions (operator decisions needed before v3.1.0-bridge ships)

1. **State granularity for `implementing`:** does `implementing` distinguish "initial development" from "post-PO-feedback iteration"? The current model treats them as the same state (re-enterable from `demo-released`).
   - **Recommendation: same state, no sub-states.** Iteration rounds are tracked via Spec 08 feedback-round events; PLO doesn't need to duplicate that.

2. **Demo-released semantics:** does emitting `demo-released` require a build-ref / deploy-url, or are those optional metadata?
   - **Recommendation: optional but encouraged.** Required would block fast iteration; encouraged via SVG-7.1 (state claims demo-released but no deploy commit).

3. **Auto-chain skip semantics:** when the operator runs `phase confirm-retro-init <phase-N>` with `--skip`, does the chain advance to Task C (SVG) or hard-stop?
   - **Recommendation: advance.** Operator-authoritative skip; auto-chain continues to next gate.

4. **Cross-phase auto-chain ownership:** Task E drafts next-phase scaffold. If the next phase is `phase-(N+1)` and ROADMAP doesn't have it, what happens?
   - **Recommendation: planner agent generates a "next phase scaffold needed; ROADMAP gap surfaced" report; operator owns ROADMAP authorship.** Substrate doesn't auto-add phases to ROADMAP.

5. **First-implementation scope:** v3.1.0-bridge ships state-tracking + operator commands ONLY (no auto-chain) for early validation; v3.2 adds auto-chain. Or skip the bridge and ship v3.2 straight?
   - **Recommendation: v3.1.0-bridge first.** Pattern matches SVG bridge → v3.2 progression; validates the state model in operational use before adding automation; rolls back to existing discipline cleanly if the model needs revision.

## Validation strategy

When v3.1.0-bridge ships, validate against this session's lived experience:

- Run `state_admin phase status` for phase-1 → expect `?` (no PLO events yet); operator backfills via `state_admin phase implementing phase-1 --reason "backfill: Phase 1 work shipped 2026-04-21 thru 2026-05-15"` and `state_admin phase demo-released phase-1 --build-ref 75fa3ea`
- Run `state_admin phase history phase-2` → expect today's `phase_boundary_declared phase-1 -> phase-2` event captured (PLO's audit format should be a strict superset; v3.1.0-bridge MUST be backward-compatible with existing phase-boundary events)
- Re-run SVG probe → expect SVG-7.1 to fire if no deploy-url recorded for phase-2 demo-released state

If the state model can absorb the substrate's prior phase-boundary events AND surface new drift via SVG-7, the bridge is validated.

## Substrate impact accounting

Per CLAUDE.md §2 architectural commitments:
- **Deterministic routing** ✅ — state transitions are operator-emit; auto-chain is deterministic queuing
- **JSON-LD canonical state** ✅ — `phase_state_changed` events flow through existing audit chain
- **Stdlib-only** ✅ — pure operator-CLI work + state.jsonld mutation; no new dependencies
- **Audit trail** ✅ — every state transition is one chain-hashed event
- **CPS containment hook** ✅ — auto-chain tasks use `awaiting_operator_decision` shape; CPS validates the shape per CLAUDE.md §7.6
- **Separation of concerns** ✅ — gate is operator-side (transitions) and daemon-side (auto-chain queuing); no agent reasoning in the lifecycle itself
- **Single-worker** ✅ — runs within the single daemon process

## References

- CLAUDE.md §2 (Architectural Commitments)
- CLAUDE.md §7.6 (Operator-Decision Handoff Path; awaiting_operator_decision shape)
- CLAUDE.md §7.9 (Phase Boundaries; existing phase-boundary event format — PLO extends this)
- CLAUDE.md §7.12 (Retro Surface + Episodic→Semantic Promotion; MAREP integration point)
- CLAUDE.md §10 (state_admin subcommand list; PLO adds the `phase` family)
- PLAYBOOK §4.10 (Operator-review-before-queuing pattern; PLO inverts this — substrate queues, operator reviews)
- Aaron 2026-05-25 directive (canonical motivation; four-claim model confirmed)
- `surfaces/_primitives/state-verification-gate.md` (SVG v3.1.0-bridge; PLO composes with SVG-7 category)
- `surfaces/_primitives/daemon-orchestrator-stall-notification.md` (Spec 09 candidate; PLO state transitions are detectable via stall categories too)
- `surfaces/_primitives/anti-pattern-enforcement.md` (AP framework; AP-PLO-1/2/3/4 baked in)
- `surfaces/feedback-rounds/surface-spec.md` (Spec 08 v0.3; demo-released state opens the feedback-round window)
- ROADMAP.md (canonical phase definitions; PLO tracks state against these)
