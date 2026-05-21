/**
 * AddLiteralDialog -- form for FR-U018 (task 2.7 Chain A).
 *
 * Literal-assertion shape: SPEC section 5.10.
 * IRI generation: uses crypto.randomUUID() (Web Crypto API; browser-native;
 * typed in tsconfig.ui.json lib:DOM).
 */

import { useState, type FormEvent } from "react";
import { Dialog } from "./Dialog.js";

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

interface DatatypePropOption {
  iri: string;
  label: string;
}

interface AddLiteralDialogProps {
  /** The project document; used to extract owl:DatatypeProperty terms. */
  project: Record<string, unknown>;
  /** IRI of the ecm:Instance this assertion attaches to (ecm:subjectIri). */
  subjectIri: string;
  /** Called with the new SPEC section 5.10-shaped ecm:LiteralAssertion on submit. */
  onConfirm: (newAssertion: Record<string, unknown>) => void;
  onClose: () => void;
}

function getDatatypePropertyOptions(project: Record<string, unknown>): DatatypePropOption[] {
  const raw = project["ecm:terms"];
  if (!Array.isArray(raw)) return [];
  const result: DatatypePropOption[] = [];
  for (const item of raw as unknown[]) {
    if (typeof item !== "object" || item === null) continue;
    const obj = item as Record<string, unknown>;
    if (typeof obj["id"] !== "string") continue;
    if (obj["type"] !== "owl:DatatypeProperty") continue;
    const iri = obj["id"] as string;
    const label =
      typeof obj["rdfs:label"] === "string" && (obj["rdfs:label"] as string).length > 0
        ? (obj["rdfs:label"] as string)
        : iri;
    result.push({ iri, label });
  }
  return result;
}

export function AddLiteralDialog({
  project,
  subjectIri,
  onConfirm,
  onClose,
}: AddLiteralDialogProps) {
  const dtPropOptions = getDatatypePropertyOptions(project);
  const [predicateIri, setPredicateIri] = useState(dtPropOptions[0]?.iri ?? "");
  const [value, setValue] = useState("");
  const [language, setLanguage] = useState("");
  const [datatype, setDatatype] = useState<string>("xsd:string");
  const [error, setError] = useState<string | null>(null);

  function handleSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (predicateIri.length === 0) {
      setError(
        "No owl:DatatypeProperty terms in this project. Add one via the Term Manager first.",
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
    <Dialog title="Add Literal" onClose={onClose} testId="gw-dialog-add-literal">
      <form
        className="gw-term-form"
        onSubmit={handleSubmit}
        data-testid="gw-form-add-literal"
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
            data-testid="gw-select-literal-predicate"
          >
            {dtPropOptions.length === 0 && (
              <option value="">(no datatype properties available)</option>
            )}
            {dtPropOptions.map((opt) => (
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
            data-testid="gw-input-literal-value"
            autoFocus
          />
        </label>
        <label className="gw-form-label">
          Datatype
          <select
            className="gw-form-input"
            value={datatype}
            onChange={(e) => { setDatatype(e.target.value); }}
            data-testid="gw-select-literal-datatype"
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
            data-testid="gw-input-literal-language"
          />
        </label>
        <div className="gw-form-actions">
          <button
            type="button"
            className="gw-btn gw-btn--secondary"
            onClick={onClose}
            data-testid="gw-btn-literal-cancel"
          >
            Cancel
          </button>
          <button
            type="submit"
            className="gw-btn"
            disabled={dtPropOptions.length === 0}
            data-testid="gw-btn-literal-submit"
          >
            Add Literal
          </button>
        </div>
      </form>
    </Dialog>
  );
}