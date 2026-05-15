# Engineering-Ready Specification v0.3

# Visual RDF / Knowledge Graph Modeler

**Strategic program:** Edge Canonical Modeling
**Specification version:** v0.3 Engineering-Ready
**Status:** Ready for implementation planning
**Canonical execution model:** Browser or local Node.js runtime
**Canonical representation:** JSON-LD 1.1, Visual Modeler Profile (defined in §5)

---

## Revision Notes (v0.2 → v0.3)

v0.3 resolves decisions that v0.2 deferred and closes gaps that would have surfaced during implementation. Material changes:

- §0 reframed from "Normative Constitution" to "Architectural Principles." The principles are unchanged; the rhetoric is reduced.
- §1 defines "Edge Canonical Modeling" rather than invoking it as a known program.
- §5 now defines the **Visual Modeler Profile (VMP)** as a normative JSON-LD serialization, with explicit canonicalization rules and a precise definition of "lossless round-trip."
- §6 splits the project document into a **Semantic Layer** (the RDF graph) and an **Editor Layer** (UI and project metadata). The semantic JSON-LD export is now defined precisely (formerly OED-005).
- §7 covers semantic-model coverage: object properties **and** datatype properties, literals with datatypes and language tags, optional `rdfs:subClassOf` / `rdfs:subPropertyOf`, and explicit deferral notes for blank nodes and named graphs.
- §8 specifies the relation model. Relations carry editor metadata internally, but their RDF semantics are determined by `{subject, predicate, object}` alone. Reification is not exported.
- §9 (Determinism Model) is new; it distinguishes transformation determinism from creation-time non-determinism and defines an opt-in deterministic mode.
- §10 (Versioning and Migration), §11 (Concurrency Model), and §12 (Security and Threat Model) are new.
- §17 (Validation) is reorganized into hard errors vs. soft warnings, with explicit suppression.
- §21 (Test Strategy) is new.
- Starter examples (§24) replaced with scenarios that don't require ontology background to grasp.
- "ABox Canvas" renamed "Instance Canvas."
- Cascading IRI update (§13) now covers collision, replacement, and snapshot edge cases.
- ZIP layout (§19) renamed to reflect actual contents.
- Contextual help (§25) is itemized as a content deliverable rather than a UI checkbox.

---

## 0. Architectural Principles

This section is normative. Later requirements are interpreted through these constraints.

### 0.1 Edge-Canonical First

All core systems must run, unmodified, in either:

1. a standards-compliant browser; or
2. a local Node.js runtime (`node index.js` or equivalent).

Cloud, server, database, broker, registry, hosted runtime, or deployment topology may exist only as an optional adapter or non-normative deployment example. If a component cannot function under browser/Node local execution, it is not core logic.

### 0.2 No Required Infrastructure

The core specification must not require: databases, message brokers, service registries, background workers, addressable servers, cloud storage, remote APIs, deployment topologies, authentication providers, or centralized repositories. These may appear only as optional adapters.

### 0.3 Determinism Over Deployment

Given the same canonical project document, the same settings, and the same command or UI action, the system produces the same outputs. Time, randomness, and environment coupling are isolated behind explicit boundaries. §9 makes the precise determinism guarantees explicit.

### 0.4 Separation of Concerns

Every requirement must distinguish among:

1. **Computation** — what is derived, transformed, validated, serialized, or compared.
2. **State** — how project information is stored and resumed.
3. **Orchestration** — how and when computation is invoked.
4. **Integration** — how the external world is contacted.

Only computation is core. State, orchestration, and integration are pluggable.

### 0.5 JSON-LD as Canonical Representation

JSON-LD 1.1 is the authoritative format for project documents, inputs, outputs, configuration, and inter-component contracts. The specific JSON-LD profile is normative and defined in §5. Alternative serializations (Turtle, N-Triples, Mermaid, Markdown) are derived artifacts only.

### 0.6 Offline Is First-Class

Inability to reach external systems is not an error state. The system defines valid behavior for partial information, deferred resolution, degraded execution, explicit uncertainty, missing remote contexts, unavailable imported ontology URLs, and offline import/export. See §16.

### 0.7 Spec Test

Before accepting any design, the following must answer "yes":

> Could a developer evaluate, reason about, and execute this system using only a browser, a local Node.js runtime, and JSON-LD files?

If the answer is no, the design violates this specification.

---

## 1. Executive Summary

The Visual RDF / Knowledge Graph Modeler is a deterministic, local-first, JSON-LD-native semantic modeling tool with browser and Node.js execution surfaces. Its purpose is to let users create, understand, persist, export, and share RDF-style knowledge graph models without requiring a server, triple store, SPARQL endpoint, database, or enterprise semantic platform.

**Edge Canonical Modeling** is the program of which this tool is the first deliverable. The program treats local-first ("edge") execution as the canonical computation site, in contrast to cloud-hosted enterprise modeling platforms. The intent is that a single user with a browser and a project file can complete a meaningful modeling task end to end.

The system shall help users:

- define or import classes, object properties, and datatype properties;
- create individual instances on a canvas;
- assign classes to instances;
- connect instances using object properties;
- attach literal values to instances using datatype properties;
- inspect the resulting subject-predicate-object assertions;
- generate Turtle, N-Triples, JSON-LD, Mermaid, and Markdown artifacts;
- save, reopen, export, and share projects;
- control IRI generation;
- distinguish imported terms from project-created terms;
- progress over time toward pattern templates, semantic linting, and shared canonical patterns.

The core system is not a web application. The core system is a deterministic JSON-LD transformation engine. The browser UI, canvas library, IndexedDB persistence, file downloads, ZIP packaging, and local folder sync are adapters around that core.

The product narrative is:

> Visible → Disciplined → Reusable → Canonical

First make RDF visible. Then make modeling disciplined. Then make patterns reusable. Then make community canonicality possible.

---

## 2. Product Goal

The system shall provide a browser-native and Node-executable modeling environment that allows users to visually create, persist, explain, export, and reuse semantic modeling projects.

The system shall remain:

- local-first;
- deterministic (per §9);
- JSON-LD-native (per §5);
- browser-executable and Node-executable;
- serverless by default;
- export-friendly;
- infrastructure-optional;
- suitable for workshops, demos, training, and lightweight semantic modeling;
- extensible toward future Edge Canonical Modeling workflows.

Each model is a durable, exportable semantic project, not a temporary diagram.

---

## 3. Product Scope

### 3.1 In Scope for v0.3 Engineering Baseline

- canonical JSON-LD project documents in the Visual Modeler Profile (§5);
- deterministic transformation from canonical project document to derived artifacts;
- visual RDF-style graph modeling on an instance canvas;
- TBox vocabulary management: classes, object properties, datatype properties;
- preservation of `rdfs:subClassOf` and `rdfs:subPropertyOf` (no reasoning);
- ABox individual instance creation and editing;
- object-property relation creation and editing;
- datatype-property literal-value assertions on instances;
- language-tagged and datatyped literals;
- project-created terms;
- imported ontology term extraction (Turtle);
- IRI generation policy with deterministic and UUID modes;
- cascading IRI updates with conflict detection;
- duplicate IRI validation;
- Turtle, N-Triples, semantic JSON-LD, Mermaid, and Markdown export;
- canonical project JSON-LD save/load with documented round-trip semantics;
- optional IndexedDB browser state adapter;
- optional ZIP export adapter;
- optional local folder sync adapter (File System Access API);
- starter examples (§24);
- contextual help content (§25).

### 3.2 Out of Scope for v0.3 MVP

- full OWL reasoning (entailment, subsumption inference, satisfiability);
- SPARQL query interface;
- server-hosted collaboration;
- required database persistence;
- cloud sync;
- authentication;
- centralized model repository;
- formal governance workflow;
- full SHACL validation engine (a structural validator is in scope);
- ontology alignment;
- multi-user simultaneous editing;
- imports-closure resolution;
- complete OWL restrictions UI (`owl:Restriction`, property chains, cardinality);
- blank-node UI (forward-compatible representation only; see §7.5);
- named graphs / quads (v0.3 produces only a default graph);
- ZIP import (export only in v0.3).

### 3.3 Future Scope

The architecture must remain compatible with: pattern templates, semantic linter warnings, model comparison, mapping diffs, CSV/JSON ingestion, SHACL export, JSON-LD context generation for developer-friendly projections, TypeScript interface export, community pattern submission with maturity status, and named-graph support.

---

## 4. Core Architectural Model

### 4.1 System Layers

#### 4.1.1 Core Computation Layer

Operates on canonical project documents and produces deterministic JSON-LD or derived textual artifacts. Includes:

- project validation;
- term extraction from imported RDF content;
- IRI generation;
- duplicate IRI detection;
- cascading IRI reference updates with collision handling;
- graph assertion construction;
- Turtle, N-Triples, JSON-LD compaction/expansion, Mermaid, Markdown generation;
- validation report generation;
- project manifest generation;
- migration of older project versions (§10).

The core layer must not depend on browser DOM, React, IndexedDB, localStorage, File System Access, network APIs, or remote services. It must be executable in Node.js with no peer dependency on a UI framework.

#### 4.1.2 State Adapter Layer

State adapters persist or resume canonical project documents. Permitted adapters: in-memory state, local file save/load, browser download/upload, IndexedDB, localStorage (non-canonical convenience state only), local folder sync, future repository adapter. No state adapter is required for core computation.

#### 4.1.3 Orchestration Layer

Orchestration invokes core computations in response to events: a UI button, a CLI command, an auto-regenerate trigger. Orchestration is not core; it is replaceable.

#### 4.1.4 Integration Layer

Integration handles interaction with the external world: File System Access API, cloud storage, repository adapters, remote ontology lookup. All integration is optional.

#### 4.1.5 UI Adapter Layer

The UI adapter renders project state and captures user intent. The reference UI may use React and React Flow, but canonical project state must not depend on React Flow's internal representation. Canvas node and edge state is derived from the Editor Layer of the project document (§6.2) and written back to it.

### 4.2 Source of Truth

The canonical source of truth is the **project document** serialized in the Visual Modeler Profile (§5). The project document has two conceptual layers (§6):

- **Semantic Layer:** the RDF graph being modeled.
- **Editor Layer:** project metadata, canvas layout, snapshots, validation reports.

Not source of truth: rendered canvas state, React component state, Mermaid text, Turtle output, N-Triples output, generated Markdown, IndexedDB records, ZIP file structure, local folder contents, in-memory RDF store. These are projections, caches, storage forms, packages, or derived artifacts.

### 4.3 Derived Artifacts

Derived artifacts must be reproducible from the canonical project document. If reproduction is not exact, the divergence must be documented (e.g., IRI regeneration was requested, mermaid renderer version differs).

---

## 5. Visual Modeler Profile (VMP)

This section defines the normative JSON-LD profile. The VMP fixes a specific JSON-LD shape so that two compliant implementations produce byte-identical canonical files for the same logical project state.

### 5.1 Project File

Recommended filename: `project.jsonld`. A project file is a single JSON-LD document conforming to the VMP. It contains the project metadata, settings, imported-ontology metadata, terms, instances, relations, literal-property assertions, canvas layouts, snapshots, validation reports, and export manifests.

### 5.2 Normative Context

Every project document must include this `@context` (or one semantically equivalent under JSON-LD expansion). Implementations must bundle this context locally and must not require remote resolution.

```json
{
  "@context": {
    "ecm": "https://edgecanonical.org/ns/modeler#",
    "rdf": "http://www.w3.org/1999/02/22-rdf-syntax-ns#",
    "rdfs": "http://www.w3.org/2000/01/rdf-schema#",
    "owl": "http://www.w3.org/2002/07/owl#",
    "xsd": "http://www.w3.org/2001/XMLSchema#",
    "id": "@id",
    "type": "@type",
    "ecm:terms":            { "@container": "@set" },
    "ecm:instances":        { "@container": "@set" },
    "ecm:relations":        { "@container": "@set" },
    "ecm:literalAssertions":{ "@container": "@set" },
    "ecm:ontologies":       { "@container": "@set" },
    "ecm:layouts":          { "@container": "@set" },
    "ecm:snapshots":        { "@container": "@set" },
    "ecm:classIris":        { "@type": "@id", "@container": "@set" },
    "ecm:subjectIri":       { "@type": "@id" },
    "ecm:predicateIri":     { "@type": "@id" },
    "ecm:objectIri":        { "@type": "@id" },
    "rdfs:subClassOf":      { "@type": "@id", "@container": "@set" },
    "rdfs:subPropertyOf":   { "@type": "@id", "@container": "@set" }
  }
}
```

The aliases `id` → `@id` and `type` → `@type` are mandatory. Implementations must not emit `@id` or `@type` directly in the compact form.

### 5.3 Canonical Serialization

The VMP canonical form is the compact JSON-LD document produced by the following normative serializer:

1. Apply the normative `@context` (§5.2).
2. Order top-level keys: `@context`, `id`, `type`, `ecm:specVersion`, then all other keys alphabetically.
3. Order keys within nested objects alphabetically.
4. Order array elements of `ecm:terms`, `ecm:instances`, `ecm:relations`, `ecm:literalAssertions`, `ecm:ontologies`, `ecm:layouts`, `ecm:snapshots` by their `id` (lexicographically).
5. Order IRI arrays (`ecm:classIris`, `rdfs:subClassOf`, `rdfs:subPropertyOf`) lexicographically.
6. Use two-space JSON indentation, LF line endings, no trailing whitespace, terminating newline.
7. Use UTF-8 encoding without BOM.
8. Use canonical ISO 8601 UTC timestamps (`2026-05-14T12:00:00Z`, no offsets, no fractional seconds in v0.3).

A "lossless round-trip" means: `serialize(parse(file)) == file` bytewise, where `file` is already in canonical form. If a file is loaded that is not in canonical form, the system normalizes it to canonical form on save and reports the normalization.

### 5.4 Project Metadata

Required top-level fields:

- `id` — project IRI, must be a `urn:uuid:` URN in v0.3;
- `type: "ecm:Project"`;
- `ecm:specVersion` — string, must be `"0.3"` for documents conforming to this spec;
- `ecm:name`;
- `ecm:createdAt`;
- `ecm:updatedAt`.

Optional:

- `ecm:description`, `ecm:author`, `ecm:version`, `ecm:license`, `ecm:notes`.

### 5.5 Settings Object

```json
{
  "type": "ecm:ProjectSettings",
  "ecm:iriGeneration": {
    "type": "ecm:IriGenerationPolicy",
    "ecm:mode": "ecm:uuid-urn",
    "ecm:baseIri": "https://example.org/instances/",
    "ecm:pattern": "{baseIri}{classSlug}_{labelSlug}_{uuid}",
    "ecm:separator": "_",
    "ecm:caseStyle": "lower-kebab",
    "ecm:includeClass": true,
    "ecm:includeLabel": true,
    "ecm:includeUuid": true
  },
  "ecm:export": {
    "ecm:defaultRdfFormat": "text/turtle",
    "ecm:includeProjectCreatedTerms": true,
    "ecm:includeImportedOntologyContent": false
  },
  "ecm:determinism": {
    "ecm:mode": "ecm:interactive",
    "ecm:seed": null
  }
}
```

The `ecm:determinism` block is new in v0.3 and controls how creation-time IRIs and timestamps are produced. See §9.

### 5.6 Imported Ontology Object

```json
{
  "id": "urn:uuid:ONTOLOGY_UUID",
  "type": "ecm:ImportedOntology",
  "ecm:projectId": "urn:uuid:PROJECT_UUID",
  "ecm:name": "Imported Ontology",
  "ecm:sourceFileName": "ontology.ttl",
  "ecm:format": "text/turtle",
  "ecm:contentHash": "sha256-...",
  "ecm:content": "@prefix ...",
  "ecm:createdAt": "2026-05-14T12:00:00Z",
  "ecm:importStatus": "ecm:parsed"
}
```

`ecm:content` may be omitted if the ontology source is included as a separate artifact in a ZIP package.

### 5.7 Term Object

A term represents a class, object property, or datatype property.

```json
{
  "id": "https://example.org/ontology/Person",
  "type": "owl:Class",
  "rdfs:label": "Person",
  "rdfs:comment": "A human person.",
  "rdfs:subClassOf": ["https://example.org/ontology/Agent"],
  "ecm:source": "ecm:project-created",
  "ecm:ontologyId": null,
  "ecm:createdAt": "2026-05-14T12:00:00Z",
  "ecm:updatedAt": "2026-05-14T12:00:00Z"
}
```

Allowed `type` values: `owl:Class`, `owl:ObjectProperty`, `owl:DatatypeProperty`. `rdfs:Class` is normalized to `owl:Class` on import.

Allowed `ecm:source` values: `ecm:imported-ontology`, `ecm:project-created`, `ecm:system-starter-example`.

`rdfs:subClassOf` is permitted on classes; `rdfs:subPropertyOf` is permitted on properties. These are preserved on round-trip but not reasoned over in v0.3.

### 5.8 Instance Object

```json
{
  "id": "urn:uuid:INSTANCE_UUID",
  "type": "ecm:Instance",
  "rdfs:label": "instance1",
  "ecm:classIris": [
    "https://example.org/ontology/Person"
  ],
  "rdfs:comment": "Optional instance note.",
  "ecm:createdAt": "2026-05-14T12:00:00Z",
  "ecm:updatedAt": "2026-05-14T12:00:00Z"
}
```

The `id` is the instance IRI. Instances may have zero or more class IRIs. On export, each class IRI produces an `rdf:type` assertion.

### 5.9 Relation Object

Relations express object-property assertions between two instances. The relation has its own `id` used for editor identification only; it has no RDF semantics.

```json
{
  "id": "urn:uuid:RELATION_UUID",
  "type": "ecm:RelationAssertion",
  "ecm:subjectIri": "urn:uuid:SUBJECT_UUID",
  "ecm:predicateIri": "https://example.org/ontology/participatesIn",
  "ecm:objectIri": "urn:uuid:OBJECT_UUID",
  "rdfs:label": "participates in",
  "ecm:createdAt": "2026-05-14T12:00:00Z",
  "ecm:updatedAt": "2026-05-14T12:00:00Z"
}
```

**RDF semantics:** the triple is determined solely by `{subjectIri, predicateIri, objectIri}`. Two relations with identical s/p/o are the same RDF triple. See §8 for the full discussion.

### 5.10 Literal Assertion Object

Literal assertions express datatype-property assertions from an instance to a literal value.

```json
{
  "id": "urn:uuid:LITERAL_ASSERTION_UUID",
  "type": "ecm:LiteralAssertion",
  "ecm:subjectIri": "urn:uuid:INSTANCE_UUID",
  "ecm:predicateIri": "https://example.org/ontology/hasName",
  "ecm:value": "Alice",
  "ecm:datatype": "xsd:string",
  "ecm:language": null,
  "ecm:createdAt": "2026-05-14T12:00:00Z",
  "ecm:updatedAt": "2026-05-14T12:00:00Z"
}
```

`ecm:datatype` is required. `ecm:language` is optional; if present and `ecm:datatype` is `xsd:string` or `rdf:langString`, the literal is emitted with a language tag. Allowed datatypes in v0.3: the XSD types `xsd:string`, `xsd:boolean`, `xsd:integer`, `xsd:decimal`, `xsd:double`, `xsd:date`, `xsd:dateTime`, `xsd:anyURI`, plus `rdf:langString`. Other datatypes may be present but are emitted verbatim without validation.

### 5.11 Canvas Layout Object

Canvas layout is Editor Layer metadata. It is not part of the RDF graph and is stripped from semantic exports.

```json
{
  "id": "urn:uuid:LAYOUT_UUID",
  "type": "ecm:CanvasLayout",
  "ecm:name": "Default Layout",
  "ecm:nodes": [
    {
      "type": "ecm:CanvasNode",
      "ecm:instanceIri": "urn:uuid:INSTANCE_UUID",
      "ecm:x": 100,
      "ecm:y": 150,
      "ecm:width": 220,
      "ecm:height": 120
    }
  ],
  "ecm:edges": [
    {
      "type": "ecm:CanvasEdge",
      "ecm:relationId": "urn:uuid:RELATION_UUID",
      "ecm:sourceHandle": "default-source",
      "ecm:targetHandle": "default-target"
    }
  ]
}
```

Canvas library-specific state (React Flow internal fields) must not be stored at this level. Library-specific state may live under a namespaced adapter field if needed (e.g., `ecm:adapterState/reactflow`), and must be discarded by other implementations without error.

### 5.12 Snapshot Object

```json
{
  "id": "urn:uuid:SNAPSHOT_UUID",
  "type": "ecm:Snapshot",
  "ecm:name": "Before refactor",
  "ecm:createdAt": "2026-05-14T12:00:00Z",
  "ecm:specVersion": "0.3",
  "ecm:projectState": { }
}
```

Snapshots store a full embedded copy of the project document at snapshot time, including its `ecm:specVersion`. Restoring a snapshot may require migration (§10). Snapshots are not modified by cascading IRI updates; see §13.7.

### 5.13 Validation Report Object

```json
{
  "id": "urn:uuid:REPORT_UUID",
  "type": "ecm:ValidationReport",
  "ecm:createdAt": "2026-05-14T12:00:00Z",
  "ecm:findings": [
    {
      "type": "ecm:ValidationFinding",
      "ecm:severity": "ecm:error",
      "ecm:code": "MISSING_PREDICATE",
      "ecm:message": "Relation has no predicate IRI.",
      "ecm:target": "urn:uuid:RELATION_UUID",
      "ecm:acknowledged": false
    }
  ]
}
```

`ecm:severity` is one of `ecm:error`, `ecm:warning`, `ecm:info`. `ecm:acknowledged` lets a user dismiss a warning without resolving it; see §17.5.

---

## 6. Semantic Layer and Editor Layer

The project document is conceptually partitioned into two layers. The layers share one JSON-LD document but are distinguishable by type.

### 6.1 Semantic Layer

The Semantic Layer is the set of project entities whose `type` is in the **semantic type allowlist**:

- `owl:Class`
- `owl:ObjectProperty`
- `owl:DatatypeProperty`
- `ecm:Instance`
- `ecm:RelationAssertion`
- `ecm:LiteralAssertion`

Together with the relevant predicates from these entities (`rdfs:label`, `rdfs:comment`, `rdfs:subClassOf`, `rdfs:subPropertyOf`, `ecm:classIris`, `ecm:subjectIri`, `ecm:predicateIri`, `ecm:objectIri`, `ecm:value`, `ecm:datatype`, `ecm:language`), the Semantic Layer is the data that will be projected to RDF.

### 6.2 Editor Layer

The Editor Layer is everything else in the project document:

- `ecm:Project` root metadata that is editor-internal (`ecm:createdAt`, `ecm:updatedAt`, `ecm:specVersion`);
- `ecm:ProjectSettings`;
- `ecm:ImportedOntology`;
- `ecm:CanvasLayout`, `ecm:CanvasNode`, `ecm:CanvasEdge`;
- `ecm:Snapshot`;
- `ecm:ValidationReport`, `ecm:ValidationFinding`;
- `ecm:source`, `ecm:ontologyId`, `ecm:acknowledged`, and other `ecm:`-prefixed editor predicates on semantic entities;
- the relation `id` (because it is editor-internal — see §8).

### 6.3 Semantic JSON-LD Export

The semantic JSON-LD export is the project document with the Editor Layer projected out. The projection algorithm is:

1. Start from the canonical project document.
2. Retain only entities whose `type` is in the semantic type allowlist (§6.1).
3. On each retained entity, retain only predicates in the semantic predicate allowlist:
   - `id`, `type`, `rdfs:label`, `rdfs:comment`;
   - `rdfs:subClassOf` (on classes), `rdfs:subPropertyOf` (on properties);
   - `ecm:classIris`, `ecm:subjectIri`, `ecm:predicateIri`, `ecm:objectIri` (rewritten — see step 4);
   - `ecm:value`, `ecm:datatype`, `ecm:language`.
4. Rewrite reified assertions into their RDF triples (§8.3).
5. Apply the canonical serializer (§5.3) to the resulting document.

The semantic JSON-LD export, when expanded, yields the RDF graph the project models. The Turtle and N-Triples exports are produced from this same projection.

### 6.4 Round-Trip Equivalences

Two equivalences are defined:

- **Canonical equivalence:** byte-identical after canonical serialization. The project file round-trips losslessly under save/load.
- **Semantic equivalence:** identical expanded JSON-LD graphs (modulo blank-node renaming) after applying the semantic projection. Two project documents may be canonically distinct but semantically equivalent (e.g., they differ only in canvas layout).

Validation report VR-008 and NFR-012 reference canonical equivalence. Comparisons of "the model" reference semantic equivalence.

---

## 7. Semantic Model Coverage

### 7.1 In Scope for v0.3

- **Classes** (`owl:Class`) with labels, comments, and optional `rdfs:subClassOf`.
- **Object properties** (`owl:ObjectProperty`) with labels, comments, optional `rdfs:subPropertyOf`. Domain and range may be modeled in the UI as informational hints but are not exported as `rdfs:domain` / `rdfs:range` triples in v0.3 unless explicitly added by the user as project-created assertions (deferred — see §7.6).
- **Datatype properties** (`owl:DatatypeProperty`) with labels, comments, optional `rdfs:subPropertyOf`.
- **Instance type assertions** via `ecm:classIris`, exported as `rdf:type` triples.
- **Object-property assertions** between two instances (§5.9, §8).
- **Datatype-property assertions** from an instance to a literal (§5.10).
- **Typed literals** for the XSD types listed in §5.10.
- **Language-tagged string literals** via `ecm:language`.

### 7.2 Subclass and Subproperty

`rdfs:subClassOf` and `rdfs:subPropertyOf` are preserved on round-trip. v0.3 does not perform inference; the UI may display the asserted hierarchy but does not derive entailed types.

### 7.3 Blank Nodes (Forward-Compatible Only)

v0.3 does not provide UI support for blank nodes. The canonical project document permits IRIs of the form `_:bn_<identifier>` in `ecm:subjectIri`, `ecm:objectIri`, and `ecm:classIris`. On RDF export, such identifiers are emitted as blank nodes. Imported Turtle may produce blank-node identifiers; these are preserved through round-trip but not exposed for editing in v0.3.

### 7.4 Named Graphs (Out of Scope)

v0.3 produces only a single default graph. N-Quads is not an export format. Future versions may add named-graph support; the VMP reserves `ecm:graphIri` for that purpose.

### 7.5 Domain and Range (Deferred)

The MVP does not model `rdfs:domain` / `rdfs:range` as first-class TBox fields. A user who needs them can declare them via project-created assertions in v0.4. Documented as a known gap.

### 7.6 OWL Restrictions, Property Chains, Cardinality (Out of Scope)

Out of scope for v0.3, as noted in §3.2. The VMP does not reserve fields for these; future versions will introduce them under their own profile bump.

---

## 8. Relation Representation

### 8.1 Design Choice

A relation in the project document is a reified record: it has an `id`, timestamps, and an optional label, in addition to its subject, predicate, and object. This design is chosen so that:

1. The UI can attach editor metadata (creation time, notes, position-on-canvas) to a specific assertion without contaminating the RDF graph.
2. Two visually distinct edges on the canvas can refer to the same triple if both happen to have identical s/p/o — useful in modeling sessions where the user is exploring.
3. Deleting a UI representation of a relation is a clean operation against the relation `id`, not against a triple pattern.

This is **not** RDF reification in the formal sense (`rdf:Statement` with `rdf:subject`, `rdf:predicate`, `rdf:object`). The reification is internal to the editor and is **stripped on export**.

### 8.2 RDF Semantics

The RDF triple expressed by a relation is `{ecm:subjectIri, ecm:predicateIri, ecm:objectIri}`. The relation `id` has no RDF meaning. Two relations with identical s/p/o express the same triple. On semantic export, duplicate s/p/o tuples collapse to a single RDF triple. A validation warning (VR-009) is raised on save if duplicates exist.

### 8.3 Export Rewriting

During semantic export (§6.3, step 4), each relation is replaced by a triple in the RDF graph. The relation `id`, `ecm:createdAt`, `ecm:updatedAt`, and `rdfs:label` on the relation are discarded.

### 8.4 Alternatives Considered

The alternatives considered and rejected for v0.3:

- **Flat triple list.** Modeling relations as `{s, p, o}` tuples without an `id`. Rejected because the canvas needs stable per-edge identification for selection, deletion, and editor metadata.
- **RDF-star (RDF 1.2).** Annotating triples with metadata using `<<s p o>>` syntax. Considered, but the tooling ecosystem (N3.js, common Turtle parsers) does not yet uniformly support it, and exporting editor metadata into the RDF graph violates the layer separation (§6).
- **Named graphs.** Putting editor metadata in a separate named graph. Deferred to v0.4 along with general named-graph support.
- **Formal RDF reification (`rdf:Statement`).** Rejected because it bloats the RDF graph, has weak truth semantics, and is widely discouraged.

The chosen design treats editor metadata as private to the editor and keeps the exported RDF clean.

---

## 9. Determinism Model

### 9.1 Transformation Determinism

Given a complete canonical project document, the same settings, and the same operation, the system produces byte-identical output for: canonical save, semantic JSON-LD export, Turtle export, N-Triples export, Mermaid export, Markdown export, and validation report generation.

Two compliant implementations must produce byte-identical Turtle, N-Triples, semantic JSON-LD, and Mermaid output for the same input project. This is a conformance requirement and is verified by golden-file tests (§21).

### 9.2 Creation-Time Non-Determinism

Interactive creation introduces non-deterministic values:

- **Timestamps:** `ecm:createdAt` and `ecm:updatedAt` are wall-clock by default.
- **IRIs:** in `ecm:uuid-urn` mode, instance and relation IRIs are random UUIDs.

These values are non-deterministic only until they are persisted into the project document. Once persisted, all downstream transformations are deterministic (§9.1).

### 9.3 Deterministic Mode

The optional `ecm:determinism` block (§5.5) configures the system to produce deterministic creation:

- `ecm:mode: "ecm:deterministic"` enables deterministic creation.
- `ecm:seed`: a string seed; required if deterministic mode is enabled.

In deterministic mode:

- Timestamps are derived from an explicit clock value passed into the operation (CLI flag `--clock`) rather than wall-clock.
- UUIDs are replaced with UUIDv5 derived from the seed and the operation context.
- Cascading IRI updates produce the same target IRIs given the same inputs.

Deterministic mode is intended for CLI batch processing, test fixtures, and reproducible builds. The browser UI defaults to `ecm:interactive` mode.

### 9.4 Honest Statement

The spec does not claim that "the same user actions produce the same project file." It claims that the same fully-populated project file produces the same derived artifacts, and that an opt-in deterministic mode makes creation operations reproducible as well.

---

## 10. Versioning and Migration

### 10.1 Spec Version

Every project document must carry `ecm:specVersion`. v0.3 documents have `"0.3"`. Implementations must reject documents whose `ecm:specVersion` is missing (treat as legacy — see §10.4) or whose major.minor is higher than the implementation's own version (forward-incompatible).

### 10.2 Compatibility Policy

- **Patch-level changes** (`0.3.x`) are backward and forward compatible within `0.3`.
- **Minor changes** (`0.4`, `0.5`, …) may introduce new fields. v0.3 implementations must reject files with a higher minor version rather than silently dropping unknown fields.
- **Major changes** (`1.0`, `2.0`) may break compatibility; migration is required.

### 10.3 Migration

The core layer provides a migration function:

```
migrate(projectDocument, targetVersion) → { document, migrationReport }
```

Migration is the responsibility of the receiving (newer) version. A v0.4 implementation must migrate v0.3 documents. The migration report lists each field added, removed, or transformed.

Migration is non-destructive: the original document is preserved on disk under `project.jsonld.pre-migration.<sourceVersion>` unless the caller opts out. UI surfaces a "Project was migrated from v0.X to v0.Y" notice.

### 10.4 Legacy Documents

v0.2 documents (missing `ecm:specVersion`, missing `ecm:literalAssertions`, missing `rdfs:subClassOf` / `rdfs:subPropertyOf` on terms) are loaded as legacy v0.2 and migrated to v0.3 on load. The migration:

- adds `ecm:specVersion: "0.3"`;
- initializes `ecm:literalAssertions` to `[]`;
- preserves all existing entities;
- if `ecm:determinism` is missing, initializes to `ecm:interactive`.

### 10.5 Snapshot Migration

A snapshot's embedded `ecm:projectState` carries its own `ecm:specVersion`. On restore, if the snapshot's version differs from the current project's version, the snapshot is migrated before being restored. The migration report is shown to the user before commit.

---

## 11. Concurrency Model

v0.3 is single-user. The concurrency model addresses scenarios where a single user creates contention by accident.

### 11.1 Scope

- Single-user, single-machine.
- Multiple browser tabs may have the same project open from IndexedDB.
- The CLI may run while the browser has the project open.
- The local folder sync adapter (File System Access API) may see the file change underneath the editor.

Multi-user simultaneous editing is out of scope (§3.2).

### 11.2 Last-Write-Wins with Stale Detection

The system uses last-write-wins as the default policy. On save, the system compares the in-memory `ecm:updatedAt` against the persisted `ecm:updatedAt`. If they differ and the in-memory project was loaded from that persisted version, the save proceeds. If the persisted version has been updated since load (its `ecm:updatedAt` is newer than the load-time value), the system warns the user before overwriting and offers:

- save anyway (last-write-wins);
- save as new project (with a new `id`);
- discard and reload.

The system does not perform automatic merging. Stale detection is best-effort; the user is informed but not blocked.

### 11.3 File Locks

The CLI acquires a POSIX advisory file lock (`flock`) on project files for the duration of a mutating operation (export modes do not lock). On Windows, file locking is best-effort via `LockFileEx`. Lock failures are reported but not silently swallowed.

### 11.4 IndexedDB Coordination

When multiple tabs share an IndexedDB project, the implementation should use `BroadcastChannel` (where available) to notify other tabs of project changes. Tabs receiving a change notification reload their state from IndexedDB rather than overwriting it.

### 11.5 What Is Not Promised

The system does not promise atomicity across multiple operations. It does not promise that two concurrent saves are linearizable. A user who runs the CLI export while editing in the browser may see the browser overwrite the CLI's output if the browser saves later.

---

## 12. Security and Threat Model

### 12.1 Threat Surface

Even as a local-first tool, the system has an attack surface:

- **Malicious Turtle import:** crafted to consume memory or time during parsing (deeply nested blank-node chains, very long term lists, recursive imports via `owl:imports`).
- **Malicious JSON-LD project file:** crafted with deep `@context` nesting, remote context URLs designed to time out or exfiltrate metadata, or pathological JSON-LD framing.
- **Path traversal in CLI:** filename arguments containing `..` or absolute paths outside the working directory.
- **ZIP bomb on future ZIP import:** out of scope for v0.3 but flagged for v0.4.

### 12.2 Mitigations

- **No remote context resolution.** JSON-LD `@context` URLs are not fetched. The system uses bundled context definitions only. Documents with unrecognized remote context URLs are loaded with a warning and unresolved references are preserved as opaque IRIs.
- **No `owl:imports` resolution.** Imported ontologies are read from the local file passed in. `owl:imports` statements in imported content are preserved but not followed.
- **Import size limits.** Default 50 MB for a single imported file, configurable via settings. Files exceeding the limit are rejected with a clear message.
- **Import term-count thresholds.** Per §14.2, term counts above the warning threshold trigger degraded mode.
- **CLI path containment.** CLI file path arguments are resolved relative to the current working directory. Absolute paths and `..` traversal are accepted only if they remain inside the working directory tree, unless `--allow-outside-cwd` is passed.
- **No JavaScript evaluation of imported content.** Ontology content is parsed, not executed.
- **Browser sandbox.** The browser UI runs entirely in the browser sandbox; it does not require elevated permissions. File System Access API prompts the user per directory.

### 12.3 What Is Not a Threat Model Concern

- **Data confidentiality on disk:** the system writes plain-text project files; encryption at rest is the operating system's responsibility.
- **Authentication:** there is none, by design.
- **Data integrity across machines:** the system does not synchronize; integrity is per-file.

### 12.4 Known Limitations

- Imported ontology content is held in the project document. A user who shares a project file shares its imported ontology content.
- The `ecm:contentHash` of an imported ontology is informational only; it is not used as an integrity check on load.

---

## 13. IRI Identity and Propagation

### 13.1 Identity Principle

IRIs are semantic identifiers. Changing an IRI changes identity unless the operation is an explicit project-local refactor. All IRI edits must be intentional, visible, and integrity-preserving.

### 13.2 Project-Created Term IRI Change

If a project-created class IRI is edited as a refactor, all instance `ecm:classIris` entries referencing the old IRI are updated to the new IRI.

If a project-created object property or datatype property IRI is edited as a refactor, all relation and literal-assertion `ecm:predicateIri` entries referencing the old IRI are updated.

The user is warned before the cascade with: old IRI, new IRI, number of affected references, list of affected entity types.

### 13.3 Imported Term IRI Change

Imported ontology term IRIs are immutable in v0.3. The user has three options for substitution:

- create a project-local replacement term with a new IRI and migrate references manually;
- copy the imported term into the project-created vocabulary;
- remove the ontology and re-import a corrected version.

The MVP supports project-local replacement terms only.

### 13.4 Instance IRI Change

If an instance IRI is edited as a refactor, all relation `ecm:subjectIri` / `ecm:objectIri` and literal-assertion `ecm:subjectIri` references are updated. The user is warned before the cascade.

### 13.5 Collision Handling

A cascading update may produce a collision: the target IRI already exists on another entity. The system:

1. Detects the collision before applying the update.
2. Aborts the update and returns a collision report.
3. Offers the user the choice to: cancel; merge entities (where applicable — instances only, in v0.3); rename the colliding entity first.

Term-on-term collisions are not auto-merged in v0.3 (deferred to v0.4). Instance-on-instance merges combine class assignments and re-point relations; the merge report lists every change.

### 13.6 Project-Created Replacing Imported

If a project-created term is created with the intent to supersede an imported term, the user may invoke a "remap references" operation that rewrites instance and relation references from the imported IRI to the project-created IRI. The imported term remains in the project (as immutable imported metadata) but is no longer referenced.

### 13.7 Snapshots and Cascading Updates

Snapshots are **not** modified by cascading IRI updates. A snapshot preserves the project state at snapshot time, including the old IRIs. Restoring a snapshot returns the project to its earlier state including its earlier IRIs. The user is warned on restore if the restore would re-introduce IRIs that were renamed in the current project state.

### 13.8 Refactor vs. Create New

In the UI, editing an IRI offers a single explicit choice:

- **Refactor IRI:** update this identifier and all project references.
- **Create New Term/Instance:** preserve the old identifier and create a new resource.

The default is "Refactor IRI" with a confirmation dialog showing affected references.

### 13.9 Deterministic IRI Generation

In `ecm:interactive` mode, IRI generation may use UUIDs. Once generated, the IRI is persisted in the canonical project document and never regenerated on load or save.

In `ecm:deterministic` mode (§9.3), IRI generation uses UUIDv5 derived from the seed and the operation context. Re-running the same operation with the same inputs produces the same IRI.

Derived exports never regenerate identifiers unless the user explicitly requests regeneration through a refactor operation.

---

## 14. Ontology Import

### 14.1 Import Scope

The MVP ontology importer extracts:

- explicit `owl:Class` resources;
- explicit `rdfs:Class` resources (normalized to `owl:Class`);
- explicit `owl:ObjectProperty` resources;
- explicit `owl:DatatypeProperty` resources;
- `rdfs:label` and `rdfs:comment` values;
- `rdfs:subClassOf` and `rdfs:subPropertyOf` values (preserved verbatim);
- source ontology and file metadata.

Out of scope for MVP: OWL restrictions, equivalent class reasoning, subclass hierarchy inference, property chains, imports-closure resolution, blank-node reasoning, class expression editing, disjointness reasoning, ontology consistency checking, `rdfs:domain` / `rdfs:range` import.

`rdfs:domain` and `rdfs:range` triples are preserved in the imported ontology's raw content but are not surfaced as first-class TBox fields in v0.3 (see §7.5).

### 14.2 Large Ontology Handling

The system does not eagerly render massive term lists.

- Comfortable display target: up to 5,000 extracted terms.
- Warning threshold: 10,000 extracted terms.
- Hard limit: 50 MB file size (§12.2).

If an ontology exceeds the warning threshold, the system:

- shows an import warning with the extracted term count;
- offers continue in degraded mode (search-only, virtualized list, partial extraction);
- offers cancel;
- preserves partial import status explicitly in the import report.

### 14.3 Canvas Scale Targets

The visual canvas prioritizes understandable modeling, not bulk graph visualization.

- MVP targets: 50–150 visible nodes; 100–300 visible edges.
- Stretch targets: 500 nodes; 1,000 edges with degraded rendering or search/filter support.

If a project exceeds comfortable canvas bounds, the system warns, continues preserving the project, and supports filtering / subgraph views (filtering is in scope for v0.3; subgraph views deferred to v0.4).

### 14.4 Export Scale

Derived RDF export supports larger graphs than the visual canvas. MVP target: at least 10,000 triples generated locally in browser or Node, subject to device constraints.

---

## 15. Reference Implementation Guidance

Non-normative.

### 15.1 Language and Runtime

- TypeScript for shared core and UI.
- Node.js-compatible core modules.
- Browser bundle for UI.

### 15.2 UI Framework

React.

### 15.3 Canvas Library

React Flow. Custom node cards, directed edges, edge labels, drag/drop layout, zoom/pan, serializable node and edge positions. React Flow state must be derived from / synchronized with the canonical Editor Layer; React Flow internal state is not canonical.

### 15.4 RDF Library

N3.js for parsing and serializing Turtle and N-Triples.

### 15.5 Mermaid Library

Mermaid.js. Mermaid text is a derived artifact, not source of truth.

### 15.6 ZIP Packaging

JSZip or equivalent.

### 15.7 JSON-LD Processing

`jsonld.js` or equivalent, configured with **remote context resolution disabled** (§12.2). The MVP can use a constrained JSON-LD profile that avoids the need for full expansion/compaction on every save — only on semantic export.

### 15.8 State Management

Canonical project state is managed as immutable updates to the project document. UI framework state is derived. Reducer / command-pattern dispatch is recommended. Library choices: Zustand, Redux Toolkit, XState, or custom reducer architecture. The state library is not core; core transformations are callable independently.

---

## 16. Offline and Degraded Behavior

### 16.1 Missing Remote Context

JSON-LD `@context` URLs are never resolved (§12.2). The system uses the bundled normative context. Documents referencing unrecognized context URLs are loaded with a warning; unresolved references are preserved as opaque IRIs.

### 16.2 Missing Ontology URL

If an imported ontology references an external URL that cannot be reached, this is not fatal. The system preserves the unresolved reference, reports deferred resolution, and continues with available local content.

### 16.3 Large File Degraded Mode

For oversized imports the system warns, attempts bounded extraction where feasible, provides an import report, and never crashes silently.

### 16.4 Export Offline

All exports work offline from the canonical project document.

### 16.5 Explicit Uncertainty

When the system cannot fully interpret an ontology import, JSON-LD context, or term reference, it produces warnings rather than silently assuming correctness.

---

## 17. Validation Requirements

### 17.1 Severity Levels

Three severities: **error**, **warning**, **info**.

- **Errors** block save by default and block export unconditionally. The user may override the save block per session.
- **Warnings** do not block save or export. They appear in the validation report and the UI inspector.
- **Info** findings are informational only.

### 17.2 Hard Errors

| Code | Description |
|------|-------------|
| `MISSING_PROJECT_ID` | Project document has no `id`. |
| `MISSING_PROJECT_NAME` | Project document has no `ecm:name`. |
| `INVALID_SPEC_VERSION` | `ecm:specVersion` is missing, malformed, or higher than implementation. |
| `MALFORMED_TERM` | A term lacks `id`, `type`, or has unrecognized `type`. |
| `MALFORMED_INSTANCE` | An instance lacks `id` or has malformed `ecm:classIris`. |
| `MALFORMED_RELATION` | A relation lacks `id`, `ecm:subjectIri`, `ecm:predicateIri`, or `ecm:objectIri`. |
| `MALFORMED_LITERAL_ASSERTION` | A literal assertion lacks required fields. |
| `DUPLICATE_IRI` | Two distinct entities share an `id` and represent different resources (e.g., a term and an instance, or two terms of different types). |
| `DANGLING_INSTANCE_CLASS_REF` | An instance's `ecm:classIris` references an IRI with no corresponding term in the project or imported ontologies. |
| `DANGLING_RELATION_SUBJECT_REF` | A relation's `ecm:subjectIri` references no known instance. |
| `DANGLING_RELATION_OBJECT_REF` | A relation's `ecm:objectIri` references no known instance. |
| `DANGLING_RELATION_PREDICATE_REF` | A relation's `ecm:predicateIri` references no known object property. |
| `DANGLING_LITERAL_SUBJECT_REF` | A literal assertion's subject references no known instance. |
| `DANGLING_LITERAL_PREDICATE_REF` | A literal assertion's predicate references no known datatype property. |

### 17.3 Warnings

| Code | Description |
|------|-------------|
| `DUPLICATE_TRIPLE` | Two relations express the same `{s, p, o}` triple. |
| `DISCONNECTED_INSTANCE` | An instance has no incoming or outgoing relations. |
| `INSTANCE_WITHOUT_CLASS` | An instance has zero entries in `ecm:classIris`. |
| `TERM_WITHOUT_LABEL` | A term has no `rdfs:label`. |
| `LITERAL_DATATYPE_MISMATCH` | A literal value does not parse against its declared `ecm:datatype`. |
| `LARGE_IMPORT` | An imported ontology exceeds the warning threshold. |
| `STALE_SAVE_TARGET` | The on-disk project has been updated since load (§11.2). |

### 17.4 Info

| Code | Description |
|------|-------------|
| `LEGACY_DOCUMENT_MIGRATED` | The project was loaded as legacy and migrated. |
| `NORMALIZED_ON_SAVE` | The loaded project was not in canonical form; it was normalized on save. |

### 17.5 Suppression

Warnings and info findings may be acknowledged. An acknowledged finding remains in the validation report but is visually suppressed in the UI. Acknowledgement is per-finding and per-target — re-creating the condition produces a new, un-acknowledged finding.

### 17.6 Generated Artifact Validity

Generated Turtle and N-Triples must parse cleanly under N3.js with no errors. This is a build-time conformance requirement validated by tests (§21), not a runtime self-check.

### 17.7 Structural JSON-LD Validation

The project document is structurally validated against the VMP profile on load and before save. The validator is a custom structural validator. SHACL-based validation is deferred to a future version.

---

## 18. Functional Requirements

### 18.1 Core Computation

| ID | Requirement |
|----|-------------|
| FR-C001 | Validate project document against the VMP profile and produce a validation report. |
| FR-C002 | Derive RDF assertions from the Semantic Layer per §6.3. |
| FR-C003 | Serialize derived RDF as Turtle. |
| FR-C004 | Serialize derived RDF as N-Triples. |
| FR-C005 | Serialize the Semantic Layer as JSON-LD (semantic JSON-LD export). |
| FR-C006 | Generate Mermaid text from the project document and a selected layout. |
| FR-C007 | Generate a Markdown summary listing terms, instances, and assertions. |
| FR-C008 | Generate a templated triple-narration ("Alice (Person) participates in Meeting1 (Meeting)"). Full natural-language generation is out of scope. |
| FR-C009 | Apply the IRI generation policy to a new instance or term. |
| FR-C010 | Perform cascading IRI update with collision detection (§13). |
| FR-C011 | Extract explicit named terms from Turtle, preserving `rdfs:subClassOf` / `rdfs:subPropertyOf`. |
| FR-C012 | Produce an export manifest listing generated artifacts and their content hashes. |
| FR-C013 | Migrate legacy v0.2 documents to v0.3 on load (§10.4). |
| FR-C014 | Normalize loaded non-canonical documents to canonical form (§5.3). |

### 18.2 UI

| ID | Requirement |
|----|-------------|
| FR-U001 | Create a new project. |
| FR-U002 | Open a project JSON-LD file. |
| FR-U003 | Save the active project as `project.jsonld` in canonical form. |
| FR-U004 | Display a term sidebar with classes, object properties, and datatype properties. |
| FR-U005 | Visually distinguish imported, project-created, and starter-example terms. |
| FR-U006 | Add a project-created class. |
| FR-U007 | Add a project-created object property. |
| FR-U008 | Add a project-created datatype property. |
| FR-U009 | Edit project-created terms (label, comment, IRI). |
| FR-U010 | Prevent direct editing of imported ontology terms (§13.3). |
| FR-U011 | Create an instance on the canvas. |
| FR-U012 | Edit an instance (label, IRI, class assignments, comment). |
| FR-U013 | Provide auto-generate, manual override, preview, regenerate, and duplicate-warning behavior on the IRI field. |
| FR-U014 | Draw a directed object-property relation between two instances. |
| FR-U015 | Select the predicate for a relation. |
| FR-U016 | Reverse a relation's direction. |
| FR-U017 | Delete a relation. |
| FR-U018 | Add a literal-property assertion to an instance: select datatype property, enter value, optionally set language tag. |
| FR-U019 | Edit and delete literal assertions. |
| FR-U020 | Show plain-language and RDF-like triple previews for selected relations and literal assertions. |
| FR-U021 | Generate and render Mermaid from the active project. |
| FR-U022 | Copy Mermaid text and download `.mmd` files. |
| FR-U023 | Generate and download Turtle. |
| FR-U024 | Generate and download N-Triples and semantic JSON-LD (recommended). |
| FR-U025 | Export a ZIP package (recommended). |
| FR-U026 | Load starter examples (§24). |
| FR-U027 | Display contextual help (§25). |
| FR-U028 | Display the validation report and allow acknowledgement of warnings (§17.5). |
| FR-U029 | Show "Project was migrated from v0.X" notice on legacy load (§10.4). |
| FR-U030 | Show stale-save warning when the on-disk file has been updated since load (§11.2). |

### 18.3 State Adapters

| ID | Requirement |
|----|-------------|
| FR-S001 | In-memory state adapter for browser and Node use. |
| FR-S002 | File save/load adapter (browser download/upload, Node file I/O). |
| FR-S003 | IndexedDB adapter (optional). Stores canonical project documents losslessly. |
| FR-S004 | Project picker, if IndexedDB is implemented. |
| FR-S005 | ZIP packaging adapter (export only in v0.3). |
| FR-S006 | Local folder sync via File System Access API where available (optional). |
| FR-S007 | BroadcastChannel coordination across browser tabs sharing IndexedDB (optional but recommended; §11.4). |

### 18.4 Export

| ID | Requirement |
|----|-------------|
| FR-E001 | Project JSON-LD export (canonical form). |
| FR-E002 | Turtle export. |
| FR-E003 | N-Triples export (recommended). |
| FR-E004 | Semantic JSON-LD export (recommended). |
| FR-E005 | Mermaid export. |
| FR-E006 | Markdown summary export (recommended). |
| FR-E007 | ZIP export with the layout in §19. |

---

## 19. ZIP Export Layout

```
/project.jsonld
/contexts/project-context.jsonld
/ontologies/<imported-ontology-files>
/rdf/graph.ttl
/rdf/graph.nt
/rdf/graph.jsonld
/diagrams/default.mmd
/docs/model-summary.md
/reports/validation-report.jsonld
/manifest.jsonld
```

The `manifest.jsonld` lists each artifact with its filename, MIME type, and SHA-256 content hash.

---

## 20. Non-Functional Requirements

| ID | Requirement |
|----|-------------|
| NFR-001 | Core computation runs in both browser and Node.js. |
| NFR-002 | No database, server, cloud service, or broker is required for core operation. |
| NFR-003 | Core transformations are deterministic per §9. |
| NFR-004 | Canonical project representation conforms to the VMP (§5). |
| NFR-005 | State, orchestration, integration, UI, and export packaging are adapterized. |
| NFR-006 | The system works offline. |
| NFR-007 | The system avoids lock-in: exports are open formats. |
| NFR-008 | The UI explains semantic modeling concepts in context; content per §25. |
| NFR-009 | The UI exposes IRIs, RDF, terms, triples, and serializations. |
| NFR-010 | The canvas prioritizes understandable modeling over bulk visualization. |
| NFR-011 | Performance bounds per §14.2 and §14.3. |
| NFR-012 | Lossless canonical round-trip per §5.3 and §6.4. |
| NFR-013 | Two compliant implementations produce byte-identical canonical and derived artifacts per §9.1. |

---

## 21. Test Strategy

This section is normative for v0.3 "engineering-ready" status.

### 21.1 Test Layers

**Unit tests** cover individual core functions: IRI generation, term extraction, cascading update step, JSON-LD canonicalization, validation rule evaluation, Turtle/N-Triples emitters, Mermaid emitter, Markdown emitter.

**Property-based tests** cover invariants:

- Cascading IRI update is reversible: `update(update(P, A→B), B→A)` is canonically equivalent to `P`.
- Cascading IRI update is idempotent: a second `update(P, A→A)` is a no-op.
- Canonical serialization is idempotent: `serialize(parse(serialize(P)))` equals `serialize(P)` bytewise.
- Semantic projection is stable: adding canvas layout entries does not change the semantic JSON-LD export.

**Golden-file tests** anchor the canonical outputs of representative projects:

- Each starter example has committed golden files for `project.jsonld`, `graph.ttl`, `graph.nt`, `graph.jsonld`, `default.mmd`, and `model-summary.md`.
- Golden files are byte-compared on every CI run.
- Updating golden files requires explicit human review (the diff goes through PR).

**Round-trip tests** verify save/load:

- Load each starter example, save it, compare byte-identical to original.
- Load a v0.2 fixture, migrate, save, compare to a committed v0.3 expected output.

**CLI integration tests** invoke `node index.js` against fixture projects and compare stdout/stderr/files to expected outputs.

**UI smoke tests** drive the browser UI (Playwright recommended):

- Create instance → assign class → draw relation → generate Turtle → assert Turtle content matches golden.
- Load project file → modify → save → reload → assert state preserved.

**Conformance tests** verify that the implementation produces the canonical outputs required by §9.1 and NFR-013. The conformance suite is the set of golden-file tests plus the round-trip tests.

### 21.2 Coverage Targets

- Core layer: branch coverage ≥ 85%.
- State and export adapters: line coverage ≥ 75%.
- UI: smoke-test coverage of the user flows in §22 (MVP definition).

### 21.3 Test Fixtures

Committed under `test/fixtures/`:

- `legacy-v0.2/` — v0.2 project files for migration testing.
- `canonical-v0.3/` — minimal, small, and medium v0.3 project files.
- `ontologies/` — small Turtle fixtures, including one with subclass hierarchy, one with datatype properties, one with blank nodes, one over the warning threshold.
- `malformed/` — fixtures that must produce specific validation errors.

### 21.4 Determinism Verification

A CI job runs the deterministic-mode CLI export against the canonical fixtures with a fixed seed and clock and compares outputs to committed golden files. Drift indicates a determinism regression.

---

## 22. MVP Definition v0.3

A user must be able to:

1. Open the browser app.
2. Create a new project.
3. Save the project as `project.jsonld` in canonical form.
4. Reopen the project from `project.jsonld`.
5. Import a Turtle ontology file.
6. Extract explicit classes, object properties, and datatype properties.
7. Add a project-created class.
8. Add a project-created object property.
9. Add a project-created datatype property.
10. Configure IRI generation.
11. Create instances with generated or manual IRIs.
12. Assign classes to instances.
13. Draw directed object-property relations between instances.
14. Add literal-property assertions to instances.
15. Select object properties for relations; reverse or delete relations.
16. See plain-language and RDF-like triple previews.
17. Generate Turtle.
18. Generate Mermaid.
19. Render Mermaid in the browser.
20. Copy/download Mermaid; download Turtle.
21. Generate a Markdown summary.
22. Validate duplicate IRIs, missing references, and dangling references.
23. Perform cascading IRI updates with collision detection.
24. Acknowledge warnings.
25. Load at least three starter examples.

A developer must be able to:

1. Run core validation against a project JSON-LD file in Node.
2. Generate Turtle, N-Triples, semantic JSON-LD, Mermaid, and Markdown from a project file in Node.
3. Run the cascading IRI update in Node.
4. Migrate a v0.2 file to v0.3 in Node.
5. Run the browser UI without a server-side backend.
6. Reproduce all golden outputs byte-identically with the deterministic CLI.

---

## 23. CLI / Node Execution Surface

```bash
node index.js validate project.jsonld
node index.js export project.jsonld --format turtle --out graph.ttl
node index.js export project.jsonld --format n-triples --out graph.nt
node index.js export project.jsonld --format json-ld --out graph.jsonld
node index.js export project.jsonld --format mermaid --out diagram.mmd
node index.js export project.jsonld --format markdown --out model-summary.md
node index.js export project.jsonld --format zip --out package.zip
node index.js import-ontology project.jsonld ontology.ttl --out updated-project.jsonld
node index.js migrate old-project.jsonld --out new-project.jsonld
node index.js refactor-iri project.jsonld --old IRI_A --new IRI_B --out new.jsonld
```

Deterministic flags:

```bash
node index.js export project.jsonld --format turtle \
  --deterministic --seed "myseed" --clock "2026-01-01T00:00:00Z" \
  --out graph.ttl
```

The CLI operates only on local files unless an explicit integration adapter is invoked. Path arguments are resolved relative to the working directory and rejected if they escape it, unless `--allow-outside-cwd` is passed (§12.2).

Exit codes:

- `0` — success.
- `1` — validation errors.
- `2` — file I/O errors.
- `3` — malformed input.
- `4` — unsupported version (file's `ecm:specVersion` is higher than implementation).

---

## 24. Starter Examples

The MVP ships at least three starter examples as canonical project JSON-LD documents. The starters use universally graspable scenarios to avoid presuming ontology background.

**MVP starters:**

1. **Customer Places Order.** Two instance types (Customer, Order), one object property (`places`), one datatype property (`hasOrderNumber`).
2. **Author Wrote Book.** Two instance types (Author, Book), one object property (`wrote`), datatype properties for title and ISBN.
3. **Employee Works At Company.** Two instance types (Employee, Company), one object property (`worksAt`), datatype properties for hire date and salary.

**Optional advanced starters** (load via "Advanced examples" menu):

- Person participates in Act.
- Document is about Entity.
- Sensor makes Observation.
- Permit authorizes Activity.

Each starter ships with:

- canonical project JSON-LD;
- explanatory text suitable for a first-time user;
- generated Mermaid;
- generated Turtle;
- generated Markdown summary.

---

## 25. Contextual Help (Content Deliverable)

The UI in-context help is a content deliverable, not only a UI hook. The MVP must ship written explanations for each of the following concepts. Each entry is one to three short paragraphs aimed at a user with no semantic-web background but some technical literacy.

Required entries:

- TBox (the vocabulary)
- ABox (the instances)
- Class
- Instance
- Object property
- Datatype property
- IRI
- Triple
- Subject / Predicate / Object
- Imported vs. project-created term
- Turtle
- N-Triples
- JSON-LD
- Mermaid (in this tool's context)
- Subclass / Subproperty
- Cascading IRI update
- What "save as canonical form" means
- Stale-save warning
- Validation severity levels

Each entry is stored as a Markdown fragment in the source tree under `content/help/<slug>.md` and loaded by the UI. Updating help content does not require a code change beyond bundling.

---

## 26. UI Layout

The reference UI is non-normative guidance.

**Header:** project name, save/open/export controls, validation status, migration notice if applicable.

**Left sidebar — Term Manager:** classes, object properties, datatype properties, search/filter, add term, source indicator (imported / project-created / starter).

**Center — Instance Canvas:** instance cards, directed relations, drag/drop positioning, zoom/pan, node/edge selection. (Renamed from "ABox Canvas" for clarity.)

**Right panel — Inspector / Explanation:** selected node details (including literal assertions), selected relation details, triple preview, RDF-like assertion preview, contextual explanation, validation findings for the selection.

**Bottom or secondary panel — Outputs:** Mermaid text, rendered Mermaid, Turtle output, Markdown summary, export buttons.

---

## 27. Resolved Engineering Decisions

These were OEDs in v0.2 and are resolved in v0.3.

| Former OED | Resolution |
|-----------|-----------|
| OED-001 (Namespace) | `https://edgecanonical.org/ns/modeler#` (placeholder; can change before public release without affecting profile semantics). |
| OED-002 (Validation method) | Custom structural validator against the VMP profile, per §17. SHACL deferred. |
| OED-003 (State update strategy) | Command/reducer pattern calling pure core transformations. |
| OED-004 (Snapshot strategy) | Full embedded project state with `ecm:specVersion`. |
| OED-005 (Semantic JSON-LD projection) | Defined in §6.3. |
| OED-006 (React Flow binding) | Editor Layer canvas layout is canonical; React Flow state derived per §15.3. |
| OED-007 (Large ontology UX) | Search-only and virtualized list at the warning threshold; partial extraction and cancel at the hard limit. |

---

## 28. Remaining Open Decisions

These genuinely remain open and should be resolved during early implementation.

- **OED-301: Mermaid edge label policy.** Truncate long property labels at how many characters? Configurable in settings?
- **OED-302: IndexedDB schema versioning.** How are IndexedDB schema migrations coordinated with `ecm:specVersion`?
- **OED-303: Validation report retention.** How many historical validation reports does the project retain? Latest only, or one per save?
- **OED-304: ZIP manifest signing.** Is the manifest hash sufficient, or do we want detached signatures in a later version?
- **OED-305: Help content localization.** v0.3 ships English-only; the loading mechanism should not preclude localization.

---

## 29. Delivery Phases

### Phase 1: Core JSON-LD Engine

- VMP profile and canonical serializer;
- structural validator;
- IRI generation (interactive and deterministic modes);
- cascading IRI update with collision handling;
- semantic projection;
- Turtle, N-Triples, semantic JSON-LD, Mermaid, Markdown generation;
- legacy v0.2 migration;
- Node CLI;
- golden-file test harness.

### Phase 2: Browser UI Foundation

- React UI shell;
- term sidebar (three term types);
- React Flow canvas bound to Editor Layer;
- instance cards with class assignment;
- object-property relation creation;
- literal-property assertion creation;
- inspector panel with triple preview;
- save/open project JSON-LD.

### Phase 3: Ontology Import and Term Management

- Turtle import;
- explicit term extraction including subclass/subproperty;
- imported vs. project-created distinction;
- term add/edit/delete (project-created only);
- search/filter;
- large-import warnings and degraded mode.

### Phase 4: Export and Packaging

- Turtle, N-Triples, semantic JSON-LD downloads;
- Mermaid copy/download;
- Markdown export;
- ZIP package export with manifest.

### Phase 5: Local Persistence Adapters

- IndexedDB adapter and project picker;
- last-active-project memory;
- snapshots;
- stale-save detection;
- BroadcastChannel tab coordination;
- File System Access API spike.

### Phase 6: Edge Canonical Bridge

- starter examples (MVP and advanced sets);
- pattern templates (initial gallery);
- modeling hints;
- early semantic linter warnings;
- pattern comparison spike.

---

## 30. Risks and Mitigations

### Risk 1: Canonical state leaks into UI library internals

- Mitigation: project document is source of truth; React Flow state is derived; explicit layout-mapping functions tested per §21.

### Risk 2: Browser crashes on large ontologies

- Mitigation: named-term extraction only; thresholds; virtualized lists; degraded mode; import report; hard 50 MB file limit (§12.2).

### Risk 3: IRI changes break graph integrity

- Mitigation: cascading update rules; warning before update; update report; collision detection (§13.5); immutable imported terms; snapshot preservation (§13.7).

### Risk 4: JSON-LD complexity slows MVP

- Mitigation: constrained VMP profile; bundled local context; no remote context resolution; expansion/compaction only at semantic-export boundary.

### Risk 5: Tool becomes only an RDF editor

- Mitigation: starter examples; triple preview; templated narration; contextual help; pattern hooks.

### Risk 6: Architecture drifts toward infrastructure

- Mitigation: spec test (§0.7); core/adapter separation; Node CLI proof; conformance test suite (§21.1); forbid required servers/databases.

### Risk 7: Two implementations produce divergent output

- Mitigation: VMP normative profile (§5); canonical serializer (§5.3); golden-file conformance suite (§21.1); explicit byte-identity requirement (NFR-013).

### Risk 8: Determinism claims overpromise

- Mitigation: §9 separates transformation determinism from creation non-determinism; deterministic mode is opt-in; CI verifies determinism on every commit (§21.4).

### Risk 9: Spec version evolution breaks user files

- Mitigation: `ecm:specVersion` required; migration policy (§10); non-destructive migration; legacy v0.2 migration path in MVP.

---

## 31. Definition of Done for v0.3 Engineering Baseline

The v0.3 engineering baseline is complete when:

1. A canonical project JSON-LD file in the VMP can represent terms (classes, object properties, datatype properties), instances, relations, literal assertions, settings, layouts, and snapshots.
2. Core computation can validate that file in Node.js.
3. Core computation can generate Turtle, N-Triples, semantic JSON-LD, Mermaid, and Markdown in Node.js.
4. The browser UI can open, edit, and save the same JSON-LD file losslessly under canonical serialization.
5. The browser UI can create instances, draw relations, add literal assertions, and generate all exports.
6. IRI generation works in both interactive and deterministic modes.
7. Duplicate IRIs are detected; cascading IRI updates preserve project integrity, including collision handling.
8. Imported terms and project-created terms are distinguished, with imported terms immutable.
9. Subclass and subproperty are preserved on import and export.
10. The system functions offline.
11. No server, database, broker, or cloud service is required.
12. Two compliant implementations produce byte-identical canonical and derived artifacts for the conformance fixtures.
13. Legacy v0.2 documents migrate to v0.3 cleanly with a migration report.
14. The full test strategy (§21) is implemented; golden-file conformance suite passes.
15. Contextual help content (§25) is written and bundled.

---

## 32. Summary

v0.3 makes the Visual RDF / Knowledge Graph Modeler engineering-ready by resolving foundational decisions that v0.2 deferred. It defines a normative JSON-LD profile (the VMP) with a canonical serializer; partitions the project document into a Semantic Layer and an Editor Layer with a precise semantic projection; admits datatype properties and literal assertions; specifies the relation model and argues for its design; commits the system to honest, layered determinism guarantees; adds versioning, concurrency, and security policies; reorganizes validation into hard errors and soft warnings; and binds the spec to a test strategy that two implementations could conform to.

The product narrative is unchanged:

> Visible → Disciplined → Reusable → Canonical

The architectural discipline is unchanged:

> Browser or Node. JSON-LD as canonical. Deterministic core. Everything else is an adapter.

What is new in v0.3 is that an engineer reading this document can begin writing code without having to invent the parts that v0.2 left underspecified.
