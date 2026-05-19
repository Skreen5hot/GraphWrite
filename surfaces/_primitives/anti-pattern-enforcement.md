---
primitive_id: anti-pattern-enforcement
short_name: Anti-Pattern Enforcement
introduced_in: v3.0 (final)
first_explicit_instance: retro-surface anti-pattern framework (v3.0-alpha.2 fnsr_daemon.py CPS extension)
related_primitives:
  - bounded-authority-orchestrator
  - episodic-to-semantic-promotion
canonical_reference: ariadne/archive/specs/MAREP-v2.2/MAREP_v2.2.md §17 (first explicit instance) + MAREP_INTEGRATION_SPEC §6 (substrate-mechanical enforcement)
---

# Anti-Pattern Enforcement — substrate primitive

## What it is

A discipline for converting **named LLM failure modes into substrate-mechanical refusals**: each anti-pattern is paired with a structural detector that fires before the agent's output reaches state.jsonld. The pattern's value is that the substrate (deterministic Python) decides whether an output exhibits the anti-pattern, not the LLM that produced the output.

The pattern is substrate-wide. It applies wherever the substrate accepts free-text-bearing outputs from LLM workers and the operator can describe failure modes structurally enough that a deterministic detector exists. The first explicit substrate instance is the retro-surface anti-pattern framework (v3.0-alpha.2; persona theater, redundant affirmation, freeform brainstorm drift). Future instances are inevitable as additional LLM-bearing surfaces ratify their own behavioral constraints.

This document is the substrate's canonical specification of the anti-pattern enforcement pattern. Documents referencing "the anti-pattern framework" or "substrate-mechanical behavioral discipline" cite this primitive.

## The three structural properties (MUST hold for every anti-pattern instance)

An anti-pattern is part of this framework only when the operator can name all three properties for it. Naming fewer than three means the operator has identified a *concern*, not yet a substrate-enforceable anti-pattern.

### 1. Forbidden behavior is named at the LLM-output level

The anti-pattern is a property of the agent's **emitted output**, not of the agent's reasoning. The substrate cannot inspect reasoning; it inspects what the agent emits. "Don't think about X" is not enforceable. "Don't write `@<agent-name>` in narrative text" is enforceable because the emitted output either contains that pattern or doesn't.

### 2. A deterministic detector exists

The substrate refuses to embed LLM judgment in the enforcement path. Every anti-pattern has a Python function — typically `_check_no_<antipattern>` — that takes the agent's output and either returns silently (no hit) or raises `ContainmentVeto` (hit). The detector is pure Python: regex matching, length comparison, similarity calculation, structural traversal. No LLM dispatch in the detector path.

This property is what distinguishes anti-pattern enforcement from soft guidelines documented in agent prompts. Prompt-level guidance ("don't drift into freeform brainstorm") relies on the LLM's compliance; substrate-mechanical enforcement does not. The detector decides; the LLM cannot argue.

### 3. The detection fires as a structured-error veto

When the detector fires, the substrate produces a `ContainmentVeto` exception that lands in the existing CPS check infrastructure. This means:

- The output never reaches state.jsonld
- The task's status becomes `blocked` (no automatic retry — anti-pattern violations are deterministic; retry produces the same result)
- A `rejected_outputs` audit entry is added with the veto reason
- The operator sees the structured error and decides the fix path (rescope the task, dispatch a different agent, edit the agent contract, adjust scope budget)

The veto integrates with the substrate's existing four-class miss taxonomy and CPS infrastructure. Anti-patterns become first-class structured failures.

## Why these three together (not "just a prompt-level rule")

Prompt-level behavioral rules and substrate-mechanical enforcement coexist; they are not redundant. But prompt-level rules alone fail three properties simultaneously:

| Property | Prompt-level rule alone | Substrate-mechanical enforcement |
|---|---|---|
| **Audit-trail honesty** | LLM judges whether it violated the rule; the violation may or may not appear in the audit chain depending on the LLM's self-report | Detector's veto + reason is a first-class audit entry; future operator can re-derive every detection |
| **Repeatability** | Same input + same prompt may produce a violation on one dispatch and not another; LLM compliance is probabilistic | Detector is deterministic Python; same input always produces same verdict |
| **Substrate-vs-procedure distinction** | The LLM is judging itself; substrate sees only what the LLM chooses to surface | Substrate decides; the LLM cannot extend its own scope by claiming compliance |

Soft prompt-level guidance has a role (preventing the agent from emitting the pattern in the first place; teaching the LLM the convention). But the substrate's safety guarantee requires the deterministic detector path. Implementers MUST treat anti-pattern enforcement as **prompt-level guidance + substrate-mechanical detection together** — never one without the other.

## How to instantiate an anti-pattern detector

For a behavioral constraint to enter the anti-pattern enforcement framework:

### 1. Author the agent-side prompt guidance

The agent's prompt names the anti-pattern explicitly. The agent reads it, internalizes it, and aims to emit outputs that satisfy the constraint. Example (from MAREP-Orchestrator's prompt):

> "Do not use `@<agent>` addresses in narrative text (only in designated reference fields like `confirmed_by`, `contested_by`, `owner`)."

### 2. Author the detector function

A Python function in `fnsr_daemon.py`:

```python
def _check_no_<antipattern>(
    task: dict[str, Any], outputs: dict[str, Any],
    <optional config>,
) -> None:
    """Per <canonical reference>. <one-line description of detection logic>.
    Raise ContainmentVeto on hit.
    """
    # Pure Python detection logic
    if <violation detected>:
        raise ContainmentVeto(
            f"<antipattern_slug>: <structured reason with evidence>"
        )
```

### 3. Wire the detector into cps_check

Inside `cps_check`, dispatch the detector when the surface scope applies:

```python
if _is_<surface>_task(task) and agent_name:
    config = _agent_anti_pattern_config(agent_name)
    _check_no_<antipattern>(task, proposed_outputs, ...)
```

Most anti-patterns are surface-scoped (retro vs verification vs synthesis), but a few (like semantic-memory-immutability) may be substrate-wide. The scoping is at wire-time, not detector-time; the detector itself only knows how to detect, not when to dispatch.

### 4. Author a corpus-wide test (optional but recommended)

If the anti-pattern is part of a pattern-conformance discipline (e.g., "every retro-surface agent must respect length budgets"), add a test that walks the agent corpus and validates the discipline. Analog to `TestBaoBoundsValidation` and `TestReadOnlyContractValidation` from prior primitive instances.

## First instance: retro-surface anti-pattern framework (v3.0-alpha.2)

The first explicit substrate instance of this pattern. Per MAREP v2.2 §17, four anti-patterns:

| Anti-pattern | Detector | Why it matters |
|---|---|---|
| **Persona theater** | `_check_no_persona_theater` — regex scan for `@<agent>` in free-text fields outside designated reference fields | Retros drift into theatrical role-play when agents address each other in narrative; the structured `proposed_issues`/`confirmed_by`/`contested_by` fields are the substrate's audience-trail-honest alternative |
| **Redundant affirmation** | `_check_no_redundant_affirmation` — normalized Levenshtein similarity vs prior turn body; reject ≥ 0.85 | Multi-turn agent dispatches can echo the prior turn instead of advancing analysis; substrate measures and refuses |
| **Freeform brainstorm drift** | `_check_no_freeform_brainstorm` — length-budget enforcement + forbidden-conversational-connectives scan | Agents may exceed scope by writing prose where structured fields are required; length budgets + connective lists make the constraint mechanical |
| **Out-of-scope mutation** | `permitted_sections` enforcement in `retro-applier` + retro-state schema validation | Agents propose mutations outside their role's authorized scope; deterministic Python rejects per role binding |

Plus a **v3.0 final** addition (the second substrate-wide anti-pattern instance):

| Anti-pattern | Detector | Why it matters |
|---|---|---|
| **Semantic-memory mutation from retro** | `_check_no_semantic_memory_mutation` — inspect `changes[*].after` paths; refuse mutation of canonical paths from retro-surface tasks | Per the Episodic→Semantic discipline (`surfaces/_primitives/episodic-to-semantic-promotion.md`), retro turns must not directly edit ADRs / PLAYBOOK / spec files / CLAUDE.md — promotion goes through the deliberate ratification chain |

## Surfaces where this applies (substrate-wide pattern instances)

Each row below is an *instance* of the anti-pattern framework, not a separate primitive:

| Surface | Anti-pattern instances | First introduced |
|---|---|---|
| Retro | Persona theater, redundant affirmation, freeform brainstorm drift, out-of-scope mutation, semantic-memory mutation | v3.0-alpha.2 + v3.0 final |
| Verification | (potential) Citation-format drift, ADR-reference invention | v2.6.0 — RETROACTIVELY (`_check_adr_citations` is an instance of the anti-pattern framework predating the named pattern; satisfies all three properties) |
| Substrate-wide | Null outputs, structured-error envelope drift, required_outputs omission, awaiting-decision shape malformation | v2.1.0+ — RETROACTIVELY (substrate's pre-existing CPS infrastructure is the anti-pattern framework's foundation) |
| External-side-effect agents | Dirty-tree commit, protected-branch commit, hook-bypass without rationale | v2.9.0 (git-committer) — RETROACTIVELY (the safety-by-default+bypass-reason pattern is an anti-pattern instance) |

The framework's coherence comes from recognizing all of these as instances of one pattern. The substrate's CPS infrastructure has been doing anti-pattern enforcement since v2.1.0; v3.0-alpha.2 + v3.0 final make the pattern explicit so future surfaces inherit it deliberately.

## Why this primitive is named separately (relationship to CPS)

The Containment Prevention System (CPS) is the **substrate mechanism** that enforces anti-patterns at commit time. The anti-pattern framework is the **discipline** that decides which behavioral constraints get CPS treatment.

CPS is older (v2.1.0). The anti-pattern framework names it formally (v3.0). The primitive doc exists because:

- Future operators adding new behavioral constraints need a canonical pattern to follow
- The three structural properties (forbidden-at-output-level, deterministic-detector, structured-error-veto) are non-obvious and load-bearing
- Without the named pattern, future constraints risk being implemented as prompt-level rules alone, missing the substrate-mechanical half
- The relationship between anti-pattern detection and the Episodic→Semantic discipline + BAO bounds + read-only-by-contract pattern needs explicit articulation

## FNSR-relevance

The synthetic moral person project requires behavioral constraints at every level where the apparatus may act on its own. Moral deliberation, normative judgment, and operator-mediated decisions all need anti-pattern enforcement: certain emission patterns must be refusable at machine speed without re-litigating the constraint each time it surfaces.

The anti-pattern framework establishes the substrate-side precedent: every constraint that matters becomes (a) prompt-level guidance for compliance + (b) a deterministic detector for failure + (c) structured audit-chain evidence when detection fires. The three together produce a normative apparatus that is **enforceable, auditable, and operator-revisable** in equal measure.

The FNSR moral-person project will need anti-patterns at every layer:

- Moral-judgment anti-patterns (named failure modes of normative reasoning)
- Deliberation-process anti-patterns (named failure modes of group-decision protocols)
- Citation-and-grounding anti-patterns (named failure modes of evidence chains)
- Audit-honesty anti-patterns (named failure modes of operator-visible records)

Each one inherits the same three properties from this primitive. The substrate's existing anti-pattern enforcement framework is the precedent.

## Anti-patterns this primitive prevents (recursive case)

| Anti-pattern at the meta-level | Why it fails | This primitive's defense |
|---|---|---|
| Prompt-rule-only behavioral constraints | LLM-compliance dependent; audit-honesty + repeatability fail | Three-property test refuses framework inclusion unless a deterministic detector exists |
| Detection without operator-visible audit | Detection happens but operator cannot review; substrate-vs-procedure distinction collapses | Structured-error veto requirement ensures every detection lands in audit chain |
| Per-surface anti-pattern fragmentation | Each surface invents its own enforcement mechanism; substrate cannot mechanically validate the discipline across surfaces | Primitive doc + corpus-wide test pattern (`TestBaoBoundsValidation` analog) enforce shared structural pattern |

## Implementation status

- **v2.1.0+**: CPS infrastructure (null outputs, structured-error envelope, required_outputs) — retroactively the first anti-pattern enforcement instances.
- **v2.6.0**: `_check_adr_citations` — retroactively another anti-pattern enforcement instance (ADR-NNN ghost class).
- **v2.9.0**: git-committer safety defaults — retroactively another anti-pattern enforcement instance (external-side-effect-agent class).
- **v3.0-alpha.2**: Retro-surface anti-pattern framework (persona theater, redundant affirmation, freeform brainstorm drift) — first explicit substrate instance with the framework name.
- **v3.0 final (THIS RELEASE)**: Anti-pattern primitive doc authored; `_check_no_semantic_memory_mutation` added as second substrate-wide anti-pattern enforcement instance (semantic-memory immutability from retro turns).
- **Future**: corpus-wide `TestAntiPatternFrameworkConformance` test that validates every detector's three structural properties; additional surface instances as ratified.

## Cross-references

- MAREP v2.2 §17 (canonical retro-surface anti-pattern enumeration)
- MAREP_INTEGRATION_SPEC §6 (substrate-mechanical enforcement contract)
- `surfaces/_primitives/episodic-to-semantic-promotion.md` (semantic-memory immutability anti-pattern lives at the boundary between these two primitives)
- `surfaces/_primitives/bounded-authority-orchestrator.md` (BAO substrate-enforcement bound is the BAO-side reflection of the anti-pattern framework)
- `fnsr_daemon.py` `_check_no_persona_theater`, `_check_no_redundant_affirmation`, `_check_no_freeform_brainstorm`, `_check_no_semantic_memory_mutation` — canonical detector implementations

## Provenance

- MAREP v2.2 §17 (canonical anti-pattern enumeration)
- v2.1.0 CPS infrastructure (retroactive first instance)
- v3.0-alpha.2 retro-surface anti-pattern framework (first explicit substrate instance)
- Aaron's CP2 observation #2 (anti-pattern checks in shared module structure; CP3 doc anchor confirmed)
- Aaron's CP3 greenlight observation #1 (anti-pattern framework becomes third substrate primitive doc; substrate-wide framing, not retro-particular)
