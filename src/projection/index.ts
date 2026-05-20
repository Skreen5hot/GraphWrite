/**
 * Semantic Projection (IMPLEMENTATION_PLAN.md section 1.4)
 *
 * SPEC refs: section 6.1-6.4, section 8.2-8.3, FR-C002.
 *
 * projectSemantic(project) implements the section 6.3 steps 1-6 algorithm:
 * 1. Start from the canonical project document.
 * 2. Retain only entities whose type is in the semantic type allowlist (section 6.1).
 * 3. On each retained entity, retain only predicates in the semantic predicate allowlist.
 * 4. Rewrite ecm:RelationAssertion entries to bare triples; collapse duplicates (section 8.2-8.3).
 * 5. Insert Project TBox node-objects into @graph (section 5.14, task 1.2).
 * 6. Apply canonical serializer (task 1.1).
 *
 * Pure function: no I/O, no Date.now(), no Math.random().
 * Layer boundary: MUST NOT import from src/adapters/ or src/composition/.
 */

import { serializeVmp } from "../kernel/canonicalize.js";
import { getProjectTBoxNodes } from "../tbox/index.js";

// ---------------------------------------------------------------------------
// Semantic type allowlist (SPEC section 6.1)
// ---------------------------------------------------------------------------

/**
 * Types whose entities are retained in the semantic projection.
 * Source: SPEC section 6.1 semantic type allowlist.
 */
const SEMANTIC_TYPE_ALLOWLIST = new Set<string>([
  "ecm:Project",
  "iao:OntologyDesignPattern",
  "owl:Class",
  "owl:ObjectProperty",
  "owl:DatatypeProperty",
  "ecm:Instance",
  "ecm:RelationAssertion",
  "ecm:LiteralAssertion",
  "ecm:Serialization",
]);

// ---------------------------------------------------------------------------
// Semantic predicate allowlist (SPEC section 6.1)
// ---------------------------------------------------------------------------

/**
 * Predicates retained on each semantic entity after projection.
 * Source: SPEC section 6.1 semantic predicate allowlist.
 *
 * Note: ecm:name is intentionally absent. SPEC section 6.1 normative list
 * does not include it; SPEC section 6.2 prose names it as a Semantic Layer
 * field on the project root. This implementation follows the strict section
 * 6.1 normative list until the tension is resolved by OED. See open_questions
 * in the task 1.4 developer output.
 */
const SEMANTIC_PREDICATE_ALLOWLIST = new Set<string>([
  "id",
  "type",
  "rdfs:label",
  "rdfs:comment",
  "rdfs:subClassOf",
  "rdfs:subPropertyOf",
  "ecm:classIris",
  "ecm:subjectIri",
  "ecm:predicateIri",
  "ecm:objectIri",
  "ecm:value",
  "ecm:datatype",
  "ecm:language",
  "iao:isAbout",
  "ecm:isSerializationOf",
  "ecm:format",
  "ecm:filename",
  "ecm:contentHash",
  "ecm:byteLength",
  "ecm:generatedAt",
]);

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

/**
 * Returns the type array from a VMP entity object.
 * Handles both scalar-string and array forms of the compact "type" key.
 */
function entityTypes(entity: Record<string, unknown>): string[] {
  const t = entity["type"];
  if (typeof t === "string") return [t];
  if (Array.isArray(t))
    return (t as unknown[]).filter((x) => typeof x === "string") as string[];
  return [];
}

/**
 * Returns true if any element of types is in the semantic type allowlist.
 */
function hasSemanticType(types: string[]): boolean {
  return types.some((t) => SEMANTIC_TYPE_ALLOWLIST.has(t));
}

/**
 * Returns true if the entity is an ecm:RelationAssertion.
 */
function isRelationAssertion(entity: Record<string, unknown>): boolean {
  return entityTypes(entity).includes("ecm:RelationAssertion");
}

/**
 * Applies the section 6.1 predicate allowlist to an entity object.
 * Returns a new object containing only allowlisted keys; input is not mutated.
 */
function applyPredicateFilter(
  entity: Record<string, unknown>,
): Record<string, unknown> {
  const result: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(entity)) {
    if (SEMANTIC_PREDICATE_ALLOWLIST.has(k)) {
      result[k] = v;
    }
  }
  return result;
}

/**
 * Rewrites a RelationAssertion to a bare triple.
 * Retains ONLY ecm:subjectIri, ecm:predicateIri, ecm:objectIri.
 * Discards: id, type, ecm:createdAt, ecm:updatedAt, rdfs:label, and all
 * other fields on the relation record.
 * Source: SPEC section 8.3.
 */
function relationToTriple(
  rel: Record<string, unknown>,
): Record<string, unknown> {
  return {
    "ecm:subjectIri": rel["ecm:subjectIri"],
    "ecm:predicateIri": rel["ecm:predicateIri"],
    "ecm:objectIri": rel["ecm:objectIri"],
  };
}

/**
 * Returns a NUL-delimited deduplication key for a bare triple.
 * Source: SPEC section 8.2 -- two relations with identical s/p/o express
 * the same RDF triple and collapse to one entry on semantic export.
 */
function tripleKey(triple: Record<string, unknown>): string {
  return (
    String(triple["ecm:subjectIri"] ?? "") +
    "\x00" +
    String(triple["ecm:predicateIri"] ?? "") +
    "\x00" +
    String(triple["ecm:objectIri"] ?? "")
  );
}

/**
 * Returns a sort key for a @graph node.
 * Named nodes (string id) sort first, keyed by id.
 * Anonymous bare triples (no id) sort after named nodes, keyed by s/p/o.
 */
function nodeSortKey(node: Record<string, unknown>): string {
  if (typeof node["id"] === "string") return "0:" + node["id"];
  return "1:" + tripleKey(node);
}

// ---------------------------------------------------------------------------
// Entity-array keys processed for semantic projection
// ---------------------------------------------------------------------------

/**
 * Named arrays in the VMP document whose items are processed as entity nodes.
 * ecm:relations is handled separately via the RelationAssertion rewrite path.
 * ecm:layouts, ecm:snapshots, ecm:ontologies are Editor Layer -- skipped.
 */
const ENTITY_ARRAY_KEYS: ReadonlyArray<string> = [
  "ecm:terms",
  "ecm:instances",
  "ecm:literalAssertions",
  "ecm:serializations",
];

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Applies the semantic projection algorithm (SPEC section 6.3 steps 1-6) to
 * a VMP project document and returns a canonical JSON-LD string.
 *
 * Output shape: compact JSON-LD @graph document.
 * - @context: the normative VMP_CONTEXT (section 5.2), injected by serializeVmp.
 * - @graph: Project TBox node-objects (section 5.14) plus all retained
 *   semantic entity node-objects. Named nodes sorted by id; bare triples
 *   sorted by s/p/o composite and placed after named nodes.
 *
 * @param project - Parsed compact JSON-LD VMP project document.
 * @returns Canonical UTF-8 JSON-LD string ending with a single LF newline.
 */
export function projectSemantic(
  project: Record<string, unknown>,
): string {
  const namedNodes: Record<string, unknown>[] = [];
  const bareTriples: Record<string, unknown>[] = [];
  const triplesSeen = new Set<string>();

  // -------------------------------------------------------------------------
  // Steps 2 + 3: Project root
  // The project root is typed ecm:Project / iao:OntologyDesignPattern,
  // both in the semantic type allowlist. Apply predicate filter; this strips
  // ecm:specVersion, ecm:createdAt, ecm:updatedAt (not in allowlist), along
  // with ecm:terms, ecm:instances, ecm:relations, ecm:layouts, and all other
  // editor / array-of-entities fields. Those arrays are processed separately.
  // -------------------------------------------------------------------------
  const rootTypes = entityTypes(project);
  if (hasSemanticType(rootTypes)) {
    namedNodes.push(applyPredicateFilter(project));
  }

  // -------------------------------------------------------------------------
  // Steps 2 + 3: Named entity arrays
  // Each entity is type-filtered then predicate-filtered.
  // -------------------------------------------------------------------------
  for (const arrayKey of ENTITY_ARRAY_KEYS) {
    const arr = project[arrayKey];
    if (!Array.isArray(arr)) continue;
    for (const item of arr) {
      if (item === null || typeof item !== "object") continue;
      const entity = item as Record<string, unknown>;
      const types = entityTypes(entity);
      if (!hasSemanticType(types)) continue;
      namedNodes.push(applyPredicateFilter(entity));
    }
  }

  // -------------------------------------------------------------------------
  // Step 4: ecm:relations -- rewrite to bare triples; collapse duplicates
  // Discards: id, type, ecm:createdAt, ecm:updatedAt, rdfs:label.
  // Only processes entities typed ecm:RelationAssertion.
  // Skips malformed relations missing any of the three IRI fields.
  // Source: SPEC section 8.2, section 8.3.
  // -------------------------------------------------------------------------
  const relationsArr = project["ecm:relations"];
  if (Array.isArray(relationsArr)) {
    for (const item of relationsArr) {
      if (item === null || typeof item !== "object") continue;
      const rel = item as Record<string, unknown>;
      if (!isRelationAssertion(rel)) continue;
      // Guard: skip relations missing any of the three required IRI fields
      if (
        typeof rel["ecm:subjectIri"] !== "string" ||
        typeof rel["ecm:predicateIri"] !== "string" ||
        typeof rel["ecm:objectIri"] !== "string"
      ) {
        continue;
      }
      const triple = relationToTriple(rel);
      const key = tripleKey(triple);
      if (!triplesSeen.has(key)) {
        triplesSeen.add(key);
        bareTriples.push(triple);
      }
    }
  }

  // -------------------------------------------------------------------------
  // Step 5: Insert Project TBox node-objects (section 5.14, task 1.2)
  // Implementation assumption: TBox-as-@graph-node-objects per
  // IMPLEMENTATION_PLAN.md section 1.5 note (SPEC section 6.3 step 5 /
  // section 31 item 2 ambiguity tracked; pending OED clarification).
  // -------------------------------------------------------------------------
  const tboxNodes = getProjectTBoxNodes() as Record<string, unknown>[];

  // Merge TBox nodes with projected entity nodes; sort by id for determinism.
  // serializeVmp does not sort @graph elements ("@graph" is not in
  // NAMED_ARRAY_KEYS), so pre-sorting is required for a deterministic output.
  const allNamedNodes = [...tboxNodes, ...namedNodes];
  allNamedNodes.sort((a, b) => {
    const aKey = nodeSortKey(a);
    const bKey = nodeSortKey(b);
    return aKey < bKey ? -1 : aKey > bKey ? 1 : 0;
  });

  // Sort bare triples for determinism by s/p/o composite key.
  bareTriples.sort((a, b) => {
    const aKey = tripleKey(a);
    const bKey = tripleKey(b);
    return aKey < bKey ? -1 : aKey > bKey ? 1 : 0;
  });

  // @graph: named nodes (TBox + entities) first; bare triples after.
  const graph: Record<string, unknown>[] = [...allNamedNodes, ...bareTriples];

  // Build the @graph document. @context is omitted here because serializeVmp
  // unconditionally injects VMP_CONTEXT as the @context first key.
  const doc: Record<string, unknown> = {
    "@graph": graph,
  };

  // -------------------------------------------------------------------------
  // Step 6: Apply canonical serializer (section 5.3, task 1.1)
  // serializeVmp injects @context as first key; @graph appears alphabetically.
  // -------------------------------------------------------------------------
  return serializeVmp(doc);
}
