# FNSR Protocol Specifications, v1.1

**To**: Daemon Team (GraphWrite / barcode-template / AgenticDev)
**From**: Aaron, Orchestrator
**Re**: v2.7.0-unblocking protocol specifications bundle (v1.1, post-Logic-Team-review)
**Status**: Logic Team instance-layer review folded in. Ready for Daemon Team implementation.

## What's in this bundle

Seven artifacts produced from the parallel substrate work with Logic Team, with Logic Team's instance-layer review corrections folded in. Each artifact is structured in two layers: a generalized specification layer that is substrate-neutral and Daemon-Team-implementable, and an instance layer that documents Logic Team's specific protocol as a worked example.

Read in order:

- `00-README.md` — this file
- `01-meta-principle-audit-trail-unity-per-surface.md` — the architectural meta-principle that grounds the rest
- `02-verification-ritual-spec.md` — the verification ritual (eight ratified categories plus two candidacies)
- `03-pass-sequencing-spec.md` — Pass 2a / Pass 2b sequencing rules
- `04-cycle-counter-spec.md` — five-bucket cycle counter plus the brief-confirmation flag
- `05-banking-lifecycle-spec.md` — banking taxonomy and lifecycle states
- `06-adr-citation-mismatch-fixture.md` — the ADR-012 ghost as a test fixture
- `07-forward-track-surface-spec.md` — Forward-Track Surface (new in v1.1; promoted from sub-surface of bankings to its own surface per Logic Team review)

## Changelog: v1 → v1.1

Logic Team's instance-layer review surfaced one structural correction plus several smaller refinements. All have been folded in.

### Structural: forward-tracks are their own surface, not sub-surfaces of bankings

v1 treated the two forward-track sub-surfaces (consumer-closure-path tracking in `v0.2-roadmap.md`; internal-methodology-refinement queue in phase-exit-retro candidates section) as sub-surfaces of the bankings surface. Logic Team correctly pushed back: bankings record observations ABOUT the protocol; forward-tracks record commitments to FUTURE deliberation. Different audience, different lifecycle semantics (candidate → deliberated → resolved versus verbal-pending → partially-committed → formalized), different audit-trail unity.

v1.1 promotes Forward-Track Surface to its own named surface in Spec 01 (the named surfaces extend from four to five) and adds Spec 07 covering its lifecycle separately. Spec 05's banking lifecycle stays as-is for bankings only; the `forward-track` category is removed from the banking taxonomy; the `sub_surface` field moves from banking events to forward-track events where it belongs.

Cost of not fixing this: at every cross-phase forward-track inheritance event, the bankings-lifecycle model would have collided with itself. Catching it at instance-layer review costs hours; catching it after v2.8.0 implementation would have cost a substrate release.

### Refinements

- **Spec 05 lifecycle clarifying note**: The three-state lifecycle is Aaron's generalization. Logic Team operates two of the three states implicitly. The note added to Spec 05 says subject projects may operate the lifecycle implicitly or explicitly; either mode is consistent with the spec.

- **Spec 05 banking taxonomy clarifying note**: The category set is a substrate generalization. Logic Team doesn't operate explicit category tags at banking authoring time; categories emerge from prose and get folded at phase-exit. The note added to Spec 05 says subject projects may categorize at authoring time (cleaner audit trail) or retroactively (matches Logic Team practice).

- **Spec 02 Cat 3 wording**: Tightened to "No notable production catch yet (no Q-ruling identifier mis-citation has surfaced); routine pass at every cycle's ritual run." The category has been actively running, not no-op'd.

- **Spec 02 Cat 8 wording on Catch 6**: Clarified that Catch 6 was attributed via Cat 8 for routing purposes (closest existing category) but the catch's failure mode actually surfaced the Cat 10 candidacy boundary. Canonical attribution is Cat 10 candidacy.

- **Spec 03 editorial-correction scope**: Noted as non-exhaustive. Q-4-C amendment Ruling 3 banking includes "corpus-shape corrections" which the four-item heuristic doesn't capture. The structural heuristic stays as a starting set; the LLM judgment at the boundary remains the final call.

- **"wrong" → "incomplete" framing**: The original directive's assumption ("every banking is an event the moment it's ratified; there is no parallel running count") was incomplete, not wrong. It excluded the parallel counting views the Logic Team protocol legitimately operates. Specs and framings updated to use "incomplete" where v1 said "wrong."

## Three substantive changes from the original directive

The bundle's substantive corrections to the original directive, restated for v1.1:

### One: the verbal-pending elimination assumption was incomplete

The original directive said "every banking is an event the moment it's ratified; there is no parallel running count." Logic Team's reframe shows that bankings have a state-transition lifecycle (verbal-pending → partially-committed → formalized) and apparent "divergence" between counts is two valid views over that lifecycle, not a bug to eliminate. The substrate should model the lifecycle, not collapse it. Spec 05 makes this concrete.

This does not invalidate v2.6.0's `bank` command and audit-event surface. v2.6.0 is correct as far as it goes. v2.7.0+ should add lifecycle-state tracking to the banking events.

### Two: the eight-category ritual count is not load-bearing

The principle is audit-trail-unity-per-surface (Spec 01), with the eight ritual categories being one canonical instance of the principle applied to the verification surface. Other surfaces (cycle, commit, bankings, forward-track) have their own instantiations. Implementation should hold the meta-principle stable; the eight categories are an evidence-grounded extension set, not a closed set.

### Three: v2.6.0's ADR-citation CPS check does not catch the ADR-012 ghost

v2.6.0's check vetoes when ADR-NNN is not registered in `project/DECISIONS.md`. The ADR-012 ghost was different: ADR-012 exists in both `DECISIONS.md` and spec §10, but the architect's verbatim citation carried framing that matched neither entry. v2.6.0 correctly lets this pass at the structural-existence level. The actual failure mode is Cat 9 candidacy territory in the verification ritual (cited-content consistency), not Cat 2 (ADR cross-reference existence). Spec 06 documents the v2.6.0 → v2.7.0+ coverage progression.

## How to use this bundle

- Read Spec 01 first. It frames everything below. Approximately twenty minutes.
- Specs 02 through 05 are v2.7.0 + v2.8.0 implementation targets. Each is independently implementable.
- Spec 06 is a test fixture. Add it to your v2.6.0 test suite to validate current behavior; use it as the anchor case for v2.7.0+ Cat 9 implementation.
- Spec 07 is new in v1.1 and covers the Forward-Track Surface. Read after Spec 05 since it references banking lifecycle for contrast.
- Each spec has an "Implementation guidance for Daemon Team" section. That section translates Logic Team's discipline into substrate decisions you can make.
- Each spec has an "Open questions / extension points" section. Push back where the generalization misses load-bearing detail or where the implementation guidance under-specifies.

## What's still pending

Logic Team's review is folded in; their workstream engagement is now on-demand per the closing-the-loop communication. The supplementary 30-minute walk validating Spec 05's lifecycle model against concrete bankings remains deferred; trigger it if Daemon Team's implementation surfaces a gap.

`surface_audience` semantics is v3.1 work; not part of this bundle.

## FNSR-relevance note

This generalization is itself FNSR-relevant. The discipline Logic Team has developed becomes substrate-neutral specification rather than tacit knowledge bound to one subject project. That portability is what the synthetic moral person project requires at every level: normative apparatus that survives substrate translation without degrading into procedure. v2.6.0 demonstrated that protocol depth survives substrate translation in a small case. This bundle extends the result.

Push back on anything that is wrong.

— Aaron
