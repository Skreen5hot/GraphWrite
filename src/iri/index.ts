/**
 * IRI Generation (IMPLEMENTATION_PLAN.md section 1.6)
 *
 * SPEC refs: section 9.2, section 9.3, section 13.9, section 5.5, FR-C009.
 *
 * generateIri(policy, context): string -- two modes:
 *   ecm:uuid-urn      UUIDv4; non-deterministic by spec acknowledgment (SPEC section 9.2).
 *   ecm:deterministic UUIDv5 per RFC 4122 section 4.3; pure function.
 *
 * Kernel purity: src/iri/ is outside src/kernel/ and is NOT subject to the
 * kernel purity checker (scripts/ensure-kernel-purity.ts). ecm:uuid-urn mode
 * intentionally calls crypto.randomUUID() (non-deterministic; acknowledged by
 * SPEC section 9.2). ecm:deterministic mode is a pure function: no Date.now(),
 * no Math.random(), no process.env -- seed and entityContext are explicit
 * parameters threaded from the CLI (SPEC section 9.3).
 *
 * Layer boundary: MUST NOT import from src/adapters/ or src/composition/.
 */

import { createHash, randomUUID as nodeRandomUUID } from "node:crypto";

// ---------------------------------------------------------------------------
// Types (SPEC section 9.2, section 9.3)
// ---------------------------------------------------------------------------

/** IRI generation policy per SPEC section 9.2. */
export type IriPolicy = "ecm:uuid-urn" | "ecm:deterministic";

/**
 * Explicit inputs threaded into IRI generation.
 * Never populated from Date.now() or process.env -- callers thread
 * --seed and --clock explicitly (SPEC section 9.3; IMPLEMENTATION_PLAN section 1.6).
 *
 * seed and entityContext are only consumed in ecm:deterministic mode.
 * ecm:uuid-urn mode ignores both fields (non-deterministic by spec acknowledgment).
 */
export interface IriContext {
  /**
   * Explicit seed threaded from the --seed CLI flag.
   * Required (non-empty) in ecm:deterministic mode; ignored in ecm:uuid-urn mode.
   */
  readonly seed?: string;
  /**
   * Entity-scoped context string distinguishing this entity from others
   * within the same seed domain (e.g. label slug, sequence counter,
   * or classSlug + labelSlug combination).
   * Required (non-empty) in ecm:deterministic mode; ignored in ecm:uuid-urn mode.
   */
  readonly entityContext?: string;
}

// ---------------------------------------------------------------------------
// Internal: UUIDv4 (ecm:uuid-urn mode; non-deterministic)
// ---------------------------------------------------------------------------

/** Hex nibble lookup table for manual UUID construction fallback. */
const HEX_NIBBLES: readonly string[] = [
  "0", "1", "2", "3", "4", "5", "6", "7",
  "8", "9", "a", "b", "c", "d", "e", "f",
];

/**
 * Manual UUIDv4 fallback using Math.random().
 * Invoked only when node:crypto.randomUUID() is unavailable (should not
 * occur on the Node >= 22.0.0 engine baseline, but provided defensively).
 * Math.random() is acceptable here: src/iri/ is outside the kernel purity
 * scope (scripts/ensure-kernel-purity.ts) and ecm:uuid-urn mode is
 * acknowledged as non-deterministic by SPEC section 9.2.
 */
function manualUuidV4(): string {
  const bytes = Array.from({ length: 16 }, () =>
    Math.floor(Math.random() * 256),
  );
  // Set version 4 bits (0100xxxx) in octet 6 per RFC 4122 section 4.1.3.
  bytes[6] = (bytes[6] & 0x0f) | 0x40;
  // Set variant bits (10xxxxxx) in octet 8 per RFC 4122 section 4.1.1.
  bytes[8] = (bytes[8] & 0x3f) | 0x80;
  const hex = bytes
    .map((b) => HEX_NIBBLES[b >> 4] + HEX_NIBBLES[b & 0x0f])
    .join("");
  return [
    hex.slice(0, 8),
    hex.slice(8, 12),
    hex.slice(12, 16),
    hex.slice(16, 20),
    hex.slice(20, 32),
  ].join("-");
}

/**
 * Generates a UUIDv4 string.
 * Prefers node:crypto.randomUUID() (guaranteed in Node >= 14.17.0; always
 * present at the Node >= 22.0.0 engine baseline). Falls back to
 * Math.random()-based manual implementation on unexpected invocation failure.
 */
function generateUuidV4(): string {
  try {
    return nodeRandomUUID();
  } catch {
    return manualUuidV4();
  }
}

// ---------------------------------------------------------------------------
// Internal: UUIDv5 (ecm:deterministic mode; pure function)
// ---------------------------------------------------------------------------

/**
 * RFC 4122 URL namespace UUID as a 16-byte Buffer.
 * Used as the fixed UUIDv5 namespace for ecm:deterministic IRI generation.
 * Value: 6ba7b811-9dad-11d1-80b4-00c04fd430c8 (RFC 4122 appendix C).
 *
 * NOTE: This namespace is a pragmatic default pending formal ADR ratification.
 * SPEC section 9.3 does not specify the UUIDv5 namespace UUID. See
 * open_questions in the task 1.6 developer chain for the ratification track.
 */
const UUID_V5_NAMESPACE = Buffer.from([
  0x6b, 0xa7, 0xb8, 0x11,
  0x9d, 0xad, 0x11, 0xd1,
  0x80, 0xb4, 0x00, 0xc0, 0x4f, 0xd4, 0x30, 0xc8,
]);

/**
 * Generates a UUIDv5 from the given name per RFC 4122 section 4.3.
 * Uses SHA-1 and UUID_V5_NAMESPACE as the namespace UUID.
 * Pure function: no I/O, no randomness.
 *
 * @param name - The name string to hash. For ecm:deterministic mode this is
 *               `${seed}|${entityContext}`.
 */
function generateUuidV5(name: string): string {
  const hash = createHash("sha1")
    .update(UUID_V5_NAMESPACE)
    .update(Buffer.from(name, "utf8"))
    .digest();
  // Set version 5 bits (0101xxxx) in octet 6 per RFC 4122 section 4.3.
  hash[6] = (hash[6] & 0x0f) | 0x50;
  // Set variant bits (10xxxxxx) in octet 8 per RFC 4122 section 4.1.1.
  hash[8] = (hash[8] & 0x3f) | 0x80;
  const hex = hash.toString("hex");
  return [
    hex.slice(0, 8),
    hex.slice(8, 12),
    hex.slice(12, 16),
    hex.slice(16, 20),
    hex.slice(20, 32),
  ].join("-");
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Generates an IRI for an entity under the given policy.
 *
 * Both modes produce strings of the form `urn:uuid:<UUID>`.
 *
 * **ecm:uuid-urn** (SPEC section 9.2):
 *   Non-deterministic UUIDv4. Uses crypto.randomUUID(); falls back to
 *   Math.random()-based manual generation. context.seed and
 *   context.entityContext are ignored. The non-determinism is acknowledged
 *   by spec: "non-deterministic only until persisted" (SPEC section 9.2).
 *
 * **ecm:deterministic** (SPEC section 9.3):
 *   UUIDv5 per RFC 4122 section 4.3 from `${context.seed}|${context.entityContext}`.
 *   Pure function; re-running with the same inputs produces the same IRI.
 *   context.seed and context.entityContext MUST be non-empty strings.
 *
 * @param policy  The IRI generation policy.
 * @param context Explicit generation inputs. Never derived from Date.now()
 *                or process.env; always threaded from the CLI (--seed flag).
 * @returns IRI string in `urn:uuid:<UUID>` format.
 * @throws {Error} If policy is ecm:deterministic and seed or entityContext
 *                 is absent or empty.
 */
export function generateIri(policy: IriPolicy, context: IriContext): string {
  switch (policy) {
    case "ecm:uuid-urn": {
      return `urn:uuid:${generateUuidV4()}`;
    }
    case "ecm:deterministic": {
      const { seed, entityContext } = context;
      if (typeof seed !== "string" || seed.length === 0) {
        throw new Error(
          "generateIri: ecm:deterministic mode requires a non-empty context.seed " +
          "(thread from --seed CLI flag; SPEC section 9.3)",
        );
      }
      if (typeof entityContext !== "string" || entityContext.length === 0) {
        throw new Error(
          "generateIri: ecm:deterministic mode requires a non-empty " +
          "context.entityContext (IMPLEMENTATION_PLAN section 1.6)",
        );
      }
      return `urn:uuid:${generateUuidV5(`${seed}|${entityContext}`)}`;
    }
    default: {
      const _exhaustive: never = policy;
      throw new Error(
        `generateIri: unknown policy "${String(_exhaustive)}"`,
      );
    }
  }
}
