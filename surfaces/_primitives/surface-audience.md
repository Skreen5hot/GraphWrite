---
primitive_id: surface-audience
short_name: Surface Audience
introduced_in: v3.1.0
enforcement_target: v3.2 (registry enforcement; differential quality gates per audience)
canonical_reference: project/Routing/00-README.md §"What's still pending" + Aaron's v3.0 closeout greenlight directive
---

# Surface Audience — substrate primitive

## What it is

A **per-output field** declared by worker agents that names the audience the output is destined for. Two values are ratified in v3.1.0:

- **`consumer`** — content destined for consumer-facing surfaces: demos, public documentation, README files, marketing material, externally-published artifacts, anything an end-user or non-substrate-operator will read.
- **`internal`** — everything else: substrate-development artifacts, audit-trail entries, operator-facing reports, methodological observations, in-progress drafts, intermediate work products.

The field is part of the output payload, not agent frontmatter. The same agent may emit `consumer` outputs on one dispatch and `internal` outputs on the next — the audience is per-output, not per-agent. This matters because many agents legitimately produce both kinds of content depending on the task.

This document is the substrate's canonical specification of the audience-distinction primitive. Documents referencing "surface audience" or "consumer vs internal output" cite this primitive.

## Why this is a substrate primitive (not just metadata)

A field on outputs that consumers ignore would just be metadata. What makes `surface_audience` a substrate primitive is the property the substrate guarantees about it: **every committed output records its audience in the audit chain**, so future operators (and the v3.2 registry enforcement that follows from this primitive) can re-derive the audience claim for every output the substrate has ever produced.

The audit chain becomes auditable per-audience: queries like "what consumer-facing outputs has this substrate produced?" or "what fraction of outputs in cycle N targeted consumers?" become answerable without re-parsing the originals. The substrate maintains the property; the operator (and future enforcement) reads it.

The primitive's three properties (parallel construction with the anti-pattern enforcement primitive's three-property structure):

1. **The audience is declared at the output level, not the agent level.** This preserves per-output flexibility. The same dispatch path produces consumer and internal outputs across different invocations; the field belongs to outputs, not contracts.
2. **The substrate validates the value as a closed enumeration.** `consumer` and `internal` are the ratified values. Outputs with `surface_audience` set to anything else are refused via structured-error veto. The substrate decides; agents cannot extend the enum by claiming compliance.
3. **The audit chain records every audience declaration.** Verification-ritual specifically records `subject_surface_audience` in its audit payload at v3.1.0; the substrate-wide pattern (every committed task's history payload records the field) is established as the convention even where v3.1.0 doesn't yet mechanically enforce it.

## Default value

When an agent's output omits `surface_audience`, the substrate treats the output as `internal`. This is the **conservative default**:

- `consumer` content has the higher quality bar (v3.2 enforcement adds gates such as: no internal jargon; no draft markers; no incomplete sections; documentation-style language). Treating omitted as `consumer` would silently elevate every output to that bar, producing false-positive enforcement failures.
- `internal` is the substrate's working register. Substrate-development work, audit entries, verification verdicts, methodological observations — all are internal-by-default. Explicitly declaring `consumer` is the deliberate elevation.

The default preserves operator agency: the operator (via the agent's contract) deliberately tags outputs as consumer-facing; the substrate doesn't promote internal content to consumer status silently.

## v3.1.0 vs v3.2 enforcement split

**v3.1.0 (THIS RELEASE):**

- Primitive doc authored (this file)
- `_extract_surface_audience(outputs)` helper validates the enum
- Verification-ritual records the field via `subject_surface_audience` in its audit payload
- The substrate accepts the field as optional output metadata; omitted defaults to `internal`
- No quality-gate enforcement; no refusal on consumer-vs-internal mismatch

**v3.2 (future):**

- Registry enforcement: agents declare in frontmatter which audiences they can produce; outputs with `surface_audience: consumer` from agents not declaring `produces_consumer: true` are refused
- Differential quality gates: consumer outputs pass through additional checks (length budgets per audience; forbidden-internal-jargon scans; documentation-completeness validation)
- Corpus-wide test `TestSurfaceAudienceConformance` validates the frontmatter declarations match the actual usage patterns in audit history

The split is per the original directive (`project/Routing/00-README.md` §"What's still pending": "`surface_audience` semantics is v3.1 work"). v3.1.0 ships the field declaration and audit-recording infrastructure; v3.2 ships enforcement against that infrastructure.

## How agents declare the field

In the output payload:

```json
{
  "outputs": {
    "surface_audience": "consumer",
    "findings": [...],
    "summary": "..."
  }
}
```

OR omit the field (treated as `internal`):

```json
{
  "outputs": {
    "findings": [...],
    "summary": "..."
  }
}
```

Agents that consistently emit one audience SHOULD declare the field explicitly in their typical output. Agents that emit both audiences SHOULD set the field per-output based on the specific dispatch's target. Agents whose outputs are operator-facing only (verification-ritual; reconnaissance; adversarial-critic) MAY omit the field; the default `internal` matches their actual audience.

Agent contracts MAY document expected `surface_audience` values in prose; substrate does not require frontmatter declaration at v3.1.0 (that lands in v3.2).

## Verification-ritual integration (v3.1.0)

The `verification-ritual` system agent records `subject_surface_audience` in its output payload, reading from UPSTREAM:

- If any upstream task's `outputs.surface_audience` is set, verification-ritual records that value in its own outputs as `subject_surface_audience`.
- If no upstream provides the field (or no UPSTREAM is given), defaults to `internal`.
- The value lands in verification-ritual's audit-event payload, making per-audience verification-ritual querying tractable.

This is the v3.1.0 audit-recording mechanism. v3.2 may extend to other system agents (applier; retro-applier) and to per-task substrate-wide recording.

## Why deferred enforcement, not immediate

The enforcement-deferred shape is deliberate:

1. **Adoption ramp.** Agents need time to declare the field per their actual output patterns. Forcing the declaration at v3.1.0 alongside enforcement would couple primitive introduction with corpus-wide modification — large change, hard to validate incrementally.
2. **Differential-gates discovery.** What gates apply to consumer outputs is itself a question. v3.1.0 + a few months of usage produces evidence about which gates are load-bearing (length? jargon? draft markers? something else surfacing from FNSR-larger-scope work). v3.2's gates are then evidence-grounded rather than speculative.
3. **Substrate-vs-procedure distinction.** v3.1.0 establishes the primitive at the substrate level (field exists; validated; recorded). v3.2 extends to procedural discipline (gates fire; agents declare; refusals happen). The two-release split matches the substrate-vs-procedure distinction from prior primitive introductions.

## FNSR-relevance

The synthetic moral person project will produce content destined for varied audiences: deliberation records (internal); ratified normative apparatus (semi-consumer; reviewable by other reasoning systems); externally-communicated decisions (consumer; visible to stakeholders the moral person serves). Each audience has different quality requirements, different review cadences, different irreversibility profiles.

A substrate that does not distinguish audiences treats all outputs as equivalent. v3.1.0's primitive establishes the distinction at the substrate level so future FNSR work can build differential discipline per audience without re-deriving the audience-distinction itself. The primitive is small; the load-bearing property is that audience becomes first-class substrate data.

This is the originally-scoped trajectory's terminal substrate primitive. v3.1.0 ships it; v3.2's enforcement is the first post-trajectory release that builds on the documented closure rather than against ongoing trajectory.

## Implementation status

- **v3.1.0 (THIS RELEASE):** primitive doc + `_extract_surface_audience` helper + verification-ritual `subject_surface_audience` recording. No enforcement.
- **v3.2 (future):** registry enforcement; agent frontmatter `produces_consumer: true` declarations; differential quality gates; corpus-wide `TestSurfaceAudienceConformance` validation.

## Cross-references

- `project/Routing/00-README.md` §"What's still pending" — originally-scoped deferral to v3.1
- `surfaces/_primitives/anti-pattern-enforcement.md` — the v3.2 differential gates will be anti-pattern enforcement instances per the three-property pattern
- `surfaces/_primitives/episodic-to-semantic-promotion.md` — surface-audience and E→S are independent dimensions: an output's audience (consumer/internal) is distinct from its promotion status (episodic/semantic). Both axes apply to every output.

## Provenance

- `project/Routing/00-README.md` (v1.1 bundle delivery) — original deferral
- Aaron's v3.0-closeout greenlight (the trajectory-terminal release directive)
- v3.1.0 substrate retrospective addendum (this release closes the originally-scoped trajectory; v3.2 begins post-trajectory work)
