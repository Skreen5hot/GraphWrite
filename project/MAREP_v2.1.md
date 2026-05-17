# Multi-Agent Retrospective Execution Protocol (MAREP)

**Version:** 2.1 (Draft)
**Status:** Specification — Normative
**Audience:** Orchestrator agents, agent implementers, retrospective system integrators
**Purpose:** Execute structured, low-drift, multi-agent retrospectives through shared-state coordination rather than conversational interaction.

---

## 0. Conformance Language

The key words **MUST**, **MUST NOT**, **SHOULD**, **SHOULD NOT**, and **MAY** in this document are to be interpreted as described in RFC 2119 and RFC 8174 when, and only when, they appear in all capitals.

A conforming implementation MUST satisfy every MUST and MUST NOT requirement in this specification. SHOULD requirements MAY be deviated from when documented justification is provided in the implementation's conformance statement.

---

## 1. Core Principle

The retrospective system is a **deterministic state machine** operated by structurally constrained agents over a shared canonical state. It is not a simulated meeting.

Three invariants govern the system:

1. **Canonicality** — A single, versioned state object is the sole authoritative artifact; all reasoning derives from and reduces to modifications of this state.
2. **Non-conversationality** — Agents MUST NOT communicate with one another directly. All inter-agent influence is mediated through state.
3. **Sequential mutation** — At any moment, at most one agent holds write authority over canonical state.

The objective is not to create the illusion of teamwork. The objective is structured collaborative cognition through controlled state transitions, yielding reliable synthesis and reduced drift.

---

## 2. Architectural Goals

The system is designed to:

* minimize hallucinated collaboration,
* reduce token waste,
* prevent recursive agreement loops,
* preserve machine-readable state,
* maintain deterministic retrospective evolution,
* support asynchronous or sequential execution,
* and enable downstream automation and analytics.

These goals are listed in priority order; in any tradeoff, earlier goals dominate.

---

## 3. Glossary

* **Canonical state** — The single authoritative state object (`RETRO_STATE.yaml`) representing the retrospective at a point in time. Versioned, schema-validated, monotonically advanced.
* **Agent** — A bounded analytical persona with defined role, scope, and update authority.
* **Orchestrator** — The privileged agent responsible for control flow, validation, locking, compression, and conflict resolution.
* **Turn** — A bounded interval during which one agent holds the write lock.
* **Update** — A localized, schema-conformant mutation of canonical state.
* **Phase** — A named stage of the retrospective workflow with defined entry and exit criteria.
* **Scratchpad** — Private, non-canonical, agent-local working memory.
* **Issue** — A retrospective finding tracked through defined status transitions.
* **Action** — A proposed remediation or follow-up with ownership and outcome criteria.
* **Lock** — A time-bounded, exclusive write authorization issued by the Orchestrator.

---

## 4. Agent Model

Each agent represents a distinct analytical perspective. Agents MUST be selected for epistemic diversity, non-overlapping reasoning styles, and unique evaluative function. Redundant personas (two agents covering the same focus area under different names) MUST NOT be instantiated within a single retrospective.

### 4.1 Required Agent

#### @Orchestrator

The Orchestrator is the only agent permitted to advance phases, compress context, archive sections, resolve schema violations, reset corrupted turns, and adjudicate contradictions. Responsibilities include workflow control, state validation, lock management, summarization, conflict detection, schema enforcement, and consensus tracking.

### 4.2 Possible Analytical Agents

| Agent | Focus |
|---|---|
| `@Architect` | System design, scalability, technical debt, integration concerns |
| `@Developer` | Implementation friction, velocity, maintainability, tooling |
| `@QA` | Defects, verification gaps, regression risks, process quality |
| `@DeliveryManager` | Sprint predictability, throughput, blockers, coordination overhead |
| `@RiskAnalyst` | Hidden failure modes, systemic fragility, operational exposure |
| `@UserAdvocate` | User impact, usability, stakeholder outcomes |
| `@Skeptic` | Challenging assumptions, identifying weak reasoning, preventing false consensus |

A retrospective MAY define additional roles consistent with §4 invariants. The complete agent roster MUST be declared in `AGENTS.md` before Phase 1 entry.

---

## 5. Required and Optional Files

### 5.1 Canonical Files (Required)

```text
/AGENTS.md          — Constitutional protocol; agent definitions, rules, schemas
/RETRO_STATE.yaml   — Authoritative state; versioned and schema-validated
/RETRO_BOARD.md     — Human-readable projection of canonical state
```

### 5.2 Working Files (Optional)

```text
/private/<agent>_notes.md   — Agent-local scratchpad; non-canonical
```

Scratchpads are temporary working memory. They MUST NOT be referenced by other agents and MUST NOT be treated as authoritative input to consensus.

---

## 6. AGENTS.md Specification

`AGENTS.md` defines the agent roster, behavioral rules, execution constraints, schema requirements, retrospective phases, and orchestration policy for a given retrospective instance. It functions as the constitutional protocol for that retrospective.

`AGENTS.md` MUST be finalized before Phase 1 entry. Mid-retrospective amendments MUST be recorded as numbered amendments and validated by the Orchestrator before taking effect.

---

## 7. Canonical State Model

`RETRO_STATE.yaml` is the sole authoritative state. All retrospective reasoning, history, and decisions reduce to its contents.

Agents MAY modify structured sections, append evidence, update issue status, and propose actions. Agents MUST NOT chat, roleplay, greet other agents, or simulate meetings. Any natural-language content placed into canonical state MUST be confined to designated free-text fields (e.g., `description`, `evidence`, `rationale`) and MUST NOT contain conversational artifacts.

### 7.1 Required Top-Level Schema

```yaml
retro:
  sprint: <string>             # Sprint identifier
  phase: <enum>                # gathering | merge | analysis | consensus | actions | compression | complete
  version: <int>               # Monotonically increasing; incremented on every accepted mutation
  schema_version: <string>     # Semver

issues:        # List of <Issue>
actions:       # List of <Action>
decisions:     # List of <Decision>; consensus outcomes
turn:          # Current turn lock (see §10)
audit:         # Append-only log of state transitions
```

Conforming implementations MUST publish a JSON Schema (or equivalent) for the full state document.

### 7.2 Issue Schema

```yaml
- id: <string>            # Unique within the retrospective; convention <DOMAIN>-<NNN>
  title: <string>
  severity: <enum>        # low | medium | high | critical
  status: <enum>          # proposed | contested | confirmed | rejected | archived
  evidence: [<string>]
  confirmed_by: [<agent>]
  contested_by: [<agent>]
  related_actions: [<action_id>]
```

### 7.3 Action Schema

```yaml
- id: <string>            # Unique; convention ACT-<NNN>
  description: <string>
  owner: <agent>
  status: <enum>          # proposed | accepted | rejected | deferred
  outcome_criteria: <string>
  due_by: <ISO8601 date>
```

---

## 8. Markdown Rendering Layer

`RETRO_BOARD.md` is a human-readable projection of canonical state. It exists for readability, human review, and lightweight inspection. The YAML state remains authoritative; in any divergence, YAML wins. Implementations SHOULD regenerate `RETRO_BOARD.md` from `RETRO_STATE.yaml` rather than edit it directly.

---

## 9. State Versioning

Canonical state version (`retro.version`) is a monotonically increasing integer. Every accepted mutation MUST increment the version by exactly 1. Agents MUST submit updates that reference the version they read; the Orchestrator MUST reject updates whose referenced version is not the current version (compare-and-swap semantics).

The Orchestrator MUST maintain an append-only `audit` log entry for every accepted mutation:

```yaml
audit:
  - version: <int>
    agent: <agent>
    timestamp: <ISO8601>
    diff_summary: <string>
    affected_sections: [<path>]
```

---

## 10. Turn-Taking Protocol

### 10.1 Sequential Execution

At most one agent MAY hold the write lock at any time. Concurrent writes MUST be rejected.

### 10.2 Lock Structure

```yaml
turn:
  current_agent: <agent>
  state_version: <int>            # Version at lock acquisition
  lock_acquired: <ISO8601>
  lock_expiration: <ISO8601>
  permitted_sections: [<path>]    # Restricts the scope of permitted mutations
```

### 10.3 Lock Lifecycle

A lock is acquired by Orchestrator grant. The grant MUST specify `permitted_sections`, restricting the turn's scope to sections relevant to the assigned task. On expiration without release, the Orchestrator MUST reclaim the lock and discard any partial in-flight updates from the holding agent.

### 10.4 Permitted Operations

A lock-holding agent MAY:

* read the current state,
* analyze sections within `permitted_sections`,
* submit one or more deterministic updates within scope,
* release the lock.

A lock-holding agent MUST NOT:

* modify sections outside `permitted_sections`,
* revise archived conclusions,
* modify another agent's scratchpad,
* self-extend turn duration.

---

## 11. Update Semantics

Every update MUST be deterministic, localized, idempotent, and schema-compliant.

* **Deterministic** — Given the same input state and the same agent prompt, the update SHOULD produce structurally equivalent diffs across runs. Semantic equivalence under field-level normalization is sufficient (LLM nondeterminism is bounded but not eliminated).
* **Localized** — Updates MUST modify only sections within the lock's `permitted_sections`.
* **Idempotent** — Re-applying an accepted update MUST be a no-op. Updates SHOULD include a stable `update_id` to enable safe retry.
* **Schema-compliant** — Updates MUST validate against the published schema. The Orchestrator MUST reject any non-conforming update without partial application.

### 11.1 Update Form

Agents express updates as YAML-merge-style diffs against the current state, not as prose.

Non-conforming:

```text
I think we had some deployment issues.
```

Conforming:

```yaml
issues:
  - id: DEPLOY-002
    title: Deployment instability
    severity: medium
    status: proposed
    evidence:
      - failed rollback in sprint-42
      - inconsistent environment parity between staging and prod
```

---

## 12. Phase Workflow

The retrospective progresses through six phases in strict order. Phase transitions are exclusively performed by the Orchestrator and MUST be recorded in `audit`.

### 12.1 Phase 1 — Independent Gathering

* **Entry:** `AGENTS.md` finalized; `RETRO_STATE.yaml` initialized.
* **Activity:** Each agent independently analyzes the sprint, records findings in private scratchpad, and submits compressed findings as `proposed` issues.
* **Purpose:** Maximize diversity of reasoning; prevent premature convergence.
* **Exit:** Every agent has either submitted findings or explicitly declined.

### 12.2 Phase 2 — Canonical Merge

* **Entry:** Phase 1 exit conditions satisfied.
* **Activity:** Orchestrator merges findings, normalizes issue identifiers, removes duplicates, organizes themes.
* **Exit:** No duplicate IDs; every proposed issue conforms to schema.

### 12.3 Phase 3 — Structured Analysis

* **Entry:** Phase 2 exit conditions satisfied.
* **Activity:** Agents take turns evaluating themes, challenging assumptions, validating evidence, refining root causes.
* **Exit:** Every issue has reached `confirmed`, `rejected`, or `contested` status with supporting evidence.

### 12.4 Phase 4 — Consensus Resolution

* **Entry:** Phase 3 exit conditions satisfied.
* **Activity:** Orchestrator identifies unresolved conflicts, triggers voting where required (§15), finalizes issue states.
* **Exit:** No issues remain in `contested` status.

### 12.5 Phase 5 — Action Assignment

* **Entry:** Phase 4 exit conditions satisfied.
* **Activity:** Agents propose actions with ownership, outcome criteria, due dates.
* **Exit:** Every `confirmed` issue has at least one accepted action OR an explicit `no_action_required` decision.

### 12.6 Phase 6 — Final Compression

* **Entry:** Phase 5 exit conditions satisfied.
* **Activity:** Orchestrator archives discussion history, preserves canonical findings, generates final summary and action manifest.
* **Exit:** All deliverables (§19) produced and validated.

---

## 13. Context Compression

Large retrospectives accumulate entropy. The Orchestrator MUST compress when any of the following triggers fires:

* token usage exceeds the configured budget,
* duplicate issues are detected,
* canonical state contains semantically redundant entries,
* historical context begins biasing new analysis (detected by repeated re-derivation of archived conclusions).

Compression preserves canonical conclusions, archives obsolete sections under `archive`, and generates compressed summaries. Compression MUST NOT alter `confirmed`, `rejected`, or `accepted` records other than relocating them under `archive`.

---

## 14. Contradiction Management

The Orchestrator MUST detect:

* conflicting root causes,
* incompatible action items,
* duplicate issue IDs,
* unresolved disagreements between agents.

When a contradiction is detected, the Orchestrator MUST mark the affected items with `status: contested`, record the conflicting positions in `conflict_record`, and either request targeted re-analysis from a specific agent or trigger a consensus vote (§15).

```yaml
conflict_record:
  - issue_id: PERF-001
    positions:
      - agent: Architect
        claim: API latency caused by N+1 query pattern
      - agent: QA
        claim: API latency caused by network egress saturation
    resolution_required_by: <phase | timestamp>
```

---

## 15. Consensus Protocol

Consensus is explicit. Implicit agreement is not consensus.

### 15.1 Decision Rules

```yaml
decision_rules:
  standard_threshold: 0.7              # Fraction of voting agents required for confirmation
  architecture_changes:
    unanimous_required: true
  abstention_policy: counts_against_quorum   # or: ignored
  tie_break: orchestrator              # or: skeptic | re_vote
```

### 15.2 Vote Record

```yaml
votes:
  - subject: ISSUE:PERF-001:status:confirmed
    threshold: 0.7
    cast:
      - agent: Architect
        position: confirm
      - agent: QA
        position: confirm
      - agent: Skeptic
        position: reject
    outcome: confirmed
    closed_at: <ISO8601>
```

### 15.3 Status Transitions

Issue status transitions MUST follow this graph:

```text
proposed   → contested
proposed   → confirmed
proposed   → rejected
contested  → confirmed
contested  → rejected
confirmed  → archived
rejected   → archived
```

All other transitions MUST be rejected by the Orchestrator.

---

## 16. Memory Boundaries

Agents MUST NOT recursively inherit unlimited prior retrospectives. Memory is partitioned into three layers with explicit promotion rules.

### 16.1 Working Memory

The current sprint's canonical state. Fully accessible to all agents within scope.

### 16.2 Episodic Memory

Compressed summaries of recent retrospectives. Accessible to the Orchestrator; surfaced to agents only on explicit request and only as compressed summaries.

### 16.3 Semantic Memory

Stable operational principles, standards, and team conventions. Accessible to all agents but read-only within the retrospective.

Implementations MUST define explicit boundaries and explicit promotion rules (e.g., when working memory compresses to episodic memory at retrospective close).

---

## 17. Anti-Pattern Enforcement

The Orchestrator MUST actively suppress the following anti-patterns. Each is paired with a detection mechanism so enforcement is mechanical rather than discretionary.

### 17.1 Persona Theater

* **Forbidden:** conversational addresses, affirmations to other agents (e.g., `"Great point @QA!"`).
* **Detection:** schema validation rejects free text containing `@<agent>` outside designated reference fields.

### 17.2 Recursive Agreement Loops

* **Forbidden:** repeated affirmations, redundant summaries, synthetic collaboration language.
* **Detection:** semantic similarity check against prior turn outputs; updates exceeding similarity threshold MUST be rejected with cause `redundant_affirmation`.

### 17.3 Freeform Brainstorm Drift

* **Forbidden:** unconstrained speculation, conversational sprawl, narrative discussion in canonical state.
* **Detection:** free-text fields exceeding length budget OR containing conversational connectives flagged for revision.

### 17.4 Out-of-Scope Mutation

* **Forbidden:** modifying sections outside the turn's `permitted_sections`.
* **Detection:** lock scope check at update validation.

---

## 18. Error Handling and Recovery

### 18.1 Schema Violation

When an update fails schema validation, the Orchestrator MUST reject the update without partial application, log the violation with cause, and either request a corrected update from the holding agent or revoke the lock.

### 18.2 Lock Expiration

When a lock expires without release, the Orchestrator MUST reclaim the lock, discard any partial in-flight updates, and record an `audit` entry. The agent's turn MAY be re-scheduled at Orchestrator discretion.

### 18.3 Orchestrator Failure

If the Orchestrator becomes unavailable, no further state mutations MAY be accepted until Orchestrator continuity is restored. Implementations SHOULD provide Orchestrator handoff procedures (state checksum, version reconciliation) before resumption.

### 18.4 State Corruption

If canonical state fails schema validation outside an in-flight update, the Orchestrator MUST roll back to the last validated version recorded in `audit` and emit a corruption event.

---

## 19. Final Deliverables

At retrospective completion, the system MUST produce:

```text
/RETRO_BOARD.md        — Final human-readable rendering
/RETRO_STATE.yaml      — Final canonical state
/RETRO_SUMMARY.md      — Executive summary derived from canonical state
/ACTION_ITEMS.yaml     — Extracted action manifest
```

Each deliverable MUST validate against its respective schema. `RETRO_SUMMARY.md` MUST be derivable from `RETRO_STATE.yaml`; the summary is a projection, not an independent artifact.

---

## 20. Guiding Philosophy

This system is not simulated human conversation. It is structured collaborative cognition through controlled state transitions. The objective is reliable synthesis, disciplined analysis, reduced drift, and high-quality operational insight — not the appearance of teamwork.

---

## Changelog

* **v2.1 (Draft)** — Added conformance language (§0), glossary (§3), state versioning with CAS (§9), formal lock lifecycle (§10), update semantics with idempotence (§11), formal phase entry/exit criteria (§12), structured contradiction records (§14), explicit status transition graph (§15.3), error handling and recovery (§18), detection mechanisms paired with each anti-pattern (§17). Reorganized heading hierarchy; reduced visual noise from horizontal rules.
* **v2.0** — Initial blackboard architecture; agent model; phase workflow; anti-pattern catalog.
