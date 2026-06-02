/**
 * RemapDialog -- Remap References affordance (FR-U010; IMPL PLAN section 3.2).
 *
 * Presents a drop-down of project-created terms with the same OWL type as the
 * imported term and invokes remapReferences on confirm.
 *
 * SPEC refs: section 13.3, section 13.6, FR-U010.
 * Dialog testId: "gw-dialog-remap".
 */

import { useState } from "react";
import { Dialog } from "./Dialog.js";
import { remapReferences } from "../kernel/remap-references.js";
import { resolveTermLabel, iriTail } from "./label-resolution.js";

interface RemapDialogProps {
  /** The imported-ontology term whose references will be remapped (source term A). */
  importedTerm: Record<string, unknown>;
  /** All project-created terms passed from Inspector; filtered here by OWL type. */
  projectCreatedTerms: Record<string, unknown>[];
  /** Current project document passed to remapReferences on confirm. */
  project: Record<string, unknown>;
  /**
   * Called with the updated project document after remapReferences succeeds.
   * Parent controls visibility: unmount after onConfirm fires.
   */
  onConfirm: (updatedProject: Record<string, unknown>) => void;
  onClose: () => void;
}

export function RemapDialog({
  importedTerm,
  projectCreatedTerms,
  project,
  onConfirm,
  onClose,
}: RemapDialogProps) {
  const [selectedTargetIri, setSelectedTargetIri] = useState<string>("");

  const importedIri =
    typeof importedTerm["id"] === "string" ? (importedTerm["id"] as string) : "";
  const importedType =
    typeof importedTerm["type"] === "string" ? (importedTerm["type"] as string) : "";
  const importedLabel = resolveTermLabel(importedTerm["rdfs:label"]);
  const displayImportedLabel =
    importedLabel.length > 0 ? importedLabel : iriTail(importedIri);

  // Filter to project-created terms with matching OWL type (SPEC section 13.6).
  // See open_questions: operator may wish to show all project-created terms instead.
  const candidateTerms = projectCreatedTerms.filter(
    (t) => typeof t["type"] === "string" && t["type"] === importedType,
  );

  function handleApply() {
    if (selectedTargetIri === "") return;
    const result = remapReferences(project, importedIri, selectedTargetIri);
    onConfirm(result.project);
  }

  return (
    <Dialog title="Remap References" onClose={onClose} testId="gw-dialog-remap">
      <p style={{ marginBottom: "0.75rem", fontSize: "0.85rem" }}>
        Replace all references to <strong>{displayImportedLabel}</strong> with a
        project-created term.
      </p>
      <p style={{ fontSize: "0.75rem", color: "#64748b", marginBottom: "0.25rem" }}>
        Replace with
      </p>
      <select
        value={selectedTargetIri}
        onChange={(e) => { setSelectedTargetIri(e.target.value); }}
        data-testid="gw-select-remap-target"
        style={{ fontSize: "0.8rem", width: "100%", marginBottom: "0.75rem" }}
      >
        <option value="">(select replacement term)</option>
        {candidateTerms.map((t) => {
          const iri = typeof t["id"] === "string" ? (t["id"] as string) : "";
          const lbl = resolveTermLabel(t["rdfs:label"]);
          const display = lbl.length > 0 ? lbl : iriTail(iri);
          return (
            <option key={iri} value={iri}>
              {display}
            </option>
          );
        })}
      </select>
      {candidateTerms.length === 0 && (
        <p
          style={{ fontSize: "0.8rem", color: "#94a3b8", marginBottom: "0.75rem" }}
          data-testid="gw-remap-no-candidates"
        >
          No project-created {importedType} terms available.
        </p>
      )}
      <div style={{ display: "flex", gap: "0.5rem", justifyContent: "flex-end" }}>
        <button
          type="button"
          className="gw-btn gw-btn--secondary"
          onClick={onClose}
          data-testid="gw-btn-remap-cancel"
        >
          Cancel
        </button>
        <button
          type="button"
          className="gw-btn"
          onClick={handleApply}
          disabled={selectedTargetIri === ""}
          data-testid="gw-btn-remap-apply"
        >
          Apply
        </button>
      </div>
    </Dialog>
  );
}