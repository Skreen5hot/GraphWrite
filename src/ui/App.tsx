import { useState, useRef, type ChangeEvent } from "react";
import "./App.css";
import "@xyflow/react/dist/style.css";
import { CanvasView } from "./CanvasView.js";
import { Inspector } from "./Inspector.js";
import { TermSidebar } from "./TermSidebar.js";
import { migrate } from "../migrate/index.js";
import { normalizeOnLoad } from "../normalize/index.js";
import { validate, type ValidationReport } from "../validate/index.js";
import { serializeVmp } from "../kernel/canonicalize.js";
import { emitTurtle } from "../emit/turtle.js";
import { ProjectSettingsDialog } from "./ProjectSettingsDialog.js";
import { ValidationPanel } from "./ValidationPanel.js";

/**
 * Minimal v0.4 project document for FR-U001 New.
 * Per SPEC section 5 required fields + section 10.4 type/iao:isAbout shape.
 * ecm:_legacyAnchorPlaceholder is NOT set: validate() emits
 * MISSING_REALIST_ANCHOR (error); ecm:error display is FR-U028 scope (task 2.8).
 */
function buildNewDocument(): Record<string, unknown> {
  return {
    id: "urn:ecm:project:new",
    type: ["ecm:Project", "iao:OntologyDesignPattern"],
    "ecm:specVersion": "0.4",
    "ecm:createdAt": "1970-01-01T00:00:00Z",
    "ecm:instances": [],
    "ecm:layouts": [],
    "ecm:literalAssertions": [],
    "ecm:name": "Untitled Project",
    "ecm:ontologies": [],
    "ecm:relations": [],
    "ecm:serializations": [],
    "ecm:snapshots": [],
    "ecm:terms": [],
    "ecm:updatedAt": "1970-01-01T00:00:00Z",
    "iao:isAbout": ["ecm:UnspecifiedSubjectMatter"],
  };
}

/**
 * The placeholder IRI used by migration, buildNewDocument, and the validator.
 * Defined here (src/ui layer) to avoid a cross-layer import from src/validate/
 * just for the constant. Kept in sync with SPEC section 5.4.1.
 */
const ECM_UNSPECIFIED = "ecm:UnspecifiedSubjectMatter";

/**
 * Derive the iao:isAbout indicator state from a project document.
 * Mirrors the validator logic in src/validate/index.ts (SPEC sections 17.2, 17.4)
 * without calling validate() -- used for reactive UI indicator display only.
 *
 * "missing" -- iao:isAbout absent/empty or contains only ECM_UNSPECIFIED
 *              with no legacy marker; MISSING_REALIST_ANCHOR would fire.
 * "legacy"  -- ecm:_legacyAnchorPlaceholder is true and iao:isAbout contains
 *              only ECM_UNSPECIFIED; LEGACY_REALIST_ANCHOR_PLACEHOLDER would fire.
 * "clean"   -- at least one real (non-placeholder) IRI present; no finding fires.
 */
function deriveIsAboutState(
  doc: Record<string, unknown>,
): "clean" | "missing" | "legacy" {
  const raw = doc["iao:isAbout"];
  const arr: unknown[] = Array.isArray(raw)
    ? raw
    : raw !== undefined
    ? [raw]
    : [];
  const nonPlaceholder = arr.filter(
    (v): v is string => typeof v === "string" && v !== ECM_UNSPECIFIED,
  );
  if (nonPlaceholder.length > 0) return "clean";
  const isLegacy = doc["ecm:_legacyAnchorPlaceholder"] === true;
  if (isLegacy && arr.some((v) => v === ECM_UNSPECIFIED)) return "legacy";
  return "missing";
}

/**
 * GraphWrite App shell -- SPEC section 26 five-panel layout.
 *
 * Panels populated in subsequent tasks:
 *   Left sidebar (Term Manager): task 2.2
 *   Center canvas (Instance Canvas): task 2.4
 *   Right inspector: task 2.5+
 *   Bottom outputs: task 2.10
 * FR-U001 / FR-U002 / FR-U003 / FR-U029 header controls: task 2.1 Chain 2.
 */
export function App() {
  const [project, setProject] = useState<Record<string, unknown> | null>(null);
  const [migrationBannerText, setMigrationBannerText] = useState<string | null>(null);
  const [selectedRelationId, setSelectedRelationId] = useState<string | null>(null);
  const [selectedInstanceId, setSelectedInstanceId] = useState<string | null>(null);
  const [projectSettingsOpen, setProjectSettingsOpen] = useState(false);
  const [validationReport, setValidationReport] = useState<ValidationReport | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Derived: iao:isAbout indicator state (clean | missing | legacy).
  // Computed from project document; no validate() call required for indicator.
  const isAboutState = project !== null ? deriveIsAboutState(project) : "clean";

  // FR-U001: New project
  function handleNew() {
    const newDoc = buildNewDocument();
    setProject(newDoc);
    setValidationReport(validate(newDoc));
    setMigrationBannerText(null);
  }

  // FR-U002: Open project -- trigger hidden file input
  function handleOpen() {
    fileInputRef.current?.click();
  }

  // FR-U002: File selected -- read, migrate, normalize, validate, set state
  function handleFileChange(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (file === undefined) return;

    const reader = new FileReader();
    reader.onload = (loadEvent: ProgressEvent<FileReader>) => {
      const raw = loadEvent.target?.result;
      if (typeof raw !== "string") return;

      let parsed: Record<string, unknown>;
      try {
        parsed = JSON.parse(raw) as Record<string, unknown>;
      } catch {
        // TODO (task 2.8): surface parse errors to user
        return;
      }

      // Capture source version BEFORE migrate() for FR-U029 banner text.
      const fromVersion =
        typeof parsed["ecm:specVersion"] === "string"
          ? (parsed["ecm:specVersion"] as string)
          : null;

      const migrateResult = migrate(parsed);
      if (migrateResult.document === null) {
        // TODO (task 2.8): surface migration refusal to user
        return;
      }

      const { document: migrated, migrationReport } = migrateResult;

      // Detect if migration actually occurred: any report arrays non-empty.
      const wasMigrated =
        migrationReport.addedFields.length > 0 ||
        migrationReport.transformedFields.length > 0 ||
        migrationReport.removedFields.length > 0 ||
        migrationReport.info.length > 0;

      const { document: normalized } = normalizeOnLoad(migrated);
      // Call validate per FR-U002; findings displayed in ValidationPanel (task 2.10).
      setValidationReport(validate(normalized));

      setProject(normalized);

      if (wasMigrated) {
        const from = fromVersion ?? "unknown";
        setMigrationBannerText(`Project was migrated from v${from} to v0.4.`);
      } else {
        setMigrationBannerText(null);
      }
    };

    reader.readAsText(file);
    // Reset input so the same file can be re-opened in the same session.
    event.target.value = "";
  }

  // FR-U003: Save project -- canonical serialize -> Blob -> browser download
  function handleSave() {
    if (project === null) return;
    const text = serializeVmp(project);
    const blob = new Blob([text], { type: "application/ld+json" });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = "project.jsonld";
    anchor.click();
    URL.revokeObjectURL(url);
  }

  // FR-U023: Save as Turtle -- semantic projection -> Blob -> browser download
  function handleSaveTurtle() {
    if (project === null) return;
    const text = emitTurtle(project);
    const blob = new Blob([text], { type: "text/turtle" });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = "project.ttl";
    anchor.click();
    URL.revokeObjectURL(url);
  }

  // FR-U028: Acknowledge a warning or info finding per SPEC section 17.5.
  // OED-303 interaction: ecm:acknowledged state is written to ecm:validationReports
  // on the project document per IMPLEMENTATION_PLAN.md section 2.10.
  // Persistence interaction with OED-303 (validation report retention policy:
  // latest-only vs. one-per-save) is UNRESOLVED. Phase 2 stub: single-report
  // (latest-only) stored in ecm:validationReports pending OED-303 resolution.
  // See project/DECISIONS.md ADR-004.
  function handleAcknowledge(code: string, target: string) {
    if (validationReport === null || project === null) return;
    const updatedFindings = validationReport["ecm:findings"].map((f) =>
      f["ecm:code"] === code && f["ecm:target"] === target
        ? { ...f, "ecm:acknowledged": true }
        : f,
    );
    const updatedReport: ValidationReport = {
      ...validationReport,
      "ecm:findings": updatedFindings,
    };
    setValidationReport(updatedReport);
    setProject({ ...project, "ecm:validationReports": [updatedReport] });
  }

  return (
    <div className="gw-shell">
      <header className="gw-header" data-testid="gw-header">
        <span className="gw-brand">GraphWrite</span>
        <div className="gw-btn-group">
          <button
            className="gw-btn"
            data-testid="gw-btn-new"
            onClick={handleNew}
          >
            New
          </button>
          <button
            className="gw-btn"
            data-testid="gw-btn-open"
            onClick={handleOpen}
          >
            Open
          </button>
          <button
            className="gw-btn"
            data-testid="gw-btn-save"
            onClick={handleSave}
            disabled={project === null}
          >
            Save
          </button>
          <button
            className="gw-btn"
            data-testid="gw-btn-save-turtle"
            onClick={handleSaveTurtle}
            disabled={project === null}
          >
            Save as Turtle
          </button>
          <button
            className="gw-btn"
            data-testid="gw-btn-project-settings"
            onClick={() => { setProjectSettingsOpen(true); }}
            disabled={project === null}
          >
            Project Settings
          </button>
        </div>
        <input
          ref={fileInputRef}
          type="file"
          accept=".jsonld,.json"
          style={{ display: "none" }}
          data-testid="gw-file-input"
          onChange={handleFileChange}
        />
        {migrationBannerText !== null && (
          <div
            className="gw-migration-banner"
            data-testid="gw-migration-banner"
          >
            <span>{migrationBannerText}</span>
            <button
              className="gw-migration-dismiss"
              data-testid="gw-migration-dismiss"
              onClick={() => { setMigrationBannerText(null); }}
              aria-label="Dismiss migration notice"
            >
              &#x2715;
            </button>
          </div>
        )}
      </header>

      {project !== null && isAboutState !== "clean" && (
        <div
          className={`gw-anchor-banner gw-anchor-banner--${isAboutState}`}
          data-testid="gw-anchor-banner"
          data-anchor-state={isAboutState}
        >
          <span className="gw-anchor-banner-text">
            {isAboutState === "missing"
              ? "No subject declared (MISSING_REALIST_ANCHOR). Export is blocked until a real subject IRI is added."
              : "Subject placeholder from v0.3 migration (LEGACY_REALIST_ANCHOR_PLACEHOLDER). Replace with a real subject IRI."}
          </span>
          <button
            className="gw-btn gw-btn--sm gw-btn--anchor-action"
            data-testid="gw-btn-anchor-action"
            onClick={() => { setProjectSettingsOpen(true); }}
          >
            {isAboutState === "missing" ? "Add subject IRI" : "Set real subject"}
          </button>
        </div>
      )}

      <div className="gw-body">
        <aside className="gw-sidebar" data-testid="gw-sidebar">
          <TermSidebar
            project={project}
            onTermsChange={(updated) => { setProject(updated); }}
          />
        </aside>

        <main className="gw-canvas" data-testid="gw-canvas">
          <CanvasView
            project={project}
            onProjectChange={(updated) => { setProject(updated); }}
            onEdgeSelect={(id) => { setSelectedRelationId(id); setSelectedInstanceId(null); }}
            onNodeSelect={(id) => { setSelectedInstanceId(id); setSelectedRelationId(null); }}
          />
        </main>

        <aside className="gw-inspector" data-testid="gw-inspector">
          <Inspector
            selectedRelationId={selectedRelationId}
            selectedInstanceId={selectedInstanceId}
            project={project}
            onProjectChange={(updated) => { setProject(updated); }}
          />
        </aside>
      </div>

      <section className="gw-outputs" data-testid="gw-outputs">
        <ValidationPanel
          findings={validationReport?.["ecm:findings"] ?? []}
          onAcknowledge={handleAcknowledge}
        />
      </section>

      {projectSettingsOpen && project !== null && (
        <ProjectSettingsDialog
          project={project}
          onSave={(updated) => {
            setProject(updated);
            setProjectSettingsOpen(false);
          }}
          onClose={() => { setProjectSettingsOpen(false); }}
        />
      )}
    </div>
  );
}
