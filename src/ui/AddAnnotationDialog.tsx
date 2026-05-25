/**
 * AddAnnotationDialog -- form for adding owl:AnnotationProperty assertions.
 *
 * Produces an ecm:LiteralAssertion routed to the AnnotationAssertion section
 * per OWL 2 DL axiom-type partition (R5-A3 / ratification 459-rat-r5-c3-v5).
 * Literal-assertion shape: SPEC section 5.10.
 * IRI generation: uses crypto.randomUUID() (Web Crypto API; browser-native;
 * typed in tsconfig.ui.json lib:DOM).
 */

import { useState, type FormEvent } from "react";
import { Dialog } from "./Dialog.js";
import { iriTail, resolveTermLabel } from "./label-resolution.js";
import { STARTER_TERMS } from "../validate/starter-terms.js";

/** Allowed Phase 2 datatypes per SPEC section 5.10. */
const DATATYPE_OPTIONS = [
  "xsd:string",
  "xsd:boolean",
  "xsd:integer",
  "xsd:decimal",
  "xsd:double",
  "xsd:date",
  "xsd:dateTime",
  "xsd:anyURI",
  "rdf:langString",
] as const;

interface AnnotationPropOption {
  iri: string;
  label: string;
}

interface AddAnnotationDialogProps {
  /** The project document; used to extract owl:AnnotationProperty terms. */
  project: Record<string, unknown>;
  /** IRI of the ecm:Instance this assertion attaches to (ecm:subjectIri). */
  subjectIri: string;
  /** Called with the new SPEC section 5.10-shaped ecm:LiteralAssertion on submit. */
  onConfirm: (newAssertion: Record<string, unknown>) => void;
  onClose: () => void;
}

/**
 * Extract owl:AnnotationProperty options from ecm:terms with STARTER_TERMS fallback.
 * Mirrors getAnnotationPropertyOptions() in Inspector.tsx; kept local per the
 * AddLiteralDialog pattern (self-contained option computation from project).
 */
function getAnnotationPropertyOptions(
  project: Record<string, unknown>,
): AnnotationPropOption[] {
  const raw = project["ecm:terms"];
  const seen = new Set<string>();
  const result: AnnotationPropOption[] = [];
  if (Array.isArray(raw)) {
    for (const item of raw as unknown[]) {
      if (typeof item !== "object" || item === null) continue;
      const obj = item as Record<string, unknown>;
      if (typeof obj["id"] !== "string") continue;
      if (obj["type"] !== "owl:AnnotationProperty") continue;
      const iri = obj["id"] as string;
      seen.add(iri);
      const labelText = resolveTermLabel(obj["rdfs:label"]);
      const label = labelText.length > 0 ? labelText : iriTail(iri);
      result.push({ iri, label });
    }
  }
  // Fallback: include STARTER_TERMS annotation properties not already in ecm:terms.
  for (const st of STARTER_TERMS) {
    if (st.type === "owl:AnnotationProperty" && !seen.has(st.id)) {
      const labelText = resolveTermLabel(st["rdfs:label"]);
      const label = labelText.length > 0 ? labelText : iriTail(st.id);
      result.push({ iri: st.id, label });
    }
  }
  return result;
}

export function AddAnnotationDialog({
  project,
  subjectIri,
  onConfirm,
  onClose,
}: AddAnnotationDialogProps) {
  const annPropOptions = getAnnotationPropertyOptions(project);
  const [predicateIri, setPredicateIri] = useState(annPropOptions[0]?.iri ?? "");
  const [value, setValue] = useState("");
  const [language, setLanguage] = useState("");
  const [datatype, setDatatype] = useState<string>("xsd:string");
  const [error, setError] = useState<string | null>(null);

  function handleSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (predicateIri.length === 0) {
      setError(
        "No owl:AnnotationProperty terms in this project. Add one via the Term Manager first.",
      );
      return;
    }
    const trimmedValue = value.trim();
    if (trimmedValue.length === 0) {
      setError("Value is required.");
      return;
    }
    const trimmedLang = language.trim();
    const newAssertion: Record<string, unknown> = {
      "ecm:datatype": datatype,
      "ecm:language": trimmedLang.length > 0 ? trimmedLang : null,
      "ecm:predicateIri": predicateIri,
      "ecm:subjectIri": subjectIri,
      "ecm:value": trimmedValue,
      id: `urn:uuid:${crypto.randomUUID()}`,
      type: "ecm:LiteralAssertion",
    };
    onConfirm(newAssertion);
  }

  return (
    <Dialog title="Add Annotation" onClose={onClose} testId="gw-dialog-add-annotation">
      <form
        className="gw-term-form"
        onSubmit={handleSubmit}
        data-testid="gw-form-add-annotation"
      >
        {error !== null && (
          <p className="gw-form-error" role="alert" data-testid="gw-form-error">
            {error}
          </p>
        )}
        <label className="gw-form-label">
          Property *
          <select
            className="gw-form-input"
            value={predicateIri}
            onChange={(e) => {
              setPredicateIri(e.target.value);
              setError(null);
            }}
            data-testid="gw-select-annotation-predicate"
          >
            {annPropOptions.length === 0 && (
              <option value="">(no annotation properties available)</option>
            )}
            {annPropOptions.map((opt) => (
              <option key={opt.iri} value={opt.iri}>
                {opt.label}
              </option>
            ))}
          </select>
        </label>
        <label className="gw-form-label">
          Value *
          <input
            className="gw-form-input"
            type="text"
            value={value}
            onChange={(e) => {
              setValue(e.target.value);
              setError(null);
            }}
            data-testid="gw-input-annotation-value"
            autoFocus
          />
        </label>
        <label className="gw-form-label">
          Datatype
          <select
            className="gw-form-input"
            value={datatype}
            onChange={(e) => { setDatatype(e.target.value); }}
            data-testid="gw-select-annotation-datatype"
          >
            {DATATYPE_OPTIONS.map((dt) => (
              <option key={dt} value={dt}>
                {dt}
              </option>
            ))}
          </select>
        </label>
        <label className="gw-form-label">
          Language tag{" "}
          <span className="gw-form-hint">(optional; e.g. en)</span>
          <input
            className="gw-form-input"
            type="text"
            value={language}
            onChange={(e) => { setLanguage(e.target.value); }}
            data-testid="gw-input-annotation-language"
          />
        </label>
        <div className="gw-form-actions">
          <button
            type="button"
            className="gw-btn gw-btn--secondary"
            onClick={onClose}
            data-testid="gw-btn-annotation-cancel"
          >
            Cancel
          </button>
          <button
            type="submit"
            className="gw-btn"
            disabled={annPropOptions.length === 0}
            data-testid="gw-btn-annotation-submit"
          >
            Add Annotation
          </button>
        </div>
      </form>
    </Dialog>
  );
}
