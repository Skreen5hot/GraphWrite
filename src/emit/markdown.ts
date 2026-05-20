/**
 * Markdown Emitter (IMPLEMENTATION_PLAN.md section 1.11; CLI Chain 1)
 *
 * SPEC refs: section 6.3, section 23, FR-C008.
 *
 * emitMarkdown(project): serializes a VMP project document as a
 * human-readable Markdown document.
 *
 * Sections emitted:
 *   # <ecm:name>
 *   ## Metadata    -- IRI, spec version, timestamps
 *   ## Subject Matter  -- iao:isAbout IRIs
 *   ## Terms       -- rdfs:label or id per term
 *   ## Instances   -- rdfs:label or id per instance
 *   ## Relations   -- FR-C008 triple narration per relation with
 *                     resolvable s/p/o IRIs
 *
 * SPEC section 6.3: Markdown uses a simpler view of instances and
 * relations only; no TBox content is needed.
 *
 * Pure function: no I/O, no Date.now(), no Math.random().
 * Layer boundary: MUST NOT import from src/adapters/ or src/composition/.
 */

import { narrateProject } from "./triple-narration.js";

/**
 * Emits a Markdown document from a VMP project document.
 *
 * @param project - Parsed VMP project document (canonical or raw form).
 * @returns Markdown string terminated with a trailing newline.
 */
export function emitMarkdown(project: Record<string, unknown>): string {
  const name =
    typeof project["ecm:name"] === "string"
      ? project["ecm:name"]
      : "Untitled Project";

  const lines: string[] = [];

  // Title
  lines.push(`# ${name}`);
  lines.push("");

  // Metadata section
  lines.push("## Metadata");
  lines.push("");
  const id = typeof project["id"] === "string" ? project["id"] : "";
  if (id) lines.push(`- **IRI:** ${id}`);
  const specVersion =
    typeof project["ecm:specVersion"] === "string"
      ? project["ecm:specVersion"]
      : "";
  if (specVersion) lines.push(`- **Spec Version:** ${specVersion}`);
  const createdAt =
    typeof project["ecm:createdAt"] === "string"
      ? project["ecm:createdAt"]
      : "";
  if (createdAt) lines.push(`- **Created:** ${createdAt}`);
  const updatedAt =
    typeof project["ecm:updatedAt"] === "string"
      ? project["ecm:updatedAt"]
      : "";
  if (updatedAt) lines.push(`- **Updated:** ${updatedAt}`);
  lines.push("");

  // Subject Matter section
  const rawIsAbout = project["iao:isAbout"];
  const subjects: string[] = Array.isArray(rawIsAbout)
    ? (rawIsAbout as unknown[]).filter(
        (s): s is string => typeof s === "string",
      )
    : typeof rawIsAbout === "string"
    ? [rawIsAbout]
    : [];
  if (subjects.length > 0) {
    lines.push("## Subject Matter");
    lines.push("");
    for (const s of subjects) {
      lines.push(`- ${s}`);
    }
    lines.push("");
  }

  // Terms section
  const terms = project["ecm:terms"];
  if (Array.isArray(terms) && terms.length > 0) {
    lines.push("## Terms");
    lines.push("");
    for (const item of terms as unknown[]) {
      if (!item || typeof item !== "object" || Array.isArray(item)) continue;
      const t = item as Record<string, unknown>;
      const label =
        typeof t["rdfs:label"] === "string"
          ? t["rdfs:label"]
          : typeof t["id"] === "string"
          ? t["id"]
          : "";
      if (label) lines.push(`- ${label}`);
    }
    lines.push("");
  }

  // Instances section
  const instances = project["ecm:instances"];
  if (Array.isArray(instances) && instances.length > 0) {
    lines.push("## Instances");
    lines.push("");
    for (const item of instances as unknown[]) {
      if (!item || typeof item !== "object" || Array.isArray(item)) continue;
      const inst = item as Record<string, unknown>;
      const label =
        typeof inst["rdfs:label"] === "string"
          ? inst["rdfs:label"]
          : typeof inst["id"] === "string"
          ? inst["id"]
          : "";
      if (label) lines.push(`- ${label}`);
    }
    lines.push("");
  }

  // Relations section (FR-C008 narration)
  const narrations = narrateProject(project);
  if (narrations.length > 0) {
    lines.push("## Relations");
    lines.push("");
    for (const n of narrations) {
      lines.push(`- ${n}`);
    }
    lines.push("");
  }

  return lines.join("\n");
}
