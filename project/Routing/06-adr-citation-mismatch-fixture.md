# Spec 06: ADR-Citation Mismatch Fixture — ADR-012 Ghost Case

**Status**: Test fixture, not a specification. Raw content from Logic Team Input 2 plus generalized framing.
**Source**: Q-4-Step5-A architect ruling 2026-05-14 (architect verbatim citation); `project/DECISIONS.md` line 777+ (canonical registry 1); `project/OFBT_spec_v0.1.7.md` §10 line 1407 (canonical registry 2).
**Implementation target**: v2.6.0 test suite (validates current ADR-existence CPS check behavior); v2.7.0+ Cat 9 anchor case (cited-content consistency).

## Purpose

This fixture documents the canonical ADR-citation mismatch case that motivated the v2.6.0 ADR-citation CPS check AND surfaces the gap that v2.6.0 does not yet cover. The Daemon Team should add this fixture to the v2.6.0 test suite to validate that v2.6.0 correctly handles the existence-level check, and use it as the anchor case for v2.7.0+ Cat 9 (cited-content consistency) implementation.

## The Ghost — Generalized Description

A path-fence-authored artifact (in this case, an architect ruling) cites a canonical reference identifier (ADR-NNN). The reference exists in one or more canonical registries. But the framing the citing artifact attaches to the reference matches NO registry entry. The citation is structurally valid (the reference exists) AND semantically invalid (the cited content doesn't match any registered content).

This is the boundary between Cat 2 (ADR cross-reference existence) and Cat 9 candidacy (cited-content consistency) in the verification ritual (per Spec 02).

## The Ghost — Logic Team's Specific Case

### (a) Architect Verbatim Citation

Source: Q-4-Step5-A architect ruling 2026-05-14, Q-4-Step5-A.1 ruling text anchor 1.

> 1. Spec governs in v0.1.7 freeze
>
> Spec §3.4.1's ratified axiom set is binding on Phase 4 implementation. The three ratified axioms (reflexivity, symmetry, parthood-extension) constitute the v0.1 Connected With semantic surface. The fixture's overlaps → connected_with requiredPattern is mathematically valid in BFO mereotopology but cites the wrong source: not §3.4.1.
>
> Per ADR-012 banked principle (Phase 2 close + reaffirmed across cycles): "Spec interpretation defaults to literal framing, not conservative emission strategy." Spec-literal framing means the ratified axiom set is the binding source; mathematically-valid-but-unspec'd axioms route as fresh ratification, not as fixture assertions.

The architect cited "ADR-012 banked principle" carrying the framing: **"Spec interpretation defaults to literal framing, not conservative emission strategy."**

### (b) `project/DECISIONS.md` ADR-012 Actual Entry (Line 777+)

> **ADR-012: Cardinality routing — Direct Mapping with n-tuple matching (Option β)**
>
> Status: Accepted (architect ratification 2026-05-07 — Step 4 spec-binding routing cycle's Q-E ruling, captured in committed form 2026-05-07)
> Date: 2026-05-07 (architect ruling); 2026-05-07 (committed-form capture)
> Predecessors: ADR-007 §7 (cardinality lifting convention — Phase 1 Step 7's non-Horn FOL emission); Phase 2 entry packet §3.1 (cardinality fixture's reversible regime); Phase 2 entry packet §6.2 (Q6 three-tier schema-evolution discipline); Step 4 spec-binding routing cycle architect rulings 2026-05-07.
>
> Decision:
> Adopt Option β: Direct Mapping with n-tuple matching for cardinality patterns. Cardinality projects as native OWL Restriction axioms with the appropriate cardinality field (minCardinality / maxCardinality / cardinality) and qualified onClass filler if present. No Loss Signature emitted; the round-trip is byte-clean.

### (c) `project/OFBT_spec_v0.1.7.md` §10 ADR-012 Actual Entry (Line 1407)

> | ADR-012 | Blank node Skolemization via content-hash registry | Accepted |

### Ghost-Case Structure

The architect cited "ADR-012 banked principle (Phase 2 close + reaffirmed across cycles)" carrying the framing "Spec interpretation defaults to literal framing, not conservative emission strategy." Neither registry entry matches that framing:

- `DECISIONS.md` ADR-012 (line 777): "Cardinality routing — Direct Mapping with n-tuple matching (Option β)" — about cardinality, not spec-literal framing
- spec §10 ADR-012 (line 1407): "Blank node Skolemization via content-hash registry" — about blank nodes, not spec-literal framing

The "spec-literal framing" principle the architect cited is **verbally-banked**: an architect-banked principle from cumulative cycle work, explicitly mentioned at multiple Phase 2 + Phase 3 cycles, NOT formalized at either ADR registry. The mis-attribution conflates a verbal-banked principle with a numbered ADR.

### Correction Disposition

SME pre-routing correction at Q-4-Step5-A Pass 2b: fixture's `relatedADRs` field stripped the ADR-012 citation; the principle was moved to a new `relatedBankedPrinciples` field with a disambiguation note. The architect's verbatim transcription was preserved in the routing artifact per `arc/AUTHORING_DISCIPLINE.md` §11 discipline.

This correction is documented in the Q-4-Step5-A routing-cycle artifact and represents the production-time SME-self-error acknowledgment pattern (per Q-4-Step5-A Banking 6 — SME-self-error acknowledgment in routing artifacts preserves audit-trail honesty).

## Coverage Progression: v2.6.0 → v2.7.0+

### v2.6.0 behavior

v2.6.0's ADR-citation CPS check vetoes commit-finalize when canonical-doc proposals cite ADR-NNN values not registered in `project/DECISIONS.md`. For the ADR-012 ghost case:

- ADR-012 IS registered in `DECISIONS.md` (as "Cardinality routing")
- ADR-012 IS registered in spec §10 (as "Blank node Skolemization")
- v2.6.0 check evaluates: ADR-012 exists in canonical registry → PASS
- v2.6.0 does NOT veto the ADR-012 ghost case

This is correct behavior for v2.6.0. v2.6.0 implements Cat 2 (ADR cross-reference existence) per Spec 02. The ghost case is structurally valid at the existence level.

### v2.7.0+ behavior (Cat 9 candidacy implementation)

Once Cat 9 (cited-content consistency) is implemented as a verification-ritual category, the ADR-012 ghost case becomes vetoable:

- Cat 2 evaluates: ADR-012 exists in canonical registry → PASS (no change from v2.6.0)
- Cat 9 evaluates: does the citing artifact's framing match the registered content? → FAIL
  - The cited framing ("Spec interpretation defaults to literal framing, not conservative emission strategy") matches NEITHER `DECISIONS.md` ADR-012 ("Cardinality routing") NOR spec §10 ADR-012 ("Blank node Skolemization")
  - Cat 9 emits veto with detail: cited framing matches no registered content

The Cat 9 implementation requires LLM judgment for the framing-vs-content comparison. Per Spec 02's "Open questions / extension points": any Cat 9 verdict that changes downstream state should require a second-pass `adversarial-critic` dispatch to mitigate LLM-judge inconsistency across runs.

## Test Fixture Structure

For the v2.6.0 test suite:

```python
# tests/test_adr_and_awaiting.py (extension)

def test_adr_012_ghost_v260_behavior():
    """
    v2.6.0 ADR-citation CPS check correctly PASSES the ADR-012 ghost case.
    The ADR exists in DECISIONS.md (structural existence check passes).
    The framing mismatch is Cat 9 candidacy, not v2.6.0 scope.
    """
    architect_output = {
        "outputs": {
            "status": "ratified",
            "ruling": "...Per ADR-012 banked principle (Phase 2 close + reaffirmed across cycles): 'Spec interpretation defaults to literal framing, not conservative emission strategy.'..."
        }
    }
    decisions_md_adr_012 = "ADR-012: Cardinality routing — Direct Mapping with n-tuple matching (Option β)"
    spec_section_10_adr_012 = "| ADR-012 | Blank node Skolemization via content-hash registry | Accepted |"

    result = cps_adr_citation_check(architect_output, decisions_md_adr_012, spec_section_10_adr_012)

    # v2.6.0 expected: ADR-012 exists in registry, so structural check passes
    assert result.vetoed == False
    assert result.reason == "adr_exists_in_canonical_registry"
```

For the v2.7.0+ test suite (when Cat 9 is implemented):

```python
def test_adr_012_ghost_cat9_behavior():
    """
    v2.7.0+ Cat 9 (cited-content consistency) correctly VETOES the ADR-012 ghost case.
    The ADR exists (Cat 2 passes) but framing matches no registered content (Cat 9 fails).
    """
    # ... same architect_output, decisions_md_adr_012, spec_section_10_adr_012 ...

    result = cat9_cited_content_consistency_check(
        architect_output,
        canonical_sources=[decisions_md_adr_012, spec_section_10_adr_012]
    )

    # v2.7.0+ expected: framing doesn't match any registered content
    assert result.vetoed == True
    assert result.category == "cat_9_cited_content_consistency"
    assert "framing_matches_no_registered_content" in result.reason

    # Adversarial-critic second-pass dispatch (per Spec 02)
    critic_result = adversarial_critic_dispatch(result)
    assert critic_result.confirms_veto == True
```

## Generalization Notes

This fixture documents a specific instance of a generalizable pattern: **a canonical reference identifier exists in multiple registries, but the citing artifact's framing matches none of them**. The pattern extends to:

- Cross-spec citations where the cited section exists but its content doesn't match the citing framing (Cat 9 candidacy in Spec 02; surfaced by Q-4-Step5-A Miss 1)
- Cross-fixture citations where the cited fixture exists but its `expectedOutcome` doesn't match the citing framing (Cat 6 Manifest Mirror surfaces this at the existence level; Cat 9 generalizes)
- Cross-Q-ruling citations where the cited Q-ruling exists but its content doesn't match the citing framing (Cat 3 surfaces this at the existence level; Cat 9 generalizes)

The ADR-012 ghost is the canonical anchor case for all of these because:

1. It is a confirmed production instance with raw verbatim citation, registry entries, and verbatim correction disposition
2. It surfaced the Cat 9 candidacy as a phase-exit retro candidate (Phase 4 exit retro candidate #1 per Q-4-Step5-A Pass 2b Banking 5)
3. Pattern repetition (Q-4-Step6-A Catch 5 with ADR-011 in similar configuration) confirmed the parallel-registry-reconciliation forward-track candidacy

## Provenance

- Logic Team Input 2 (raw content: architect verbatim citation; DECISIONS.md line 777 entry; spec §10 line 1407 entry; ghost-case structure; SME pre-routing correction disposition)
- Q-4-Step5-A architect ruling 2026-05-14
- `project/DECISIONS.md` line 777+
- `project/OFBT_spec_v0.1.7.md` §10 line 1407
- Q-4-Step5-A Pass 2b Banking 5 (Cat 9 candidacy phase-exit retro candidate #1)
- Q-4-Step5-A Banking 6 (SME-self-error acknowledgment in routing artifacts preserves audit-trail honesty)
- Q-4-Step6-A Catch 5 (ADR-011 pattern repetition strengthening parallel-registry-reconciliation forward-track candidacy)
