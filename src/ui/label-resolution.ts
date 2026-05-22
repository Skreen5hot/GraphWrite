/**
 * Shared label-resolution utilities for UI components.
 * Pure functions -- no React imports; no side effects.
 */

/**
 * Returns the last non-empty segment of an IRI, split on /, #, :, or -.
 * Canonical shared implementation; matches the CanvasView derivation contract.
 */
export function iriTail(iri: string): string {
  const parts = iri.split(/[-#/:]/).filter((s) => s.length > 0);
  return parts[parts.length - 1] ?? iri;
}

/**
 * Build a map from instance IRI to display label by scanning the project's
 * ecm:instances array. Falls back to the IRI itself when rdfs:label is absent.
 */
export function buildInstanceLabelMap(
  project: Record<string, unknown>,
): Map<string, string> {
  const map = new Map<string, string>();
  const instances = project["ecm:instances"];
  if (!Array.isArray(instances)) return map;
  for (const item of instances as unknown[]) {
    if (item === null || typeof item !== "object") continue;
    const inst = item as Record<string, unknown>;
    const id = inst["id"];
    if (typeof id !== "string") continue;
    map.set(
      id,
      typeof inst["rdfs:label"] === "string" ? inst["rdfs:label"] : id,
    );
  }
  return map;
}

/** Resolved display information for a single instance IRI. */
export interface InstanceDisplayInfo {
  /** rdfs:label from the project, or null when the instance has no label. */
  label: string | null;
  /** Last non-empty segment of the IRI. */
  iriTail: string;
  /** label if a label is present, otherwise iriTail. */
  displayLabel: string;
}

/**
 * Resolve plain-language display info for a single instance IRI.
 *
 * @param project - The project document.
 * @param iri     - The instance IRI to resolve.
 */
export function resolveInstanceDisplay(
  project: Record<string, unknown>,
  iri: string,
): InstanceDisplayInfo {
  const tail = iriTail(iri);
  const instanceLabel = buildInstanceLabelMap(project);
  const rawLabel = instanceLabel.get(iri);
  // When the map stored the IRI itself as fallback, treat as no label present.
  const label = rawLabel !== undefined && rawLabel !== iri ? rawLabel : null;
  return { label, iriTail: tail, displayLabel: label ?? tail };
}
