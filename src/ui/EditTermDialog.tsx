/**
 * EditTermDialog -- form for FR-U009 (Edit project-created term).
 * Task 2.3 Chain B.
 *
 * Phase "edit": pre-populated form (label, comment, IRI).
 *   Submit with IRI unchanged -> label/comment update, calls onConfirm.
 *   Submit with IRI changed   -> calls refactorIri(); collision -> inline
 *   error; success -> phase "confirm-refactor".
 *
 * Phase "confirm-refactor": shows old IRI, new IRI, reference count,
 *   affected entity types. Confirm applies the pre-computed cascade + label/
 *   comment update and calls onConfirm. Cancel returns to phase "edit".
 *
 * Reuses Dialog from Chain A (src/ui/Dialog.tsx).
 * SPEC §5.7, §13.2, §13.5, §13.8 / FR-U009.
 */

import { useState, type FormEvent } from "react";
import { Dialog } from "./Dialog.js";
import { refactorIri, type RefactorResult } from "../refactor/index.js";

interface EditTermDialogProps {
  /** Raw ecm:terms entry to edit (SPEC §5.7-shaped). */
  term: Record<string, unknown>;
  /** Current project document (for IRI collision check + refactor cascade). */
  project: Record<string, unknown>;
  /**
   * Called with the updated project document on successful save.
   * The parent controls visibility: unmount this dialog after onConfirm fires.
   */
  onConfirm: (updatedProject: Record<string, unknown>) => void;
  onClose: () => void;
}

type Phase = "edit" | "confirm-refactor";

/** Safely read a string field; returns "" if absent or non-string. */
function readStr(obj: Record<string, unknown>, key: string): string {
  const v = obj[key];
  return typeof v === "string" ? v : "";
}

/**
 * Return a new ecm:terms array where the entry whose id === originalIri is
 * updated to newIri, newLabel, newComment (+ refreshed ecm:updatedAt).
 * All other entries pass through unchanged.
 *
 * @param sourceProject Project to read ecm:terms from (may be the cascade-
 *   updated project from refactorIri when IRI changed).
 */
function applyTermEdit(
  sourceProject: Record<string, unknown>,
  originalIri: string,
  newIri: string,
  newLabel: string,
  newComment: string,
): unknown[] {
  const existing: unknown[] = Array.isArray(sourceProject["ecm:terms"])
    ? (sourceProject["ecm:terms"] as unknown[])
    : [];
  const now = new Date().toISOString();
  return existing.map((item) => {
    const obj = item as Record<string, unknown>;
    if (readStr(obj, "id") !== originalIri) return item;
    const updated: Record<string, unknown> = {
      ...obj,
      id: newIri,
      "rdfs:label": newLabel,
      "ecm:updatedAt": now,
    };
    if (newComment.length > 0) {
      updated["rdfs:comment"] = newComment;
    } else {
      // rdfs:comment is optional per SPEC §5.7; remove when cleared.
      delete updated["rdfs:comment"];
    }
    return updated;
  });
}

export function EditTermDialog({
  term,
  project,
  onConfirm,
  onClose,
}: EditTermDialogProps) {
  const originalIri = readStr(term, "id");
  const [label, setLabel] = useState(readStr(term, "rdfs:label"));
  const [comment, setComment] = useState(readStr(term, "rdfs:comment"));
  const [iri, setIri] = useState(originalIri);
  const [error, setError] = useState<string | null>(null);
  const [phase, setPhase] = useState<Phase>("edit");
  const [pendingRefactor, setPendingRefactor] =
    useState<RefactorResult | null>(null);

  function handleSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const trimmedLabel = label.trim();
    const trimmedComment = comment.trim();
    const trimmedIri = iri.trim();

    if (trimmedLabel.length === 0) {
      setError("Label is required.");
      return;
    }
    if (trimmedIri.length === 0) {
      setError("IRI is required.");
      return;
    }

    // IRI unchanged: label + comment update only.
    if (trimmedIri === originalIri) {
      const updatedTerms = applyTermEdit(
        project,
        originalIri,
        trimmedIri,
        trimmedLabel,
        trimmedComment,
      );
      onConfirm({ ...project, "ecm:terms": updatedTerms });
      return;
    }

    // IRI changed: refactorIri is a pure function -- safe to call for count
    // and collision detection without committing (SPEC §21.1).
    const result = refactorIri(project, originalIri, trimmedIri);
    if (result.collision !== undefined) {
      setError(`IRI already in use: ${trimmedIri}`);
      return;
    }

    setPendingRefactor(result);
    setPhase("confirm-refactor");
  }

  function handleConfirmRefactor() {
    if (pendingRefactor === null) return;
    const trimmedLabel = label.trim();
    const trimmedComment = comment.trim();
    const trimmedIri = iri.trim();
    // Apply label/comment/id edit on top of the cascade-updated project.
    const updatedTerms = applyTermEdit(
      pendingRefactor.project,
      originalIri,
      trimmedIri,
      trimmedLabel,
      trimmedComment,
    );
    onConfirm({ ...pendingRefactor.project, "ecm:terms": updatedTerms });
  }

  function handleCancelRefactor() {
    setPendingRefactor(null);
    setPhase("edit");
  }

  /**
   * Regenerate IRI (AC3 FR-U013): auto-generate a fresh urn:uuid: IRI, compute
   * the refactor cascade (referenceCount + affectedEntityTypes) via refactorIri(),
   * then enter the confirm-refactor phase for user review before commit.
   *
   * Uses crypto.randomUUID() (Web Crypto API; lib:DOM; browser-native).
   * Cannot import src/iri/index.ts -- it uses node:crypto, not browser-compatible.
   * See open_questions in urn:fnsr:task:171-dev-term-crud for the recommended
   * browser-compat export track for src/iri/.
   */
  function handleRegenerateIri() {
    const newIri = `urn:uuid:${crypto.randomUUID()}`;
    const result = refactorIri(project, originalIri, newIri);
    // A fresh UUID should never collide, but guard for correctness.
    if (result.collision !== undefined) {
      setError(`Regenerated IRI unexpectedly collided: ${newIri}`);
      return;
    }
    // Update iri state so the confirm-refactor dialog shows the generated value.
    setIri(newIri);
    setPendingRefactor(result);
    setPhase("confirm-refactor");
  }

  if (phase === "confirm-refactor" && pendingRefactor !== null) {
    const { referenceCount, affectedEntityTypes } = pendingRefactor;
    const entityList =
      affectedEntityTypes.length > 0
        ? affectedEntityTypes.join(", ")
        : "none";
    return (
      <Dialog
        title="Confirm Refactor IRI"
        onClose={onClose}
        testId="gw-dialog-confirm-refactor"
      >
        <div
          className="gw-refactor-confirm"
          data-testid="gw-refactor-confirm-body"
        >
          <p>
            <strong>Old IRI:</strong> {originalIri}
          </p>
          <p>
            <strong>New IRI:</strong> {iri.trim()}
          </p>
          <p data-testid="gw-refactor-reference-count">
            This will update <strong>{referenceCount}</strong>{" "}
            reference{referenceCount !== 1 ? "s" : ""} across{" "}
            <strong>{entityList}</strong>. Continue?
          </p>
          <div className="gw-form-actions">
            <button
              type="button"
              className="gw-btn gw-btn--secondary"
              onClick={handleCancelRefactor}
              data-testid="gw-btn-refactor-cancel"
            >
              Cancel
            </button>
            <button
              type="button"
              className="gw-btn"
              onClick={handleConfirmRefactor}
              data-testid="gw-btn-refactor-confirm"
            >
              Confirm
            </button>
          </div>
        </div>
      </Dialog>
    );
  }

  return (
    <Dialog title="Edit Term" onClose={onClose} testId="gw-dialog-edit-term">
      <form
        className="gw-term-form"
        onSubmit={handleSubmit}
        data-testid="gw-form-edit-term"
      >
        {error !== null && (
          <p
            className="gw-form-error"
            role="alert"
            data-testid="gw-form-error"
          >
            {error}
          </p>
        )}
        <label className="gw-form-label">
          Label *
          <input
            className="gw-form-input"
            type="text"
            value={label}
            onChange={(e) => {
              setLabel(e.target.value);
              setError(null);
            }}
            data-testid="gw-input-edit-label"
            autoFocus
          />
        </label>
        <label className="gw-form-label">
          Comment{" "}
          <span className="gw-form-hint">(optional)</span>
          <textarea
            className="gw-form-input gw-form-textarea"
            value={comment}
            onChange={(e) => {
              setComment(e.target.value);
            }}
            data-testid="gw-input-edit-comment"
          />
        </label>
        <label className="gw-form-label">
          IRI
          <input
            className="gw-form-input"
            type="text"
            value={iri}
            onChange={(e) => {
              setIri(e.target.value);
              setError(null);
            }}
            data-testid="gw-input-edit-iri"
          />
        </label>
        <button
          type="button"
          className="gw-btn gw-btn--secondary"
          onClick={handleRegenerateIri}
          data-testid="gw-btn-regenerate-iri"
        >
          Regenerate IRI
        </button>
        <div className="gw-form-actions">
          <button
            type="button"
            className="gw-btn gw-btn--secondary"
            onClick={onClose}
            data-testid="gw-btn-edit-cancel"
          >
            Cancel
          </button>
          <button
            type="submit"
            className="gw-btn"
            data-testid="gw-btn-edit-submit"
          >
            Save
          </button>
        </div>
      </form>
    </Dialog>
  );
}
