/**
 * ProjectSettingsDialog -- iao:isAbout declaration UI (FR-U031, task 2.9).
 *
 * Allows the user to view, add, and remove iao:isAbout subject IRIs.
 * Uses the Dialog base component (same pattern as AddTermDialog).
 * Layer boundary: src/ui/ only; SPEC section 5.4.1 for IRI semantics.
 */

import { useState, type FormEvent } from "react";
import { Dialog } from "./Dialog.js";

/** The placeholder IRI per SPEC section 5.4.1; must not be added as a real subject. */
const ECM_UNSPECIFIED = "ecm:UnspecifiedSubjectMatter";

interface ProjectSettingsDialogProps {
  project: Record<string, unknown>;
  /** Called with the updated project document when the user clicks Save. */
  onSave: (updated: Record<string, unknown>) => void;
  onClose: () => void;
}

/** Extract current iao:isAbout entries as a string array from the project document. */
function extractIsAbout(project: Record<string, unknown>): string[] {
  const raw = project["iao:isAbout"];
  if (Array.isArray(raw)) {
    return (raw as unknown[]).filter(
      (v): v is string => typeof v === "string",
    );
  }
  if (typeof raw === "string") return [raw];
  return [];
}

export function ProjectSettingsDialog({
  project,
  onSave,
  onClose,
}: ProjectSettingsDialogProps) {
  const [isAbout, setIsAbout] = useState<string[]>(() =>
    extractIsAbout(project),
  );
  const [addInput, setAddInput] = useState("");
  const [addError, setAddError] = useState<string | null>(null);

  function handleAdd() {
    const trimmed = addInput.trim();
    if (trimmed.length === 0) {
      setAddError("IRI must not be empty.");
      return;
    }
    if (trimmed === ECM_UNSPECIFIED) {
      setAddError(
        "Cannot add the placeholder IRI. Enter a real subject IRI.",
      );
      return;
    }
    if (isAbout.includes(trimmed)) {
      setAddError("This IRI is already in the list.");
      return;
    }
    setIsAbout((prev) => [...prev, trimmed]);
    setAddInput("");
    setAddError(null);
  }

  function handleRemove(iri: string) {
    setIsAbout((prev) => prev.filter((v) => v !== iri));
  }

  function handleSave(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const hasRealIri = isAbout.some((v) => v !== ECM_UNSPECIFIED);
    const updated: Record<string, unknown> = {
      ...project,
      "iao:isAbout": isAbout,
    };
    if (hasRealIri) {
      // Clear the migration marker once a real subject IRI is declared so that
      // if the user later empties the list, validate() emits
      // MISSING_REALIST_ANCHOR (not LEGACY_REALIST_ANCHOR_PLACEHOLDER).
      // Setting to undefined causes JSON.stringify (used by serializeVmp) to
      // omit the field from the saved document.
      updated["ecm:_legacyAnchorPlaceholder"] = undefined;
    }
    onSave(updated);
  }

  return (
    <Dialog
      title="Project Settings"
      onClose={onClose}
      testId="gw-dialog-project-settings"
    >
      <form
        className="gw-term-form"
        onSubmit={handleSave}
        data-testid="gw-form-project-settings"
      >
        <div className="gw-form-label">
          Subject IRIs (<code>iao:isAbout</code>)
        </div>
        {isAbout.length === 0 ? (
          <p className="gw-placeholder" data-testid="gw-isabout-empty">
            No subject IRIs declared.
          </p>
        ) : (
          <ul className="gw-iri-list" data-testid="gw-isabout-list">
            {isAbout.map((iri) => (
              <li key={iri} className="gw-iri-item">
                <span
                  className="gw-iri-value"
                  title={iri}
                  data-testid="gw-iri-value"
                >
                  {iri}
                </span>
                <button
                  type="button"
                  className="gw-btn gw-btn--secondary gw-btn--sm"
                  onClick={() => { handleRemove(iri); }}
                  aria-label={`Remove ${iri}`}
                  data-testid="gw-btn-remove-iri"
                >
                  Remove
                </button>
              </li>
            ))}
          </ul>
        )}
        <div className="gw-iri-add-row">
          <input
            className="gw-form-input"
            type="text"
            placeholder="https://example.org/MySubject"
            value={addInput}
            onChange={(e) => {
              setAddInput(e.target.value);
              setAddError(null);
            }}
            data-testid="gw-input-isabout-iri"
          />
          <button
            type="button"
            className="gw-btn"
            onClick={handleAdd}
            data-testid="gw-btn-add-iri"
          >
            Add IRI
          </button>
        </div>
        {addError !== null && (
          <p
            className="gw-form-error"
            role="alert"
            data-testid="gw-isabout-add-error"
          >
            {addError}
          </p>
        )}
        <div className="gw-form-actions">
          <button
            type="button"
            className="gw-btn gw-btn--secondary"
            onClick={onClose}
            data-testid="gw-btn-settings-cancel"
          >
            Cancel
          </button>
          <button
            type="submit"
            className="gw-btn"
            data-testid="gw-btn-settings-save"
          >
            Save
          </button>
        </div>
      </form>
    </Dialog>
  );
}
