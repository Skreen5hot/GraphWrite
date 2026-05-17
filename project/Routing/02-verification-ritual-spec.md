# Spec 02: Verification Ritual Specification

**Status**: Generalized from Logic Team Input 1. Logic Team instance-layer review pending.
**Source**: `arc/AUTHORING_DISCIPLINE.md` "SME-Persona Verification of Vendored Canonical Sources" subsection.
**Implementation target**: v2.8.0 `verification-ritual` agent. v2.7.0 architect refusal contract may consult subset.

## Purpose

The verification ritual runs on path-fence-authored content before routing. It catches references that drift from canonical sources at machine speed, eliminating an entire class of routing failures. This specification defines the ritual's structure substrate-neutrally and documents Logic Team's specific category set as the canonical instance.

## Generalized Specification

### Core structure

For each canonical-source-or-cross-reference surface where path-fence-authored content can drift from canonical, one ritual category covers verification of that surface.

Each ritual category is specified by four fields:

- **Inputs**: what content the category consumes (typically path-fence-authored artifacts plus canonical sources)
- **Verification mode**: STRUCTURAL only / STRUCTURAL+SEMANTIC / SEMANTIC only
- **Veto criteria**: conditions under which the category vetoes routing
- **Production history**: representative cases where the category caught failures, or where it missed and a new category became candidate

### Verification modes

- **STRUCTURAL**: reference-existence verification ("does the reference exist?")
- **SEMANTIC**: reference-consistency verification ("does the actual content at the reference match the citing artifact's framing?")

A category may operate STRUCTURAL only, STRUCTURAL+SEMANTIC (with structural primary and semantic secondary), or SEMANTIC only. Categories that operate STRUCTURAL only have explicit gap candidacies for the SEMANTIC coverage they leave uncovered (this is the boundary Cat 9 candidacy surfaces).

### Evidence-grounded extension

The category set is NOT a closed set. New categories surface when:

- Production cases (passes or misses) reveal a verification surface not covered by existing categories
- The pattern repeats (two or more production cases at the same boundary)
- Forward-tracking to phase-exit retro candidacy accumulates supporting evidence

This means the verification-ritual agent must support category extension as a first-class operation, not as a substrate release. Per Logic Team's framing: "verification ritual category-expansion candidates evidence-grounded by production misses forward-track to phase exit retro candidacy" (Q-4-Step5-A Banking 5).

### Two-cadence operation

Some categories require two-cadence operation:

- **Pre-routing cadence**: structural verification at SME pre-routing ritual run, binds immediately before architect routing
- **At-vendoring-analog-time cadence**: canonical-value confirmation at Developer Pass 2b activation-time ritual run, when canonical sources are fetched and `[VERIFY]` markers are flipped

Two-cadence operation is required for categories where canonical sources are external (URLs, vendored IRIs, third-party registries). Single-cadence (pre-routing only) is sufficient for categories where canonical sources are internal (spec sections, internal frozen enums).

### Production-history accumulation

The ritual accumulates production history as it operates. The history is itself a substrate concern: each catch, each miss, and each new candidacy becomes an audit event. This history grounds the evidence-based extension of the category set.

Logic Team's accumulated history through Phase 4: six catches plus two misses, producing the Cat 9 + Cat 10 candidacies.

## Instance Layer: Logic Team's 8 Categories Plus 2 Candidacies

### Cat 1 — Spec-Section-Existence Verification

- **Inputs**: Path-fence-authored artifacts citing spec §N.M references; the binding spec document (`project/OFBT_spec_v0.1.7.md`)
- **Verification mode**: STRUCTURAL only. Does §N.M exist? Grep matches the section header. Does NOT verify cited content matches.
- **Veto criteria**: Cited §N.M doesn't exist → ritual veto, pre-routing correction required
- **Cadence**: Single (pre-routing)
- **Representative case**: Phase 3 Step 5 routing artifact 2026-05-08 cited spec §3.4.4 which did NOT exist (off-by-one; correct was §3.4.1). First production catch in engagement.

### Cat 2 — ADR Cross-Reference Verification

- **Inputs**: Path-fence-authored artifacts citing ADR-NNN references; canonical ADR registries (`project/DECISIONS.md` plus spec §10 ADR registry)
- **Verification mode**: STRUCTURAL only. Does ADR-NNN exist in canonical registry? Does NOT verify ADR content matches the citing artifact's framing.
- **Veto criteria**: Cited ADR doesn't exist in canonical registry, OR exists in only one registry when context implies both
- **Cadence**: Single (pre-routing)
- **Representative case**: Q-4-Step5-A Catch 4 plus Q-4-Step6-A Catch 5 — ADR-012 plus ADR-011 mis-citations. ADRs existed in BOTH registries but with DIFFERENT content; the cited framing matched NEITHER (verbal-banked principle mis-attributed as numbered ADR). Pattern repetition strengthened parallel-registry-reconciliation forward-track candidacy.
- **Note for Daemon Team**: This is the category v2.6.0's ADR-citation CPS check implements at the existence level. See Spec 06 for the gap between Cat 2 (structural existence) and Cat 9 (cited-content consistency) that the ADR-012 ghost case exposes.

### Cat 3 — Q-Ruling Cross-Reference Verification

- **Inputs**: Path-fence-authored artifacts citing Q-N-X or Q-N-StepM-X references; prior cycle artifacts under `project/reviews/`
- **Verification mode**: STRUCTURAL only. Does the cited Q-ruling exist in a prior cycle artifact?
- **Veto criteria**: Cited Q-ruling doesn't exist, OR ruling exists but with a different identifier than cited (e.g., Q-4-A cited but actual ruling was Q-4-B)
- **Cadence**: Single (pre-routing)
- **Representative case**: No notable production catch yet (no Q-ruling identifier mis-citation has surfaced); routine pass at every cycle's ritual run. The category has been actively running and discriminating, not no-op'd. Phase 4 has accumulated Q-4-A through Q-4-H plus Q-4-Step4-A, Q-4-Step5-A (with sub-rulings), and Q-4-Step6-A. Cat 3 verifies that cross-references between these hold.

### Cat 4 — Reason-Code-Against-Frozen-Enum Verification

- **Inputs**: Path-fence-authored artifacts citing `expectedReason: "X"` values; the frozen reason-code enum (`src/kernel/reason-codes.ts`, Object.freeze'd canonical 16-member set); API §11.1 spec text
- **Verification mode**: STRUCTURAL only. Is reason code "X" a member of the frozen 16-member set?
- **Veto criteria**: Cited reason code not in frozen enum → ritual veto
- **Cadence**: Single (pre-routing)
- **Representative case**: Phase 3 Step 4 — `naf_residue` cited in `cwa_open_predicate` fixture's `expectedReason`; reason did NOT exist (it was a LossType, not a reason code). Routed Q-3-Step4-A; architect ratified Option β (reuse of `open_world_undetermined`). Reason-enum-stability discipline preserved.

### Cat 5 — FOL @type vs OWL @type Discriminator Verification

- **Inputs**: Path-fence-authored fixtures' `@type` strings; canonical FOL @type set (`src/kernel/fol-types.ts`: `fol:Implication`, `fol:Conjunction`, `fol:Disjunction`, `fol:Negation`, `fol:Universal`, `fol:Existential`, `fol:Atom`, `fol:Equality`, `fol:False`); canonical OWL @type set (`src/kernel/owl-types.ts`)
- **Verification mode**: STRUCTURAL only. Is `"@type": "X"` a member of the canonical type union? Does NOT verify the object's field structure matches the canonical interface declaration. (Cat 10 candidacy covers field-structure consistency.)
- **Veto criteria**: @type string not in canonical set → ritual veto
- **Cadence**: Single (pre-routing)
- **Representative case**: Q-4-C amendment Catch 2 — `canary_connected_with_overlap` fixture's `forbiddenPatterns[0]` used `"@type": "fol:Biconditional"` which does NOT exist in canonical FOL @type set. Corrected to reverse-direction `fol:Implication` pattern per ADR-007 §4 decomposition convention. Second production catch in engagement.

### Cat 6 — Manifest Mirror Consistency Verification

- **Inputs**: `tests/corpus/manifest.json` entries; `tests/corpus/*.fixture.js` files
- **Verification mode**: STRUCTURAL only. Does the manifest entry's `expectedOutcome` field mirror the fixture's `expectedOutcome` field? Same `expectedConsistencyResult`, same `canaryRole`, same `expectedRequiredPatternsCount`, etc.
- **Veto criteria**: Manifest entry diverges from fixture → ritual veto, pre-routing reconciliation required
- **Cadence**: Single (pre-routing)
- **Representative case**: Q-4-Step4-A Catch 3 contributed via the manifest-mirror dimension. Manifest entry for `bfo_disjointness_map_axiom_emission` was authored alongside fixture; Cat 6 verified consistency.

### Cat 7 — Cross-Phase Plus Cross-Amendment Cross-Reference Verification

- **Inputs**: Cycle artifacts citing prior cycle artifacts; cross-references between same-cycle artifacts (routing artifact ↔ verification ritual report ↔ entry packet § amendments)
- **Verification mode**: STRUCTURAL only. Does the cited prior artifact exist at the named path? Does the cross-reference at one artifact match the cross-reference at the other? Does NOT verify the cited content's actual semantic match.
- **Veto criteria**: Cross-reference dangles (cited artifact doesn't exist), OR cross-references are asymmetric (artifact A claims B references A, but B doesn't)
- **Cadence**: Single (pre-routing)
- **Representative case**: Q-4-Step5-A Catch 4 contributed via Cat 7 dimension — the `relatedADRs` citation surface was a cross-reference verification surface; the conflation surfaced through multi-surface comparison.

### Cat 8 — Multi-Canonical-Source Verification

- **Inputs**: Path-fence-authored artifacts citing canonical sources (BFO-2020 OWL IRIs, CCO IRIs, ADR registries, spec sections); the canonical sources themselves
- **Verification mode**: STRUCTURAL primarily (do cited IRIs and canonical-source references resolve?). Some semantic coverage when cross-source consistency check applies (e.g., IRI in `arc/core` matches IRI in fixture).
- **Veto criteria**: Cited canonical source doesn't resolve, OR multi-source citations are inconsistent (same concept cited with different IRIs across sources)
- **Cadence**: TWO-cadence operation:
  - Pre-routing cadence: structural verification (shape plus cross-reference)
  - At-vendoring-analog-time cadence: canonical-value confirmation at Developer Pass 2b commit-time fetch plus `[VERIFY]` marker flip
- **Representative case**: Q-4-Step4-A Catch 3 plus Q-4-Step5-A Catch 4 plus Q-4-Step6-A Catch 5 contributed via Cat 8 dimension (IRI verification plus ADR-registry verification plus canonical-source-content verification). Q-4-Step6-A Catch 6 was attributed via Cat 8 for routing purposes (closest existing category) but the catch's failure mode actually surfaced the Cat 10 candidacy boundary — canonical attribution is Cat 10 candidacy below. Cat 8 captured Catch 6 only because Cat 10 didn't exist yet at the time of routing.

### Cat 9 Candidacy — Cited-Content Consistency

- **Boundary that surfaces it**: Reference-existence (Cat 1–7) holds: reference target exists at named location. Reference-consistency (Cat 9) verifies that the actual content at that location matches what the citing artifact asserts. Cat 9 ≠ Cat 1 (Cat 1 = does §N.M exist; Cat 9 = does §N.M's content match the cited framing?).
- **Surface that surfaced it**: Q-4-Step5-A Miss 1 (2026-05-14) — `canary_connected_with_overlap` cited spec §3.4.1 in `relatedSpecSections`; spec §3.4.1 exists (Cat 1 passes); but fixture's `requiredPatterns[1]` asserted `overlaps → connected_with` axiom NOT in §3.4.1's ratified axiom set (§3.4.1 ratifies reflexivity plus symmetry plus parthood-extension). Q-4-G phase-boundary retroactive batch ritual reported 0 Cat 7 findings on this fixture; reference-existence held; reference-consistency failed. Developer-side Step 5 implementation reconnaissance caught what ritual missed.
- **Forward-tracked**: Phase 4 exit retro candidate #1 per Q-4-Step5-A Meta-observation ruling plus Q-4-Step5-A Pass 2b Banking 5
- **Note for Daemon Team**: The ADR-012 ghost case (Spec 06) is the canonical Cat 9 fixture. When v2.7.0+ implements Cat 9, the ADR-012 ghost is the anchor test case.

### Cat 10 Candidacy — Type-Field-Structure Consistency

- **Boundary that surfaces it**: @type-string-existence (Cat 5) holds: @type "X" is in canonical type union. Type-field-structure-consistency (Cat 10) verifies that the object's field shape matches the canonical interface declaration's field shape. Cat 10 ≠ Cat 5 (Cat 5 = does "X" exist as canonical @type; Cat 10 = does the X-tagged object's field shape match X's interface declaration?).
- **Surface that surfaced it**: Q-4-Step6-A Miss 2 (2026-05-14) — both `regularityCheck` fixtures' rbox used `{ "@type": "SubObjectPropertyOf", subPropertyChain: { "@type": "ObjectPropertyChain", properties: [...] } }`. "SubObjectPropertyOf" exists as canonical OWL @type (Cat 5 passes); "ObjectPropertyChain" exists as canonical OWL @type (Cat 5 passes). But `src/kernel/owl-types.ts:210-214` declares `SubObjectPropertyOfAxiom` with `subProperty: string` (single IRI; NO chain field); `ObjectPropertyChainAxiom` is a top-level RBoxAxiom with `chain: string[]` plus `superProperty: string` (not nested under SubObjectPropertyOf). Field shape mismatch caused lifter `IRIFormatError` at Developer Pass 2b activation-time ritual run; Catch 6.
- **Forward-tracked**: Phase 4 exit retro candidate #6 per Q-4-Step6-A Pass 2b corrective sub-amendment §8.4

## Implementation guidance for Daemon Team

### Agent contract structure

The `verification-ritual` agent's frontmatter should declare:

```yaml
name: verification-ritual
surface: verification
categories_path: surfaces/verification/categories/
mode: hybrid  # deterministic + LLM
required_outputs:
  - per_category_result: list of {category_id, status: pass|veto|miss, evidence}
  - overall_status: pass|veto
  - new_candidacies: list of {boundary_description, surfacing_case}
tools: Read, Grep, Glob
```

Each category is a separate file under `surfaces/verification/categories/cat-NN-name.md` with:

- The four fields specified in §"Core structure"
- An `implementation_mode: deterministic | llm | hybrid` field
- For deterministic categories: a Python predicate signature
- For LLM categories: a prompt template
- For hybrid: both, with deterministic running first

### Deterministic versus LLM split (Logic Team's categories)

- Cat 1, 2, 3, 4, 5, 6, 7: deterministic. Structural lookups against frozen contracts.
- Cat 8: hybrid. Pre-routing cadence deterministic (does the IRI resolve to a known canonical source?); at-vendoring-analog-time cadence may require canonical-source content fetch (deterministic) plus consistency comparison (deterministic for strict equality; LLM for semantic equivalence).
- Cat 9 candidacy: LLM-required. Semantic consistency comparison is the category's entire purpose.
- Cat 10 candidacy: deterministic. Structural shape match against TypeScript interface declarations.

### CPS hook integration

The CPS hook should fail commit-finalize on any verification-ritual veto. The veto payload should include per-category status so downstream agents (and operators) can see which category vetoed and why.

### New candidacy handling

When the verification-ritual agent detects a pattern that no current category covers, it emits a `new_candidacies` entry in its output. This entry is recorded as a `forward_track` audit event (per Spec 07's Forward-Track Surface) with `subject.type: candidacy` and `sub_surface: internal-methodology-refinement`. The candidacy accumulates evidence across cycles; phase-exit retro consolidates and may promote candidacy to ratified category.

### Two-cadence operation handling

Cat 8 (and any future two-cadence categories) requires the verification-ritual agent to run twice in the routing pipeline:

- Pre-routing run: structural checks only, blocks routing on veto
- Activation-time run (at commit-finalize): canonical-value confirmation, blocks commit-finalize on veto

The agent should emit different output payloads for each cadence so the CPS hook can route the veto to the correct stage.

## Open questions / extension points

- **Cat 9 implementation will require an LLM judge that can disagree with itself across runs.** Per the original directive: any Cat 9 verdict that changes downstream state should require a second-pass `adversarial-critic` dispatch. v2.8.0 implementation should specify this concretely.

- **Cat 10 implementation depends on canonical interface declarations being machine-readable.** Logic Team's instance uses TypeScript `.ts` files for canonical interfaces; the verification-ritual agent will need to parse TypeScript to check field-structure consistency. For subject projects not using TypeScript, the canonical interface declaration substrate is open.

- **Category-expansion governance.** The current evidence-grounded extension pattern is informal. Once the ritual runs at substrate speed, the rate of new candidacies may increase. Whether candidacies should require operator approval (via `awaiting_operator_decision`) or be auto-promoted on evidence threshold is an open governance question; v2.8.0 implementation should default to operator approval and revisit after observation.

- **Cross-surface cross-references.** Cat 7 verifies cross-references within and across cycles. Cross-references that span surfaces (e.g., a routing-cycle artifact referencing a banking from a different phase) may need their own category or may fit Cat 7 with extension. v2.8.0 implementation may surface this gap.

## Provenance

- Logic Team Input 1 (Cat 1–8 with inputs, structural-vs-semantic split, veto criteria, representative cases)
- Logic Team Input 1 (Cat 9 + Cat 10 candidacy notes, surfacing cases, forward-track status)
- `arc/AUTHORING_DISCIPLINE.md` "SME-Persona Verification of Vendored Canonical Sources" subsection
- Phase 4 cycle artifacts: Q-4-C amendment, Q-4-Step4-A, Q-4-Step5-A, Q-4-Step6-A
- Phase 3 production catches: Phase 3 Step 4 (Cat 4), Phase 3 Step 5 (Cat 1)
- Logic Team Input 5.1 (eight is not load-bearing; principle is "however many categories the canonical surfaces require")
