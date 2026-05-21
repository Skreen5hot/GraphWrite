/**
 * TermSidebar -- task 2.2 Term Manager left sidebar.
 * Extended in task 2.3 Chain A: Add term (FR-U006 / FR-U007 / FR-U008).
 *
 * Renders three sections (Classes, Object Properties, Datatype Properties)
 * from the canonical project document's ecm:terms array.
 * Source-indicator badges carry both CSS class + aria-label per AC2.
 * SPEC §5.7 / FR-U004 / FR-U005 / FR-U006 / FR-U007 / FR-U008.
 */

import { useState } from "react";
import { AddTermDialog, type AddTermType } from "./AddTermDialog.js";
import { EditTermDialog } from "./EditTermDialog.js";

/** Shape of a single ecm:terms entry (SPEC §5.7). */
interface TermEntry {
  id: string;
  type: string;
  "rdfs:label"?: string;
  "rdfs:comment"?: string;
  "ecm:source"?: string;
}

interface TermSidebarProps {
  project: Record<string, unknown> | null;
  /**
   * Called with the updated project document after a term is added.
   * When undefined the Add buttons are hidden (read-only mode).
   */
  onTermsChange?: (project: Record<string, unknown>) => void;
}

/** Extract the IRI tail (fragment after last '#' or last path segment). */
function iriTail(iri: string): string {
  const hash = iri.lastIndexOf("#");
  const slash = iri.lastIndexOf("/");
  const idx = Math.max(hash, slash);
  return idx >= 0 ? iri.slice(idx + 1) : iri;
}

/** Coerce an ecm:terms array element to TermEntry; returns null if malformed. */
function toTermEntry(item: unknown): TermEntry | null {
  if (typeof item !== "object" || item === null) return null;
  const obj = item as Record<string, unknown>;
  if (typeof obj["id"] !== "string") return null;
  return obj as unknown as TermEntry;
}

/** Partition the project's ecm:terms into typed buckets. */
function partitionTerms(project: Record<string, unknown> | null): {
  classes: TermEntry[];
  objectProperties: TermEntry[];
  datatypeProperties: TermEntry[];
} {
  if (project === null) {
    return { classes: [], objectProperties: [], datatypeProperties: [] };
  }
  const raw = project["ecm:terms"];
  if (!Array.isArray(raw)) {
    return { classes: [], objectProperties: [], datatypeProperties: [] };
  }
  const terms = (raw as unknown[])
    .map(toTermEntry)
    .filter((t): t is TermEntry => t !== null);
  return {
    classes: terms.filter((t) => t.type === "owl:Class"),
    objectProperties: terms.filter((t) => t.type === "owl:ObjectProperty"),
    datatypeProperties: terms.filter((t) => t.type === "owl:DatatypeProperty"),
  };
}

/**
 * Source-indicator badge.
 * CSS class encodes the source kind; aria-label carries the raw ecm: value
 * so Playwright can assert either (AC2: CSS class OR aria-label).
 */
function SourceBadge({ source }: { source: string | undefined }) {
  if (source === undefined) return null;
  const label =
    source === "ecm:imported-ontology"
      ? "imported"
      : source === "ecm:project-created"
      ? "project-created"
      : source === "ecm:system-starter-example"
      ? "starter"
      : source;
  const cssModifier =
    source === "ecm:imported-ontology"
      ? "gw-badge--imported"
      : source === "ecm:project-created"
      ? "gw-badge--project-created"
      : source === "ecm:system-starter-example"
      ? "gw-badge--starter"
      : "gw-badge--unknown";
  return (
    <span className={`gw-badge ${cssModifier}`} aria-label={source}>
      {label}
    </span>
  );
}

/**
 * One type-section: header (with optional Add button) + item list or empty-state.
 * onAddTerm is only passed when a project is open and onTermsChange is wired.
 * onTermClick fires only for project-created terms (FR-U009; Chain B).
 */
function TermSection({
  title,
  terms,
  testId,
  onAddTerm,
  addTestId,
  onTermClick,
}: {
  title: string;
  terms: TermEntry[];
  testId: string;
  onAddTerm?: () => void;
  addTestId?: string;
  onTermClick?: (term: TermEntry) => void;
}) {
  return (
    <section className="gw-term-section" data-testid={testId}>
      <div className="gw-term-section-header">
        <h3 className="gw-term-section-title">{title}</h3>
        {onAddTerm !== undefined && (
          <button
            type="button"
            className="gw-btn-add-term"
            onClick={onAddTerm}
            aria-label={`Add ${title}`}
            data-testid={addTestId}
          >
            +
          </button>
        )}
      </div>
      {terms.length === 0 ? (
        <p className="gw-term-empty">No {title.toLowerCase()} yet</p>
      ) : (
        <ul className="gw-term-list">
          {terms.map((term) => {
            const displayLabel =
              typeof term["rdfs:label"] === "string" &&
              term["rdfs:label"].length > 0
                ? term["rdfs:label"]
                : iriTail(term.id);
            // Only project-created terms are clickable; imported/starter are not.
            const isClickable =
              onTermClick !== undefined &&
              term["ecm:source"] === "ecm:project-created";
            // Imported-ontology terms carry an affirmative read-only signal (FR-U010; Chain C).
            const isImported = term["ecm:source"] === "ecm:imported-ontology";
            return (
              <li
                key={term.id}
                className={
                  isClickable
                    ? "gw-term-item gw-term-item--clickable"
                    : "gw-term-item"
                }
                data-testid="gw-term-item"
                role={isClickable ? "button" : undefined}
                tabIndex={isClickable ? 0 : undefined}
                aria-disabled={isImported ? "true" : undefined}
                onClick={isClickable ? () => { onTermClick(term); } : undefined}
                onKeyDown={
                  isClickable
                    ? (e) => {
                        if (e.key === "Enter" || e.key === " ") {
                          onTermClick(term);
                        }
                      }
                    : undefined
                }
              >
                <span className="gw-term-label">{displayLabel}</span>
                <SourceBadge source={term["ecm:source"]} />
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}

/** Left-sidebar Term Manager (SPEC §26, FR-U004 through FR-U008). */
export function TermSidebar({ project, onTermsChange }: TermSidebarProps) {
  /** OWL type of the term being added; null when the Add dialog is closed. */
  const [addDialogType, setAddDialogType] = useState<AddTermType | null>(null);
  /** Term being edited; null when the Edit dialog is closed (FR-U009). */
  const [editTerm, setEditTerm] = useState<Record<string, unknown> | null>(null);

  const { classes, objectProperties, datatypeProperties } =
    partitionTerms(project);

  /**
   * Append the confirmed new term to ecm:terms, sort by id (SPEC §5.3 rule 4),
   * propagate via onTermsChange, then close the dialog.
   */
  function handleAddConfirm(newTerm: Record<string, unknown>) {
    if (project === null || onTermsChange === undefined) return;
    const existing: unknown[] = Array.isArray(project["ecm:terms"])
      ? (project["ecm:terms"] as unknown[])
      : [];
    const sorted = [...existing, newTerm].sort((a, b) => {
      const aId =
        typeof (a as Record<string, unknown>)["id"] === "string"
          ? ((a as Record<string, unknown>)["id"] as string)
          : "";
      const bId =
        typeof (b as Record<string, unknown>)["id"] === "string"
          ? ((b as Record<string, unknown>)["id"] as string)
          : "";
      return aId < bId ? -1 : aId > bId ? 1 : 0;
    });
    onTermsChange({ ...project, "ecm:terms": sorted });
    setAddDialogType(null);
  }

  /**
   * Receive the updated project document from EditTermDialog (label / comment /
   * IRI change already applied, refactor cascade included when IRI changed),
   * propagate via onTermsChange, then close the dialog (FR-U009).
   */
  function handleEditConfirm(updatedProject: Record<string, unknown>) {
    if (onTermsChange === undefined) return;
    onTermsChange(updatedProject);
    setEditTerm(null);
  }

  // Add buttons are only visible when a project is open and the mutation
  // callback is wired (read-only contexts pass no onTermsChange).
  const canEdit = project !== null && onTermsChange !== undefined;

  /** Open EditTermDialog for the clicked project-created term. */
  function handleTermClick(term: TermEntry) {
    setEditTerm(term as unknown as Record<string, unknown>);
  }

  return (
    <>
      <TermSection
        title="Classes"
        terms={classes}
        testId="gw-term-section-classes"
        onAddTerm={canEdit ? () => setAddDialogType("owl:Class") : undefined}
        addTestId="gw-btn-add-class"
        onTermClick={canEdit ? handleTermClick : undefined}
      />
      <TermSection
        title="Object Properties"
        terms={objectProperties}
        testId="gw-term-section-object-properties"
        onAddTerm={
          canEdit ? () => setAddDialogType("owl:ObjectProperty") : undefined
        }
        addTestId="gw-btn-add-object-property"
        onTermClick={canEdit ? handleTermClick : undefined}
      />
      <TermSection
        title="Datatype Properties"
        terms={datatypeProperties}
        testId="gw-term-section-datatype-properties"
        onAddTerm={
          canEdit
            ? () => setAddDialogType("owl:DatatypeProperty")
            : undefined
        }
        addTestId="gw-btn-add-datatype-property"
        onTermClick={canEdit ? handleTermClick : undefined}
      />
      {addDialogType !== null && project !== null && (
        <AddTermDialog
          termType={addDialogType}
          project={project}
          onConfirm={handleAddConfirm}
          onClose={() => setAddDialogType(null)}
        />
      )}
      {editTerm !== null && project !== null && (
        <EditTermDialog
          term={editTerm}
          project={project}
          onConfirm={handleEditConfirm}
          onClose={() => setEditTerm(null)}
        />
      )}
    </>
  );
}
