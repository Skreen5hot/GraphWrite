# Phase 3 Chain 1 Demo — Turtle Ontology Import

**Stakeholder review:** API-level capability landing. UI integration follows in subsequent Phase 3 chains.

Companion to [WALKTHROUGH-PHASE-3.md](WALKTHROUGH-PHASE-3.md) (UI-facing browser walkthrough). This document covers Chain 1 specifically — the programmatic `importOntology()` capability that all later Phase 3 UI features build on.

---

## What this chain delivers

A pure-function ontology importer at [`src/import/turtle-import.ts`](../src/import/turtle-import.ts) plus the public re-export at [`src/import/index.ts`](../src/import/index.ts):

```typescript
import { importOntology } from "../src/import/index.js";

const result = importOntology(
  turtleSourceString,
  "small.ttl",
  "urn:uuid:00000000-0000-0000-0000-000000000001",
  "2026-06-01T00:00:00Z"
);
```

Returns an `ImportResult` containing:
- An `ImportedOntologyRecord` (`ecm:ImportedOntology` per SPEC §5.6) with content hash, source-file metadata, parsed status
- An array of `ImportedTermObject`s — one per extracted `owl:Class`, `owl:ObjectProperty`, or `owl:DatatypeProperty`
- Preserved `rdfs:label` / `rdfs:comment` / `rdfs:subClassOf` / `rdfs:subPropertyOf` (named-node targets verbatim)

---

## Acceptance criteria (IMPLEMENTATION_PLAN §3.1)

All six pass. Run `npm test` and the [tests/import-turtle.test.ts](../tests/import-turtle.test.ts) block reports 6/6.

| AC | Behavior | What proves it |
|---|---|---|
| **AC1** | `importOntology(small.ttl)` produces ≥1 `owl:Class` term | Unit test fixture with two `owl:Class` declarations |
| **AC2** | `rdfs:Class` in input is normalized to `owl:Class` in output | Per FR-C011; legacy `rdfs:Class` callers map cleanly into the OWL vocabulary the rest of GraphWrite uses |
| **AC3** | `rdfs:subClassOf` values preserved verbatim (named nodes only) | Hierarchy semantics survive the import; blank-node restrictions out of scope (§14.1) |
| **AC4** | `ecm:contentHash = "sha256-" + SHA-256(input bytes)` | Deterministic content identity per NFR-003; same bytes → same hash across implementations |
| **AC5** | A 51 MB input returns an error result **without parsing** | Hard-rejection per SPEC §12.2; protects against pathological inputs and DoS |
| **AC6** | `owl:imports` declarations are NOT followed; only supplied-file terms extracted | Offline-capable (NFR-006) and security-bounded; no surprise network calls during import |

---

## How to verify

**Prerequisites:** Node.js ≥ 22, `npm install` once (≈ 30 seconds).

```bash
# Build TypeScript
npm run build

# Run the full test suite
npm test
```

Expected output tail:
```
  Files: 18/18 passed
  Tests: 137/137 passed
```

The 6 Chain 1 acceptance tests live in `tests/import-turtle.test.ts`:
```
✓ PASS: small ontology must produce >= 1 owl:Class term (AC1)
✓ PASS: rdfs:Class must be normalized to owl:Class on import (AC2)
✓ PASS: rdfs:subClassOf must be preserved verbatim (AC3)
✓ PASS: ecm:contentHash = "sha256-" + SHA-256 of input bytes (AC4)
✓ PASS: 51 MB input returns error result without parsing (AC5)
✓ PASS: owl:imports must not be followed; only supplied-file terms extracted (AC6)
```

---

## What works end-to-end right now

- Turtle source string → parsed term population
- Both `<http://example.org/Person> a owl:Class` and `<http://example.org/Person> a rdfs:Class` forms produce the same `owl:Class` term type in output
- `@prefix` declarations expand correctly via N3.js's synchronous parser
- Multi-language labels preserved with `lang` tag (e.g., `"Person"@en`)
- `rdfs:comment` preserved as plain string
- Subclass hierarchies preserved as named-node IRI arrays
- Content hash is deterministic — same input bytes always produce same `sha256-...` digest
- 50 MB size guard fires BEFORE parsing (cheap byte-length check; no N3.js invocation if oversize)

---

## What is NOT yet in scope (per ROADMAP)

Phase 3 Chain 1 ships the importer **engine**. Subsequent Phase 3 chains layer on top:

- **Chain 2+ (still to do):** Import-aware sidebar UI; visual indicators for imported / project-created / starter-example terms (FR-U005)
- **Chain N+ (still to do):** Imported-term immutability enforcement at the term-edit layer (§13.3, §13.6); "remap references" workflow
- **Chain N+ (still to do):** 10,000-term `LARGE_IMPORT` warning + degraded-mode virtualized list (§14.2)
- **Not in this MVP:** OWL restrictions, property chains, cardinality, equivalent-class reasoning, imports-closure, blank-node reasoning, SHACL validation (all §3.2 / §14.1 explicitly deferred)

The importer's blank-node handling is conservative-by-design: blank-node subjects are excluded; blank-node `subClassOf` targets (restriction expressions) are excluded. This matches §14.1 ("blank-node reasoning out of scope for MVP").

---

## Sign-off prompt

This chain is ready for review against four questions:

1. **Does the engine work?** Run `npm test`. If 137/137 pass, the engine works.
2. **Is the scope right?** AC1–AC6 plus the "NOT in scope" list above describe what landed. Anything in scope that you expected and don't see, or anything in "NOT in scope" that you think should be here?
3. **Does the file shape feel right?** Skim [`src/import/turtle-import.ts`](../src/import/turtle-import.ts) (247 lines, single file). Layered correctly: imports from `n3`, `node:crypto`, and `src/iri/`; nothing from `src/adapters/` or `src/composition/`. Purity OK for Layer 0 except for `node:crypto` which is documented at the top.
4. **What's the next chain?** Phase 3 Chain 2 would naturally be the sidebar/UI integration — surfacing imported terms in the term list and adding the import file picker. Confirm or redirect.

---

## Substrate-side context (for the audit-curious)

This chain reached `all_pass` via a substrate-mediated recovery loop, not a clean first-try. The audit-chain narrative:

1. Initial recon task `752-recon-p3-c1c` was CPS-vetoed for malformed output envelope (returned a flat finding shape instead of `{findings, summary, evidence_paths}`)
2. Fixer auto-dispatched twice (recursion bound 2/2); both escalated to operator with options
3. Operator manually `reset` 752 + re-dispatched; recon returned correct envelope on retry
4. Developer + architect ran clean; applier 755 hit `before_not_found` (mojibake mismatch between developer-emitted `before` snippet and disk)
5. Fixer 761 proposed retry chain `763-dev → 764-apply → 765-test`; recovery-dispatcher validated and append-tasks'd
6. Retry chain landed cleanly; **137/137 tests pass** at task 765
7. Operator administratively closed wedged anchors 755/756 via `abandon` + `resolve --execution-mode state-surgery-applied` (the v3.3.2 substrate-discipline patch shipped earlier the same day; clean self-validation moment)

Full audit trail in [state.jsonld](../state.jsonld); banking observations at `bank-760-...-1`, `bank-760-...-2`, `bank-767-...-2`; forward-track `ft-767-...-1` (v3.4 phase-readiness auto-detect candidate).

For the substrate-as-substrate audience (FNSR-archive material), this audit chain demonstrates the recovery-from-stall pattern working end-to-end: the substrate detected the wedges, dispatched Fixers, surfaced operator decisions via the v3.3.0 emission primitive, enforced the resolve → execution link via v3.3.2, and the operator's administrative actions composed cleanly with the audit-chain integrity (1174 entries verified PASS after Option A executed).
