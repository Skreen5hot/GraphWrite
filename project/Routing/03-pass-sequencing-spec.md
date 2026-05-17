# Spec 03: Pass 2a / Pass 2b Sequencing Specification

**Status**: Generalized from Logic Team protocol summary plus Input 5.3 (brief-confirmation almost-different-direction history).
**Source**: `arc/AUTHORING_DISCIPLINE.md` §0 Path-Fencing + §1 per-entry sign-off ritual; Logic Team brief-confirmation precedent at Phase 3 entry-packet final-ratification cycle.
**Implementation target**: v2.7.0 `ratification` task type + architect refusal contract; v2.8.0 `commit-finalize` task type.

## Purpose

Defines the two-pass sequencing discipline for changes that mutate canonical state. Pass 2a is ratification (no state mutation; produces ruling payload). Pass 2b is commit-finalize (state mutation; gated by verification-ritual). This sequencing makes evidence-gated change mechanical rather than cultural.

## Generalized Specification

### The two-pass discipline

Any change that mutates canonical state (state.jsonld, DECISIONS.md, any frozen contract) passes through two distinct passes:

- **Pass 2a (Ratification)**: An architect agent reviews a proposed change against frozen contracts, prior rulings, and reconnaissance evidence. Produces a ruling payload. No state mutation.
- **Pass 2b (Commit-finalize)**: A developer or applier agent executes the ratified change under verification-ritual gating. Produces state mutation plus an audit event.

The two passes are sequential within a routing cycle. Pass 2a precedes Pass 2b; Pass 2b consumes Pass 2a's ruling payload as input.

### Pass 2a (Ratification) contract

- **Task type**: `ratification`
- **Agent**: architect (or any agent fulfilling the architect role for the surface in question)
- **Input**: proposed change payload; UPSTREAM context including reconnaissance evidence
- **Output**: ruling payload (no state mutation), with structure:
  - `ruling: ratified | denied | deferred`
  - `rationale: string`
  - `referenced_evidence: list of upstream task references`
  - `bankings: list of new disciplines observed (per Spec 05)`
- **Refusal condition**: ratification is denied when UPSTREAM lacks reconnaissance evidence for changes outside the editorial-correction scope. The architect agent's contract enforces this refusal mechanically.

### Pass 2b (Commit-finalize) contract

- **Task type**: `commit-finalize`
- **Agent**: developer (implementation mode) or applier
- **Input**: ratified change payload; ratification ruling from Pass 2a (via depends_on)
- **Output**: state mutation plus audit event
- **Gating**: the verification-ritual agent runs against the proposed mutation. CPS hook fails commit-finalize on verification-ritual veto.
- **Brief-confirmation variant**: see §"Brief-confirmation variant" below.

### Reconnaissance requirement

The architect's refusal contract requires UPSTREAM reconnaissance evidence for substantive changes. "Substantive" means anything outside the editorial-correction scope.

Editorial-correction scope (these changes do NOT require reconnaissance):

- Typo fixes
- Formatting consistency (whitespace, header levels, list style)
- Terminology tightening that preserves semantics (replacing "use" with "employ" where meaning is unchanged)
- Citation format updates

**This list is non-exhaustive.** Per Q-4-C amendment Ruling 3 banking, editorial corrections within a v0.1.7-style freeze also include "terminology sharpening and language tightening to reflect newly-introduced API surfaces that were architecturally implicit but not textually explicit" plus "corpus-shape corrections" that adjust corpus structure without changing semantic content. The four-item heuristic above is a starting structural test; the LLM judgment at the boundary remains the final call. Implementations should not treat the four items as a closed enumeration.

Anything outside this scope (changes to defined terms, ADR text, constraint clauses, normative `shall`/`must` language, behavioral spec content) requires a `reconnaissance` task in UPSTREAM. The architect agent walks UPSTREAM for an entry where `agent == "reconnaissance"`; if absent and the change is substantive, ratification is refused with `denied: reconnaissance_required`.

The editorial-vs-substantive distinction is LLM-judged at the boundary. The architect agent's frontmatter encodes the structural heuristic above; the final call lies with the LLM. Per the original directive: accept the judgment cost.

### Brief-confirmation variant

Brief-confirmation cycles handle follow-up commit-finalize tasks for path-fence-authored amendments whose substance was ratified at the prior cycle.

Per Logic Team Input 5.3, brief-confirmation was almost-different-direction. The robust move is:

- Brief-confirmation is structurally a separate cycle (gets its own §7 close section in routing artifact; bankings accumulate per cycle)
- AND has a counter-suppression flag (does NOT increment any cycle-cadence counter per Spec 04)

The almost-different-direction was flag-only collapse: treating brief-confirmation as a flag on the prior cycle's routing artifact, with no new audit-trail surface. That collapse would have lost roughly twelve to twenty bankings per phase (the architect typically banks three to five new principles per brief-confirmation cycle observing the SME's amendment shape as exemplary practice). The hybrid pattern preserves the bankings cleanly via per-cycle §7 close sections.

### Implementation: brief-confirmation as a flag, separate cycle as structure

The Daemon Team's v2.6.0 proposal handled brief-confirmation as a `brief_confirmation: true` flag on the commit-finalize task object. That implementation is correct for the cycle-counter behavior (the flag suppresses the increment). But the separate-cycle structural requirement means the routing artifact still gets a fresh §7 close section per brief-confirmation cycle, and bankings from the brief-confirmation cycle accumulate to the verbal-pending queue per Spec 05.

Concretely:

- `brief_confirmation: true` on the commit-finalize task object: counter suppression (per Spec 04)
- A new routing-cycle audit event is still emitted: separate cycle structurally (per Spec 01's audit-trail-unity-per-surface, cycle surface)
- Bankings from the brief-confirmation cycle accumulate normally (per Spec 05)

The flag affects counter behavior only. It does not affect audit-trail-unity-per-surface.

## Sequencing rules

### Default chain

The default chain for substantive changes:

```
reconnaissance → ratification → commit-finalize
```

Each step is a separate task. `reconnaissance` is the developer agent in read-only mode; `ratification` is the architect agent producing a ruling payload; `commit-finalize` is the developer/applier agent executing under verification-ritual gating.

### Editorial-correction chain

For changes within editorial-correction scope:

```
ratification → commit-finalize
```

Reconnaissance is bypassed. The architect agent's contract permits this when the proposed change matches the editorial-correction structural heuristics.

### Brief-confirmation chain

For brief-confirmation cycles (follow-up commit-finalize for path-fence-authored amendments to a prior ratified change):

```
commit-finalize (brief_confirmation: true, depends_on: prior ratification)
```

The prior ratification is in UPSTREAM; no new ratification task is needed because the substance was ratified at the prior cycle. Cycle counter is suppressed; bankings still accumulate.

### Contingency-operationalization chain

For pre-ratified contingency framings that trigger on evidence (per Spec 04 Bucket 3):

```
contingency-trigger-detection → ratification (operationalization) → commit-finalize
```

The contingency framing was ratified at entry-packet authoring time (e.g., entry packet §8.2). When evidence triggers the framing, a new ratification task confirms the trigger conditions are met; commit-finalize executes the pre-ratified disposition. This is structurally distinct from corrective sub-cycles (Spec 04 Bucket 4) where the architect issues clean revision when concerns hold.

## Instance Layer: Logic Team's Pass 2a/2b protocol

### Pass 2a in Logic Team's protocol

- Pass 2a corresponds to the architect-ruling cycle: SME path-fence-authors a proposal; architect reviews against frozen contracts and reconnaissance evidence; architect produces a ruling payload (`ratified`, `denied`, or `deferred`).
- The ruling is captured in the routing-cycle artifact's §5 ruling section, transcribed verbatim per `arc/AUTHORING_DISCIPLINE.md` §11 discipline.
- Bankings observed during Pass 2a accumulate to the verbal-pending queue per Spec 05.

### Pass 2b in Logic Team's protocol

- Pass 2b corresponds to SME path-fence-author plus commit landing: SME folds the architect's ruling into the path-fence-authored artifact; SME runs the verification ritual on the amended artifact; the artifact is committed.
- The brief-confirmation variant fires when the path-fence-authored amendment closely follows the architect's ruling without new substantive content; the architect's brief confirmation cycle observes the amendment shape, banks new principles, and closes the cycle without incrementing the counter.

### Reconnaissance in Logic Team's protocol

- Reconnaissance is Developer-side work in read-only mode: read existing implementation; identify the gap or finding that motivates the proposed change; produce a findings payload.
- The architect's ratification refusal contract requires reconnaissance evidence for substantive changes; the discipline is encoded in `project/OFBT_spec_v0.1.7.md` §0.2.3 evidence-gated change rule.
- Reconnaissance was generalized at Q-4-Step5-A.4 + Q-4-Step6-A.1 banking.

### Brief-confirmation precedent

- Established at Phase 3 entry-packet final-ratification cycle (2026-05-08)
- Reaffirmed at Q-4-C amendment brief-confirmation (2026-05-10)
- Reaffirmed at Q-4-Step4-A Pass 2b brief-confirmation (2026-05-14)
- Reaffirmed at Q-4-Step5-A Pass 2b brief-confirmation (2026-05-14)
- Reaffirmed at Q-4-Step6-A Pass 2b brief-confirmation (2026-05-14/15)

Four consecutive reaffirmations across Phase 4 validate the flag's portability.

## Implementation guidance for Daemon Team

### Task type definitions

Add three task types (or finalize them if v2.7.0 already has them):

```yaml
ratification:
  agent: architect
  produces_state_mutation: false
  required_outputs: [ruling, rationale, referenced_evidence, bankings]
  refusal_condition: substantive_change_without_reconnaissance

commit-finalize:
  agent: developer | applier
  produces_state_mutation: true
  depends_on: [ratification]
  optional_fields: [brief_confirmation]
  gating: verification-ritual

reconnaissance:
  agent: developer (mode: reconnaissance)
  produces_state_mutation: false
  required_outputs: [findings, summary, evidence_paths]
  tools: Read, Grep, Glob
```

### Architect refusal contract

The architect agent's frontmatter should declare:

```yaml
refusal_conditions:
  - condition: substantive_change_without_reconnaissance
    check: |
      walk UPSTREAM for entry where agent == "reconnaissance"
      if absent AND change is_substantive AND change not_in editorial_correction_scope:
        emit denial: reconnaissance_required
```

The `is_substantive` and `editorial_correction_scope` checks are LLM-judged. The architect agent's prompt should include the editorial-correction structural heuristics (no changes to: defined terms, ADR text, constraint clauses, normative shall/must language).

### Brief-confirmation flag handling

The Daemon Team's v2.6.0 proposal of `brief_confirmation: true` as a field on the commit-finalize task is correct for counter suppression. Implementation note: the flag affects Spec 04 cycle counter only; the routing-cycle audit event for the brief-confirmation cycle is still emitted per Spec 01 cycle surface unity.

## Open questions / extension points

- **Multi-architect ratification.** Logic Team's protocol has a single architect ratifying per cycle. v3.0+ parallel-agent synthesis (per the original directive's generalized synthesist) may require multi-architect ratification with audit-trail-unity-per-surface preserved. The Pass 2a contract needs extension for this case.

- **Deferred ratifications.** The Pass 2a ruling can be `deferred` (neither ratified nor denied). Logic Team's protocol defers to phase-exit retro for accumulated forward-tracks. The interaction between `ratification: deferred` rulings and the `forward-track` event type (per Spec 07) needs clarification before v2.7.0 implementation; deferring may produce a forward-track audit event automatically on the Forward-Track Surface.

- **Editorial-correction LLM-judgment edge cases.** The boundary between editorial and substantive will produce false positives (substantive changes mis-classified as editorial, bypassing reconnaissance) and false negatives (editorial changes mis-classified as substantive, blocking on absent reconnaissance). v2.7.0 implementation should record the architect's editorial-vs-substantive verdict in the audit chain so misclassifications surface and inform heuristic refinement.

## Provenance

- Logic Team protocol summary (Pass 2a / Pass 2b sequencing description)
- Logic Team Input 5.3 (brief-confirmation almost-different-direction history; separate-cycle plus counter-suppression-flag hybrid as robust move)
- Logic Team Input 3 (brief-confirmation flag precedent and reaffirmations)
- `arc/AUTHORING_DISCIPLINE.md` §0 Path-Fencing + §1 per-entry sign-off ritual
- `project/OFBT_spec_v0.1.7.md` §0.2.3 evidence-gated change rule
- Q-4-Step5-A.4 + Q-4-Step6-A.1 reconnaissance banking
