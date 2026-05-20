/**
 * Export Manifest Data Structure (IMPLEMENTATION_PLAN.md section 1.8)
 *
 * SPEC refs: section 5.15, section 19, FR-C012, NFR-014.
 *
 * generateManifestEntries(project, artifacts): SerializationEntry[]
 *
 * Produces one SerializationEntry per artifact. Implements all 7 Required
 * fields listed in SPEC section 5.15 plus ecm:byteLength (present in the
 * section 5.15 JSON example and section 6.1 semantic predicate allowlist;
 * absent from the section 5.15 Required: line -- three-way count mismatch
 * noted in task 1.8 reconnaissance findings F2/F3; implemented per
 * IMPL plan section 1.8 sub-tasks which enumerate 8 fields).
 *
 * Layer boundary: MUST NOT import from src/adapters/ or src/composition/.
 * src/manifest/ is outside src/kernel/ and is NOT subject to the kernel
 * purity checker (scripts/ensure-kernel-purity.ts).
 *
 * Non-determinism: generateIri("ecm:uuid-urn", {}) produces a new UUIDv4
 * per entry, acknowledged non-deterministic by SPEC section 9.2
 * ("non-deterministic only until persisted"). The generatedAt timestamp is
 * threaded from the caller; this function never calls Date.now() internally
 * (SPEC section 9.3 determinism requirement).
 */

import { createHash } from "node:crypto";
import { generateIri } from "../iri/index.js";

// ---------------------------------------------------------------------------
// Types (SPEC section 5.15)
// ---------------------------------------------------------------------------

/**
 * A single artifact input passed to generateManifestEntries.
 *
 * contentBytes: UTF-8 string or raw Buffer. Byte length and SHA-256 are
 * derived by the function; callers supply raw content only.
 *
 * generatedAt: ISO-8601 timestamp string for ecm:generatedAt. Callers
 * thread this explicitly (e.g. from --clock CLI flag; SPEC section 9.3)
 * or supply the current time. This function never calls Date.now().
 */
export interface ArtifactInput {
  readonly filename: string;
  readonly contentBytes: string | Buffer;
  readonly format: string;
  readonly generatedAt: string;
}

/**
 * A serialization entry per SPEC section 5.15.
 *
 * Seven Required fields per section 5.15 Required: line:
 *   id, type, ecm:format, ecm:filename, ecm:contentHash,
 *   ecm:generatedAt, ecm:isSerializationOf.
 *
 * Plus ecm:byteLength (present in section 5.15 JSON example and
 * section 6.1 semantic predicate allowlist; included per
 * IMPL plan section 1.8 sub-tasks).
 */
export interface SerializationEntry {
  readonly id: string;
  readonly type: "ecm:Serialization";
  readonly "ecm:format": string;
  readonly "ecm:filename": string;
  readonly "ecm:contentHash": string;
  readonly "ecm:byteLength": number;
  readonly "ecm:generatedAt": string;
  readonly "ecm:isSerializationOf": string;
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Generates one SerializationEntry per artifact.
 *
 * Each entry receives a new urn:uuid: IRI (ecm:uuid-urn mode; SPEC section
 * 9.2), the SHA-256 content hash prefixed with "sha256-", the UTF-8 byte
 * length, and ecm:isSerializationOf pointing to the project root id.
 *
 * @param project   Project root document. Must have a non-empty string id.
 * @param artifacts Artifact descriptors; one entry emitted per element.
 * @returns SerializationEntry[] in the same order as artifacts.
 * @throws {Error} If project.id is absent or not a non-empty string.
 */
export function generateManifestEntries(
  project: Record<string, unknown>,
  artifacts: readonly ArtifactInput[],
): SerializationEntry[] {
  const projectId = project["id"];
  if (typeof projectId !== "string" || projectId.length === 0) {
    throw new Error(
      "generateManifestEntries: project.id must be a non-empty string " +
        "(SPEC section 5.15: ecm:isSerializationOf references the project root id)",
    );
  }

  return artifacts.map((artifact): SerializationEntry => {
    // Normalize contentBytes to Buffer for consistent hashing and byte counting.
    const contentBuf: Buffer =
      typeof artifact.contentBytes === "string"
        ? Buffer.from(artifact.contentBytes, "utf8")
        : artifact.contentBytes;

    // ecm:contentHash = "sha256-" + SHA-256 hex digest.
    // Pattern per IMPL plan section 1.8 ("sha256-" + hex) and
    // section 3.1 importOntology precedent.
    const digest: string = createHash("sha256")
      .update(contentBuf)
      .digest("hex");

    // ecm:byteLength = UTF-8 byte length of artifact content.
    const byteLength: number = contentBuf.length;

    return {
      id: generateIri("ecm:uuid-urn", {}),
      type: "ecm:Serialization",
      "ecm:format": artifact.format,
      "ecm:filename": artifact.filename,
      "ecm:contentHash": `sha256-${digest}`,
      "ecm:byteLength": byteLength,
      "ecm:generatedAt": artifact.generatedAt,
      "ecm:isSerializationOf": projectId,
    };
  });
}
