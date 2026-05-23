# Stakeholder Feedback — Round 4

**Reviewer:** Aaron (product owner)
**Date:** 2026-05-23
**Site under review:** https://skreen5hot.github.io/GraphWrite/
**Build:** commit `cca2e65` (Round 3 close + WALKTHROUGH-ROUND-4)
**Walkthrough used:** [WALKTHROUGH-ROUND-4.md](WALKTHROUGH-ROUND-4.md)
**Protocol:** FNSR Spec 08 v0.2 (with Aaron's meta-concern triggering protocol amendment proposal)

---

## Meta-concern (most important)

Aaron's verbatim:

> I am concerned that we made so many structural misses. When I say I want defaults who is reviewing the contents of those defaults. My goal is that it is NOT me but an agent. IS an agent reviewing the contents a Subject Matter Expert or is an agent building the contents and handing it over to a developer to implement then test and it is all good?

This triggers a **Spec 08 amendment proposal**: ontology-content atomic items MUST have a semantic-sme review step inserted between Phase 02 (Atomic Decomposition) and Phase 06 (Implementation). Captured as anti-pattern candidate AP-6 in Spec 08 v0.3 work.

---

## Section-by-section (verbatim)

### Chain α — New project flow

> The new flow is good

### Chain β — Instance + edge labels

> Edge labels are now showing, good.

### Chain γ — Starter terms

> Thank you for adding the defaults it is now clear I misscommunicated I also now see that we should have NO default OWL or RDF classes or Object properties they do not exist. You are using owl:properties this is not appropriate for this tool. Remove the Classes and Object Properties defaults then update the DataType to be split into DataType and Annotation Properties as below. Further we missed the annotation properties vs DataType properties. This is subtle but important. The current DataType Properties are Annotation Properties.

### Refined Mini Spec — Property Creation Module

Aaron provided an expanded technical specification (Annotation vs Datatype Property distinction; "Add New Property" popup with conditional fields; JSON payload + Turtle serialization). Verbatim:

#### 1. Data Schema & Core Behavior

The tool categorizes schema properties into two distinct functional pipelines based on their semantic purpose and interaction with downstream reasoning engines.

| Feature | Annotation Properties (`owl:AnnotationProperty`) | Datatype Properties (`owl:DatatypeProperty`) |
|---|---|---|
| **Default Built-ins** | `rdfs:label`, `rdfs:comment`, `rdfs:seeAlso` | None (user-defined or standard vocab like `foaf:age`) |
| **System Behavior** | Multi-language indexing, global search UI, localized documentation, tooltips. | Column sorting, mathematical/range filtering, strict type-coercion, form-validation. |
| **Reasoner Impact** | **Completely ignored** by semantic reasoners (Pellet, HermiT, etc.). Structural changes do not cause inconsistencies. | **Strictly validated** for logical consistency (e.g., domain/range violations, functional property constraints). |
| **Target Object** | Strings, language-tagged strings (`"Hello"@en`), or URIs. | Typed literals only (e.g., `xsd:integer`, `xsd:date`). |

#### 2. UI/UX Specification: "Add New Property" Popup

Field interaction & validation rules:

- **Property Type Toggle (Mandatory)** — Radio Group or Segmented Control. Defaults to `Annotation Property`. Switching dynamically mounts/unmounts the **Target Data Type** container.
- **Prefix/Namespace Selector (Mandatory)** — Searchable dropdown. Data source: pre-populated array of app-configured namespaces (`ex:`, `foaf:`, `schema:`, `rdf:`).
- **Property Name / Technical ID (Mandatory)** — Text input with real-time regex masking. Validation: must match standard XML/RDF local name conventions: `^[a-zA-Z_][a-zA-Z0-9_.-]*$`. No spaces. Usually enforced as `camelCase`. Async uniqueness check against active graph (`Namespace + Property Name`).
- **Human Label & Language Tag (Mandatory)** — Text input paired with small language dropdown (`@en`, `@es`, `@fr`). Generates `rdfs:label` triple. Defaults to `@en`.
- **Target Data Type Dropdown (Conditional)** — Visible only if `Datatype Property` selected. Options: XSD primitives (`xsd:string`, `xsd:integer`, `xsd:decimal`, `xsd:boolean`, `xsd:date`, `xsd:dateTime`).

#### 3. Frontend-to-Backend JSON Payload

```json
{
  "propertyType": "DatatypeProperty",
  "namespace": "http://example.org/",
  "prefix": "ex",
  "localName": "hourlyRate",
  "label": { "text": "Hourly Rate", "lang": "en" },
  "range": "http://www.w3.org/2001/XMLSchema#decimal"
}
```

Note: if `propertyType: "AnnotationProperty"`, `range` is `null` or omitted.

#### 4. Backend Turtle Serialization

**Annotation Property:**
```turtle
@prefix ex: <http://example.org/> .
@prefix owl: <http://www.w3.org/2002/07/owl#> .
@prefix rdfs: <http://www.w3.org/2000/01/rdf-schema#> .

ex:internalNote a owl:AnnotationProperty ;
    rdfs:label "Internal Note"@en .
```

**Datatype Property:**
```turtle
@prefix ex: <http://example.org/> .
@prefix owl: <http://www.w3.org/2002/07/owl#> .
@prefix rdfs: <http://www.w3.org/2000/01/rdf-schema#> .
@prefix xsd: <http://www.w3.org/2001/XMLSchema#> .

ex:hourlyRate a owl:DatatypeProperty ;
    rdfs:label "Hourly Rate"@en ;
    rdfs:range xsd:decimal .
```

---

## Protocol notes for this round

Round 4 is the **first round to apply Spec 08 v0.2 with the semantic-sme amendment under consideration**. The decomposition chain (next) will:

1. Atomically decompose every claim (no bundling — anti-pattern AP-1 prevention).
2. **For each atomic item, classify whether it touches ontology content** (new field for Spec 08 v0.3 amendment).
3. For ontology-content items, the completeness map MUST include `semantic-sme review` as an artifact, and Phase 06 implementation chains MUST insert semantic-sme between recon and developer.
4. Phase 05a operator adjudication awaits Aaron's per-item ratify/amend/defer + semantic-sme's per-item ontology verdict.

Why this matters: Round 3 Chain γ shipped 16 starter terms without semantic-sme review. The developer made structural classification errors (owl:Class as a "class"; rdfs:label as a DatatypeProperty rather than AnnotationProperty; meta-vocabulary inappropriate as project terms). The semantic-sme agent exists in the roster for exactly this — Spec 08 v0.2's dispatch routing didn't invoke it because the file was a `.ts` source file rather than a `.jsonld`/`.ttl` ontology file. The fix: classify by content-domain, not by file extension.
