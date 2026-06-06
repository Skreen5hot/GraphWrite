/**
 * Mermaid Emitter (FR-C006)
 *
 * SPEC refs: section 6.3, FR-C006.
 *
 * emitMermaid(project): renders the project graph as a Mermaid flowchart.
 *   Instances are nodes; object-property relations are directed edges.
 *   One node per instance IRI (plus any relation-referenced IRIs not in
 *   ecm:instances); predicate label on each edge.
 *
 * Operates on the raw VMP project document (not the semantic projection):
 * SPEC section 6.3 states Mermaid uses a simpler view of instances and
 * relations only; no TBox content is needed.
 *
 * Node IDs: sequential (N0, N1, ...) in ecm:instances array order, then any
 * relation-referenced IRIs not already declared. Labels from rdfs:label
 * (string or {text,lang} object); fall back to the raw IRI string.
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

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Emits a Mermaid flowchart (FR-C006) from a VMP project document.
 *
 * Renders ecm:instances as labeled nodes and ecm:relations as directed edges.
 * Predicate labels are resolved from ecm:terms rdfs:label; fall back to the
 * relation rdfs:label, then to the raw predicate IRI string.
 *
 * @param project - Parsed VMP project document (canonical or raw form).
 * @returns Mermaid flowchart string terminated with a trailing newline.
 */
export function emitMermaid(project: Record<string, unknown>): string {
  // Build label maps from instances and terms
  const instanceLabel = new Map<string, string>();
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

  // Assign sequential Mermaid-safe node IDs (N0, N1, ...) in instance-array order
  const nodeId = new Map<string, string>();
  let nodeIndex = 0;
  for (const iri of instanceLabel.keys()) {
    nodeId.set(iri, `N${nodeIndex++}`);
  }

  // Collect edges; also register any relation-referenced IRIs not in instanceLabel
  const edges: Array<{ from: string; to: string; label: string }> = [];

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
      if (!nodeId.has(sIri)) {
        nodeId.set(sIri, `N${nodeIndex++}`);
        instanceLabel.set(sIri, sIri);
      }
      if (!nodeId.has(oIri)) {
        nodeId.set(oIri, `N${nodeIndex++}`);
        instanceLabel.set(oIri, oIri);
      }

      const predicateLabel =
        termLabel.get(pIri) ??
        (typeof rel["rdfs:label"] === "string" ? rel["rdfs:label"] : pIri);

      edges.push({ from: sIri, to: oIri, label: predicateLabel });
    }
  }

  const lines: string[] = [];
  lines.push("flowchart LR");

  // Emit node declarations
  for (const [iri, nid] of nodeId.entries()) {
    const label = instanceLabel.get(iri) ?? iri;
    lines.push(`  ${nid}["${escapeMermaidLabel(label)}"]`);
  }

  // Emit edge declarations
  for (const edge of edges) {
    const fromId = nodeId.get(edge.from)!;
    const toId = nodeId.get(edge.to)!;
    lines.push(`  ${fromId} -->|"${escapeMermaidLabel(edge.label)}"| ${toId}`);
  }

  return lines.join("\n") + "\n";
}
