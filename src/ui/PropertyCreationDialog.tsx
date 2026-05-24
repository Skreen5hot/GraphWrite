/**
 * PropertyCreationDialog -- FR-U033 Property Creation Module.
 *
 * Dedicated creation workflow for adding project-created annotation and
 * datatype properties from the Term Manager sidebar.
 *
 * Five fields per FR-U033:
 *   (a) Property Type Toggle  -- AnnotationProperty (default) / DatatypeProperty
 *   (b) Prefix / Namespace Selector -- ex:, foaf:, schema:, Custom... (rdf: excluded per SPEC)
 *   (c) Local Name field      -- regex ^[a-zA-Z_][a-zA-Z0-9_.-]*$
 *   (d) Label + BCP 47 lang tag -- required text; default "en"
 *   (e) Target Data Type Dropdown -- XSD primitives (DatatypeProperty only)
 *
 * On submit: composes IRI as `${namespace}${localName}`, builds SPEC section 5.7
 * term with id=composedIRI, type=owl:AnnotationProperty|owl:DatatypeProperty,
 * ecm:source=ecm:project-created, rdfs:label={text,lang},
 * rdfs:range=xsdIri (DatatypeProperty only; ADR-009).
 *
 * IRI uniqueness check is non-blocking (warn inline; does not block submit).
 * Reuses Dialog primitive from src/ui/Dialog.tsx. FR-U033, ADR-009.
 */

import { useState, type FormEvent } from "react";
import { Dialog } from "./Dialog.js";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type PropertyCreationType =
  | "owl:AnnotationProperty"
  | "owl:DatatypeProperty";

export interface PropertyCreationDialogProps {
  /** Initial property type; defaults to AnnotationProperty (FR-U033 default). */
  initialType?: PropertyCreationType;
  /** Read-only; used for non-blocking IRI uniqueness check (FR-U033). */
  project: Record<string, unknown>;
  /** Called with new SPEC section 5.7 term entry on successful submit. */
  onConfirm: (newTerm: Record<string, unknown>) => void;
  onClose: () => void;
}

// ---------------------------------------------------------------------------
// Constants
// Hardcoded app-level list per FR-U033 + SME S9 correction.
// rdf: explicitly excluded: "The rdf: namespace MUST NOT appear" (SPEC FR-U033).
// ---------------------------------------------------------------------------

const NAMESPACE_OPTIONS: ReadonlyArray<{ prefix: string; ns: string }> = [
  { prefix: "ex",     ns: "http://example.org/" },
  { prefix: "foaf",   ns: "http://xmlns.com/foaf/0.1/" },
  { prefix: "schema", ns: "https://schema.org/" },
];

/** 8 XSD datatypes per FR-U033 (xsd:double + xsd:anyURI added vs FEEDBACK-ROUND-4.md). */
const XSD_DATATYPES: ReadonlyArray<string> = [
  "xsd:string",
  "xsd:boolean",
  "xsd:integer",
  "xsd:decimal",
  "xsd:double",
  "xsd:date",
  "xsd:dateTime",
  "xsd:anyURI",
];

const XSD_NS = "http://www.w3.org/2001/XMLSchema#";

/** BCP 47 tag pattern per FR-U033 (d). */
const BCP47_RE = /^[a-zA-Z]{2,8}(-[a-zA-Z0-9]{1,8})*$/;

/** Local name pattern per FR-U033 (c). */
const LOCAL_NAME_RE = /^[a-zA-Z_][a-zA-Z0-9_.-]*$/;

/** Custom namespace IRI: must end with '#' or '/' (R5-A1a). */
const CUSTOM_NS_IRI_RE = /^(https?:\/\/[^\s]+[#\/]|urn:[^\s]+#)$/;

/** Custom prefix label: NCName-compatible (R5-A1a). */
const CUSTOM_PREFIX_RE = /^[A-Za-z_][A-Za-z0-9_-]*$/;

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

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

function expandXsdIri(compact: string): string {
  if (compact.startsWith("xsd:")) return XSD_NS + compact.slice(4);
  return compact;
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function PropertyCreationDialog({
  initialType = "owl:AnnotationProperty",
  project,
  onConfirm,
  onClose,
}: PropertyCreationDialogProps) {
  const [propertyType, setPropertyType] = useState<PropertyCreationType>(initialType);
  const [selectedPrefix, setSelectedPrefix] = useState<string>(
    NAMESPACE_OPTIONS[0].prefix,
  );
  const [localName, setLocalName] = useState("");
  const [labelText, setLabelText] = useState("");
  const [langTag, setLangTag] = useState("en");
  const [dataType, setDataType] = useState<string>(XSD_DATATYPES[0]);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [customNsIri, setCustomNsIri] = useState("");
  const [customPrefixLabel, setCustomPrefixLabel] = useState("");

  const isCustomPrefix = selectedPrefix === "custom";
  const selectedNs = isCustomPrefix
    ? customNsIri
    : NAMESPACE_OPTIONS.find((o) => o.prefix === selectedPrefix)?.ns ?? "";
  const trimmedLocal = localName.trim();
  const composedIri =
    trimmedLocal.length > 0 ? `${selectedNs}${trimmedLocal}` : "";
  const localNameValid = trimmedLocal.length === 0 || LOCAL_NAME_RE.test(trimmedLocal);
  const langTagTrimmed = langTag.trim();
  const langTagValid = langTagTrimmed.length === 0 || BCP47_RE.test(langTagTrimmed);
  const customNsIriValid =
    !isCustomPrefix || customNsIri.length === 0 || CUSTOM_NS_IRI_RE.test(customNsIri);
  const customPrefixLabelValid =
    !isCustomPrefix || customPrefixLabel.length === 0 || CUSTOM_PREFIX_RE.test(customPrefixLabel);
  const iriAlreadyExists =
    composedIri.length > 0 && collectExistingIris(project).has(composedIri);
  const isAnnotation = propertyType === "owl:AnnotationProperty";

  function handleSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (trimmedLocal.length === 0) {
      setSubmitError("Local name is required.");
      return;
    }
    if (!LOCAL_NAME_RE.test(trimmedLocal)) {
      setSubmitError(
        "Local name must match ^[a-zA-Z_][a-zA-Z0-9_.-]*$ (start with letter or underscore).",
      );
      return;
    }
    const trimmedLabel = labelText.trim();
    if (trimmedLabel.length === 0) {
      setSubmitError("Label is required.");
      return;
    }
    if (langTagTrimmed.length === 0 || !BCP47_RE.test(langTagTrimmed)) {
      setSubmitError("Language tag must be a valid BCP 47 tag (e.g. en, fr, zh-Hans).");
      return;
    }
    if (isCustomPrefix) {
      if (customNsIri.length === 0) {
        setSubmitError("Namespace IRI is required for a custom prefix.");
        return;
      }
      if (!CUSTOM_NS_IRI_RE.test(customNsIri)) {
        setSubmitError(
          "Namespace IRI must be https://, http://, or urn: and end with '#' or '/'.",
        );
        return;
      }
      if (customPrefixLabel.length === 0) {
        setSubmitError("Prefix label is required for a custom prefix.");
        return;
      }
      if (!CUSTOM_PREFIX_RE.test(customPrefixLabel)) {
        setSubmitError(
          "Prefix label must match ^[A-Za-z_][A-Za-z0-9_-]*$ (NCName-compatible).",
        );
        return;
      }
    }
    const now = new Date().toISOString();
    const newTerm: Record<string, unknown> = {
      "ecm:createdAt": now,
      "ecm:ontologyId": null,
      "ecm:source": "ecm:project-created",
      "ecm:updatedAt": now,
      id: composedIri,
      "rdfs:label": { text: trimmedLabel, lang: langTagTrimmed },
      type: propertyType,
    };
    if (!isAnnotation) {
      newTerm["rdfs:range"] = expandXsdIri(dataType);
    }
    onConfirm(newTerm);
  }

  return (
    <Dialog
      title={isAnnotation ? "Add Annotation Property" : "Add Datatype Property"}
      onClose={onClose}
      testId="gw-dialog-property-creation"
    >
      <form
        className="gw-term-form"
        onSubmit={handleSubmit}
        data-testid="gw-form-property-creation"
      >
        {submitError !== null && (
          <p
            className="gw-form-error"
            role="alert"
            data-testid="gw-form-error-property"
          >
            {submitError}
          </p>
        )}

        {/* (a) Property Type Toggle */}
        <fieldset
          className="gw-form-fieldset"
          data-testid="gw-fieldset-property-type"
        >
          <legend className="gw-form-legend">Property Type</legend>
          <label className="gw-form-radio-label">
            <input
              type="radio"
              name="propertyType"
              value="owl:AnnotationProperty"
              checked={isAnnotation}
              onChange={() => setPropertyType("owl:AnnotationProperty")}
              data-testid="gw-radio-annotation-property"
            />{" "}
            Annotation Property
          </label>
          <label className="gw-form-radio-label">
            <input
              type="radio"
              name="propertyType"
              value="owl:DatatypeProperty"
              checked={!isAnnotation}
              onChange={() => setPropertyType("owl:DatatypeProperty")}
              data-testid="gw-radio-datatype-property"
            />{" "}
            Datatype Property
          </label>
        </fieldset>

        {/* (b) Prefix / Namespace Selector */}
        <label className="gw-form-label">
          Prefix *
          <select
            className="gw-form-select"
            value={selectedPrefix}
            onChange={(e) => {
              setSelectedPrefix(e.target.value);
              setSubmitError(null);
            }}
            data-testid="gw-select-prefix"
          >
            {NAMESPACE_OPTIONS.map((o) => (
              <option key={o.prefix} value={o.prefix}>
                {o.prefix}: ({o.ns})
              </option>
            ))}
            <option value="custom">Custom...</option>
          </select>
        </label>

        {isCustomPrefix && (
          <>
            <label className="gw-form-label">
              Namespace IRI *
              <input
                className="gw-form-input"
                type="text"
                value={customNsIri}
                onChange={(e) => {
                  setCustomNsIri(e.target.value);
                  setSubmitError(null);
                }}
                placeholder="e.g. https://example.org/myvocab#"
                data-testid="gw-input-custom-ns-iri"
              />
            </label>
            {!customNsIriValid && (
              <p
                className="gw-form-error"
                role="alert"
                data-testid="gw-custom-ns-iri-error"
              >
                Namespace IRI must be https://, http://, or urn: and end with # or /.
              </p>
            )}
            <label className="gw-form-label">
              Prefix Label *
              <input
                className="gw-form-input"
                type="text"
                value={customPrefixLabel}
                onChange={(e) => {
                  setCustomPrefixLabel(e.target.value);
                  setSubmitError(null);
                }}
                placeholder="e.g. myns"
                data-testid="gw-input-custom-prefix-label"
              />
            </label>
            {!customPrefixLabelValid && (
              <p
                className="gw-form-error"
                role="alert"
                data-testid="gw-custom-prefix-label-error"
              >
                Prefix label must match ^[A-Za-z_][A-Za-z0-9_-]*$ (NCName-compatible).
              </p>
            )}
          </>
        )}

        {/* (c) Local Name */}
        <label className="gw-form-label">
          Local Name *
          <input
            className="gw-form-input"
            type="text"
            value={localName}
            onChange={(e) => {
              setLocalName(e.target.value);
              setSubmitError(null);
            }}
            placeholder="e.g. myProperty"
            data-testid="gw-input-local-name"
            autoFocus
          />
        </label>
        {!localNameValid && (
          <p
            className="gw-form-error"
            role="alert"
            data-testid="gw-local-name-error"
          >
            Must start with a letter or underscore; only letters, digits, underscores, dots, hyphens allowed.
          </p>
        )}
        {composedIri.length > 0 && (
          <p className="gw-form-hint" data-testid="gw-composed-iri">
            IRI: {composedIri}
          </p>
        )}
        {iriAlreadyExists && (
          <p
            className="gw-iri-duplicate-warning"
            role="alert"
            data-testid="gw-iri-duplicate-warning"
          >
            Warning: this IRI already exists in the project.
          </p>
        )}

        {/* (d) Label + Language Tag */}
        <label className="gw-form-label">
          Label *
          <input
            className="gw-form-input"
            type="text"
            value={labelText}
            onChange={(e) => {
              setLabelText(e.target.value);
              setSubmitError(null);
            }}
            data-testid="gw-input-property-label"
          />
        </label>
        <label className="gw-form-label">
          Language Tag{" "}
          <span className="gw-form-hint">(BCP 47; default en)</span>
          <input
            className="gw-form-input"
            type="text"
            value={langTag}
            onChange={(e) => {
              setLangTag(e.target.value);
              setSubmitError(null);
            }}
            data-testid="gw-input-lang-tag"
          />
        </label>
        {!langTagValid && (
          <p
            className="gw-form-error"
            role="alert"
            data-testid="gw-lang-tag-error"
          >
            Language tag must be a valid BCP 47 tag (e.g. en, fr, zh-Hans).
          </p>
        )}

        {/* (e) Target Data Type Dropdown -- conditional on DatatypeProperty */}
        {!isAnnotation && (
          <label className="gw-form-label">
            Target Data Type *
            <select
              className="gw-form-select"
              value={dataType}
              onChange={(e) => setDataType(e.target.value)}
              data-testid="gw-select-datatype"
            >
              {XSD_DATATYPES.map((dt) => (
                <option key={dt} value={dt}>
                  {dt}
                </option>
              ))}
            </select>
          </label>
        )}

        <div className="gw-form-actions">
          <button
            type="button"
            className="gw-btn gw-btn--secondary"
            onClick={onClose}
            data-testid="gw-btn-property-cancel"
          >
            Cancel
          </button>
          <button
            type="submit"
            className="gw-btn"
            data-testid="gw-btn-property-submit"
          >
            {isAnnotation ? "Add Annotation Property" : "Add Datatype Property"}
          </button>
        </div>
      </form>
    </Dialog>
  );
}
