/**
 * N-Triples Emitter (FR-C004)
 *
 * SPEC refs: section 6.3, section 17.6, FR-C004.
 *
 * emitNTriples(project): serializes the semantic projection as N-Triples.
 *   TBox is prepended by parsing getProjectTBoxTurtle() with N3.js Parser
 *   and re-serializing as N-Triples (IMPLEMENTATION_PLAN.md section 1.5).
 *   Non-TBox triples are derived via graphToQuads() imported from turtle.ts.
 *
 * Pure function: no I/O, no Date.now(), no Math.random().
 * Layer boundary: MUST NOT import from src/adapters/ or src/composition/.
 */

import { Writer, Parser } from "n3";
import { projectSemantic } from "../projection/index.js";
import { getProjectTBoxTurtle } from "../tbox/index.js";
import { graphToQuads } from "./turtle.js";

/**
 * Emits an N-Triples serialization of the project's semantic content (FR-C004).
 *
 * Output structure:
 *   [TBox as N-Triples -- parsed from getProjectTBoxTurtle(), re-serialized]
 *   [Non-TBox triples -- graphToQuads() output serialized as N-Triples]
 *
 * N-Triples uses full-IRI notation; no prefix declarations appear in output.
 *
 * @param project - Parsed canonical VMP project document.
 * @returns N-Triples string; each triple on its own line ending with " .\n".
 */
export function emitNTriples(project: Record<string, unknown>): string {
  // Step 1: TBox as N-Triples (parse Turtle TBox; re-serialize)
  const tboxParser = new Parser();
  const tboxQuads = tboxParser.parse(getProjectTBoxTurtle());
  let tboxNt = "";
  const tboxWriter = new Writer({ format: "N-Triples" });
  tboxWriter.addQuads(tboxQuads);
  tboxWriter.end((_err, r) => { tboxNt = r; });

  // Step 2: Non-TBox triples from @graph via shared graphToQuads helper
  const semanticDoc = JSON.parse(projectSemantic(project)) as Record<string, unknown>;
  const graphArr: unknown[] = Array.isArray(semanticDoc["@graph"])
    ? (semanticDoc["@graph"] as unknown[])
    : [];
  const contentQuads = graphToQuads(graphArr);
  let contentNt = "";
  const contentWriter = new Writer({ format: "N-Triples" });
  contentWriter.addQuads(contentQuads);
  contentWriter.end((_err, r) => { contentNt = r; });

  return tboxNt + contentNt;
}
