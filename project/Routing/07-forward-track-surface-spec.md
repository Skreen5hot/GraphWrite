# Spec 07: Forward-Track Surface Specification

**Status**: New in v1.1. Promoted from sub-surface of bankings per Logic Team's instance-layer review of v1.
**Source**: Logic Team v1.1 review pushback (Section 2); Logic Team Input 5.3 (forward-track history through Phases 1–4); Q-Frank-Step9-A Ask 6 (consumer-closure-path tracking surface origin).
**Implementation target**: v2.7.0+ `forward-track` task type refinement; v2.8.0+ forward-track resolution events; v3.0+ cross-phase forward-track inheritance.

## Purpose

Defines the Forward-Track Surface — one of the five named surfaces per Spec 01. Forward-tracks record commitments to future deliberation on specific items. The surface has its own lifecycle, audience structure, and audit-trail unity, structurally distinct from the bankings surface (Spec 05).

## Why this is a separate surface (v1 → v1.1 correction)

v1 of this bundle treated forward-tracks as sub-surfaces of bankings. Logic Team's review surfaced that this collapses real distinctions:

| | Bankings | Forward-tracks |
|---|---|---|
| **What is recorded** | Observations ABOUT the protocol itself (disciplines noticed, patterns observed) | Commitments to FUTURE deliberation on specific items |
| **Audience** | Future self-reference plus protocol generalization | Consumer-facing closure-path tracking OR internal-methodology-refinement queue |
| **Audit-trail unity** | §12 stratification by sub-cycle origin in entry packet; folded into authoring-discipline document at phase-exit doc-pass | One consolidated artifact per audience sub-surface |
| **Lifecycle** | 3-state: verbal-pending → partially-committed → formalized | 3-state: candidate → deliberated-at-named-cycle → resolved |

Treating forward-tracks as sub-surfaces of bankings would have caused the bankings-lifecycle model to collide with itself at every cross-phase forward-track inheritance event. v1.1 corrects this.

## Generalized Specification

### Forward-track lifecycle

A forward-track has three lifecycle states:

- **State A: Candidate**. Forward-track has been created, naming a specific item and a future cycle at which deliberation will occur. Item awaits deliberation.
- **State B: Deliberated-at-named-cycle**. The named cycle has run; deliberation occurred. Outcome is pending resolution (may be deferred again, may be on track to resolve, etc.).
- **State C: Resolved**. The forward-track has reached terminal status via one of: ratified-into-spec, merged-into-roadmap-release, withdrawn.

Resolution paths:

- **ratified-into-spec**: The forward-track candidate was deliberated and the outcome is ratified into a canonical specification (e.g., a Cat 9 verification ritual category candidacy is promoted to ratified Cat 9 status).
- **merged-into-roadmap-release**: The forward-track candidate was deliberated and the outcome is folded into a consumer-facing roadmap release (e.g., a v0.2 feature commitment is delivered in v0.2).
- **withdrawn**: The forward-track candidate was deliberated and the outcome is to NOT proceed (the candidate is recognized as no-longer-relevant, superseded, or otherwise not warranting ratification).

### Audience sub-surfaces

Forward-tracks stratify by audience, not by surfacing-cycle (which is how bankings stratify). Two audience sub-surfaces have been observed:

- **Consumer closure-path tracking**: forward-tracks whose deliberation outcome is consumer-facing (when does this feature/capability surface for the consumer?). Recorded in a consolidated consumer-facing roadmap artifact (Logic Team instance: `project/v0.2-roadmap.md`).
- **Internal methodology-refinement queue**: forward-tracks whose deliberation outcome is internal (when does this methodology refinement deliberate?). Recorded as phase-exit-retro candidates in the phase entry packet (Logic Team instance: §"phase-exit-retro candidates" section).

The sub-surface set is not closed. Future stakeholder critiques or organizational evolution may surface additional sub-surfaces with their own audience semantics.

### Audit-trail unity within the surface

Each sub-surface has its own consolidated artifact. Forward-tracks belonging to the same sub-surface bundle into one artifact; the artifact is the audit-trail unity for that sub-surface's forward-tracks. Forward-tracks belonging to different sub-surfaces are deliberately not unified — the audience distinction is what motivates the separation.

Cross-sub-surface relationships are tracked through explicit cross-references between forward-track events (e.g., a forward-track in the internal-methodology-refinement queue may reference a forward-track in the consumer closure-path tracking artifact when the methodology refinement enables the consumer-facing capability).

### Cross-phase inheritance

Forward-tracks not resolved at phase close inherit forward to the next phase. The inheritance is itself an audit event (`forward_track_phase_inheritance`) that updates the forward-track's `phase_origin` field (which phase first surfaced the forward-track) and `inherited_through_phases` field (which phases have inherited the forward-track without resolution).

This inheritance is structurally distinct from banking inheritance. Bankings transition between three lifecycle states; forward-tracks inherit across phases while remaining in State A (Candidate) until the named deliberation cycle occurs.

## Instance Layer: Logic Team's Forward-Track Surface

### Historical evolution (Phases 1–4)

Per Logic Team Input 5.3:

- **Phase 1–2**: forward-tracks named inline in cycle artifacts. No consolidated artifact. Audience distinction was implicit and ambiguous.
- **Phase 3 close (Q-Frank-Step9-A Ask 6)**: forward-tracks consolidated into `project/v0.2-roadmap.md` per Frank's stakeholder critique §4.5. The architect's banking generalization: "when deferred-closure-path framing accumulates across phases, a consolidated roadmap artifact at the next phase boundary lists every commitment with scope/owner/timeline." This established the Consumer Closure-Path Tracking sub-surface.
- **Phase 4**: phase-exit-retro candidates accumulate as a separate section in the entry packet, distinct from `v0.2-roadmap.md`. This emerged from a different audience: methodology-refinement candidates that defer to phase-cadence retro, NOT to v0.2 consumer-facing roadmap. This established the Internal Methodology-Refinement Queue sub-surface.

The almost-different-direction (per Input 5.3): a single forward-track artifact conflating both audiences. That collapse would have made the consumer-closure-path tracking ambiguous (mixing methodology-refinement candidates into the consumer-facing artifact) AND under-deliberated the internal-methodology-refinement queue (consumer-roadmap cadence wouldn't have produced the methodology-refinement deliberation cycle).

### Consumer Closure-Path Tracking sub-surface

- **Consolidated artifact**: `project/v0.2-roadmap.md`
- **Audience**: Consumer-facing (when does the deferred capability surface for the consumer?)
- **Contents**: Every commitment with scope/owner/timeline per Q-Frank-Step9-A Ask 6 architect generalization
- **Resolution path typical**: merged-into-roadmap-release (the commitment is folded into v0.2 implementation work and ships)

### Internal Methodology-Refinement Queue sub-surface

- **Consolidated artifact**: Phase entry packet, "phase-exit-retro candidates" section
- **Audience**: Internal deliberation (when does this methodology refinement deliberate?)
- **Contents**: Methodology refinement candidates that surface during phase work and defer to phase-exit retro for deliberation
- **Resolution path typical**: ratified-into-spec (the methodology refinement is folded into authoring-discipline document or ADR registry) or withdrawn (the candidate is recognized as no-longer-relevant during retro deliberation)

### Phase 3 → Phase 4 inheritance worked example

Logic Team Input 4 referenced "3 Phase 3 inheritance" entries in Phase 4's verbal-pending bankings queue. The forward-track-surface analog: forward-tracks not resolved at Phase 3 close inherit to Phase 4 entry. These inherited forward-tracks operate the same lifecycle as Phase 4-originating forward-tracks but carry phase_origin: phase-3 and inherited_through_phases: [phase-4].

Phase 4 has accumulated phase-exit-retro candidates accumulating in the §"phase-exit-retro candidates" section, including Cat 9 candidacy and Cat 10 candidacy (per Spec 02 instance layer). These will deliberate at Phase 4 exit retro and resolve via one of the three resolution paths.

## Implementation guidance for Daemon Team

### Audit event structure for forward-tracks

```json
{
  "event_type": "forward_track",
  "forward_track_id": "ft-<sequence>",
  "state": "A",
  "sub_surface": "consumer-closure-path | internal-methodology-refinement",
  "subject": {
    "type": "banking | fixture | capability | candidacy | other",
    "id": "<referenced-event-id>",
    "description": "<human-readable description of what is being tracked>"
  },
  "named_deliberation_cycle": "phase-exit-retro | v0.2-roadmap | <specific-cycle-id>",
  "phase_origin": "<phase-id>",
  "inherited_through_phases": [],
  "transition_history": [
    { "state": "A", "timestamp": "<iso8601>", "transitioning_cycle": "<cycle-id>" }
  ]
}
```

The `subject.type` field identifies what kind of item is being forward-tracked. Common cases: a banking event (`type: banking`, `id: bank-...`), a verification-ritual category candidacy (`type: candidacy`, `id: cat-9-candidacy`), a fixture commitment (`type: fixture`, `id: ...`), or a feature capability commitment (`type: capability`, `id: ...`).

### State transition events

State transitions are themselves audit events:

```json
{
  "event_type": "forward_track_state_transition",
  "forward_track_id": "ft-...",
  "from_state": "A",
  "to_state": "B",
  "transitioning_cycle": "<cycle-id>",
  "trigger": "named_deliberation_cycle_ran | resolution_reached",
  "timestamp": "<iso8601>"
}
```

For State C (resolved) transitions, the transition event includes a `resolution_path` field with one of `ratified-into-spec`, `merged-into-roadmap-release`, `withdrawn`.

### Cross-phase inheritance events

```json
{
  "event_type": "forward_track_phase_inheritance",
  "forward_track_id": "ft-...",
  "from_phase": "<phase-id>",
  "to_phase": "<phase-id>",
  "inherited_at_cycle": "<entry-cycle-id>",
  "timestamp": "<iso8601>"
}
```

The inheritance event appends to the forward-track's `inherited_through_phases` field. Forward-tracks should be flagged for explicit operator attention if they have inherited through three or more phases without resolution; long-lived candidates may indicate either substantive blockers or candidates that should be withdrawn rather than perpetually deferred.

### Sub-surface registry

Per Spec 01's surface-registry abstraction, the two sub-surfaces should be registered explicitly rather than hard-coded. The substrate supports N sub-surfaces; the v1.1 specification registers two (consumer-closure-path tracking, internal-methodology-refinement queue) as the currently-observed sub-surfaces with appropriate audience semantics.

Adding a new sub-surface in a later release is a matter of registering it in the surface-registry with its consolidated-artifact destination and audience semantics.

### Bidirectional reference with banking events (per Spec 05)

When a forward-track event references a banking event:

- Forward-track's `subject` field is set to `{type: banking, id: <banking-event-id>, description: ...}`
- Banking's `forward_tracked_by` field is appended with the forward-track event ID
- Both updates are part of the same atomic operation (single audit-chain transaction)

If the banking event is later transitioned (verbal-pending → partially-committed → formalized), the forward-track's `subject` reference remains stable. If the forward-track is resolved, the banking's `forward_tracked_by` list is updated to mark the reference resolved (the reference is not removed; the audit history is preserved).

## Operator commands

Suggested `state_admin` extensions for v2.7.0+:

- `state_admin forward-track create --subject-type <type> --subject-id <id> --sub-surface <sub-surface> --deliberation-cycle <cycle-id> --description "..."` — creates a forward-track in State A
- `state_admin forward-track transition <ft-id> --to-state <B|C> --resolution-path <path>` — transitions state with appropriate metadata
- `state_admin forward-track inherit --from-phase <id> --to-phase <id>` — bulk-inheritance operation at phase boundary; emits inheritance events for all forward-tracks in State A or State B
- `state_admin forward-track list --sub-surface <sub-surface> --state <A|B|C>` — query forward-tracks by sub-surface and state
- `state_admin forward-track aging` — surfaces forward-tracks that have inherited through three or more phases without resolution

## Open questions / extension points

- **Sub-surface emergence governance.** When a third audience sub-surface surfaces (e.g., a stakeholder-feedback queue distinct from both consumer and internal), how is it registered? Default per Spec 01: operator approval via `awaiting_operator_decision` task. Worth observing whether sub-surface emergence is rare enough to warrant operator approval or frequent enough to need lighter-weight registration.

- **Aging policy.** "Three or more phases without resolution" is a reasonable starting threshold for flagging long-lived candidates, but Logic Team has not yet operated long enough to validate this number. v2.7.0+ implementation should make the threshold configurable and emit aging warnings as forward-track events that the operator can review at phase boundaries.

- **Cross-sub-surface relationships.** When an internal-methodology-refinement forward-track enables a consumer closure-path forward-track (the methodology refinement is the precondition for the consumer-facing capability), the relationship should be tracked. v2.7.0+ implementation should add a `relates_to` field on forward-track events for explicit cross-references.

- **Resolution-path edge cases.** The three resolution paths (ratified-into-spec, merged-into-roadmap-release, withdrawn) cover the cases observed in Logic Team's Phase 1–4 history. Edge cases may emerge: e.g., a forward-track that splits into multiple resolved items, or merges with another forward-track on deliberation. The substrate should preserve audit history of such operations.

- **Phase-exit retro deliberation outcome capture.** When the phase-exit retro cycle runs, deliberation outcomes need to attach to the forward-track events they resolve. Implementation guidance: the phase-exit-retro task's outputs should include a `forward_track_resolutions: list of {ft_id, resolution_path, rationale}` field. The phase-exit-retro-finalizer system agent then emits the state transitions atomically.

## Provenance

- Logic Team v1.1 review pushback Section 2 (forward-tracks as separate surface; collision-with-bankings-lifecycle cost-of-not-fixing argument)
- Logic Team Input 5.3 (forward-track history Phase 1–2 inline → Phase 3 v0.2-roadmap.md → Phase 4 phase-exit-retro candidates section)
- Q-Frank-Step9-A Ask 6 (consumer-facing closure-path tracking artifact origin; "when deferred-closure-path framing accumulates across phases, a consolidated roadmap artifact at the next phase boundary lists every commitment with scope/owner/timeline" — architect banking generalization)
- Phase 4 entry-cycle (internal-methodology-refinement queue emergence as separate section)
- Phase 3 → Phase 4 forward-track inheritance (3 entries; worked example for cross-phase inheritance audit events)
- Spec 01 §"Audit-trail unity within a surface" (cross-surface relationships tracked through explicit cross-references, not unified audit trails)
- Spec 05 §"Relationship to forward-tracks" (banking ↔ forward-track bidirectional reference structure)
