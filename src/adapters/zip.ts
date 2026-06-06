/**
 * ZIP Export Adapter (IMPLEMENTATION_PLAN.md section 4.4)
 *
 * SPEC refs: section 19, FR-E007, FR-S005.
 *
 * packageZip(project, artifacts, options): Buffer
 *
 * Produces a STORE-mode ZIP archive (no compression) with the SPEC section 19
 * layout (v0.4 subset):
 *   manifest.jsonld
 *   serializations/<artifact.filename>  â€” one per artifact
 *   tbox/project-tbox.ttl
 *   contexts/project-context.jsonld
 *
 * STORE mode (compression method = 0) preserves content addressability:
 * every byte in the archive equals the original file byte. The ZIP is
 * still a valid ZIP; any standard unzip tool handles STORE entries.
 *
 * CRC-32 uses a pure-TypeScript lookup-table implementation (reflected
 * polynomial 0xEDB88320; ISO-HDLC / ZIP standard). No runtime dependencies
 * other than Node Buffer (CLAUDE.md section 6).
 *
 * Layer boundary: src/adapters/ MAY import from src/manifest/, src/tbox/,
 * and src/kernel/. MUST NOT be imported by src/kernel/ or src/emit/.
 */

import { stableStringify, VMP_CONTEXT } from "../kernel/canonicalize.js";
import { getProjectTBoxTurtle } from "../tbox/index.js";
import { buildManifestJsonLd } from "../manifest/build.js";
import type { ArtifactInput } from "../manifest/index.js";
import { checkExportGate } from "../validate/export-gate.js";

// ---------------------------------------------------------------------------
// CRC-32 (ISO-HDLC; reflected polynomial 0xEDB88320; ZIP standard)
// ---------------------------------------------------------------------------

const CRC32_TABLE: Uint32Array = (() => {
  const tbl = new Uint32Array(256);
  for (let i = 0; i < 256; i++) {
    let c = i;
    for (let j = 0; j < 8; j++) {
      c = c & 1 ? (0xedb88320 ^ (c >>> 1)) : (c >>> 1);
    }
    tbl[i] = c >>> 0;
  }
  return tbl;
})();

function computeCrc32(data: Buffer): number {
  let crc = 0xffffffff;
  for (let i = 0; i < data.length; i++) {
    crc = (CRC32_TABLE[(crc ^ data[i]) & 0xff] ^ (crc >>> 8)) >>> 0;
  }
  return (crc ^ 0xffffffff) >>> 0;
}

// ---------------------------------------------------------------------------
// ZIP STORE writer
// ---------------------------------------------------------------------------

// ZIP local-file-header signature (PK\x03\x04)
const LOCAL_FILE_HEADER_SIG  = 0x04034b50;
// ZIP central-directory-header signature (PK\x01\x02)
const CENTRAL_DIR_HEADER_SIG = 0x02014b50;
// ZIP end-of-central-directory signature (PK\x05\x06)
const END_OF_CENTRAL_DIR_SIG = 0x06054b50;

/** Deterministic DOS timestamp: 1980-01-01 00:00:00 (lowest ZIP-legal date). */
const DOS_TIME = 0x0000; // 00:00:00
const DOS_DATE = 0x0021; // year=0 (+1980=1980), month=1, day=1

interface LocalEntry {
  localOffset: number;
  nameBytes: Buffer;
  dataLength: number;
  crcValue: number;
}

/**
 * Builds a STORE-mode ZIP archive from an array of named entries.
 * Each entry is written with a local file header, then the raw data.
 * Followed by a central directory and EOCD record.
 *
 * @param entries - Files to pack; `name` is the path inside the ZIP.
 * @returns Complete ZIP archive as a Buffer.
 */
function buildZip(entries: Array<{ name: string; data: Buffer }>): Buffer {
  const localEntries: LocalEntry[] = [];
  const dataParts: Buffer[] = [];
  let localSectionSize = 0;

  // --- Local file headers + file data ---
  for (const entry of entries) {
    const nameBytes = Buffer.from(entry.name, "utf8");
    const crcValue = computeCrc32(entry.data);
    const dataLen = entry.data.length;

    // Local file header: 30 bytes fixed + file-name bytes (no extra field)
    const lhBuf = Buffer.alloc(30 + nameBytes.length, 0);
    lhBuf.writeUInt32LE(LOCAL_FILE_HEADER_SIG, 0);
    lhBuf.writeUInt16LE(20, 4);                      // version needed to extract: 2.0
    lhBuf.writeUInt16LE(0, 6);                       // general purpose bit flag
    lhBuf.writeUInt16LE(0, 8);                       // compression method: STORE (0)
    lhBuf.writeUInt16LE(DOS_TIME, 10);               // last mod file time
    lhBuf.writeUInt16LE(DOS_DATE, 12);               // last mod file date
    lhBuf.writeUInt32LE(crcValue, 14);               // CRC-32
    lhBuf.writeUInt32LE(dataLen, 18);                // compressed size = uncompressed
    lhBuf.writeUInt32LE(dataLen, 22);                // uncompressed size
    lhBuf.writeUInt16LE(nameBytes.length, 26);       // file name length
    lhBuf.writeUInt16LE(0, 28);                      // extra field length
    nameBytes.copy(lhBuf, 30);

    localEntries.push({
      localOffset: localSectionSize,
      nameBytes,
      dataLength: dataLen,
      crcValue,
    });
    dataParts.push(lhBuf, entry.data);
    localSectionSize += lhBuf.length + dataLen;
  }

  // --- Central directory ---
  const centralDirOffset = localSectionSize;
  const cdParts: Buffer[] = [];
  let cdSize = 0;

  for (const le of localEntries) {
    // Central directory entry: 46 bytes fixed + file-name bytes
    const cdBuf = Buffer.alloc(46 + le.nameBytes.length, 0);
    cdBuf.writeUInt32LE(CENTRAL_DIR_HEADER_SIG, 0);
    cdBuf.writeUInt16LE(20, 4);                      // version made by
    cdBuf.writeUInt16LE(20, 6);                      // version needed
    cdBuf.writeUInt16LE(0, 8);                       // general purpose bit flag
    cdBuf.writeUInt16LE(0, 10);                      // compression method: STORE
    cdBuf.writeUInt16LE(DOS_TIME, 12);               // last mod file time
    cdBuf.writeUInt16LE(DOS_DATE, 14);               // last mod file date
    cdBuf.writeUInt32LE(le.crcValue, 16);            // CRC-32
    cdBuf.writeUInt32LE(le.dataLength, 20);          // compressed size
    cdBuf.writeUInt32LE(le.dataLength, 24);          // uncompressed size
    cdBuf.writeUInt16LE(le.nameBytes.length, 28);    // file name length
    cdBuf.writeUInt16LE(0, 30);                      // extra field length
    cdBuf.writeUInt16LE(0, 32);                      // file comment length
    cdBuf.writeUInt16LE(0, 34);                      // disk number start
    cdBuf.writeUInt16LE(0, 36);                      // internal file attributes
    cdBuf.writeUInt32LE(0, 38);                      // external file attributes
    cdBuf.writeUInt32LE(le.localOffset, 42);         // relative offset of LFH
    le.nameBytes.copy(cdBuf, 46);

    cdParts.push(cdBuf);
    cdSize += cdBuf.length;
  }

  // --- End of central directory record (22 bytes) ---
  const eocdBuf = Buffer.alloc(22, 0);
  eocdBuf.writeUInt32LE(END_OF_CENTRAL_DIR_SIG, 0);
  eocdBuf.writeUInt16LE(0, 4);                               // disk number
  eocdBuf.writeUInt16LE(0, 6);                               // disk with start of CD
  eocdBuf.writeUInt16LE(localEntries.length, 8);             // entries on this disk
  eocdBuf.writeUInt16LE(localEntries.length, 10);            // total entries
  eocdBuf.writeUInt32LE(cdSize, 12);                         // size of central directory
  eocdBuf.writeUInt32LE(centralDirOffset, 16);               // offset of start of CD
  eocdBuf.writeUInt16LE(0, 20);                              // ZIP comment length

  return Buffer.concat([...dataParts, ...cdParts, eocdBuf]);
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Options for packageZip.
 * No required fields in v0.4; reserved for future extension.
 */
export interface ZipOptions {
  /** Currently unused; reserved for future flags (e.g. include-reports). */
  readonly generatedAt?: string;
}

/**
 * Packages a VMP project into a ZIP archive per SPEC section 19 (v0.4 layout).
 *
 * Contents:
 *   manifest.jsonld                    â€” manifest RDF document (section 5.15 + 19)
 *   serializations/<artifact.filename> â€” one per artifact
 *   tbox/project-tbox.ttl              â€” Project TBox (section 5.14)
 *   contexts/project-context.jsonld   â€” VMP @context (section 5.2)
 *
 * @param project   VMP project document; must have a non-empty id.
 * @param artifacts Serialization artifacts for /serializations/.
 * @param _options  Reserved; currently unused.
 * @returns ZIP archive as a Buffer (STORE mode; no compression).
 * @throws {Error} propagated from buildManifestJsonLd if project.id is absent.
 */
export function packageZip(
  project: Record<string, unknown>,
  artifacts: readonly ArtifactInput[],
  _options?: ZipOptions,
): Buffer {
  // Export gate: block export for anchor-missing or legacy-placeholder projects
  // (SPEC sections 17.2, 17.4; defense-in-depth alongside CLI enforcement).
  const gateResult = checkExportGate(project);
  if (!gateResult.ok) {
    const codes = gateResult.blockingFindings.join(", ");
    throw new Error(
      `packageZip: export blocked by ${codes}. Declare a real iao:isAbout IRI` +
        " to enable export (SPEC section 17.2 / 17.4).",
    );
  }
  // 1. manifest.jsonld
  const manifestBuf = Buffer.from(buildManifestJsonLd(project, artifacts), "utf8");

  // 2. serializations/<filename> per artifact
  const artifactEntries: Array<{ name: string; data: Buffer }> = [];
  for (const artifact of artifacts) {
    const data =
      typeof artifact.contentBytes === "string"
        ? Buffer.from(artifact.contentBytes, "utf8")
        : artifact.contentBytes;
    artifactEntries.push({ name: `serializations/${artifact.filename}`, data });
  }

  // 3. tbox/project-tbox.ttl
  const tboxBuf = Buffer.from(getProjectTBoxTurtle(), "utf8");

  // 4. contexts/project-context.jsonld â€” VMP_CONTEXT serialized to JSON
  const contextBuf = Buffer.from(stableStringify(VMP_CONTEXT, true) + "\n", "utf8");

  // Assemble in Â§19 order: manifest, serializations, tbox, contexts.
  const entries: Array<{ name: string; data: Buffer }> = [
    { name: "manifest.jsonld", data: manifestBuf },
    ...artifactEntries,
    { name: "tbox/project-tbox.ttl", data: tboxBuf },
    { name: "contexts/project-context.jsonld", data: contextBuf },
  ];

  return buildZip(entries);
}
