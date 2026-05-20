/**
 * Deterministic Canonicalization
 *
 * Provides stable serialization of JSON values by recursively sorting
 * object keys and optionally sorting unordered arrays. This ensures
 * that identical data structures produce identical string representations
 * regardless of property insertion order.
 *
 * This module is part of the kernel and MUST NOT perform I/O or
 * reference non-deterministic APIs.
 */

/**
 * Recursively canonicalize a value by sorting object keys.
 * Arrays are preserved in their original order (caller is responsible
 * for ensuring semantic ordering if needed).
 *
 * @param value - Any JSON-serializable value
 * @returns A new value with all object keys sorted recursively
 */
function canonicalize(value: unknown): unknown {
  if (value === null || typeof value !== "object") {
    return value;
  }

  if (Array.isArray(value)) {
    return value.map(canonicalize);
  }

  // Plain object: sort keys lexicographically
  const obj = value as Record<string, unknown>;
  const keys = Object.keys(obj).sort();
  const sorted: Record<string, unknown> = {};
  for (const key of keys) {
    sorted[key] = canonicalize(obj[key]);
  }
  return sorted;
}

/**
 * Produce a deterministic JSON string from any JSON-serializable value.
 *
 * Object keys are sorted recursively. Arrays preserve element order.
 * The output is suitable for deterministic comparison and hashing.
 *
 * @param value - Any JSON-serializable value
 * @param pretty - If true, output is indented with 2 spaces (default: false)
 * @returns A deterministic JSON string
 */
export function stableStringify(value: unknown, pretty: boolean = false): string {
  const canonical = canonicalize(value);
  return pretty
    ? JSON.stringify(canonical, null, 2)
    : JSON.stringify(canonical);
}

// ---------------------------------------------------------------------------
// VMP Canonical Serializer (SPEC.md §5.2—§5.4)
// ---------------------------------------------------------------------------

/**
 * The normative §5.2 JSON-LD @context bundled as a local constant.
 * Implementations MUST NOT resolve this remotely (SPEC.md §5.2).
 * ADR-006: custom-recursive-sorter approach; no JSON-LD library at serialization layer.
 */
export const VMP_CONTEXT: Record<string, unknown> = {
  ecm: "https://edgecanonical.org/ns/modeler#",
  rdf: "http://www.w3.org/1999/02/22-rdf-syntax-ns#",
  rdfs: "http://www.w3.org/2000/01/rdf-schema#",
  owl: "http://www.w3.org/2002/07/owl#",
  xsd: "http://www.w3.org/2001/XMLSchema#",
  iao: "http://purl.obolibrary.org/obo/iao#",
  cco: "https://www.commoncoreontologies.org/",
  id: "@id",
  type: "@type",
  "ecm:terms":             { "@container": "@set" },
  "ecm:instances":         { "@container": "@set" },
  "ecm:relations":         { "@container": "@set" },
  "ecm:literalAssertions": { "@container": "@set" },
  "ecm:ontologies":        { "@container": "@set" },
  "ecm:layouts":           { "@container": "@set" },
  "ecm:snapshots":         { "@container": "@set" },
  "ecm:serializations":    { "@container": "@set" },
  "ecm:classIris":         { "@type": "@id", "@container": "@set" },
  "ecm:subjectIri":        { "@type": "@id" },
  "ecm:predicateIri":      { "@type": "@id" },
  "ecm:objectIri":         { "@type": "@id" },
  "ecm:isSerializationOf": { "@type": "@id" },
  "iao:isAbout":           { "@type": "@id", "@container": "@set" },
  "rdfs:subClassOf":       { "@type": "@id", "@container": "@set" },
  "rdfs:subPropertyOf":    { "@type": "@id", "@container": "@set" },
};

/** §5.3 rule 2: top-level keys emitted before the alphabetical remainder, in this order. */
const TOP_LEVEL_PRIORITY = ["@context", "id", "type", "ecm:specVersion"];

/** §5.3 rule 4: array properties whose elements are sorted by their `id` field. */
const NAMED_ARRAY_KEYS = new Set([
  "ecm:terms",
  "ecm:instances",
  "ecm:relations",
  "ecm:literalAssertions",
  "ecm:ontologies",
  "ecm:layouts",
  "ecm:snapshots",
  "ecm:serializations",
]);

/**
 * §5.3 rule 5 + §5.4: array properties whose string elements are sorted
 * lexicographically. Includes `type` (§5.4: project-type array sorted).
 */
const LEX_SORTED_ARRAY_KEYS = new Set([
  "ecm:classIris",
  "iao:isAbout",
  "rdfs:subClassOf",
  "rdfs:subPropertyOf",
  "type",
]);

/**
 * Matches ISO 8601 timestamps that need normalization (fractional seconds
 * or a non-Z offset present). §5.3 rule 8.
 */
const ISO_TIMESTAMP_RE =
  /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d+)?(Z|[+-]\d{2}:?\d{2})$/;

/**
 * Normalize an ISO 8601 timestamp to canonical form: strip fractional
 * seconds; replace any UTC offset with `Z`. Already-canonical strings
 * are returned unchanged (idempotent). §5.3 rule 8.
 */
function normalizeTimestamp(s: string): string {
  if (!ISO_TIMESTAMP_RE.test(s)) return s;
  return s.replace(/\.\d+/, "").replace(/[+-]\d{2}:?\d{2}$/, "Z");
}

/**
 * Walk a value and rename every `@id` key to `id` and every `@type` key
 * to `type` (§5.2 compact aliases). Also normalizes ISO 8601 timestamp
 * strings (§5.3 rule 8). Returns a new object tree; input is not mutated.
 */
function applyAliases(value: unknown): unknown {
  if (typeof value === "string") return normalizeTimestamp(value);
  if (value === null || typeof value !== "object") return value;
  if (Array.isArray(value)) return (value as unknown[]).map(applyAliases);

  const obj = value as Record<string, unknown>;
  const result: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(obj)) {
    const key = k === "@id" ? "id" : k === "@type" ? "type" : k;
    result[key] = applyAliases(v);
  }
  return result;
}

/**
 * Recursively apply VMP ordering rules to a value.
 * `parentKey` is the property name under which this value lives; used to
 * detect named-array and lex-sorted-array contexts.
 */
function vmpCanonicalizeValue(value: unknown, parentKey?: string): unknown {
  if (value === null || typeof value !== "object") return value;

  if (Array.isArray(value)) {
    const arr = value as unknown[];

    if (parentKey !== undefined && NAMED_ARRAY_KEYS.has(parentKey)) {
      // §5.3 rule 4: sort by element `id`, then recurse into each element
      return [...arr]
        .sort((a, b) => {
          const aid = String(
            typeof a === "object" && a !== null
              ? (a as Record<string, unknown>)["id"] ?? ""
              : ""
          );
          const bid = String(
            typeof b === "object" && b !== null
              ? (b as Record<string, unknown>)["id"] ?? ""
              : ""
          );
          return aid < bid ? -1 : aid > bid ? 1 : 0;
        })
        .map((el) => vmpCanonicalizeValue(el));
    }

    if (parentKey !== undefined && LEX_SORTED_ARRAY_KEYS.has(parentKey)) {
      // §5.3 rule 5 / §5.4: sort string elements lexicographically
      return [...arr].sort().map((el) => vmpCanonicalizeValue(el));
    }

    return arr.map((el) => vmpCanonicalizeValue(el));
  }

  return vmpCanonicalizeObject(value as Record<string, unknown>, false);
}

/**
 * Sort an object's keys per VMP rules and recurse into each value.
 * Top-level: priority ordering then alphabetical (§5.3 rule 2).
 * Nested: alphabetical at every level (§5.3 rule 3).
 */
function vmpCanonicalizeObject(
  obj: Record<string, unknown>,
  isTopLevel: boolean
): Record<string, unknown> {
  const keys = Object.keys(obj);
  let orderedKeys: string[];

  if (isTopLevel) {
    const priority = TOP_LEVEL_PRIORITY.filter((k) => keys.includes(k));
    const rest = keys
      .filter((k) => !TOP_LEVEL_PRIORITY.includes(k))
      .sort();
    orderedKeys = [...priority, ...rest];
  } else {
    orderedKeys = [...keys].sort();
  }

  const result: Record<string, unknown> = {};
  for (const key of orderedKeys) {
    result[key] = vmpCanonicalizeValue(obj[key], key);
  }
  return result;
}

/**
 * Serialize a VMP project document to the canonical form defined by
 * SPEC.md §5.2—§5.4. Rules applied (in order):
 *
 * 1. Rename `@id`→`id` and `@type`→`type` in the document body (§5.2).
 * 2. Normalize ISO 8601 timestamps: strip fractional seconds, `Z` suffix (§5.3 rule 8).
 * 3. Inject the §5.2 `VMP_CONTEXT` constant, overwriting any incoming `@context`.
 * 4. Top-level key order: `@context`, `id`, `type`, `ecm:specVersion`, then
 *    remaining keys alphabetically (§5.3 rule 2).
 * 5. Nested object keys alphabetical at every level (§5.3 rule 3).
 * 6. Named-array elements sorted by `id` (§5.3 rule 4).
 * 7. IRI arrays and `type` array sorted lexicographically (§5.3 rule 5 + §5.4).
 * 8. Two-space indent, LF line endings, one terminating LF newline,
 *    UTF-8 no BOM (§5.3 rules 6—7).
 *
 * Idempotent: `serializeVmp(JSON.parse(serializeVmp(doc)))` equals
 * `serializeVmp(doc)` bytewise for any VMP project document.
 *
 * @param project - VMP project document; may use `@id`/`@type` or compact `id`/`type`.
 * @returns Canonical UTF-8 JSON-LD string ending with a single LF newline.
 */
export function serializeVmp(project: Record<string, unknown>): string {
  // Pass 1: compact aliases (@id→id, @type→type) + timestamp normalization
  const aliased = applyAliases(project) as Record<string, unknown>;

  // Drop any incoming @context â€” unconditionally replaced with VMP_CONTEXT
  const body: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(aliased)) {
    if (k !== "@context") body[k] = v;
  }

  // Pass 2: prepend normative §5.2 @context
  const withContext: Record<string, unknown> = { "@context": VMP_CONTEXT, ...body };

  // Pass 3: apply VMP key-ordering and array-sorting rules recursively
  const canonical = vmpCanonicalizeObject(withContext, true);

  // §5.3 rules 6—7: two-space indent; JSON.stringify always uses \n for newlines
  // (string literal semantics, platform-independent); one terminating newline.
  return JSON.stringify(canonical, null, 2) + "\n";
}
