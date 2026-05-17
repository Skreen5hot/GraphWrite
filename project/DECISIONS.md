# Architecture Decision Records

<!--
  Log decisions here so they survive between AI sessions.
  An AI agent has no memory of yesterday. This file IS its memory.

  Format: Date | Decision | Context | Consequences
-->

## ADR-001: Use JSON-LD Deterministic Service Template

**Date:** [TODAY]

**Decision:** Adopt the JSON-LD Deterministic Service Template as the base architecture.

**Context:** We need a service that produces deterministic, reproducible transformations on structured data. The template provides a pure kernel with spec tests, layered boundaries (kernel/composition/adapters), and zero runtime dependencies.

**Consequences:**
- All transformation logic lives in `src/kernel/transform.ts` as pure functions
- Kernel MUST NOT perform I/O, reference time, randomness, or environment state
- Infrastructure (HTTP, persistence, scheduling) lives in `src/adapters/`
- Spec tests (determinism, no-network, snapshot, purity) MUST pass before any merge

---

<!--
  Add new decisions below. Use the format:

  ## ADR-NNN: [Decision Title]

  **Date:** YYYY-MM-DD

  **Decision:** One sentence stating the choice.

  **Context:** Why this decision was needed. What alternatives were considered.

  **Consequences:** What follows from this decision. What is now easier or harder.
-->

## ADR-002: Excise SPEC §31 Item 14 (Second-Compliant-Implementation DoD)

**Date:** 2026-05-16

**Decision:** Remove the requirement for a second conformant implementation from the v0.4 Definition of Done.

**Context:** SPEC §31 item 14 required a second independent implementation to demonstrate conformance before v0.4 could be declared complete. No second v0.4-conformant implementation is planned; the kgModeler POC (github.com/Skreen5hot/kgModeler) targets a different schema version and is not v0.4-conformant. Retaining the requirement would permanently block the v0.4 exit gate with no actionable path to satisfaction.

**Consequences:**
- The v0.4 DoD no longer requires a second implementation; all remaining exit-gate items are achievable with the primary codebase
- If a conformant second implementation emerges later, interoperability testing can be added as a separate workstream rather than a gate
- Reduced risk of the project stalling on an externally-dependent criterion

---

## ADR-003: Phase 1 Stubs Phase 3/4 CLI Commands

**Date:** 2026-05-16

**Decision:** `import-ontology` and `export --format zip` return exit code 2 in Phase 1 with a stderr message of ‘not yet implemented; available in Phase N’ rather than being fully implemented.

**Context:** These CLI commands belong to Phase 3 (`import-ontology`) and Phase 4 (`export --format zip`) according to the roadmap. Implementing them in Phase 1 would pull in out-of-scope dependencies and inflate the Phase 1 surface area. Alternatives considered: omitting the commands entirely (breaks discoverability), or raising exit code 1 (conflicts with POSIX convention for ‘usage error’; exit code 2 is the standard for ‘not implemented / unavailable in this build’).

**Consequences:**
- Phase 1 CLI is shippable without implementing future-phase features
- Callers receive a predictable, machine-readable signal (exit code 2) rather than a crash or silent no-op
- Phase 3 and Phase 4 must replace the stubs with real implementations before their respective exit gates close
- Stub behaviour must be covered by Phase 1 CLI integration tests to prevent silent regression

---

## ADR-004: Move OED-303 to Phase 1 Exit Gate

**Date:** 2026-05-16

**Decision:** Advance OED-303 (validation report retention policy) from the Phase 3 exit gate to the Phase 1 exit gate.

**Context:** OED-303 defines how validation reports are retained and referenced by golden files. It was originally deferred to Phase 3 on the assumption that validation outputs would not be committed until later. However, Phase 1 golden files now commit real validation outputs, making the retention policy a prerequisite for those files to be meaningful and reproducible. Without the policy in place at Phase 1, golden-file comparisons in CI would be non-deterministic or incomplete.

**Consequences:**
- Phase 1 cannot close until OED-303 is resolved and the policy is documented
- Phase 1 golden files can commit real, policy-compliant validation outputs from day one
- Phase 3 exit gate is simplified by one item
- The retention policy must be designed conservatively enough to remain valid through Phases 2–4 without requiring a breaking change

---

## ADR-005: Create OED-313 (Conformance Fixture Set Scope)

**Date:** 2026-05-16

**Decision:** Introduce OED-313 to track which input fixtures belong in Phase 1 versus Phase 4 golden files, designated as a joint Phase 1 and Phase 4 exit gate.

**Context:** As the conformance fixture set grew it became unclear which fixtures must pass before Phase 1 closes versus which may be deferred to Phase 4. Without an explicit decision record, contributors were making ad-hoc choices that risked either over-committing Phase 1 scope or leaving Phase 4 with an unverified fixture set. OED-313 creates a named, trackable decision item rather than leaving fixture assignment implicit. Status is Open pending fixture enumeration.

**Consequences:**
- Phase 1 exit gate will not close until OED-313 is resolved with an agreed fixture list
- Phase 4 exit gate will not close until all Phase 4 fixtures in OED-313 have passing golden files
- Fixture scope is now an explicit, auditable decision rather than an implicit engineering choice
- The OED-313 resolution task must be queued before either Phase 1 or Phase 4 can be declared complete
