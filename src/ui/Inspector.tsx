import { useState } from "react";
import { AddLiteralDialog } from "./AddLiteralDialog.js";
import { narrateTriple } from "../emit/triple-narration.js";

// ---------------------------------------------------------------------------
// Domain types (local to Inspector; shared extraction is a future refactor)
// ---------------------------------------------------------------------------

interface EcmRelation {
  id: string;
  type: string;
  "ecm:subjectIri": string;
  "ecm:predicateIri": string;
  "ecm:objectIri": string;
}

function isEcmRelation(v: unknown): v is EcmRelation {
  if (v === null || typeof v !== "object") return false;
  const obj = v as Record<string, unknown>;
  return (
    typeof obj["id"] === "string" &&
    obj["type"] === "ecm:RelationAssertion" &&
    typeof obj["ecm:subjectIri"] === "string" &&
    typeof obj["ecm:objectIri"] === "string" &&
    typeof obj["ecm:predicateIri"] === "string"
  );
}

interface EcmLiteralAssertion {
  id: string;
  type: string;
  "ecm:subjectIri": string;
  "ecm:predicateIri": string;
  "ecm:value": string;
  "ecm:datatype": string;
  "ecm:language": string | null;
}

function isEcmLiteralAssertion(v: unknown): v is EcmLiteralAssertion {
  if (v === null || typeof v !== "object") return false;
  const obj = v as Record<string, unknown>;
  return (
    typeof obj["id"] === "string" &&
    obj["type"] === "ecm:LiteralAssertion" &&
    typeof obj["ecm:subjectIri"] === "string" &&
    typeof obj["ecm:predicateIri"] === "string" &&
    typeof obj["ecm:value"] === "string" &&
    typeof obj["ecm:datatype"] === "string"
  );
}

interface EcmInstance {
  id: string;
  type: "ecm:Instance";
  "rdfs:label"?: string;
  "ecm:classIris": string[];
}

function isEcmInstance(v: unknown): v is EcmInstance {
  if (v === null || typeof v !== "object") return false;
  const obj = v as Record<string, unknown>;
  return (
    typeof obj["id"] === "string" &&
    obj["type"] === "ecm:Instance" &&
    Array.isArray(obj["ecm:classIris"])
  );
}

/** Extract the IRI tail (fragment after last '#' or last path segment). */
function iriTail(iri: string): string {
  const hash = iri.lastIndexOf("#");
  const slash = iri.lastIndexOf("/");
  const idx = Math.max(hash, slash);
  return idx >= 0 ? iri.slice(idx + 1) : iri;
}

/**
 * Resolve the FR-C008 narration for a single selected relation (FR-U020).
 * Label-resolution mirrors narrateProject() in triple-narration.ts but scoped
 * to one EcmRelation (narrateProject returns no per-relation ID -- recon F2).
 */
function resolveRelationNarration(
  rel: EcmRelation,
  project: Record<string, unknown>,
): string {
  const instanceLabel = new Map<string, string>();
  const instanceClass = new Map<string, string>();
  const termLabel = new Map<string, string>();

  const instances = project["ecm:instances"];
  if (Array.isArray(instances)) {
    for (const item of instances as unknown[]) {
      if (!item || typeof item !== "object") continue;
      const inst = item as Record<string, unknown>;
      const id = inst["id"];
      if (typeof id !== "string") continue;
      instanceLabel.set(id, typeof inst["rdfs:label"] === "string" ? inst["rdfs:label"] : id);
      const classIris = inst["ecm:classIris"];
      if (Array.isArray(classIris) && classIris.length > 0 && typeof classIris[0] === "string") {
        instanceClass.set(id, String(classIris[0]));
      }
    }
  }

  const terms = project["ecm:terms"];
  if (Array.isArray(terms)) {
    for (const item of terms as unknown[]) {
      if (!item || typeof item !== "object") continue;
      const term = item as Record<string, unknown>;
      const id = term["id"];
      if (typeof id !== "string") continue;
      termLabel.set(id, typeof term["rdfs:label"] === "string" ? term["rdfs:label"] : id);
    }
  }

  const sIri = rel["ecm:subjectIri"];
  const pIri = rel["ecm:predicateIri"];
  const oIri = rel["ecm:objectIri"];

  const subjectLabel    = instanceLabel.get(sIri) ?? sIri;
  const objectLabel     = instanceLabel.get(oIri) ?? oIri;
  const subClassRaw     = instanceClass.get(sIri) ?? "";
  const className       = subClassRaw !== "" ? (termLabel.get(subClassRaw) ?? subClassRaw) : "";
  const objClassRaw     = instanceClass.get(oIri) ?? "";
  const objectClassName = objClassRaw !== "" ? (termLabel.get(objClassRaw) ?? objClassRaw) : "";
  const predicateLabel  = termLabel.get(pIri) ?? pIri;

  return narrateTriple({ subjectLabel, className, predicateLabel, objectLabel, objectClassName });
}

/** Shape of an owl:ObjectProperty option for the predicate <select>. */
interface ObjPropOption {
  iri: string;
  label: string;
}

/** Extract all owl:ObjectProperty entries from the project's ecm:terms. */
function getObjectPropertyOptions(project: Record<string, unknown>): ObjPropOption[] {
  const raw = project["ecm:terms"];
  if (!Array.isArray(raw)) return [];
  const result: ObjPropOption[] = [];
  for (const item of raw as unknown[]) {
    if (typeof item !== "object" || item === null) continue;
    const obj = item as Record<string, unknown>;
    if (typeof obj["id"] !== "string") continue;
    if (obj["type"] !== "owl:ObjectProperty") continue;
    const iri = obj["id"] as string;
    const label =
      typeof obj["rdfs:label"] === "string" && obj["rdfs:label"].length > 0
        ? (obj["rdfs:label"] as string)
        : iriTail(iri);
    result.push({ iri, label });
  }
  return result;
}

/** Shape of an owl:DatatypeProperty option for the literal predicate display. */
interface DatatypePropOption {
  iri: string;
  label: string;
}

/** Extract all owl:DatatypeProperty entries from the project's ecm:terms. */
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
        : iriTail(iri);
    result.push({ iri, label });
  }
  return result;
}

/** Shape of an owl:Class option for the class-assignment <select>. */
interface OwlClassOption {
  iri: string;
  label: string;
}

/** Extract all owl:Class entries from the project's ecm:terms. */
function getOwlClassOptions(project: Record<string, unknown>): OwlClassOption[] {
  const raw = project["ecm:terms"];
  if (!Array.isArray(raw)) return [];
  const result: OwlClassOption[] = [];
  for (const item of raw as unknown[]) {
    if (typeof item !== "object" || item === null) continue;
    const obj = item as Record<string, unknown>;
    if (typeof obj["id"] !== "string") continue;
    if (obj["type"] !== "owl:Class") continue;
    const iri = obj["id"] as string;
    const label =
      typeof obj["rdfs:label"] === "string" && (obj["rdfs:label"] as string).length > 0
        ? (obj["rdfs:label"] as string)
        : iriTail(iri);
    result.push({ iri, label });
  }
  return result;
}

// ---------------------------------------------------------------------------
// Inspector component (SPEC section 26; FR-U015/FR-U016/FR-U017/FR-U018)
// ---------------------------------------------------------------------------

interface InspectorProps {
  selectedRelationId: string | null;
  selectedInstanceId: string | null;
  project: Record<string, unknown> | null;
  /**
   * Called with the updated project document on relation or literal mutation.
   * Accepted here so App can pass it unconditionally and the prop shape is
   * stable across chains.
   */
  onProjectChange?: (updated: Record<string, unknown>) => void;
}

/**
 * Inspector panel -- right sidebar (SPEC section 26).
 *
 * Relation mode (task 2.6): predicate dropdown (FR-U015), Reverse (FR-U016),
 *                           Delete (FR-U017).
 * Instance mode (task 2.7 Chain A): literal assertions list (FR-U018),
 *                                   Add literal, Delete literal.
 */
export function Inspector({
  selectedRelationId,
  selectedInstanceId,
  project,
  onProjectChange,
}: InspectorProps) {
  const [addLiteralOpen, setAddLiteralOpen] = useState(false);
  const [selectedAddClassIri, setSelectedAddClassIri] = useState<string>("");

  if ((selectedRelationId === null && selectedInstanceId === null) || project === null) {
    return (
      <p className="gw-placeholder" data-testid="gw-inspector-empty">
        Select a node or relation to inspect.
      </p>
    );
  }

  // ---------------------------------------------------------------------------
  // Instance mode
  // ---------------------------------------------------------------------------
  if (selectedInstanceId !== null) {
    const rawLiterals = Array.isArray(project["ecm:literalAssertions"])
      ? (project["ecm:literalAssertions"] as unknown[])
      : [];
    const instanceLiterals = rawLiterals.filter(
      (la): la is EcmLiteralAssertion =>
        isEcmLiteralAssertion(la) && la["ecm:subjectIri"] === selectedInstanceId,
    );
    const dtPropOptions = getDatatypePropertyOptions(project);

    const rawInstances = Array.isArray(project["ecm:instances"])
      ? (project["ecm:instances"] as unknown[])
      : [];
    const selectedInstance =
      rawInstances.find(
        (inst): inst is EcmInstance =>
          isEcmInstance(inst) && inst.id === selectedInstanceId,
      ) ?? null;
    const classIris: string[] =
      selectedInstance !== null ? selectedInstance["ecm:classIris"] : [];
    const owlClassOptions = getOwlClassOptions(project);
    const classLabelFor = (iri: string): string =>
      owlClassOptions.find((c) => c.iri === iri)?.label ?? iriTail(iri);

    function handleDeleteLiteral(assertionId: string) {
      if (onProjectChange === undefined || project === null) return;
      const updatedLiterals = rawLiterals.filter(
        (la) => !(isEcmLiteralAssertion(la) && la.id === assertionId),
      );
      onProjectChange({ ...project, "ecm:literalAssertions": updatedLiterals });
    }

    function handleRemoveClassAssignment(classIri: string) {
      if (onProjectChange === undefined || project === null || selectedInstance === null) return;
      const updatedInstances = rawInstances.map((inst) => {
        if (!isEcmInstance(inst) || inst.id !== selectedInstanceId) return inst;
        return {
          ...(inst as unknown as Record<string, unknown>),
          "ecm:classIris": classIris.filter((c) => c !== classIri),
        };
      });
      onProjectChange({ ...project, "ecm:instances": updatedInstances });
    }

    function handleAddClassAssignment() {
      if (
        onProjectChange === undefined ||
        project === null ||
        selectedInstance === null ||
        selectedAddClassIri === "" ||
        classIris.includes(selectedAddClassIri)
      ) return;
      const updatedInstances = rawInstances.map((inst) => {
        if (!isEcmInstance(inst) || inst.id !== selectedInstanceId) return inst;
        return {
          ...(inst as unknown as Record<string, unknown>),
          "ecm:classIris": [...classIris, selectedAddClassIri],
        };
      });
      onProjectChange({ ...project, "ecm:instances": updatedInstances });
    }

    return (
      <>
        <div data-testid="gw-inspector-instance">
          <p style={{ fontWeight: 600, marginBottom: "0.5rem" }}>Instance</p>
          <p style={{ fontSize: "0.75rem", color: "#64748b", marginBottom: "0.125rem" }}>
            IRI
          </p>
          <p
            style={{ fontSize: "0.8rem", wordBreak: "break-all", marginBottom: "0.75rem" }}
            data-testid="gw-inspector-instance-iri"
          >
            {selectedInstanceId}
          </p>
          <p style={{ fontWeight: 600, marginBottom: "0.5rem", marginTop: "0.75rem" }}>
            Class Assignments
          </p>
          <div data-testid="gw-inspector-class-assignments">
            {classIris.length === 0 && (
              <p style={{ fontSize: "0.8rem", color: "#94a3b8" }}>
                No class assignments.
              </p>
            )}
            {classIris.map((iri) => (
              <div
                key={iri}
                data-testid="gw-class-assignment-row"
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: "0.5rem",
                  marginBottom: "0.375rem",
                }}
              >
                <span style={{ fontSize: "0.8rem", flex: 1, wordBreak: "break-all" }}>
                  {classLabelFor(iri)}
                </span>
                <button
                  type="button"
                  data-testid="gw-btn-remove-class"
                  onClick={() => { handleRemoveClassAssignment(iri); }}
                  style={{ fontSize: "0.75rem" }}
                >
                  Remove
                </button>
              </div>
            ))}
            <div
              style={{ display: "flex", gap: "0.5rem", marginTop: "0.5rem", alignItems: "center" }}
            >
              <select
                value={selectedAddClassIri}
                onChange={(e) => { setSelectedAddClassIri(e.target.value); }}
                data-testid="gw-select-add-class"
                style={{ fontSize: "0.8rem", flex: 1 }}
              >
                <option value="">(select class)</option>
                {owlClassOptions.map((opt) => (
                  <option key={opt.iri} value={opt.iri}>
                    {opt.label}
                  </option>
                ))}
              </select>
              <button
                type="button"
                data-testid="gw-btn-assign-class"
                onClick={handleAddClassAssignment}
                style={{ fontSize: "0.75rem" }}
              >
                Assign
              </button>
            </div>
          </div>
          <p style={{ fontWeight: 600, marginBottom: "0.5rem", marginTop: "0.75rem" }}>
            Literal Assertions
          </p>
          {instanceLiterals.length === 0 && (
            <p
              style={{ fontSize: "0.8rem", color: "#94a3b8" }}
              data-testid="gw-inspector-no-literals"
            >
              No literal assertions.
            </p>
          )}
          {instanceLiterals.map((la) => {
            const predLabel =
              dtPropOptions.find((dp) => dp.iri === la["ecm:predicateIri"])?.label ??
              iriTail(la["ecm:predicateIri"]);
            return (
              <div
                key={la.id}
                data-testid="gw-literal-entry"
                style={{
                  borderBottom: "1px solid #e2e8f0",
                  paddingBottom: "0.5rem",
                  marginBottom: "0.5rem",
                }}
              >
                <p style={{ fontSize: "0.75rem", color: "#64748b", marginBottom: "0.125rem" }}>
                  {predLabel}
                </p>
                <p
                  style={{ fontSize: "0.8rem", marginBottom: "0.25rem" }}
                  data-testid="gw-literal-value"
                >
                  {la["ecm:value"]}
                  {la["ecm:language"] !== null && la["ecm:language"] !== undefined && (
                    <span
                      style={{ color: "#64748b", fontSize: "0.7rem", marginLeft: "0.25rem" }}
                      data-testid="gw-literal-lang"
                    >
                      @{la["ecm:language"]}
                    </span>
                  )}
                </p>
                <button
                  type="button"
                  data-testid="gw-btn-delete-literal"
                  onClick={() => { handleDeleteLiteral(la.id); }}
                  style={{ fontSize: "0.75rem" }}
                >
                  Delete
                </button>
              </div>
            );
          })}
          <button
            type="button"
            data-testid="gw-btn-add-literal"
            onClick={() => { setAddLiteralOpen(true); }}
            style={{ marginTop: "0.5rem", width: "100%" }}
          >
            Add literal
          </button>
        </div>
        {addLiteralOpen && (
          <AddLiteralDialog
            project={project}
            subjectIri={selectedInstanceId}
            onConfirm={(newAssertion) => {
              if (onProjectChange !== undefined && project !== null) {
                const existing = Array.isArray(project["ecm:literalAssertions"])
                  ? (project["ecm:literalAssertions"] as unknown[])
                  : [];
                onProjectChange({
                  ...project,
                  "ecm:literalAssertions": [...existing, newAssertion],
                });
              }
              setAddLiteralOpen(false);
            }}
            onClose={() => { setAddLiteralOpen(false); }}
          />
        )}
      </>
    );
  }

  // ---------------------------------------------------------------------------
  // Relation mode (existing behavior)
  // ---------------------------------------------------------------------------
  const rawRelations = Array.isArray(project["ecm:relations"])
    ? (project["ecm:relations"] as unknown[])
    : [];

  const rel = rawRelations.find(
    (r): r is EcmRelation => isEcmRelation(r) && r.id === selectedRelationId,
  );

  if (rel === undefined) {
    return (
      <p className="gw-placeholder" data-testid="gw-inspector-empty">
        Select a node or relation to inspect.
      </p>
    );
  }

  const objPropOptions = getObjectPropertyOptions(project);

  function handlePredicateChange(newIri: string) {
    if (onProjectChange === undefined || selectedRelationId === null || project === null) return;
    const updatedRelations = rawRelations.map((r) => {
      if (!isEcmRelation(r) || r.id !== selectedRelationId) return r;
      return { ...(r as unknown as Record<string, unknown>), "ecm:predicateIri": newIri };
    });
    onProjectChange({ ...project, "ecm:relations": updatedRelations });
  }

  function handleReverse() {
    if (onProjectChange === undefined || selectedRelationId === null || project === null) return;
    const updatedRelations = rawRelations.map((r) => {
      if (!isEcmRelation(r) || r.id !== selectedRelationId) return r;
      return {
        ...(r as unknown as Record<string, unknown>),
        "ecm:subjectIri": r["ecm:objectIri"],
        "ecm:objectIri": r["ecm:subjectIri"],
      };
    });
    onProjectChange({ ...project, "ecm:relations": updatedRelations });
  }

  function handleDelete() {
    if (onProjectChange === undefined || selectedRelationId === null || project === null) return;
    const updatedRelations = rawRelations.filter(
      (r) => !(isEcmRelation(r) && r.id === selectedRelationId),
    );
    onProjectChange({ ...project, "ecm:relations": updatedRelations });
  }

  return (
    <div data-testid="gw-inspector-relation">
      <p style={{ fontWeight: 600, marginBottom: "0.5rem" }}>Relation</p>

      <p style={{ fontSize: "0.75rem", color: "#64748b", marginBottom: "0.125rem" }}>
        Subject
      </p>
      <p
        style={{
          fontSize: "0.8rem",
          wordBreak: "break-all",
          marginBottom: "0.75rem",
        }}
        data-testid="gw-inspector-subject"
      >
        {rel["ecm:subjectIri"]}
      </p>

      <p style={{ fontSize: "0.75rem", color: "#64748b", marginBottom: "0.125rem" }}>
        Predicate
      </p>
      <select
        value={rel["ecm:predicateIri"]}
        onChange={(e) => { handlePredicateChange(e.target.value); }}
        data-testid="gw-select-predicate"
        style={{ fontSize: "0.8rem", marginBottom: "0.75rem", width: "100%" }}
      >
        <option value="ecm:UnassignedPredicate">(unassigned)</option>
        {objPropOptions.map((opt) => (
          <option key={opt.iri} value={opt.iri}>
            {opt.label}
          </option>
        ))}
      </select>

      <p style={{ fontSize: "0.75rem", color: "#64748b", marginBottom: "0.125rem" }}>
        Object
      </p>
      <p
        style={{
          fontSize: "0.8rem",
          wordBreak: "break-all",
          marginBottom: "0.75rem",
        }}
        data-testid="gw-inspector-object"
      >
        {rel["ecm:objectIri"]}
      </p>

      <p style={{ fontWeight: 600, marginBottom: "0.5rem", marginTop: "0.75rem" }}>
        Preview
      </p>
      <p style={{ fontSize: "0.75rem", color: "#64748b", marginBottom: "0.125rem" }}>
        Plain language (FR-C008)
      </p>
      <p
        style={{ fontSize: "0.8rem", wordBreak: "break-all", marginBottom: "0.75rem" }}
        data-testid="gw-triple-narration"
      >
        {resolveRelationNarration(rel, project)}
      </p>
      <p style={{ fontSize: "0.75rem", color: "#64748b", marginBottom: "0.125rem" }}>
        IRI triple
      </p>
      <p
        style={{ fontSize: "0.8rem", wordBreak: "break-all", fontFamily: "monospace", marginBottom: "0.75rem" }}
        data-testid="gw-triple-iri"
      >
        {`<${rel["ecm:subjectIri"]}> <${rel["ecm:predicateIri"]}> <${rel["ecm:objectIri"]}> .`}
      </p>

      <div style={{ display: "flex", gap: "0.5rem", marginTop: "0.75rem" }}>
        <button
          type="button"
          onClick={handleReverse}
          data-testid="gw-btn-reverse"
          style={{ flex: 1 }}
        >
          Reverse
        </button>
        <button
          type="button"
          onClick={handleDelete}
          data-testid="gw-btn-delete-relation"
          style={{ flex: 1 }}
        >
          Delete
        </button>
      </div>
    </div>
  );
}