/**
 * Manifest JSON-LD Builder (IMPLEMENTATION_PLAN.md section 4.5)
 *
 * SPEC refs: section 19, section 5.15, NFR-014.
 *
 * buildManifestJsonLd(project, artifacts, options): string
 *
 * Produces a self-contained manifest.jsonld document per SPEC section 19.
 * The @graph contains:
 *   1. Project node: typed ecm:Project + ecm:OntologyDesignPattern, with
 *      iao:isAbout and ecm:name (SPEC section 19).
 *   2. Project TBox declarations inline (getProjectTBoxNodes(); SPEC section 5.14).
 *   3. One ecm:Serialization per artifact (generateManifestEntries()).
 *
 * Output is deterministic: @graph sorted by id, all object keys sorted
 * lexicographically via stableStringify.
 *
 * Note: serialization entry ids are UUIDv4 (non-deterministic per SPEC section 9.2;
 * non-deterministic only until persisted). Pass an empty artifacts array to
 * obtain a byte-deterministic output (e.g. for golden-file tests).
 *
 * Layer boundary: MUST NOT import from src/adapters/ or src/composition/.
 * Not subject to the kernel purity checker (scripts/ensure-kernel-purity.ts).
 */

import { stableStringify, VMP_CONTEXT } from "../kernel/canonicalize.js";
import { getProjectTBoxNodes } from "../tbox/index.js";
import { generateManifestEntries, type ArtifactInput } from "./index.js";

/**
 * Options for buildManifestJsonLd.
 * Reserved for future extension; no required fields in v0.4.
 */
export type ManifestJsonLdOptions = Record<string, unknown>;

/**
 * Builds a manifest.jsonld JSON-LD document per SPEC section 19.
 *
 * @param project   VMP project root document. Must have a non-empty string id.
 * @param artifacts Artifacts to include as ecm:Serialization nodes.
 * @param _options  Reserved; currently unused.
 * @returns Deterministic JSON-LD string, two-space indent, LF-terminated.
 * @throws {Error} If project.id is absent or not a non-empty string.
 */
export function buildManifestJsonLd(
  project: Record<string, unknown>,
  artifacts: readonly ArtifactInput[],
  _options?: ManifestJsonLdOptions,
): string {
  const projectId = project["id"];
  if (typeof projectId !== "string" || projectId.length === 0) {
    throw new Error(
      "buildManifestJsonLd: project.id must be a non-empty string " +
        "(SPEC section 19: manifest references the project root IRI)",
    );
  }

  // 1. Project node per SPEC section 19:
  //    typed ["ecm:Project", "ecm:OntologyDesignPattern"] (sorted lexicographically);
  //    with iao:isAbout and ecm:name.
  //    Note: SPEC section 19 specifies ecm:OntologyDesignPattern; ROADMAP/IMPL plan
  //    Â§4.5 write iao:OntologyDesignPattern (F11 discrepancy; SPEC is authoritative).
  const rawType = project["type"];
  const projectTypes: string[] = [];
  if (Array.isArray(rawType)) {
    for (const t of rawType as unknown[]) {
      if (typeof t === "string") projectTypes.push(t);
    }
  }
  const typeSet = new Set(projectTypes);
  if (!typeSet.has("ecm:Project")) typeSet.add("ecm:Project");
  if (!typeSet.has("ecm:OntologyDesignPattern")) typeSet.add("ecm:OntologyDesignPattern");
  const sortedTypes = [...typeSet].sort();

  const projectNode: Record<string, unknown> = {
    id: projectId,
    type: sortedTypes,
  };
  const nameVal = project["ecm:name"];
  if (typeof nameVal === "string") {
    projectNode["ecm:name"] = nameVal;
  }
  const aboutVal = project["iao:isAbout"];
  projectNode["iao:isAbout"] = Array.isArray(aboutVal) ? aboutVal : [];

  // 2. TBox nodes per SPEC section 5.14.
  const tboxNodes = getProjectTBoxNodes() as Record<string, unknown>[];

  // 3. Serialization entries per SPEC section 5.15.
  const serializationEntries = generateManifestEntries(
    project,
    artifacts,
  ) as unknown as Record<string, unknown>[];

  // 4. Assemble @graph sorted by id for deterministic output.
  const graphNodes: Record<string, unknown>[] = [
    ...tboxNodes,
    projectNode,
    ...serializationEntries,
  ];
  graphNodes.sort((a, b) => {
    const aid = String(a["id"] ?? "");
    const bid = String(b["id"] ?? "");
    return aid < bid ? -1 : aid > bid ? 1 : 0;
  });

  // 5. Serialize deterministically.
  const manifest: Record<string, unknown> = {
    "@context": VMP_CONTEXT,
    "@graph": graphNodes,
  };
  return stableStringify(manifest, true) + "\n";
}
