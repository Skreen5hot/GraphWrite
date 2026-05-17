# Spec 04: Cycle Counter Specification

**Status**: Generalized from Logic Team Input 3 (five-bucket cycle counter rules).
**Source**: Phase 4 entry-packet §3.8 cycle history table; Q-4-H bucket framing ratification 2026-05-10; Q-4-C amendment Ruling 4.
**Implementation target**: v2.7.0+ cycle accounting; brief-confirmation flag mechanics on commit-finalize tasks.

## Purpose

Defines the multi-bucket cycle counter rules that the routing-discipline protocol uses to track distinct sub-cycle types. Distinct sub-cycle types map to distinct counter buckets; conflating them corrupts cadence reading and loses projection-accuracy data.

## Generalized Specification

### Core structure

Cycle accounting uses N distinct counter buckets, where N is determined by the distinct sub-cycle types the protocol recognizes. Each bucket has:

- A scope (which sub-cycle types increment it)
- An increment rule (what action causes an increment)
- A suppression rule (what action suppresses the increment despite scope match)
- A distinct-from declaration (which other buckets the bucket must not be conflated with)

The cross-cutting `brief-confirmation` flag suppresses increment on follow-up confirmation cycles whose substance was ratified at a prior cycle.

### Why multi-bucket rather than single-counter

A single counter conflates structurally distinct sub-cycles. Projection-accuracy data (e.g., "we projected three architectural-gap cycles for this phase; actual is three; that's an exact match") requires that the counter discriminate between architectural-gap cycles and other sub-cycle types. A single counter would collapse this distinction.

The five-bucket structure Logic Team operates emerged from observing distinct sub-cycle types over multiple phases. The structure is evidence-grounded extension, similar to the verification-ritual category set. New sub-cycle types may surface and warrant new buckets.

### Brief-confirmation flag (cross-cutting)

The flag operates across Buckets 1–4 (Bucket 5 is independent). When the flag is true:

- Counter increment is suppressed for the bucket the cycle would otherwise belong to
- The routing-cycle audit event is still emitted (cycle surface unity per Spec 01)
- Bankings from the cycle still accumulate to the verbal-pending queue (per Spec 05)

The flag affects counter behavior only. It does not affect audit-trail-unity-per-surface or banking accumulation.

## Instance Layer: Logic Team's Five Buckets

### Bucket 1 — Phase Entry-Cycle Counter

- **Scope**: Initial-review cycle on entry packet (SME draft → architect rules); final-ratification cycle on amended entry packet (SME folds rulings → architect ratifies)
- **Increment rule**: One increment per entry-cycle pass (initial-review = +1; final-ratification = +1; brief follow-up confirmation = no increment per brief-confirmation flag)
- **Suppression rule**: Brief follow-up confirmation cycles on path-fence-authored amendments do not increment
- **Distinct from**: Bucket 2 (mid-phase) — entry-cycle is at phase boundary, not mid-phase
- **Precedent**:
  - Phase 1 entry-cycle counter: 2 (initial-review + final-ratification)
  - Phase 2 entry-cycle counter: 2
  - Phase 3 entry-cycle counter: 2
  - Phase 4 entry-cycle counter: 2 (closed at final ratification 2026-05-10)

### Bucket 2 — Phase Mid-Phase Architectural-Gap Counter

- **Scope**: In-Step architectural-gap micro-cycle (architect rules on Q-N-StepM-X surfaced by Developer reconnaissance during Step M implementation framing)
- **Increment rule**: One increment per ratified architectural-gap micro-cycle
- **Suppression rule**: Brief follow-up Pass 2b confirmation cycles do not increment; corrective sub-amendments within open Pass 2b window do not increment
- **Distinct from**: Bucket 3 (contingency-operationalization) — Bucket 2 is architect-surfacing-new-finding; Bucket 3 is pre-ratified disposition triggering on evidence. Distinct from Bucket 4 (corrective) — Bucket 2 is architect ruling on Developer reconnaissance; Bucket 4 is architect-error-correction on stakeholder critique.
- **Precedent**:
  - Phase 3: Q-3-Step3-A, Q-3-Step4-A, Q-3-Step5-A, Q-3-Step6-A, Q-3-Step9-A (5 cycles — overshoot vs Q-3-A projection of approximately 3)
  - Phase 4: Q-4-Step4-A, Q-4-Step5-A, Q-4-Step6-A (3 cycles — EXACT MATCH with Q-4-A approximately 3 projection)
- **Projection-accuracy data point**: The Phase 4 exact match is the second data point in a cumulative trajectory; Phase 3 over-shoot 5/~3 plus Phase 4 exact-match 3/~3 forms the substantive-scope-weighting projection-accuracy data Q-4-Step6-A Pass 2b Banking 4 preserved.

### Bucket 3 — Phase Contingency-Operationalization Sub-Cycle Counter

- **Scope**: Pre-ratified contingency framings (e.g., entry packet §8.2) that trigger on evidence; architect ratifies the pre-ratified disposition activation
- **Increment rule**: One increment per ratified contingency-operationalization cycle
- **Suppression rule**: Brief follow-up confirmation cycles do not increment
- **Distinct from**: Bucket 4 (corrective sub-cycle) — corrective is architect-error-correction; contingency-operationalization is pre-ratified disposition triggering on evidence
- **Key rule** (Q-4-C amendment Banking 1): "Pre-ratified contingency framings that trigger on evidence operationalize as the ratified disposition, not as corrective sub-cycles"
- **Precedent**: Q-4-C source-state amendment cycle 2026-05-10 — first production operationalization in engagement; bucket framing ratified at Q-4-C amendment Ruling 4

### Bucket 4 — Phase Stakeholder-Routing Corrective Sub-Cycle Counter

- **Scope**: Stakeholder critique surfaces architect-error-correction cycle (architect issues clean revision when concerns hold on the merits)
- **Increment rule**: One increment per ratified corrective sub-cycle
- **Suppression rule**: Brief follow-up confirmation cycles do not increment
- **Distinct from**: Bucket 3 (contingency-operationalization) — see above
- **Precedent**:
  - Phase 3: Q-Frank-Step9-A corrective overlay 2026-05-10 (Frank's stakeholder critique surfaced 3 banking withdrawals + 7 new bankings + 1 meta-banking + 8 architect rulings)
  - Phase 4 counter at 0

### Bucket 5 — ARC Content Authoring Workstream Bucket

- **Scope**: ARC content authoring cycles (own counter; parallel workstream; pre-exists phase entry)
- **Increment rule**: One increment per ARC content authoring cycle
- **Suppression rule**: NEVER increments any phase-level counter (Buckets 1–4)
- **Distinct from**: All phase-level cycles
- **Key rule**: Conflating ARC content authoring cycles with phase-level counters corrupts cadence reading
- **Precedent**: Q-4-H bucket framing; Aaron-led BFO ARC content authoring workstream pre-existed Phase 4 entry (40-entry `arc/core/bfo-2020.json` as input to Phase 4 entry-cycle)

### Brief-Confirmation Flag (cross-cutting; applies to Buckets 1, 2, 3, 4)

- **Rule**: Brief follow-up confirmation cycles for path-fence-authored amendments whose substance was ratified at the prior cycle do NOT increment any cycle-cadence counter
- **What still happens**: Brief confirmation cycle closes the sub-cycle pending Pass 2b commit + remote CI green; new bankings from the brief confirmation cycle still accumulate to verbal-pending queue (architect typically banks 3–5 new principles per brief confirmation observing the SME's amendment shape as exemplary practice)
- **Precedent**: Established Phase 3 entry-packet final-ratification cycle 2026-05-08
- **Reaffirmed**:
  - Q-4-C amendment brief confirmation 2026-05-10
  - Q-4-Step4-A Pass 2b brief confirmation 2026-05-14
  - Q-4-Step5-A Pass 2b brief confirmation 2026-05-14
  - Q-4-Step6-A Pass 2b brief confirmation 2026-05-14/15
- **Four consecutive reaffirmations validate the flag's portability across cycle types**

## Implementation guidance for Daemon Team

### Counter storage

Each bucket is a separate counter in `state.jsonld`. The structure:

```json
{
  "cycle_counters": {
    "phase_id": "phase-4",
    "buckets": {
      "entry_cycle": { "count": 2, "scope": "phase entry" },
      "mid_phase_architectural_gap": { "count": 3, "scope": "mid-phase" },
      "contingency_operationalization": { "count": 1, "scope": "contingency sub-cycle" },
      "stakeholder_corrective": { "count": 0, "scope": "stakeholder critique" },
      "arc_authoring": { "count": null, "scope": "parallel workstream" }
    },
    "projection": {
      "mid_phase_architectural_gap": "~3 (Q-4-A)",
      "actual_vs_projection": "EXACT MATCH"
    }
  }
}
```

### Counter increment logic

When a routing-cycle audit event is emitted:

1. Determine the cycle type (entry-cycle, mid-phase architectural-gap, contingency-operationalization, stakeholder-corrective, ARC-authoring)
2. Check if `brief_confirmation: true` is set on any task in the cycle
3. If brief_confirmation is true: emit the routing-cycle audit event but do NOT increment any counter
4. If brief_confirmation is false: emit the routing-cycle audit event AND increment the corresponding bucket

### Bucket determination

The cycle type can be determined from the task chain that produced the audit event:

- Entry-cycle: ratification task whose subject is a phase entry packet
- Mid-phase architectural-gap: ratification task whose subject is a Q-N-StepM-X ruling
- Contingency-operationalization: ratification task with `contingency_trigger: true` flag
- Stakeholder-corrective: ratification task with `corrective_origin: stakeholder_critique` flag
- ARC-authoring: any task tagged with `workstream: arc_authoring` (this can be a frontmatter declaration on the relevant agents)

### Projection-accuracy tracking

When a phase closes, the counter values are compared against the projection (if one was recorded at phase entry). The projection-vs-actual comparison is itself an audit event (`projection_accuracy_data_point`) that contributes to the substantive-scope-weighting projection-accuracy data accumulating across phases.

This is a small but FNSR-relevant feature: it lets the substrate learn over time how accurate its projections are, which is a primitive useful for the synthetic moral person project's projection-and-confidence apparatus.

## Open questions / extension points

- **New bucket emergence governance.** When a new sub-cycle type surfaces that doesn't fit existing buckets, the substrate should support adding a sixth or later bucket. The governance for this is parallel to the verification-ritual new-candidacy governance (per Spec 02). Default: operator approval via `awaiting_operator_decision` task.

- **Bucket 5 (ARC-authoring) generalization.** The "parallel workstream" framing generalizes to "any workstream that operates outside the phase-cadence structure." Subject projects may have multiple parallel workstreams. The spec should accommodate N parallel workstream buckets (one per workstream) rather than treating Bucket 5 as a single fixed bucket.

- **Projection-accuracy data accumulation.** Phase 3 over-shoot plus Phase 4 exact-match is a two-data-point trajectory. Mid-cycle methodology refinement was refused per Q-4-Step6-A.5 (complete-phase evidence plus early-next-phase evidence required for Frame I vs Frame II ruling). The substrate should support accumulating projection-accuracy data points across phases without forcing premature methodology refinement.

- **Brief-confirmation flag mis-application.** If an architect mis-classifies a substantive follow-up as brief-confirmation, the counter is incorrectly suppressed. v2.7.0+ implementation should make the brief-confirmation classification auditable so misclassifications surface (similar to the editorial-correction LLM-judgment edge case in Spec 03).

## Provenance

- Logic Team Input 3 (five-bucket cycle counter rules with precedent cycles)
- Q-4-H bucket framing ratification 2026-05-10 (initial five-bucket structure)
- Q-4-C amendment Ruling 4 (contingency-operationalization bucket framing)
- Phase 3 entry-packet final-ratification cycle 2026-05-08 (brief-confirmation precedent)
- Q-4-Step5-A through Q-4-Step6-A brief-confirmation reaffirmations
- Q-4-Step6-A Pass 2b Banking 4 (substantive-scope-weighting projection-accuracy data preservation)
