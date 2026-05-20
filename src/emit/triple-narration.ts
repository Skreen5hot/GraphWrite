/**
 * Triple Narration Helper (FR-C008)
 *
 * SPEC refs: section 7.1, FR-C008.
 *
 * Template: "{subjectLabel} ({className}) {predicateLabel} {objectLabel} ({objectClassName})"
 * Full natural-language generation is out of scope per FR-C008.
 *
 * narrateTriple(input): renders the template from five pre-resolved label strings.
 * narrateProject(project): resolves labels from ecm:instances + ecm:terms and
 *   generates one narration per object-property relation with resolvable s/p/o IRIs.
 *
 * Operates on the raw VMP project document (not the semantic projection):
 * SPEC section 6.3 states Mermaid and Markdown (and by extension narration)
 * use a simpler view of instances and relations only; no TBox content is needed.
 *
 * Pure function: no I/O, no Date.now(), no Math.random().
 * Layer boundary: MUST NOT import from src/adapters/ or src/composition/.
 */

// ---------------------------------------------------------------------------
// Public types
// ---------------------------------------------------------------------------

/** Input shape for the FR-C008 narration template. */
export interface NarrationInput {
  subjectLabel:    string;
  className:       string;
  predicateLabel:  string;
  objectLabel:     string;
  objectClassName: string;
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Renders the FR-C008 triple-narration template from five resolved label strings.
 * Template: "{subjectLabel} ({className}) {predicateLabel} {objectLabel} ({objectClassName})"
 *
 * @param input - Five resolved labels for the template slots.
 * @returns Narration string per FR-C008.
 */
export function narrateTriple(input: NarrationInput): string {
  const { subjectLabel, className, predicateLabel, objectLabel, objectClassName } = input;
  return `${subjectLabel} (${className}) ${predicateLabel} ${objectLabel} (${objectClassName})`;
}

/**
 * Generates narration strings for all object-property relations in a VMP
 * project document by resolving labels from ecm:instances and ecm:terms.
 *
 * Label resolution per template slot:
 *   subjectLabel    -- instance rdfs:label ?? instance id
 *   className       -- term rdfs:label for first ecm:classIri ?? first classIri ?? ""
 *   predicateLabel  -- term rdfs:label for predicateIri ?? relation rdfs:label ?? predicateIri
 *   objectLabel     -- instance rdfs:label ?? instance id
 *   objectClassName -- term rdfs:label for first classIri of object ?? first classIri ?? ""
 *
 * Relations missing ecm:subjectIri, ecm:predicateIri, or ecm:objectIri are skipped.
 *
 * @param project - Parsed VMP project document (canonical or raw form).
 * @returns Array of narration strings; one per relation with resolvable s/p/o IRIs.
 */
export function narrateProject(project: Record<string, unknown>): string[] {
  const instanceLabel = new Map<string, string>();
  const instanceClass = new Map<string, string>(); // instanceId -> first classIri
  const termLabel     = new Map<string, string>();

  const instances = project["ecm:instances"];
  if (Array.isArray(instances)) {
    for (const item of instances as unknown[]) {
      if (!item || typeof item !== "object") continue;
      const inst = item as Record<string, unknown>;
      const id = inst["id"];
      if (typeof id !== "string") continue;
      instanceLabel.set(id, typeof inst["rdfs:label"] === "string" ? inst["rdfs:label"] : id);
      const classIris = inst["ecm:classIris"];
      if (Array.isArray(classIris) && classIris.length > 0 && typeof classIris[0] === "string") {
        instanceClass.set(id, String(classIris[0]));
      }
    }
  }

  const terms = project["ecm:terms"];
  if (Array.isArray(terms)) {
    for (const item of terms as unknown[]) {
      if (!item || typeof item !== "object") continue;
      const term = item as Record<string, unknown>;
      const id = term["id"];
      if (typeof id !== "string") continue;
      termLabel.set(id, typeof term["rdfs:label"] === "string" ? term["rdfs:label"] : id);
    }
  }

  const results: string[] = [];
  const relations = project["ecm:relations"];
  if (!Array.isArray(relations)) return results;

  for (const item of relations as unknown[]) {
    if (!item || typeof item !== "object") continue;
    const rel = item as Record<string, unknown>;
    const sIri = rel["ecm:subjectIri"];
    const pIri = rel["ecm:predicateIri"];
    const oIri = rel["ecm:objectIri"];
    if (typeof sIri !== "string" || typeof pIri !== "string" || typeof oIri !== "string") continue;

    const subjectLabel    = instanceLabel.get(sIri) ?? sIri;
    const objectLabel     = instanceLabel.get(oIri) ?? oIri;
    const subClassRaw     = instanceClass.get(sIri) ?? "";
    const className       = (subClassRaw !== "" && termLabel.get(subClassRaw)) || subClassRaw;
    const objClassRaw     = instanceClass.get(oIri) ?? "";
    const objectClassName = (objClassRaw !== "" && termLabel.get(objClassRaw)) || objClassRaw;
    const predicateLabel  = termLabel.get(pIri)
      ?? (typeof rel["rdfs:label"] === "string" ? rel["rdfs:label"] : pIri);

    results.push(narrateTriple({
      subjectLabel, className, predicateLabel, objectLabel, objectClassName,
    }));
  }

  return results;
}
