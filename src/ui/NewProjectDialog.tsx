/**
 * NewProjectDialog -- Title + Subject prompt for FR-U001 new-project flow.
 *
 * Primary:   "Create Project" -- uses entered title + subject IRI.
 * Secondary: "Skip \u2014 use placeholder" -- creates with defaults and ecm:UnspecifiedSubjectMatter.
 * Close (X / Escape): aborts; no project created.
 *
 * Uses Dialog.tsx primitive (same pattern as ProjectSettingsDialog).
 */

import { useState, type FormEvent } from "react";
import { Dialog } from "./Dialog.js";

interface NewProjectDialogProps {
  /** Called when user clicks "Create Project". subjectIri is null when field left blank. */
  onConfirm: (title: string, subjectIri: string | null) => void;
  /** Called when user clicks "Skip \u2014 use placeholder". */
  onSkip: () => void;
  /** Called when dialog is dismissed via X / Escape without action. */
  onClose: () => void;
}

export function NewProjectDialog({
  onConfirm,
  onSkip,
  onClose,
}: NewProjectDialogProps) {
  const [title, setTitle] = useState("Untitled Project");
  const [subjectIri, setSubjectIri] = useState("");

  function handleCreate(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const trimmedTitle = title.trim() || "Untitled Project";
    const trimmedIri = subjectIri.trim() || null;
    onConfirm(trimmedTitle, trimmedIri);
  }

  return (
    <Dialog
      title="New Project"
      onClose={onClose}
      testId="gw-dialog-new-project"
    >
      <form
        className="gw-term-form"
        onSubmit={handleCreate}
        data-testid="gw-form-new-project"
      >
        <div className="gw-form-label">Project Title</div>
        <input
          className="gw-form-input"
          type="text"
          value={title}
          onChange={(e) => { setTitle(e.target.value); }}
          data-testid="gw-input-new-project-title"
        />

        <div className="gw-form-label">Subject of the graph</div>
        <input
          className="gw-form-input"
          type="text"
          placeholder="https://example.org/MySubject"
          value={subjectIri}
          onChange={(e) => { setSubjectIri(e.target.value); }}
          data-testid="gw-input-new-project-subject"
        />
        <p className="gw-form-hint">
          Example: https://example.org/MyDomain. Leave blank to set later.
        </p>

        <div className="gw-form-actions">
          <button
            type="button"
            className="gw-btn gw-btn--secondary"
            onClick={onSkip}
            data-testid="gw-btn-new-project-skip"
          >
            Skip \u2014 use placeholder
          </button>
          <button
            type="submit"
            className="gw-btn"
            data-testid="gw-btn-new-project-create"
          >
            Create Project
          </button>
        </div>
      </form>
    </Dialog>
  );
}
