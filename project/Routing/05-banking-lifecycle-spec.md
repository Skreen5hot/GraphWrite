# Spec 05: Banking Lifecycle Specification

**Status**: Generalized from Logic Team Input 4 (reframe: the 44/49 divergence is queue-stratification, not per-banking) plus Input 5.3 (verbal-pending queue almost-different-direction history).
**Source**: Logic Team protocol summary, Phase entry packet §12, Q-4-Step5-A Pass 2b Banking 4 (defer-reconciliation banking).
**Implementation target**: v2.7.0+ banking event refinement; v2.8.0 verification-ritual banking integration.

## Important: this spec corrects the original directive

The original directive said "every banking is an event the moment it's ratified; there is no parallel running count." That framing was incomplete.

Logic Team's reframe shows: bankings have a state-transition lifecycle. The apparent "divergence" between architect-verbatim count (44) and SME-running count (49) is not a bug to eliminate. It is two valid views over the lifecycle. Mid-cycle reconciliation would force one counting rule to dominate and lose the discipline-state-transition boundary information that the divergence preserves. Deferred reconciliation at phase-exit doc-pass is the load-bearing principle.

This specification defines the lifecycle model so both counting views can coexist through cycle cadence and reconcile at the formalization moment.

## Generalized Specification

### Banking state-transition lifecycle

A banking has three lifecycle states:

- **State 1: Verbal-pending**. Banked at architect-ruling cycle (or routing artifact transcription). Not yet captured in a committed artifact.
- **State 2: Partially-committed**. Banking captured in committed routing-artifact text (e.g., Pass 2b commit landed). Not yet formalized in the canonical authoring-discipline document.
- **State 3: Formalized**. Banking has a numbered entry in the canonical authoring-discipline document. Phase-exit doc-pass has folded the banking in.

The substrate should track lifecycle state explicitly. A banking event records the state and the transitions over time.

**Note on lifecycle operation** (added in v1.1 per Logic Team review): The three states formalize a lifecycle that Logic Team operates implicitly. Logic Team's actual practice: the SME tracks "all banked content awaiting formal write-up at phase-exit doc-pass" as one set without intermediate state tags; the architect appears to track "what's been ratified this cycle but not yet committed to repo" (this is inferred from count divergence, not from an explicit architect-side statement); neither side operates an explicit "partially-committed" tracking flag. The three-state model is a substrate generalization that makes the implicit explicit. Subject projects implementing this spec may operate the lifecycle implicitly (reconcile at doc-pass moments) or explicitly (lifecycle-state audit events per transition). Either operating mode is consistent with the spec.

### Two valid counting views

At any moment, two counting rules can be applied to the banking corpus:

- **Strict-verbal-pending count**: counts bankings in State 1 only (excludes partially-committed)
- **Inclusive-pending count**: counts bankings in States 1 + 2 (excludes only formalized)

Both rules are defensible. The strict rule honors a definition of "verbal-pending" anchored to State 1 — the banking exists verbally but not yet in any committed artifact. The inclusive rule honors a definition anchored to State 3 — until the banking is formally folded into the authoring-discipline document, it is pending regardless of intermediate commit status.

Logic Team's protocol has the architect operating the strict rule and the SME operating the inclusive rule. The divergence between them carries discipline-state-transition information.

### Deferred reconciliation as load-bearing principle

Mid-cycle reconciliation creates recovery-cycle pressure. Forcing one counting rule to dominate destroys the discipline-state-transition information the divergence preserves. The robust move is deferred reconciliation at phase-exit doc-pass.

At phase-exit doc-pass:

- All State 1 + State 2 bankings transition to State 3 (formalization)
- The two counting views converge by construction (both rules now count the same set: all formalized)
- The reconciliation produces the canonical reconciled count
- Discipline-state-transition boundary observations from the deferred reconciliation surface as methodology-refinement candidates per Spec 02 Cat 9 candidacy and similar evidence-grounded extensions

### Banking taxonomy

Bankings are categorized by purpose:

- **Methodology-refinement candidate**: an observation about the protocol itself that defers to phase-exit retro for deliberation
- **Pattern observation**: a recurring pattern that has been noticed but not yet formalized as a discipline
- **Discipline correction**: a correction to an existing discipline (Q-Frank-Step9-A precedent for withdrawn-discipline-non-inheritance)
- **Contingency-operationalization**: a pre-ratified disposition framing that activates on evidence (Bucket 3 per Spec 04)
- **Discipline-state-transition observation (meta-banking)**: an observation about banking lifecycle itself (Q-4-Step5-A Pass 2b Banking 4 is the canonical example: the defer-reconciliation banking)

A banking may motivate a forward-track (a commitment to future deliberation on the banking's content); the forward-track is a separate event on the Forward-Track Surface (Spec 07), not a banking category. The substrate should not conflate these.

**Note on taxonomy authoring** (added in v1.1 per Logic Team review): The category set above is a substrate generalization. Logic Team's protocol does not operate explicit category tags at banking authoring time; categories emerge from prose description and get folded at phase-exit doc-pass. Subject projects implementing this spec may categorize bankings at authoring time (cleaner audit trail) or retroactively (matches Logic Team practice). Either operating mode is consistent with the spec.

Each banking event carries:

- `category`: one of the taxonomy entries above
- `state`: 1 / 2 / 3
- `surfacing_cycle`: which routing cycle surfaced the banking
- `transition_history`: list of (state, timestamp, transitioning_cycle) tuples
- `content`: the banking text
- `forward_tracked_by`: optional, list of forward-track event IDs that reference this banking (populated when a forward-track event is created)

### Relationship to forward-tracks

Bankings and forward-tracks are structurally distinct (corrected in v1.1 per Logic Team review).

Bankings record observations ABOUT the protocol itself (disciplines noticed, patterns observed, corrections made). Bankings operate the three-state lifecycle defined above (verbal-pending → partially-committed → formalized) and stratify by sub-cycle origin in the phase entry packet §12.

Forward-tracks record COMMITMENTS TO FUTURE DELIBERATION on specific items. Forward-tracks have a different lifecycle (candidate → deliberated-at-named-cycle → resolved) and stratify by audience (consumer-facing closure-path tracking versus internal-methodology-refinement queue).

A banking may motivate a forward-track. When this happens:

- The banking is recorded as a banking event on the bankings surface (with category = methodology-refinement-candidate, pattern-observation, etc.)
- A separate forward-track event is recorded on the Forward-Track Surface, referencing the banking by ID
- The banking's `forward_tracked_by` field is updated to include the forward-track event ID
- The two events operate independent lifecycles thereafter

For Forward-Track Surface specification, see Spec 07.

## Instance Layer: Logic Team's banking corpus

### The 44/49 divergence: queue-stratification, not per-banking

At Q-4-Step5-A architect ruling (2026-05-14), the architect's accounting:

> "Phase 4 verbal-pending bankings queue post-this-cycle: 24 Phase 4 + 3 Phase 3 inheritance + 6 from this cycle = 33 entries for exit doc-pass formalization."

The architect's "24 prior" was 5 lower than the SME's running count of "29 prior" at the same moment. Both counts agreed on the +6 from Q-4-Step5-A architect ruling cycle itself. The divergence was inherited from the prior count.

Tracing backward to Q-4-Step4-A Pass 2b brief confirmation cycle (2026-05-14):

- Architect's accounting: "Phase 4 verbal-pending bankings queue: 27 (24 Phase 4 + 3 Phase 3 inheritance; accumulating per the pattern banked this cycle)"
- SME's accounting (folded into entry packet §12 banking summary): 32 = 29 + 3

The 5-count divergence originated from the Q-4-Step4-A Pass 2b brief-confirmation cycle's 5 new bankings. Architect's "24" excluded them from running total; SME's "29" included them.

### The stratification rule inference

Hypothesized rule the architect's counts follow (inferred — never explicitly stated in the protocol):

- Verbal-pending = banked at architect-ruling cycle, awaiting formalization at phase-exit doc-pass (State 1 in this spec)
- Brief-confirmation-cycle bankings transition from "pure verbal-pending" to "partially-committed-at-Pass-2b-commit-landing" status at Pass 2b commit time (State 1 → State 2)
- Architect's count tracks only State 1

Hypothesized rule the SME's counts follow:

- Verbal-pending = banked at ANY cycle (architect-ruling, brief-confirmation, corrective sub-amendment), awaiting formalization (State 1 OR State 2)
- Pass 2b commit landing transitions the COMMIT status, not the banking lifecycle state
- SME's count tracks all bankings until formal authoring-discipline.md entry (State 1 + State 2)

Both rules are defensible per the lifecycle states. Both produce defensible totals from the same banking corpus.

### Defer-reconciliation banking precedent

- **Q-4-Step5-A Pass 2b Banking 4** (newly banked at that cycle): defer to phase-exit doc-pass. Reasoning: "Mid-cycle reconciliation risks recovery-cycle pressure; deferred reconciliation preserves cycle cadence."
- **Q-4-Step6-A Pass 2b**: architect explicitly noted divergence ("Note: my count of 5 new bankings this cycle vs the SME's reported 6 in the commit message creates a potential divergence vector") + reaffirmed deferral
- **Operating discipline**: honest deferral of counting-rule-disagreement until full-queue audit at phase exit doc-pass

### Forward-track historical precedent

The forward-track history (Phase 1–2 inline → Phase 3 close consolidation in `v0.2-roadmap.md` → Phase 4 separate phase-exit-retro section) is documented in Spec 07 (Forward-Track Surface), not here. Spec 05's scope is the bankings surface; forward-track precedent belongs in the forward-track surface specification.

## Implementation guidance for Daemon Team

### Audit event structure for bankings

```json
{
  "event_type": "banking",
  "banking_id": "bank-<task-id>-<sequence>",
  "category": "methodology-refinement-candidate | pattern-observation | discipline-correction | contingency-operationalization | discipline-state-transition-observation",
  "state": 1,
  "surfacing_cycle": "<cycle-id>",
  "transition_history": [
    { "state": 1, "timestamp": "<iso8601>", "transitioning_cycle": "<cycle-id>" }
  ],
  "content": "<banking text>",
  "forward_tracked_by": []
}
```

The `forward_tracked_by` field is populated with forward-track event IDs when a forward-track event references this banking. The banking event itself does not specify a forward-track destination or sub-surface; those belong on the forward-track event per Spec 07.

### Lifecycle state transitions

State transitions are themselves audit events:

```json
{
  "event_type": "banking_state_transition",
  "banking_id": "bank-...",
  "from_state": 1,
  "to_state": 2,
  "transitioning_cycle": "<cycle-id>",
  "trigger": "pass_2b_commit_landed | phase_exit_doc_pass_fold | manual_operator_action",
  "timestamp": "<iso8601>"
}
```

The transition event updates the banking event's `state` and appends to `transition_history`.

### Two counting views as substrate primitives

The substrate should support both counting rules as first-class queries:

- `state_admin count-bankings --rule strict --phase phase-4`: returns count of State 1 bankings only
- `state_admin count-bankings --rule inclusive --phase phase-4`: returns count of State 1 + State 2 bankings

If the two views disagree, the substrate should NOT auto-reconcile. The disagreement is information, not noise.

### Phase-exit doc-pass reconciliation

The phase-exit doc-pass is a deterministic operation:

- All State 1 + State 2 bankings for the phase transition to State 3
- The transitions emit `banking_state_transition` audit events with `trigger: phase_exit_doc_pass_fold`
- After the operation, the two counting rules converge by construction

The phase-exit doc-pass operation can be implemented as a system agent (`phase-exit-retro-finalizer` or similar). It is not the same as the `phase-exit-retro` task type from the original directive; the retro task consolidates forward-tracked methodology candidates, while the doc-pass operation transitions bankings to formalized state. The two may run together at phase close.

### v2.6.0 `bank` command lifecycle integration

The Daemon Team's v2.6.0 `bank` command creates banking audit events. For v2.7.0+ refinement, the command should accept a `--state` parameter (defaulting to State 1) and a `--category` parameter (defaulting to whatever is appropriate for the calling context). Existing v2.6.0 bankings can be retroactively assigned State 1 with default category `pattern-observation` until reclassified.

## Open questions / extension points

- **Operator manual transitions.** Operators may need to manually transition bankings (e.g., flagging a banking as formalized outside of a phase-exit doc-pass). The substrate should support this via `state_admin transition-banking <banking-id> --to-state N --reason "..."` with an audit event.

- **Banking content updates.** Bankings may be amended without state transition (e.g., clarifying language). Whether amendment is a state-transition variant or a separate audit event is open. Default: separate `banking_amendment` audit event preserving the original content + the amended content + the amending cycle.

- **Cross-phase banking inheritance.** Logic Team's protocol has Phase 3 bankings inherited at Phase 4 entry (3 entries in the architect's count). Inheritance is a kind of transition (from "Phase 3 verbal-pending" to "Phase 4 verbal-pending") that is structurally distinct from State 1 → State 2. The lifecycle model may need a fourth state (or a phase-inheritance flag) to model this; v2.7.0+ implementation should observe and decide.

- **Forward-track relationship to bankings.** Spec 05 specifies that bankings may motivate forward-tracks through the `forward_tracked_by` field, but the substrate semantics for the bidirectional reference (banking ↔ forward-track event) need v2.7.0+ implementation experience to refine. See Spec 07 §"Relationship to bankings" for the forward-track-side specification.

## Provenance

- Logic Team Input 4 (honest reframe: 44/49 divergence is queue-stratification, not per-banking; hypothesized counting rules; defer-reconciliation as load-bearing principle)
- Logic Team Input 5.3 (verbal-pending queue almost-different-direction history; mid-cycle reconciliation as collapsed alternative)
- Logic Team instance-layer review v1.1 (clarifying notes on implicit-vs-explicit lifecycle operation; clarifying notes on substrate-vs-protocol categorization)
- Q-4-Step5-A Pass 2b Banking 4 (defer-reconciliation banking)
- Q-4-Step6-A Pass 2b (architect explicit divergence notice + deferral reaffirmation)
- Phase entry packet §12 (verbal-pending bankings queue with sub-cycle origin stratification)
- Logic Team Input 5.3 (forward-track history; see Spec 07 for full provenance)
