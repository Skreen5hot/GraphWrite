/**
 * ImportOntologyDialog -- Import Turtle ontology file (FR-C011; SPEC section 14.1).
 *
 * Presents a file picker for .ttl files, pre-checks file size (SPEC section 12.2),
 * parses with importOntology (async browser path; digestHexFn + uuidFn injected),
 * shows a term-count preview, and on confirm merges ecm:terms + ecm:ontologies
 * per the CLI cmdImportOntology reference (IMPLEMENTATION_PLAN section 3.1).
 *
 * Browser-safe:
 *   - sha256HexAsync: inlined Web Crypto (globalThis.crypto.subtle.digest).
 *   - uuidFn: () => crypto.randomUUID() (Web Crypto API; lib:DOM typed).
 * node:crypto is NOT invoked at runtime -- importOntology async path uses only
 * the injected digest and uuid functions (R2 fix per architect 813 denial).
 *
 * SPEC refs: section 14.1, section 12.2, FR-C011, IMPLEMENTATION_PLAN section 3.1.
 * Dialog testId: "gw-dialog-import-ontology".
 */

import { useState, useRef, type ChangeEvent } from "react";
import { Dialog } from "./Dialog.js";
import {
  importOntology,
  type ImportedOntologyRecord,
  type ImportedTermObject,
} from "../import/turtle-import.js";

// ---------------------------------------------------------------------------
// Browser-safe SHA-256 (Web Crypto API; no node:crypto dependency)
// ---------------------------------------------------------------------------

/**
 * Compute a SHA-256 hex digest using globalThis.crypto.subtle.
 * Available in all modern browsers and Node >= 19.
 * Inlined here (rather than imported from src/kernel/sha256.ts) so that the
 * browser bundle does not pull in sha256.ts's top-level node:crypto import.
 */
async function sha256HexAsync(bytes: Uint8Array): Promise<string> {
  const buffer = await globalThis.crypto.subtle.digest("SHA-256", bytes);
  return Array.from(new Uint8Array(buffer))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type DialogPhase = "idle" | "reading" | "preview" | "large_import_warning" | "error";

interface PendingImport {
  ontology: ImportedOntologyRecord;
  terms: readonly ImportedTermObject[];
  fileName: string;
}

interface ImportOntologyDialogProps {
  /** Current project document; provides the ecm:projectId for the import record. */
  project: Record<string, unknown>;
  /**
   * Called with the merged project document after import is confirmed.
   * Parent controls visibility: unmount the dialog after onConfirm fires.
   */
  onConfirm: (updatedProject: Record<string, unknown>) => void;
  onClose: () => void;
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function ImportOntologyDialog({
  project,
  onConfirm,
  onClose,
}: ImportOntologyDialogProps) {
  const [phase, setPhase] = useState<DialogPhase>("idle");
  const [errorMessage, setErrorMessage] = useState<string>("");
  const [pending, setPending] = useState<PendingImport | null>(null);

  const fileInputRef = useRef<HTMLInputElement>(null);

  const termCount = pending?.terms.length ?? 0;

  function handleBrowse() {
    fileInputRef.current?.click();
  }

  async function handleFileChange(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (file === undefined) return;
    // Reset so the same file can be re-selected after an error.
    event.target.value = "";

    // Reject non-.ttl files (SPEC section 14.1: Turtle format only).
    if (!file.name.toLowerCase().endsWith(".ttl")) {
      setPhase("error");
      setErrorMessage(
        "Only .ttl (Turtle) files are supported (SPEC section 14.1).",
      );
      return;
    }

    // R1: 50 MB byte-length pre-check BEFORE reader.readAsText (SPEC section 12.2).
    // Uses file.size (cheap; no I/O) to reject oversized files before loading
    // multi-gigabyte content into the renderer's memory.
    if (file.size > 50 * 1024 * 1024) {
      setPhase("error");
      setErrorMessage(
        "File exceeds 50 MB limit (SPEC section 12.2). Reject before parsing.",
      );
      return;
    }

    setPhase("reading");
    setPending(null);

    const reader = new FileReader();
    reader.onload = async (loadEvent: ProgressEvent<FileReader>) => {
      const raw = loadEvent.target?.result;
      if (typeof raw !== "string") {
        setPhase("error");
        setErrorMessage("Failed to read file content.");
        return;
      }

      const projectId =
        typeof project["id"] === "string" ? (project["id"] as string) : "";
      const createdAt = new Date().toISOString();

      // R2: Thread digestHexFn (sha256HexAsync) AND uuidFn (() => crypto.randomUUID())
      // into importOntology. Async browser path; createHash / nodeRandomUUID from
      // node:crypto are never called at runtime (SPEC section 12.2, section 14.1).
      const result = await importOntology(
        raw,
        file.name,
        projectId,
        createdAt,
        sha256HexAsync,
        () => crypto.randomUUID(),
      );

      if (!result.ok) {
        setPhase("error");
        setErrorMessage(result.error);
        return;
      }

      setPending({
        ontology: result.ontology,
        terms: result.terms,
        fileName: file.name,
      });
      if (result.warning === "LARGE_IMPORT") {
        setPhase("large_import_warning");
      } else {
        setPhase("preview");
      }
    };

    reader.onerror = () => {
      setPhase("error");
      setErrorMessage("File read failed. Please try again.");
    };

    reader.readAsText(file);
  }

  function handleConfirm() {
    if (pending === null) return;

    // Merge per CLI cmdImportOntology reference (src/cli/index.ts:324-344; F9 evidence).
    // Augment each extracted term with ecm:source + ecm:ontologyId before appending.
    const augmented = pending.terms.map((t) => ({
      ...t,
      "ecm:source": "ecm:imported-ontology" as const,
      "ecm:ontologyId": pending.ontology.id,
    }));
    const existingOntologies = Array.isArray(project["ecm:ontologies"])
      ? (project["ecm:ontologies"] as unknown[])
      : [];
    const existingTerms = Array.isArray(project["ecm:terms"])
      ? (project["ecm:terms"] as unknown[])
      : [];
    const updatedProject: Record<string, unknown> = {
      ...project,
      "ecm:ontologies": [...existingOntologies, pending.ontology],
      "ecm:terms": [...existingTerms, ...augmented],
    };

    onConfirm(updatedProject);
  }

  function handleContinueDegraded() {
    if (pending === null) return;

    // Build degraded ontology record (SPEC section 14.2; IMPLEMENTATION_PLAN section 3.3).
    // Spread-override ecm:importStatus; all other fields are preserved verbatim.
    const degradedOntology: ImportedOntologyRecord = {
      ...pending.ontology,
      "ecm:importStatus": "ecm:degraded",
    };
    const augmented = pending.terms.map((t) => ({
      ...t,
      "ecm:source": "ecm:imported-ontology" as const,
      "ecm:ontologyId": degradedOntology.id,
    }));
    const existingOntologies = Array.isArray(project["ecm:ontologies"])
      ? (project["ecm:ontologies"] as unknown[])
      : [];
    const existingTerms = Array.isArray(project["ecm:terms"])
      ? (project["ecm:terms"] as unknown[])
      : [];
    const updatedProject: Record<string, unknown> = {
      ...project,
      "ecm:ontologies": [...existingOntologies, degradedOntology],
      "ecm:terms": [...existingTerms, ...augmented],
    };

    onConfirm(updatedProject);
  }

  return (
    <Dialog
      title="Import Ontology"
      onClose={onClose}
      testId="gw-dialog-import-ontology"
    >
      {/* Hidden file input: .ttl only (SPEC section 14.1). */}
      <input
        ref={fileInputRef}
        type="file"
        accept=".ttl"
        style={{ display: "none" }}
        data-testid="gw-import-file-input"
        onChange={handleFileChange}
      />

      {/* Idle / reading: browse prompt */}
      {(phase === "idle" || phase === "reading") && (
        <>
          <p style={{ marginBottom: "0.75rem", fontSize: "0.85rem" }}>
            Select a Turtle (.ttl) ontology file. Extracted terms will be
            merged into the current project.
          </p>
          <button
            type="button"
            className="gw-btn gw-btn--secondary"
            onClick={handleBrowse}
            disabled={phase === "reading"}
            style={{ marginBottom: "0.75rem" }}
          >
            {phase === "reading" ? "Reading\u2026" : "Browse\u2026"}
          </button>
        </>
      )}

      {/* Preview: term count and re-select affordance */}
      {phase === "preview" && pending !== null && (
        <>
          <p style={{ marginBottom: "0.5rem", fontSize: "0.85rem" }}>
            File: <strong>{pending.fileName}</strong>
          </p>
          <p
            data-testid="gw-import-preview-count"
            style={{ marginBottom: "0.75rem", fontSize: "0.85rem" }}
          >
            {termCount === 0
              ? "No importable terms found (owl:Class, owl:ObjectProperty, owl:DatatypeProperty)."
              : `${termCount} term${termCount === 1 ? "" : "s"} ready to import.`}
          </p>
          <button
            type="button"
            className="gw-btn gw-btn--secondary"
            onClick={() => {
              setPhase("idle");
              setPending(null);
            }}
            style={{ marginBottom: "0.75rem" }}
          >
            Choose a different file
          </button>
        </>
      )}

      {/* Large import warning panel (SPEC section 14.2; IMPLEMENTATION_PLAN section 3.3) */}
      {phase === "large_import_warning" && pending !== null && (
        <div
          data-testid="gw-import-large-warning"
          style={{
            marginBottom: "0.75rem",
            padding: "0.75rem",
            background: "#fffbeb",
            border: "1px solid #f59e0b",
            borderRadius: "4px",
            fontSize: "0.85rem",
          }}
        >
          <p style={{ marginBottom: "0.4rem", fontWeight: 600 }}>
            Large import warning
          </p>
          <p style={{ marginBottom: "0.4rem" }}>
            <span data-testid="gw-import-large-term-count">{termCount}</span>
            {" terms found. "}
            The UI will render in degraded (virtualized) mode for performance.
            Search-only navigation will be available.
          </p>
          <p style={{ margin: 0 }}>
            Select <em>Continue in degraded mode</em> to import, or{" "}
            <em>Cancel</em> to leave the project unchanged.
          </p>
        </div>
      )}

      {/* Error: message and retry affordance */}
      {phase === "error" && (
        <>
          <p
            style={{
              marginBottom: "0.75rem",
              fontSize: "0.85rem",
              color: "#dc2626",
            }}
          >
            {errorMessage}
          </p>
          <button
            type="button"
            className="gw-btn gw-btn--secondary"
            onClick={() => {
              setPhase("idle");
              setErrorMessage("");
            }}
            style={{ marginBottom: "0.75rem" }}
          >
            Try again
          </button>
        </>
      )}

      {/* Cancel / Import button row -- conditional on phase (RemapDialog layout pattern) */}
      {phase === "large_import_warning" ? (
        <div style={{ display: "flex", gap: "0.5rem", justifyContent: "flex-end" }}>
          <button
            type="button"
            className="gw-btn gw-btn--secondary"
            onClick={onClose}
            data-testid="gw-btn-import-cancel-large"
          >
            Cancel
          </button>
          <button
            type="button"
            className="gw-btn"
            onClick={handleContinueDegraded}
            data-testid="gw-btn-import-continue-degraded"
          >
            Continue in degraded mode
          </button>
        </div>
      ) : (
        <div style={{ display: "flex", gap: "0.5rem", justifyContent: "flex-end" }}>
          <button
            type="button"
            className="gw-btn gw-btn--secondary"
            onClick={onClose}
            data-testid="gw-btn-import-cancel"
          >
            Cancel
          </button>
          <button
            type="button"
            className="gw-btn"
            onClick={handleConfirm}
            disabled={phase !== "preview" || termCount === 0}
            data-testid="gw-btn-import-confirm"
          >
            Import
          </button>
        </div>
      )}
    </Dialog>
  );
}
