# Spec 01: Meta-Principle — Audit-Trail-Unity-Per-Surface

**Status**: Foundational. Frames all subsequent specifications in this bundle.
**Source**: Logic Team Input 5.2; generalized for FNSR substrate-neutral application.
**Implementation tier**: Architecture-level. No agent or task type implements this directly; it constrains how Specs 02–05 are implemented.

## Statement

Each architectural surface in a routing-discipline protocol gets its own audit-trail unity. Surfaces are not collapsed across categories.

A surface is identified by the question it answers. Each surface has:

- A distinct question scope (the surface answers questions that no other surface answers)
- An audit-trail unity guarantee (within the surface, related work is bundled; never split across audit instances)
- An evidence-grounded category set (the categories that instantiate the principle for that surface; not pre-declared closed)

## Why this is the meta-principle

The principle is substrate-neutral. The eight-category verification ritual that Logic Team has developed is one instance of the principle, applied to the verification surface. Other surfaces have their own instantiations. New surfaces emerge with evidence; their category sets are evidence-grounded extensions, not pre-declared closures.

If implementation specifies "eight categories per surface" as the rule, it over-fits to the verification surface and loses the principle's portability across surfaces. If implementation specifies "audit-trail-unity-per-surface" as the rule with category sets being evidence-grounded per-surface, the principle generalizes cleanly.

This matters because the Daemon Team will be implementing the verification-ritual agent in v2.8.0. The temptation will be to hard-code the eight categories. The architecture should leave room for the other three named surfaces (cycle, commit, bankings) plus surfaces that have not yet emerged.

## Surface identification

A surface is recognized when three conditions hold:

1. A distinct question scope exists that no other surface answers
2. Path-fence-authored content can drift from canonical along that surface's dimension
3. Verification of that surface requires its own category set, not absorption into another surface

When all three hold, a new surface is registered. When fewer than three hold, the candidate is folded into an existing surface or deferred to phase-exit retro.

## Audit-trail unity within a surface

"Unity" within a surface means:

- Related work bundles together within one audit instance
- The audit instance is the single source of truth for that work
- Subsequent references to the work cite the audit instance, not the work in isolation

This is distinct from cross-surface unity (which does not exist; surfaces are deliberately separate). Cross-surface relationships are tracked through explicit cross-references, not unified audit trails.

## Instance Layer: Logic Team's Five Named Surfaces

Logic Team's protocol currently operates five surfaces with explicit audit-trail unity. The fifth (Forward-Track Surface) was promoted from sub-surface of bankings to its own surface in v1.1 per Logic Team's instance-layer review. New surfaces may emerge.

### Verification Surface

- **Question**: Does path-fence-authored content correctly cite, mirror, or otherwise correspond to canonical sources?
- **Audit-trail unity**: One verification ritual run per routing-cycle artifact
- **Category set**: 8 ratified categories (Cat 1–8) + 2 candidacies (Cat 9–10) as of Phase 4
- **Detailed specification**: See Spec 02

### Cycle Surface

- **Question**: When does a cycle close and what audit-trail does it leave?
- **Audit-trail unity**: One standalone routing-cycle artifact per architectural-gap micro-cycle. Cycle artifacts are NOT bundled into the phase entry packet; the entry packet references them by cross-reference.
- **Instantiations**: Phase entry-cycle (initial-review + final-ratification); mid-phase architectural-gap micro-cycle; contingency-operationalization sub-cycle; stakeholder-routing corrective sub-cycle
- **Detailed specification**: See Spec 04

### Commit Surface

- **Question**: What constitutes a related-work-bundle for a single commit?
- **Audit-trail unity**: Pass 2b commit bundles related artifacts together; never split related work across multiple commits. The commit is the audit instance for the bundle.
- **Detailed specification**: See Spec 03, §Pass 2b

### Bankings Surface

- **Question**: What disciplines have been observed, and where are they recorded as the discipline evolves?
- **Audit-trail unity**: Phase entry packet §12 tracks bankings stratified by sub-cycle origin. Bankings have a state-transition lifecycle (verbal-pending → partially-committed → formalized).
- **Detailed specification**: See Spec 05

### Forward-Track Surface

- **Question**: What commitments to future deliberation exist, and where will they be deliberated?
- **Audit-trail unity**: One consolidated artifact per audience sub-surface. Forward-tracks have a candidate → deliberated-at-named-cycle → resolved lifecycle, structurally distinct from the bankings lifecycle.
- **Sub-surfaces** (audience-driven):
  - Consumer closure-path tracking (e.g., `v0.2-roadmap.md`): forward-tracks whose closure is consumer-facing
  - Internal methodology-refinement queue (e.g., phase-exit-retro candidates section): forward-tracks whose closure is internal-deliberation
- **Detailed specification**: See Spec 07

## Implementation guidance for Daemon Team

The meta-principle implies a design decision: the substrate should provide surface-registry primitives, not hard-code the five named surfaces.

Concretely:

- Define a `surface` data structure with: question scope (string identifier), audit-trail-unity guarantee (semantics specified per-surface), category set (evidence-grounded, extensible), extension points (named, with surfacing criteria)
- The verification-ritual agent (v2.8.0) instantiates the principle for the verification surface
- Future agents may instantiate the principle for the cycle surface (cycle-boundary agent), commit surface (commit-bundle agent), or bankings surface (banking-stratification agent)
- New surfaces register via the surface-registry; the substrate doesn't need to know in advance what surfaces will exist
- The CPS hook can consult the surface-registry to determine which veto categories apply to a given task type

This framing means v2.8.0+ work is not a one-off verification implementation. It's the first surface-instance of the meta-principle, with the architecture deliberately leaving room for additional surfaces.

### Minimum viable architecture

For v2.7.0–v2.8.0 implementation, the minimum viable architecture is:

- A `surfaces/` directory containing one specification file per registered surface
- The verification surface specification (drawn from Spec 02) is the first file
- The verification-ritual agent reads its surface specification from this directory rather than from hard-coded categories
- Adding a new surface in a later release is a matter of adding a new specification file and instantiating an agent that consumes it

## Open questions / extension points

- **The surface-registry abstraction is mine, not Logic Team's.** Logic Team operates the five named surfaces with internal discipline; whether they would endorse "surface-registry" framing requires their review. Logic Team's v1.1 review endorsed this abstraction explicitly (Section 2: "surface-registry framing wins on generalization-friendliness; cycle history already shows extensibility in practice"). If a subject project pushes back, the alternative is to specify the five surfaces in code and require explicit substrate releases for new surfaces. That's a less elegant architecture but is closer to current Logic Team practice.

- **Cross-cutting unity guarantees.** Audit-trail unity is specified per-surface in Specs 02–05. Whether there's a cross-cutting unity primitive (e.g., transaction-style atomicity across surfaces when an action touches multiple surfaces) is open. v2.7.0–v2.8.0 implementation does not require resolving this; v3.0+ may.

- **A potential sixth surface.** Logic Team's protocol has currently surfaced five named surfaces. The Forward-Track Surface was promoted to its own surface in v1.1 after Logic Team's review surfaced that the two forward-track sub-surfaces (consumer-closure-path tracking and internal-methodology-refinement queue) have a structurally distinct lifecycle from the bankings surface. Additional surfaces may emerge with evidence. v2.7.0+ implementation should treat the surface-registry as open.

## Provenance

- Logic Team Input 5.2 (audit-trail-unity-per-surface as meta-principle; eight ritual categories as one canonical instance)
- Logic Team Input 5.3 (forward-tracking evolution: Phase 1–2 inline → Phase 3 close consolidation in `v0.2-roadmap.md` → Phase 4 separate phase-exit-retro section, surfacing two distinct forward-track surfaces)
- `arc/AUTHORING_DISCIPLINE.md` §0 Path-Fencing and §1+ per-entry sign-off ritual (verification surface instance)
- Phase 4 entry packet §3.8 cycle history table (cycle surface instance)
- Phase entry packet §12 verbal-pending bankings queue (bankings surface instance)
- Q-Frank-Step9-A corrective overlay (surfacing of the two forward-track sub-surfaces)
