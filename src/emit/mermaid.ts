/**
 * Mermaid Emitter (FR-C006, ADR-011)
 *
 * SPEC refs: FR-C006, ADR-011.
 *
 * emitMermaid(project): renders the project ABox as a Mermaid graph.
 *   Instances are nodes; object-property relations are directed edges.
 *   One node per instance IRI (plus any relation-referenced IRIs not in
 *   ecm:instances); predicate label on each edge.
 *
 * Operates on the raw VMP project document (not the semantic projection):
 * ABox-only view -- instances and relations only; no TBox content.
 *
 * Round-trip format (ADR-011):
 *   Node IDs: sequential (N0, N1, ...) in lexicographic IRI order for
 *   deterministic output. Node labels: "label:type-local<br>typeIRI..."
 *   Edge labels: "predicate-label<br>predicateIRI"
 *
 * Pure function: no I/O, no Date.now(), no Math.random().
 * Layer boundary: MUST NOT import from src/adapters/ or src/composition/.
 */

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

/** Resolve display text from a raw rdfs:label value (string or {text,lang} object). */
function resolveLabel(raw: unknown): string {
  if (typeof raw === "string") return raw;
  if (typeof raw === "object" && raw !== null) {
    const text = (raw as Record<string, unknown>)["text"];
    if (typeof text === "string") return text;
  }
  return "";
}

/** Escape a string for use inside a Mermaid double-quoted label. */
function escapeMermaidLabel(s: string): string {
  return s.replace(/"/g, "&quot;");
}

/**
 * Extract the local name from an IRI (ADR-011 round-trip label format):
 * - fragment after '#'  (e.g. http://www.w3.org/2002/07/owl#Class -> "Class")
 * - last path segment   (e.g. https://example.org/Person -> "Person")
 * - last colon segment  (e.g. urn:uuid:xxx-yyy -> "xxx-yyy")
 */
function localName(iri: string): string {
  const hash = iri.lastIndexOf("#");
  if (hash >= 0) return iri.slice(hash + 1);
  const slash = iri.lastIndexOf("/");
  if (slash >= 0) return iri.slice(slash + 1);
  const colon = iri.lastIndexOf(":");
  if (colon >= 0) return iri.slice(colon + 1);
  return iri;
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Emits a Mermaid graph (FR-C006, ADR-011) from a VMP project document.
 *
 * Renders ecm:instances as labeled nodes and ecm:relations as directed edges.
 * Node format (ADR-011): N<i>["label:type-local<br>typeIRI1[<br>typeIRI2...]"]
 * Edge format (ADR-011): N<i> -- "predicate-label<br>predicateIRI" --> N<j>
 *
 * Node ordering is lexicographic by IRI for deterministic output.
 * Embedded quotes in labels are escaped as &quot;.
 *
 * @param project - Parsed VMP project document (canonical or raw form).
 * @returns Mermaid graph string terminated with a trailing newline.
 */
export function emitMermaid(project: Record<string, unknown>): string {
  // Build label and classIris maps from instances
  const instanceLabel = new Map<string, string>();
  const instanceClassIris = new Map<string, string[]>();
  const termLabel = new Map<string, string>();

  const instances = project["ecm:instances"];
  if (Array.isArray(instances)) {
    for (const item of instances as unknown[]) {
      if (!item || typeof item !== "object") continue;
      const inst = item as Record<string, unknown>;
      const id = inst["id"];
      if (typeof id !== "string") continue;
      const label = resolveLabel(inst["rdfs:label"]) || id;
      instanceLabel.set(id, label);
      const classIris: string[] = [];
      if (Array.isArray(inst["ecm:classIris"])) {
        for (const c of inst["ecm:classIris"] as unknown[]) {
          if (typeof c === "string") classIris.push(c);
        }
      }
      instanceClassIris.set(id, classIris);
    }
  }

  const terms = project["ecm:terms"];
  if (Array.isArray(terms)) {
    for (const item of terms as unknown[]) {
      if (!item || typeof item !== "object") continue;
      const term = item as Record<string, unknown>;
      const id = term["id"];
      if (typeof id !== "string") continue;
      const label = resolveLabel(term["rdfs:label"]) || id;
      termLabel.set(id, label);
    }
  }

  // Collect all known IRIs; start with declared instances
  const allIris = new Set<string>(instanceLabel.keys());

  // Collect edges and register any relation-referenced IRIs not already declared
  const edges: Array<{ from: string; to: string; label: string; predicateIri: string }> = [];

  const relations = project["ecm:relations"];
  if (Array.isArray(relations)) {
    for (const item of relations as unknown[]) {
      if (!item || typeof item !== "object") continue;
      const rel = item as Record<string, unknown>;
      const sIri = rel["ecm:subjectIri"];
      const pIri = rel["ecm:predicateIri"];
      const oIri = rel["ecm:objectIri"];
      if (
        typeof sIri !== "string" ||
        typeof pIri !== "string" ||
        typeof oIri !== "string"
      ) continue;

      // Register subject/object nodes if not already declared from ecm:instances
      if (!allIris.has(sIri)) {
        allIris.add(sIri);
        instanceLabel.set(sIri, sIri);
        instanceClassIris.set(sIri, []);
      }
      if (!allIris.has(oIri)) {
        allIris.add(oIri);
        instanceLabel.set(oIri, oIri);
        instanceClassIris.set(oIri, []);
      }

      const predicateLabel =
        termLabel.get(pIri) ??
        (typeof rel["rdfs:label"] === "string" ? rel["rdfs:label"] : pIri);

      edges.push({ from: sIri, to: oIri, label: predicateLabel, predicateIri: pIri });
    }
  }

  // Assign sequential node IDs in lexicographic IRI order (deterministic, ADR-011)
  const sortedIris = [...allIris].sort();
  const nodeId = new Map<string, string>();
  let nodeIndex = 0;
  for (const iri of sortedIris) {
    nodeId.set(iri, `N${nodeIndex++}`);
  }

  const lines: string[] = [];
  lines.push("graph TD");

  // Emit node declarations with round-trip label format (ADR-011)
  for (const iri of sortedIris) {
    const nid = nodeId.get(iri)!;
    const label = instanceLabel.get(iri) ?? iri;
    const classIris = instanceClassIris.get(iri) ?? [];
    let nodeLabel: string;
    if (classIris.length === 0) {
      nodeLabel = escapeMermaidLabel(label);
    } else {
      const typeLocal = localName(classIris[0]);
      const typeLines = classIris.map((c) => `<br>${c}`).join("");
      nodeLabel = `${escapeMermaidLabel(label)}:${typeLocal}${typeLines}`;
    }
    lines.push(`  ${nid}["${nodeLabel}"]`);
  }

  // Emit edge declarations with round-trip label format (ADR-011)
  for (const edge of edges) {
    const fromId = nodeId.get(edge.from)!;
    const toId = nodeId.get(edge.to)!;
    const edgeLabel = `${escapeMermaidLabel(edge.label)}<br>${edge.predicateIri}`;
    lines.push(`  ${fromId} -- "${edgeLabel}" --> ${toId}`);
  }

  return lines.join("\n") + "\n";
}
