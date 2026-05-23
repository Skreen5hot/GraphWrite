---
surface_id: feedback-rounds
question_scope: "How does a stakeholder feedback payload get faithfully decomposed, adjudicated, implemented, and verified such that every atomic provision is traceable from receipt to landed artifact?"
audit_trail_unity: "One STATE.jsonld per feedback-round instance, chain-hashed, append-only. Each atomic item carries its own adjudication record, completeness map, and reconciliation status."
phases_path: surfaces/feedback-rounds/phases/
agents_path: surfaces/feedback-rounds/agents/
status: draft
---

# FNSR Protocol Spec 08 -- Stakeholder Feedback Round Protocol

**Status**: Draft. Empirical motivation: demo/FEEDBACK.md Item J + OPERATOR-MEDIATION-LOG.md Events 9--12.
**Implementation target**: v3.2+ (state_admin commands, agent contracts, and daemon hooks are downstream chains).

## Purpose

Stakeholder feedback typically arrives as a bundled payload -- a single artifact listing multiple concerns, proposals, and requests. Ad-hoc processing introduces predictable failure modes: provisions get partially implemented, provision halves get lost, and no mechanism verifies that every stated concern was honored before the phase closes.

This protocol defines the **Stakeholder Feedback Round** -- a surface-level discipline for processing feedback payloads with the same rigor that Pass 2a/2b applies to individual changes. Two structural guarantees:

1. **Atomic decomposition before adjudication.** The payload must be decomposed into atomic, independently-trackable provisions before any adjudication or implementation chain is dispatched.
2. **Reconciliation after implementation.** After chains run, a reconciliation pass verifies that every provision's completeness map was honored.

**Distinct from:**

- **Retro surface (MAREP v2.2)**: retros are backwards-looking deliberation about a body of completed work. Feedback rounds are external-input processing with forward-looking adjudication and implementation tracking.
- **Pass 2a/2b (Spec 03)**: Pass 2a gates individual changes at the architectural level. Feedback rounds operate at the payload level -- decomposing payloads into items, each of which then follows the normal Pass 2a/2b chain.
- **Banking (Spec 05)**: bankings record observations about the protocol. Feedback rounds process stakeholder input into implemented provisions.

## Empirical motivation

Item J in demo/FEEDBACK.md contained two independent provisions: J1 (rdfs:label collision detection in AddTermDialog.tsx) and J2 (starter-term population via buildNewDocument() in App.tsx). Both were classified under one "Amend" heading in FEEDBACK-RESPONSE.md without atomic decomposition.

The developer chain ran against the bundled item. J1 landed in Phase 3 (confirmed by WALKTHROUGH-PHASE-3.md and OPERATOR-MEDIATION-LOG.md Event 12 work log). J2 has no Phase 3 committed-work record -- no test-count attribution, no walkthrough step, no commit mention. No completeness map existed to make the gap visible. No reconciliation pass ran to detect the missing provision.

This is the canonical empirical instance of the failure mode this protocol prevents. The protocol's three mandatory phases -- Atomic Decomposition (Phase 2), Completeness Map (Phase 4), and Reconciliation (Phase 7) -- each address a structural cause of the J2 loss.

OPERATOR-MEDIATION-LOG.md Events 9 and 12 document two additional substrate failure modes (wrong escalation shape via outputs.error; awaiting_operator_decision bypass not honoring the required_outputs skip specified in CLAUDE.md section 7.6). These inform AP-6 in the Anti-patterns section below.

## Phases

Nine phases in order. Phase 05 is split into 05a (operator scoping) and 05b (architect gate) per the adjudication-authority separation described below. Per-phase spec files live under `surfaces/feedback-rounds/phases/` (stub files; v1 scope is this surface-spec.md only).

| Phase | Name | Entry | Exit |
|---|---|---|---|
| 01-capture | Capture | Round initiated; feedback payload artifact identified | All feedback items recorded verbatim in STATE.jsonld; no interpretation yet |
| 02-decompose | Atomic Decomposition | Phase 1 done | Every bundled item split into atomic single-provision units; each has a unique item_id + parent_item_id; provisional_kind assigned |
| 03-categorize | Categorize + Scope | Phase 2 done | Each item has: canonical kind (confirmed or overriding provisional_kind) + effort estimate (S/M/L/XL) + initial priority |
| 04-completeness-map | Completeness Map | Phase 3 done | Each item has an explicit completeness_map listing every artifact path that must be updated |
| 05a-adjudicate-scope | Operator Scoping | Phase 4 done | Operator has made a per-item decision: ratify / amend / defer; deferred items become Spec 07 forward-tracks (State A); adjudicated_by.operator recorded |
| 05b-adjudicate-gate | Architect Pass 2a Gate | Phase 5a done; all ratified/amended items have architect ratification tasks queued | Per-item Pass 2a ruling received; denied items blocked from Phase 06; adjudicated_by.architect recorded |
| 06-implement | Implementation | Phase 5b done; all ratified items have completeness maps and architect Pass 2a approval | Each ratified/amended item has dispatched a Pass 2b chain; all chains completed |
| 07-reconcile | Reconciliation | Phase 6 done | Each item's completeness_map entries verified; reconciliation_gaps recorded for any discrepancy |
| 08-close | Phase-Close Consumption | Phase 7 done; no open gaps OR all gaps explicitly deferred with forward-tracks | Canonical docs updated; round archived; phase-boundary may proceed |

**Critical ordering constraint**: Phase 02-decompose MUST complete before Phase 05a-adjudicate-scope. Adjudication over bundled items allows partial implementation; adjudication over atomic items forces independent tracking of every provision. This is the direct structural prevention of the Item J failure mode.

**Phase 05a/05b authority boundary**: Phase 05a is the operator's content-scope judgment (ratify/amend/defer). The operator owns this decision; no architect involvement at 05a. Phase 05b is the architect's Pass 2a gate on the implementation chain per Spec 03. The architect owns this gate; the operator does not override it. `adjudicated_by` is a two-actor field: `{operator: <id>, architect: <task-ref> | null}`. The operator field is populated at Phase 05a; the architect field is populated at Phase 05b when the Pass 2a ruling is received.

Phase transitions are operator-committed via `state_admin feedback-round phase-transition`. A feedback-round BAO orchestrator proposes transitions but does not commit them. Per `surfaces/_primitives/bounded-authority-orchestrator.md`, all four BAO bounds apply to this surface's orchestrator:

1. **Surface scope**: elevated authority extends only within the feedback-round surface; cross-surface actions require standard dispatch through the substrate.
2. **Substrate enforcement**: all outputs pass through CPS `required_outputs` check, structured-error veto, and surface-specific anti-pattern detection.
3. **Audit-chain visibility**: every proposal lands in the audit chain via normal dispatch; there are no off-chain state transitions.
4. **No substrate-level privilege**: the orchestrator cannot commit transitions, write directly to state.jsonld, or bypass dispatch ordering.

In v1, transitions are entirely operator-driven.

## Agent roles

| Agent | Phase(s) | Role | Substrate agent |
|---|---|---|---|
| `feedback-decomposer` | 02-decompose | Splits bundled payload into atomic single-provision items; read-only-by-contract; output: item_id + parent_item_id + provision + provisional_kind per item | New role candidate; may be a mode of `reconnaissance` or a dedicated agent (downstream decision) |
| `feedback-reconciler` | 07-reconcile | Verifies each implemented item's completeness map; records reconciliation_gaps; read-only-by-contract; MUST NOT propose fixes | New role candidate; may be a mode of `reconnaissance` or a dedicated agent (downstream decision) |
| `reconnaissance` | 04-completeness-map | Investigates which canonical artifact paths are touched by each atomic item | `.claude/agents/reconnaissance.md` |
| `architect` | 05b-adjudicate-gate, 06-implement | Pass 2a gating for each item's implementation chain; architectural ratification per Spec 03 | `.claude/agents/architect.md` mode: ratification |
| `developer` | 06-implement | Change proposals per ratified atomic item | `.claude/agents/developer.md` |
| `applier` | 06-implement | Apply developer changes to subject codebase | System agent |
| `feedback-round-orchestrator` | Phase transitions + coordination | BAO instance over the feedback-round surface (downstream); operator-driven in v1 | New BAO instance |

Full per-role permitted_sections are defined in `surfaces/feedback-rounds/agents/` (stub files; downstream chain).

### feedback-decomposer (new role candidate)

Takes a raw feedback payload; emits a list of atomic items. Each item carries: `item_id`, `parent_item_id` (the source feedback item this was decomposed from), `provision` (the single claim or request in plain text), and `provisional_kind` (bug-report | enhancement-request | spec-gap | editorial | data-discipline | ux-concern). The `provisional_kind` is Phase 02's preliminary classification; Phase 03 confirms or overrides it to produce the canonical `kind`. See Item shape for the merge rule.

The agent MUST NOT adjudicate, MUST NOT modify canonical docs, and MUST NOT produce implementation proposals. Its sole output is the decomposed item list. This is the read-only-by-contract pattern per Spec 03's reconnaissance precedent.

### feedback-reconciler (new role candidate)

Verifies, after implementation, that each atomic item's completeness map was honored. For each item with `adjudication: ratify | amend`, it checks whether every artifact in the completeness_map was updated consistently with the item's provision. On discrepancy: records a `reconciliation_gap` -- never silently passes. MUST NOT propose fixes; a reconciliation_gap triggers a re-entry implementation chain (see Phase 06 re-entry below). Also read-only-by-contract.

## State persistence

State file path: `feedback-rounds/<round-id>/STATE.jsonld`.

Chain-hashed via the substrate's `hiri_sign` mechanism; append-only; one file per feedback-round instance. Parallel structure to `retros/<retro-id>/RETRO_STATE.jsonld`. Override directory via `FNSR_FEEDBACK_ROUND_DIR` env var (implementation-time decision; analog of `FNSR_RETRO_DIR`).

### Top-level shape

```
{
  "@context": "urn:fnsr:feedback-round:v0.1",
  "@id": "urn:fnsr:feedback-round:<round-id>",
  "status": "active | closed | archived",
  "phase": "01-capture | 02-decompose | 03-categorize | 04-completeness-map | 05a-adjudicate-scope | 05b-adjudicate-gate | 06-implement | 07-reconcile | 08-close",
  "source_payload_path": "<path to feedback artifact>",
  "items": [],
  "audit": []
}
```

**@context note**: `urn:fnsr:feedback-round:v0.1` is an internal namespace placeholder using the URN-based scheme consistent with the retro state (`urn:fnsr:retro:`). The v0.1 URI `https://fnsr.io/feedback-round/v0.1` was inconsistent with both the `fnsr.example` placeholder domain (main state) and the `urn:fnsr:` URN scheme (retro state). Operator MUST decide the canonical @context scheme policy before v1 implementation; see Open questions item 7.

### Item shape

```
{
  "item_id": "<string>",
  "parent_item_id": "<string | null>",
  "provision": "<plain-text single provision>",
  "provisional_kind": "bug-report | enhancement-request | spec-gap | editorial | data-discipline | ux-concern | null",
  "kind": "bug-report | enhancement-request | spec-gap | editorial | data-discipline | ux-concern | null",
  "effort": "S | M | L | XL | null",
  "priority": "high | medium | low | deferred | null",
  "adjudication": "ratify | amend | defer | null",
  "adjudication_note": "<string | null>",
  "adjudicated_by": {
    "operator": "<operator-id | null>",
    "architect": "<task-ref | null>"
  },
  "completeness_map": [
    {
      "artifact_path": "<path>",
      "artifact_kind": "spec-section | fr | roadmap | impl-plan | source-module | spec-test | playwright-test | demo-material | walkthrough-doc | other",
      "section_ref": "<string | null>",
      "verified": false,
      "verified_by_task": "<task-id | null>"
    }
  ],
  "implementation_task_ids": [],
  "touches_ontology_content": false,
  "sme_verdict": "confirm | confirm-with-detail | dispute | null",
  "sme_verdict_note": "<string | null>",
  "reconciliation_status": "pending | verified | gap | skipped | null",
  "reconciliation_gaps": [
    {
      "artifact_path": "<path>",
      "gap_description": "<what was expected vs what was found>"
    }
  ],
  "forward_track_id": "<string | null>"
}
```

**provisional_kind / kind merge rule**: Phase 02 MUST set `provisional_kind`; `kind` remains null at Phase 02 exit. Phase 03 MUST set `kind` to the confirmed or overriding value; `kind` is canonical at Phase 03 exit and onward. `provisional_kind` is retained in the item shape after Phase 03 for audit traceability.

**reconciliation_status: skipped**: indicates the item was adjudicated `defer` in Phase 05a. Reconciliation is not applicable to deferred items (no implementation chain was dispatched); `reconciliation_status` MUST be set to `skipped` when Phase 07 processes a deferred item.

**adjudicated_by field**: Two-actor field per Phase 05a/05b split. `operator` is set at Phase 05a (populated by `state_admin feedback-round adjudicate --adjudicated-by <operator-id>`); `architect` is the task-ref for the Pass 2a ruling task, set at Phase 05b. Both are null until the respective phase completes.

**touches_ontology_content field (v0.3)**: A boolean classification set at Phase 02 (Atomic Decomposition) and verifiable at Phase 03 (Categorize). True when the atomic provision involves IRIs, semantic categories, namespace bindings, RDF/OWL/RDFS vocabulary, term-type classification, validator-code semantics, or any other ontological content where canonical-form correctness depends on OWL 2 DL / RDF 1.1 conformance. False when the provision is purely UI polish, build configuration, or other non-ontological work. When true:

- Phase 03 outputs MUST include the recon-stage classification + an SME pre-verdict (recon may invoke semantic-sme inline during Phase 02-03; the decomposition document records the verdict before reaching Phase 05a).
- Phase 06 implementation chain MUST insert a `semantic-sme` task UPSTREAM of the developer task (chain shape: `recon → semantic-sme → developer → architect → applier → test-runner`). This ensures the developer's authoring is constrained by SME guidance, not retrofit post-implementation.
- Phase 07 reconciliation MUST verify the SME's verdict was honored in the landed artifact (no override without explicit operator decision recorded in `sme_verdict_note`).

**sme_verdict / sme_verdict_note fields (v0.3)**: Populated when `touches_ontology_content` is true. Possible values: `confirm` (SME agrees with the atomic provision as stated), `confirm-with-detail` (SME agrees but adds clarifying constraints or surfaces adjacent gaps), `dispute` (SME disputes the ontological soundness with rationale). When `dispute`, Phase 05a operator adjudication SHOULD weight the SME's rationale; the operator MAY override but the override MUST be recorded in `sme_verdict_note`.

## Schema Extensions

The following extend Spec 07 forward-track field enumerations. Registered here for implementers.

### subject.type: feedback-round-item

`feedback-round-item` is a new value for the `subject.type` field in Spec 07 forward-tracks. Deferred feedback-round items MUST use `subject.type: feedback-round-item` when creating forward-tracks via `state_admin feedback-round forward-track`. The existing registered values (`banking | fixture | capability | candidacy | other`) remain valid.

**Transitional use**: Until the `state_admin forward-track create --subject-type` CLI is updated to accept `feedback-round-item`, operators MAY use `--subject-type other` as a transitional value. The CLI update is downstream substrate work tracked alongside Spec 08 implementation.

### declaration_kind: operator_deliberate_deferral

`operator_deliberate_deferral` is the `declaration_kind` value used when a deferred feedback-round item is promoted to a Spec 07 forward-track. `declaration_kind` is treated as an open string value per existing convention (canonical-value-list is informative, not closed). Registered canonical values as of v3.1.0: `operator_authoritative`, `operator_deliberate_promotion`, and (added by this spec) `operator_deliberate_deferral`.

## Audit event shapes

All events appended to `STATE.jsonld.audit[]`; chain-hashed per `hiri_sign`. All events include `round_id`, `timestamp` (ISO-8601), and `chain_hash` (sha-256).

| Event | Required fields (beyond common) |
|---|---|
| `feedback_round_initiated` | anchor_task_id, source_payload_path, phase_origin |
| `atomic_item_decomposed` | item_id, parent_item_id, provision, provisional_kind, decomposed_by_task |
| `completeness_map_declared` | item_id, completeness_map[], declared_by_task |
| `item_adjudicated` | item_id, adjudication (ratify / amend / defer), adjudication_note, adjudicated_by ({operator, architect}) |
| `item_implemented` | item_id, implementation_task_ids[] |
| `item_reconciled` | item_id, reconciliation_status, reconciliation_gaps[] |
| `feedback_round_closed` | items_ratified, items_deferred, items_verified, items_with_gaps, forward_track_ids[] |

The six events `feedback_round_initiated`, `atomic_item_decomposed`, `item_adjudicated`, `item_implemented`, `item_reconciled`, and `feedback_round_closed` are the primary named events per this spec. `completeness_map_declared` is a required additional event for Phase 4 traceability.

## Operator commands

Full implementation is downstream substrate work (v3.2+). This section is the command-surface contract spec for implementers.

```
state_admin feedback-round init <round-id>
    --anchor-task <task-id> --source-payload <path> [--phase-origin <phase-id>]
```
Initializes STATE.jsonld; emits `feedback_round_initiated`; sets status=active, phase=01-capture.

```
state_admin feedback-round phase-transition <round-id>
    --to-phase <phase> --rationale "..."
```
Operator-commits a phase transition after confirming exit criteria. Analog of `state_admin retro phase-transition`.

```
state_admin feedback-round decompose <round-id> --from-task <task-id>
```
Merges feedback-decomposer agent output into STATE.jsonld items[]; emits `atomic_item_decomposed` per item. Operator reviews before committing.

```
state_admin feedback-round map <round-id> --item-id <id> --from-task <task-id>
```
Merges completeness map from reconnaissance agent output; emits `completeness_map_declared`.

```
state_admin feedback-round adjudicate <round-id>
    --item-id <id> --decision {ratify|amend|defer}
    [--adjudicated-by <operator-id>] [--note "..."]
```
Records Phase 05a operator scoping decision for a single atomic item; emits `item_adjudicated` with `adjudicated_by.operator` set. `adjudicated_by.architect` is null until Phase 05b completes. Deferred items require a `forward-track` sub-command before `close` is allowed.

```
state_admin feedback-round implement <round-id>
    --item-id <id> --task-ids <id1,id2,...>
```
Records the implementation chain task IDs for a ratified item; emits `item_implemented`.

```
state_admin feedback-round reconcile <round-id> --from-task <task-id>
```
Merges feedback-reconciler agent output; emits `item_reconciled` per item.

```
state_admin feedback-round close <round-id> --anchor-task <task-id>
```
Closes the round; emits `feedback_round_closed`; sets status=closed. **Refuses** if any item has `reconciliation_status: gap` without an explicit forward-track.

```
state_admin feedback-round forward-track <round-id>
    --item-id <id> --deliberation-cycle <cycle-id>
```
Creates a Spec 07 forward-track (State A) with `subject.type: feedback-round-item`, `declaration_kind: operator_deliberate_deferral`; links the item's `forward_track_id` field. See Schema Extensions for transitional `--subject-type other` use.

```
state_admin feedback-round status <round-id>
```
Read-only display: current phase, per-item status table, open reconciliation gaps.

```
state_admin feedback-round list [--include-archived]
```
Lists all feedback rounds with phase + status summary.

## Integration with Spec 07

### Deferred items become forward-tracks

When an atomic item is adjudicated `defer` in Phase 05a, it MUST become a Spec 07 forward-track in State A via `state_admin feedback-round forward-track`. The item's `forward_track_id` field provides bidirectional traceability between the STATE.jsonld item record and the forward-track audit event in state.jsonld. Deferred items MUST use `subject.type: feedback-round-item` and `declaration_kind: operator_deliberate_deferral` per the Schema Extensions section.

### Sub-surface placement

Deferred items MUST map to one of the two existing Spec 07 sub-surfaces: `consumer-closure-path` (consumer-facing provisions -- features, fixes, UX concerns visible to end users) or `internal-methodology-refinement` (protocol-internal provisions). Spec 07's open question "Sub-surface emergence governance" explicitly anticipates a stakeholder-feedback queue as a possible third sub-surface; if usage patterns demonstrate a distinct audience semantic, register via `awaiting_operator_decision` per that section.

### Phase-boundary ordering and inheritance

`state_admin feedback-round close` MUST precede `state_admin phase-boundary` for the associated phase. The `close` command MUST refuse if any item has `reconciliation_status: gap` without an explicit forward-track -- this blocks the phase-boundary declaration. Once all gaps are either verified or forward-tracked as deferred, `close` succeeds; `phase-boundary` may proceed.

At a phase boundary, unresolved feedback-round forward-tracks MUST inherit via `state_admin forward-track inherit`. Recommended sequence at phase-close: `feedback-round close` then `forward-track inherit` then `phase-boundary`.

**Principle**: a phase MUST NOT close while its feedback round has open, unaccounted provisions. This is the substrate-level enforcement of the lesson from Item J's Phase 3 close.

## Phase 06 re-entry after reconciliation gap

When Phase 07-reconcile records `reconciliation_status: gap` for an atomic item, the item's implementation chain did not fully honor its completeness map. The operator MAY queue a re-entry implementation chain against that item:

1. Review `reconciliation_gaps[]` for the affected item -- each entry names `artifact_path` and `gap_description`.
2. Queue a new Pass 2a/2b chain for each gap item (same pattern as Phase 06 original implementation). Phase 04 completeness-map update and Phase 05 re-adjudication are NOT required unless the completeness map itself needs amendment; original adjudications remain in effect.
3. If the completeness map is incomplete (missing artifact paths), update it via a supplementary `completeness_map_declared` audit event before the re-entry chain runs.
4. After re-entry chains complete, dispatch `feedback-reconciler` again targeting gap items only. This is a sub-cycle within Phase 07; the round phase does not reset to 06-implement.
5. If reconciliation verifies, `reconciliation_status` updates to `verified`. If a new gap is recorded, the loop repeats from step 1.

**Close gate**: the `close` command MUST continue to refuse while any item has `reconciliation_status: gap`. Re-entry loops run to resolution or explicit deferral with a forward-track.

**Audit trail**: re-entry implementation task IDs link to the original item via `item_id` in `implementation_task_ids[]`. The `item_reconciled` event for the re-run appends to the audit chain (append-only; prior gap record is not deleted).

## Substrate primitives this surface uses

- **Bounded-Authority Orchestrator (BAO)** -- `surfaces/_primitives/bounded-authority-orchestrator.md`. The `feedback-round-orchestrator` role is a BAO instance over the feedback-round surface. All four BAO bounds apply (enumerated in the Phases section). Downstream; operator-driven in v1.
- **Forward-Track Surface (Spec 07)** -- deferred atomic items become State-A forward-tracks; phase-boundary inheritance applies at phase-close. See Schema Extensions for `subject.type` and `declaration_kind` registrations.
- **Pass 2a / Pass 2b Sequencing (Spec 03)** -- each ratified atomic item's implementation follows the standard reconnaissance -> ratification -> commit-finalize chain.
- **Episodic -> Semantic Promotion** -- `surfaces/_primitives/episodic-to-semantic-promotion.md`. The CPS `_check_no_semantic_memory_mutation` constraint applies substrate-wide; `surfaces/` is in `_SEMANTIC_MEMORY_PATHS`. Promotions from closed rounds follow the deliberate-promotion path.
- **Anti-Pattern Enforcement** -- `surfaces/_primitives/anti-pattern-enforcement.md`. The five retro-surface anti-pattern detectors are candidates for feedback-round surface tasks; exact enforcement mapping is a downstream authoring decision.

## Anti-patterns and failure modes

### AP-1: Premature bundling (root cause of Item J)

**Pattern**: A feedback item containing multiple independent provisions enters adjudication as a single unit. One provision lands; the others are implicit and untracked.

**Instance**: demo/FEEDBACK.md Item J -- J1 (collision detection) and J2 (starter-term population) classified under one "Amend" heading in FEEDBACK-RESPONSE.md. J1 implemented in Phase 3; J2 lost.

**Prevention**: Phase 02-decompose is mandatory and MUST complete before Phase 05a-adjudicate-scope. Items without a `parent_item_id` tracing to a `atomic_item_decomposed` audit event are not valid STATE.jsonld entries.

### AP-2: Lost completeness map (no per-item artifact tracking)

**Pattern**: No explicit record of which artifacts a provision requires updating. The developer chain runs; some artifacts updated; others missed silently.

**Instance**: No completeness map existed for J2. The absence of an entry for buildNewDocument() in App.tsx made the gap structurally invisible until post-hoc audit.

**Prevention**: Phase 04-completeness-map is mandatory and MUST complete before Phase 06-implement. An item without a non-empty `completeness_map` MUST NOT advance to the implementation phase.

### AP-3: No reconciliation pass (no verification of completeness map honor)

**Pattern**: Implementation chains run; the phase closes; no agent verifies that every artifact listed in every item's completeness map was actually updated.

**Prevention**: Phase 07-reconcile is mandatory. The `feedback-reconciler` agent (read-only-by-contract) verifies each item's map. Items with `reconciliation_status: gap` block the `close` command.

### AP-4: Manual-only triage (no atomic-decomposition agent)

**Pattern**: The operator or a triage agent processes the payload informally. Compound items pass into adjudication as if they were atomic.

**Instance**: FEEDBACK-RESPONSE.md's adjudication table treated Item J as a single "Amend" unit rather than two independently-tracked provisions.

**Prevention**: The `feedback-decomposer` role MUST be dispatched for every non-trivial feedback payload. The agent's output is the authoritative decomposition; informal annotation is input to the agent, not a substitute for a formal decomposition record.

### AP-5: Reliance on bypass behavior to block denied implementation chains

**Pattern**: An implementation workflow is authored to rely on a substrate bypass mechanism -- e.g., expecting an architect to emit `outputs.error: "ratification_denied"` to force a CPS veto -- rather than implementing a proper chain-gate. When the bypass behavior changes in a future substrate release, the reliance breaks silently.

**Context**: OPERATOR-MEDIATION-LOG.md Event 11 documents gap-16 (v3.2 candidate): architect denial does not currently block downstream applier dispatch because the daemon checks task status rather than `outputs.ruling`. The v3.2 fix lands a proper gate. The v1 mitigation is operator-discipline review before dispatching the applier for each atomic item's implementation chain.

**Prevention**: Implementation chains MUST NOT be authored with gap-16's bypass as a design constraint. Operator-discipline review is a backstop -- not an architectural guarantee -- until gap-16 resolves.

### AP-6: Substrate-escalation-shape failures during feedback-round dispatch

**Pattern**: An agent in the feedback-round dispatch chain uses `outputs.error` to report a scope or capacity issue (e.g., `task_too_broad`) rather than the correct `outputs.status: "awaiting_operator_decision"` shape. This causes a CPS veto and `status=blocked` instead of routing control back to the operator.

**Instance**: OPERATOR-MEDIATION-LOG.md Event 9 -- developer used `error: "task_too_broad"` (a CPS-veto-triggering structured failure) when the correct shape was `awaiting_operator_decision` with `options[]` + `recommendation`. Event 12 -- CPS `required_outputs` check fired despite the `awaiting_operator_decision` bypass, indicating the bypass contract was not honored.

**Prevention**: Agents dispatched within feedback-round chains MUST use `outputs.status: "awaiting_operator_decision"` (with non-empty `options[]` and `recommendation`) for capacity or scope handoffs to the operator. `outputs.error` is reserved for genuine structured failures that SHOULD block the chain. Chain operators MUST verify dispatched agents honor the `awaiting_operator_decision` bypass contract per CLAUDE.md section 7.6.

### AP-7: Ontology-content authored without semantic-sme review (v0.3 amendment)

**Pattern**: An atomic provision touches ontology content (IRIs, semantic categories, namespace bindings, RDF/OWL/RDFS vocabulary, term-type classification, validator-code semantics) and the implementation chain dispatches developer → architect → applier WITHOUT a `semantic-sme` task between recon and developer. The developer authors ontologically incorrect content; the architect ratifies on structural completeness without ontological verification; the applier lands the defect. Downstream consequences emerge as active defects in shipped builds (e.g., OWL Full violations passing as OWL 2 DL; silent term-type filtering dropping user data).

**Canonical empirical instance**: Round 3 Chain γ (commit `880d53c`) shipped 16 starter terms authored by the developer without SME review. Aaron's Round 4 feedback exposed multiple structural errors: 12 inappropriate entries (3 owl: metaclasses + 9 schema-vocabulary predicates classified as ObjectProperty); 3 entries misclassified as DatatypeProperty when canonical OWL 2 typing is AnnotationProperty. Semantic-sme review, when invoked formally in R4-1/R4-2/R4-3/R4-4 chains, additionally surfaced two active defects that had survived prior architect ratifications: SA1 (OWL Full violation in every Turtle export — `rdfs:label rdf:type owl:DatatypeProperty` conflicting with OWL 2 built-in declarations) and SA3 (silent annotation-property drop in `src/projection/index.ts` SEMANTIC_TYPE_ALLOWLIST filter). Both defects predated Round 4 and would not have been caught by any non-SME reviewer.

**Prevention**: Phase 02 (Atomic Decomposition) MUST classify each atomic item via the `touches_ontology_content` field. Phase 06 implementation chains for items where `touches_ontology_content == true` MUST insert a `semantic-sme` task UPSTREAM of the developer (`recon → semantic-sme → developer → architect → applier → test-runner`). The semantic-sme's verdict is recorded in the item's `sme_verdict` field at the decomposition document and informs Phase 05a operator adjudication. Phase 07 reconciliation verifies the SME verdict was honored in the landed artifact.

## Open questions (v1 draft)

1. **feedback-decomposer / feedback-reconciler agent shape**: New dedicated agent contracts or modes of the existing `reconnaissance` agent? Output shapes differ (decomposed items vs. findings + evidence_paths). Dedicated contracts are cleaner; defer to the agent-contract authoring chain.

2. **feedback-round-orchestrator BAO**: v1 is operator-driven throughout. A BAO instance for phase-transition proposals follows the retro-surface pattern. Scope deferred to the BAO-agent-contract chain.

3. **Sub-surface registration for stakeholder feedback**: Spec 07 open question "Sub-surface emergence governance" anticipates a third sub-surface for stakeholder-feedback items if usage patterns show a distinct audience semantic. Register via `awaiting_operator_decision` when evidence accumulates; not in v1 scope.

4. **Gap-16 resolution timing**: AP-5 identifies that adjudication phase integrity depends on gap-16 being resolved. Recommend resolving gap-16 before shipping `state_admin feedback-round adjudicate` in v3.2.

5. **Companion entry in project/Routing/**: FNSR Protocol Spec docs 01--07 all have entries in `project/Routing/` using the prose-frontmatter convention. This spec lives at `surfaces/feedback-rounds/surface-spec.md` (surface-level convention). Whether to add a companion `project/Routing/08-stakeholder-feedback-round-spec.md` is a v1.1 authoring consideration; not in v1 scope.

6. **FNSR_FEEDBACK_ROUND_DIR env var**: The state file path `feedback-rounds/<round-id>/STATE.jsonld` is relative to the project root. An env var override (analog of `FNSR_RETRO_DIR`) is expected; implementation-time decision for the state_admin chain.

7. **Canonical @context scheme policy**: v0.1 used `https://fnsr.io/feedback-round/v0.1`; v0.2 aligns with the URN pattern (`urn:fnsr:feedback-round:v0.1`). Operator MUST confirm the canonical scheme before v1 implementation. If `fnsr.example` placeholder domain is preferred for uniformity with main state, update accordingly.

8. **amend adjudication flow**: The `amend` value in Phase 05a has no procedural definition for how an amended item differs from `ratify` in Phase 06 (what constraints apply to the implementation chain; whether amendment implies a modified spec/FR before the chain is queued). Definition deferred to the agent-contract authoring chain.

9. **items_amended in feedback_round_closed**: The event schema omits an `items_amended` count despite `amend` being a valid adjudication outcome. Add `items_amended` when the event schema is implemented, alongside open question 8's amend flow definition.

## v1 scope

This document is the **protocol specification only**. The following are downstream separate chains and are NOT in v1 scope:

- `surfaces/_primitives/stakeholder-feedback-round.md` (primitive doc)
- Agent contract files for `feedback-decomposer`, `feedback-reconciler`, `feedback-round-orchestrator`
- `state_admin feedback-round` command implementations in state_admin.py
- Per-phase spec files under `surfaces/feedback-rounds/phases/`
- Role binding files under `surfaces/feedback-rounds/agents/`
- Daemon hooks for feedback-round surface tasks
- Pass 2a gating fix for gap-16 (architect contract change)

## Provenance

- demo/FEEDBACK.md Item J (J1 + J2 bundled-provision failure; canonical empirical instance for this protocol)
- OPERATOR-MEDIATION-LOG.md Events 9--12 (substrate failure modes informing AP-5 and AP-6)
- MAREP v2.2 (retro surface parallel structure; phase-spec and role-binding layout conventions)
- FNSR Protocol Spec 03 (Pass 2a / Pass 2b sequencing; architect ratification contract)
- FNSR Protocol Spec 07 (forward-track lifecycle; subject.type + declaration_kind extension pattern)
- `surfaces/_primitives/bounded-authority-orchestrator.md` (BAO pattern; four-bounds enumeration requirement)
- `surfaces/retro/surface-spec.md` (surface-spec frontmatter convention; parallel phase-spec layout)

### Amendment history

- **v0.1** (2026-05-22): initial draft; 14 spec-reviewer findings.
- **v0.2** (2026-05-22): all v0.1 findings resolved; spec-reviewer "accept" + architect "ratified" clean.
- **v0.3** (2026-05-23): semantic-sme amendment. Added `touches_ontology_content` field on item shape (Phase 02 classification); added `sme_verdict` + `sme_verdict_note` fields; updated Phase 06 implementation chain shape to insert `semantic-sme` upstream of developer when `touches_ontology_content == true`; added AP-7 (ontology-content authored without semantic-sme review). Empirical motivation: Round 3 Chain γ shipped 16 starter terms with structural ontology errors that no non-SME reviewer caught; Round 4 SME review of subsequent chains surfaced two active defects (SA1 OWL Full violation; SA3 silent annotation-property drop) that had been live since Round 3. Spec 08 v0.3 institutionalizes the SME-review insertion that Round 4 applied informally.
- `surfaces/verification/surface-spec.md` (surface-spec frontmatter convention)
