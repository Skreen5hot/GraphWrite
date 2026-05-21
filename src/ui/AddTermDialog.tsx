/**
 * AddTermDialog -- form for FR-U006 / FR-U007 / FR-U008 (task 2.3 Chain A).
 *
 * IRI generation: uses crypto.randomUUID() (Web Crypto API; browser-native;
 * typed in tsconfig.ui.json lib:DOM) when no IRI override is supplied.
 * src/iri/index.ts uses node:crypto and is not importable in a browser bundle.
 * See open_questions in urn:fnsr:task:171-dev-term-crud for the recommended
 * browser-compat export track for src/iri/.
 *
 * Term shape: SPEC §5.7.
 */

import { useState, type FormEvent } from "react";
import { Dialog } from "./Dialog.js";

export type AddTermType =
  | "owl:Class"
  | "owl:ObjectProperty"
  | "owl:DatatypeProperty";

interface AddTermDialogProps {
  termType: AddTermType;
  /** Read-only; used for IRI uniqueness check. */
  project: Record<string, unknown>;
  /** Called with the new SPEC §5.7-shaped term entry on successful submit. */
  onConfirm: (newTerm: Record<string, unknown>) => void;
  onClose: () => void;
}

const TERM_TYPE_LABEL: Record<AddTermType, string> = {
  "owl:Class": "Class",
  "owl:ObjectProperty": "Object Property",
  "owl:DatatypeProperty": "Datatype Property",
};

/**
 * Collect all id values from ecm:terms + ecm:instances for duplicate-IRI
 * detection. Inline because collectSemanticEntityIds in src/refactor/index.ts
 * is not exported (reconnaissance finding F13).
 */
function collectExistingIris(project: Record<string, unknown>): Set<string> {
  const iris = new Set<string>();
  for (const key of ["ecm:terms", "ecm:instances"]) {
    const arr = project[key];
    if (!Array.isArray(arr)) continue;
    for (const item of arr as unknown[]) {
      if (typeof item !== "object" || item === null) continue;
      const id = (item as Record<string, unknown>)["id"];
      if (typeof id === "string" && id.length > 0) iris.add(id);
    }
  }
  return iris;
}

export function AddTermDialog({
  termType,
  project,
  onConfirm,
  onClose,
}: AddTermDialogProps) {
  const [label, setLabel] = useState("");
  const [iriOverride, setIriOverride] = useState("");
  const [error, setError] = useState<string | null>(null);

  function handleSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const trimmedLabel = label.trim();
    if (trimmedLabel.length === 0) {
      setError("Label is required.");
      return;
    }
    const trimmedIri = iriOverride.trim();
    const iri =
      trimmedIri.length > 0
        ? trimmedIri
        : `urn:uuid:${crypto.randomUUID()}`;
    if (collectExistingIris(project).has(iri)) {
      setError(`IRI already exists in this project: ${iri}`);
      return;
    }
    const now = new Date().toISOString();
    const newTerm: Record<string, unknown> = {
      "ecm:createdAt": now,
      "ecm:ontologyId": null,
      "ecm:source": "ecm:project-created",
      "ecm:updatedAt": now,
      id: iri,
      "rdfs:label": trimmedLabel,
      type: termType,
    };
    onConfirm(newTerm);
  }

  const typeLabel = TERM_TYPE_LABEL[termType];
  // AC2 (FR-U013): derived on each render; only fires for non-empty overrides.
  // Empty override -> auto-generate (urn:uuid:) path, which is always unique.
  const trimmedIriOverride = iriOverride.trim();
  const isDuplicate =
    trimmedIriOverride.length > 0 &&
    collectExistingIris(project).has(trimmedIriOverride);

  return (
    <Dialog
      title={`Add ${typeLabel}`}
      onClose={onClose}
      testId="gw-dialog-add-term"
    >
      <form
        className="gw-term-form"
        onSubmit={handleSubmit}
        data-testid="gw-form-add-term"
      >
        {error !== null && (
          <p className="gw-form-error" role="alert" data-testid="gw-form-error">
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
            data-testid="gw-input-term-label"
            autoFocus
          />
        </label>
        <label className="gw-form-label">
          IRI override{" "}
          <span className="gw-form-hint">(optional; auto-generated if empty)</span>
          <input
            className="gw-form-input"
            type="text"
            value={iriOverride}
            onChange={(e) => {
              setIriOverride(e.target.value);
              setError(null);
            }}
            data-testid="gw-input-term-iri"
          />
        </label>
        {isDuplicate && (
          <p
            className="gw-iri-duplicate-warning"
            role="alert"
            data-testid="gw-iri-duplicate-warning"
          >
            IRI already exists in this project: {trimmedIriOverride}
          </p>
        )}
        <div className="gw-form-actions">
          <button
            type="button"
            className="gw-btn gw-btn--secondary"
            onClick={onClose}
            data-testid="gw-btn-term-cancel"
          >
            Cancel
          </button>
          <button
            type="submit"
            className="gw-btn"
            disabled={isDuplicate}
            data-testid="gw-btn-term-submit"
          >
            Add {typeLabel}
          </button>
        </div>
      </form>
    </Dialog>
  );
}
