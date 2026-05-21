import { test, expect } from "@playwright/test";
import fs from "fs";
import path from "path";

const SIDEBAR_FIXTURE = path.join(
  process.cwd(),
  "tests",
  "playwright",
  "fixtures",
  "term-sidebar-2c-1op-1dp.jsonld",
);

const V03_FIXTURE = path.join(
  process.cwd(),
  "tests",
  "playwright",
  "fixtures",
  "minimal-v0.3.jsonld",
);

/**
 * Task 2.12 -- Playwright Smoke Test Suite (Chain B: flows 1 and 4).
 *
 * Smoke flow 1: New project -> add class 'Person' -> add object property
 *   'knows' -> create 2 instances via canvas dblclick -> assign Person class
 *   to instance 1 -> draw relation from instance 1 to instance 2 -> set
 *   predicate to 'knows' -> save -> reload -> assert state preserved.
 *
 * Smoke flow 4: New project -> assert MISSING_REALIST_ANCHOR indicator is
 *   visible before any user action.
 *
 * Class-assignment UI (gw-select-add-class, gw-btn-assign-class) confirmed
 * present in src/ui/Inspector.tsx lines 367 and 379 (Chain A landed).
 *
 * Event 8 lesson applied throughout: canvas dblclick uses explicit
 * bottom-area positions to avoid React Flow element occlusion.
 */

test.describe("Smoke flow 1 (task 2.12)", () => {
  test(
    "Smoke 1: new project -> add class + OP -> create 2 instances -> assign class -> draw relation -> set predicate -> save -> reload -> assert state preserved",
    async ({ page }) => {
      await page.goto("/");

      // ---- Step 1: New project. ----
      await page.getByTestId("gw-btn-new").click();
      await expect(page.getByTestId("gw-btn-save")).toBeEnabled();

      // ---- Step 2: Add class 'Person'. ----
      await page.getByTestId("gw-btn-add-class").click();
      await expect(page.getByTestId("gw-dialog-add-term")).toBeVisible();
      await page.getByTestId("gw-input-term-label").fill("Person");
      await page.getByTestId("gw-btn-term-submit").click();
      await expect(
        page.getByTestId("gw-dialog-add-term"),
      ).not.toBeVisible();

      // ---- Step 3: Add object property 'knows'. ----
      await page.getByTestId("gw-btn-add-object-property").click();
      await expect(page.getByTestId("gw-dialog-add-term")).toBeVisible();
      await page.getByTestId("gw-input-term-label").fill("knows");
      await page.getByTestId("gw-btn-term-submit").click();
      await expect(
        page.getByTestId("gw-dialog-add-term"),
      ).not.toBeVisible();

      // ---- Step 4: Create 2 instances via canvas dblclick. ----
      // Event 8 lesson: use bottom-area positions to land on empty pane,
      // not on the TermSidebar or any existing canvas elements.
      const canvasView = page.getByTestId("gw-canvas-view");
      await expect(canvasView).toBeVisible();

      const pane = canvasView.locator(".react-flow__pane");
      await expect(pane).toBeVisible({ timeout: 10_000 });
      const paneBox = await pane.boundingBox();
      expect(paneBox, "pane must have a bounding box").not.toBeNull();

      // Instance 1: bottom-left area.
      await pane.dblclick({
        position: { x: 80, y: paneBox!.height - 80 },
      });
      await expect(
        canvasView.locator(".react-flow__node"),
      ).toHaveCount(1, { timeout: 5_000 });

      // Instance 2: bottom-right area, 220 px to the right to avoid overlap.
      await pane.dblclick({
        position: { x: 300, y: paneBox!.height - 80 },
      });
      await expect(
        canvasView.locator(".react-flow__node"),
      ).toHaveCount(2, { timeout: 5_000 });

      // ---- Step 5: Click instance 1; capture its IRI from Inspector. ----
      const nodeLocators = canvasView.locator(".react-flow__node");
      const firstNode = nodeLocators.first();
      await firstNode.click();

      const instanceIriEl = page.getByTestId("gw-inspector-instance-iri");
      await expect(instanceIriEl).toBeVisible({ timeout: 5_000 });
      const instance1Id = await instanceIriEl.innerText();

      // ---- Step 6: Assign class 'Person' to instance 1. ----
      // Inspector's class-assignments subsection: gw-select-add-class (native
      // <select>) and gw-btn-assign-class. The select value is the class IRI;
      // options render rdfs:label as visible text, so { label } matching works.
      const classSelect = page.getByTestId("gw-select-add-class");
      await expect(classSelect).toBeVisible({ timeout: 3_000 });
      await classSelect.selectOption({ label: "Person" });
      await page.getByTestId("gw-btn-assign-class").click();

      // ---- Step 7: Draw relation from instance 1 to instance 2. ----
      // Hover the first node to reveal connection handles.
      await firstNode.hover();
      const srcHandle = firstNode
        .locator(".react-flow__handle.source")
        .first();
      await expect(srcHandle).toBeVisible({ timeout: 5_000 });

      const srcBox = await srcHandle.boundingBox();
      expect(srcBox, "source handle must have a bounding box").not.toBeNull();

      const secondNode = nodeLocators.nth(1);
      const tgtBox = await secondNode.boundingBox();
      expect(tgtBox, "second node must have a bounding box").not.toBeNull();

      await page.mouse.move(
        srcBox!.x + srcBox!.width / 2,
        srcBox!.y + srcBox!.height / 2,
      );
      await page.mouse.down();
      await page.mouse.move(
        tgtBox!.x + tgtBox!.width / 2,
        tgtBox!.y + tgtBox!.height / 2,
        { steps: 15 },
      );
      await page.mouse.up();

      // One new edge must appear.
      await expect(
        canvasView.locator(".react-flow__edge"),
      ).toHaveCount(1, { timeout: 5_000 });

      // ---- Step 8: Select the edge; set predicate to 'knows'. ----
      // Click the edge via bounding-box center (Event 8 lesson: raw mouse click
      // avoids SVG hit-target ambiguity on invisible interaction path).
      const edge = canvasView.locator(".react-flow__edge").first();
      const edgeBB = await edge.boundingBox();
      expect(edgeBB, "edge must have a bounding box").not.toBeNull();
      await page.mouse.click(
        edgeBB!.x + edgeBB!.width / 2,
        edgeBB!.y + edgeBB!.height / 2,
      );
      await expect(page.getByTestId("gw-inspector-relation")).toBeVisible({
        timeout: 5_000,
      });
      // Select predicate by visible label: IRI is auto-generated at runtime.
      await page
        .getByTestId("gw-select-predicate")
        .selectOption({ label: "knows" });

      // ---- Step 9: Save; capture downloaded JSON-LD. ----
      const [download] = await Promise.all([
        page.waitForEvent("download"),
        page.getByTestId("gw-btn-save").click(),
      ]);
      const downloadPath = await download.path();
      expect(downloadPath, "download must be saved to disk").not.toBeNull();

      const content = fs.readFileSync(downloadPath!, "utf-8");
      const saved = JSON.parse(content) as Record<string, unknown>;

      // ---- Structural assertions on downloaded JSON-LD ----

      // ecm:terms must contain Person (owl:Class) and knows (owl:ObjectProperty).
      const terms = saved["ecm:terms"] as Record<string, unknown>[];
      expect(Array.isArray(terms), "ecm:terms must be an array").toBe(true);

      const personTerm = terms.find(
        (t) => t["type"] === "owl:Class" && t["rdfs:label"] === "Person",
      );
      expect(
        personTerm,
        "ecm:terms must contain a Person owl:Class",
      ).toBeDefined();
      const personIri = personTerm!["id"] as string;

      const knowsTerm = terms.find(
        (t) =>
          t["type"] === "owl:ObjectProperty" && t["rdfs:label"] === "knows",
      );
      expect(
        knowsTerm,
        "ecm:terms must contain a knows owl:ObjectProperty",
      ).toBeDefined();
      const knowsIri = knowsTerm!["id"] as string;

      // ecm:instances must contain exactly 2 entries.
      const instances = saved["ecm:instances"] as Record<string, unknown>[];
      expect(
        Array.isArray(instances),
        "ecm:instances must be an array",
      ).toBe(true);
      expect(instances, "ecm:instances must have 2 entries").toHaveLength(2);

      // Instance 1 must have Person IRI in ecm:classIris.
      const inst1 = instances.find((i) => i["id"] === instance1Id);
      expect(
        inst1,
        `instance with id ${instance1Id} must be in ecm:instances`,
      ).toBeDefined();
      const classIris = inst1!["ecm:classIris"] as string[];
      expect(
        Array.isArray(classIris),
        "ecm:classIris must be an array",
      ).toBe(true);
      expect(
        classIris,
        "instance 1 ecm:classIris must contain the Person IRI",
      ).toContain(personIri);

      // ecm:relations must contain exactly 1 entry with the knows predicate IRI.
      const relations = saved["ecm:relations"] as Record<string, unknown>[];
      expect(
        Array.isArray(relations),
        "ecm:relations must be an array",
      ).toBe(true);
      expect(relations, "ecm:relations must have 1 entry").toHaveLength(1);
      const rel = relations[0] as Record<string, unknown>;
      expect(rel["type"]).toBe("ecm:RelationAssertion");
      expect(
        rel["ecm:predicateIri"],
        "relation predicateIri must be the knows IRI",
      ).toBe(knowsIri);

      // ---- Step 10: Reload -- re-upload downloaded file; verify project loads. ----
      await page.getByTestId("gw-file-input").setInputFiles(downloadPath!);
      await expect(page.getByTestId("gw-btn-save")).toBeEnabled();
    },
  );
});

test.describe("Smoke flow 4 (task 2.12)", () => {
  test(
    "Smoke 4: new project shows MISSING_REALIST_ANCHOR indicator before any user action",
    async ({ page }) => {
      await page.goto("/");

      await page.getByTestId("gw-btn-new").click();
      // Wait for React state update -- Save becomes enabled once project != null.
      await expect(page.getByTestId("gw-btn-save")).toBeEnabled();

      // MISSING_REALIST_ANCHOR indicator must be visible immediately.
      // The banner renders when iao:isAbout contains only
      // ecm:UnspecifiedSubjectMatter (the default for new projects).
      const banner = page.getByTestId("gw-anchor-banner");
      await expect(banner).toBeVisible();
      await expect(banner).toHaveAttribute(
        "data-anchor-state",
        "missing",
      );
    },
  );
});

test.describe("Smoke flow 2 (task 2.12)", () => {
  test(
    "Smoke 2: open v0.4 fixture -> edit term label -> save -> reload -> assert label preserved",
    async ({ page }) => {
      await page.goto("/");

      // ---- Step 1: Load v0.4 fixture (term-sidebar-2c-1op-1dp) which has
      // Person as a project-created owl:Class. ----
      await page.getByTestId("gw-file-input").setInputFiles(SIDEBAR_FIXTURE);
      await expect(page.getByTestId("gw-btn-save")).toBeEnabled();

      // ---- Step 2: Click 'Person' class item to open EditTermDialog. ----
      // Only project-created terms carry role="button" (imported terms are
      // read-only per FR-U010; aria-disabled="true", no role="button").
      const classesSec = page.getByTestId("gw-term-section-classes");
      await classesSec
        .locator('[role="button"]')
        .filter({ hasText: "Person" })
        .click();
      await expect(page.getByTestId("gw-dialog-edit-term")).toBeVisible();

      // ---- Step 3: Clear label; fill 'Person (Smoke 2)'; submit. ----
      // IRI is left unchanged -- no confirmation dialog expected.
      await page.getByTestId("gw-input-edit-label").clear();
      await page.getByTestId("gw-input-edit-label").fill("Person (Smoke 2)");
      await page.getByTestId("gw-btn-edit-submit").click();
      await expect(
        page.getByTestId("gw-dialog-edit-term"),
      ).not.toBeVisible();

      // ---- Step 4: Save; capture downloadPath. ----
      const [download] = await Promise.all([
        page.waitForEvent("download"),
        page.getByTestId("gw-btn-save").click(),
      ]);
      const downloadPath = await download.path();
      expect(downloadPath, "download must be saved to disk").not.toBeNull();

      // ---- Step 5: Reload -- re-upload the downloaded file. ----
      await page.getByTestId("gw-file-input").setInputFiles(downloadPath!);
      await expect(page.getByTestId("gw-btn-save")).toBeEnabled();

      // ---- Step 6: Assert edited label is preserved in downloaded JSON-LD. ----
      const content = fs.readFileSync(downloadPath!, "utf-8");
      const saved = JSON.parse(content) as Record<string, unknown>;
      const terms = saved["ecm:terms"] as Array<Record<string, unknown>>;
      expect(Array.isArray(terms), "ecm:terms must be an array").toBe(true);

      // Person IRI is stable (only label was edited, not IRI).
      const personTerm = terms.find(
        (t) => t["id"] === "https://example.org/ontology/Person",
      );
      expect(
        personTerm,
        "Person term must still be in ecm:terms after reload",
      ).toBeDefined();
      expect(
        personTerm!["rdfs:label"],
        "rdfs:label must reflect the edited value after reload",
      ).toBe("Person (Smoke 2)");
    },
  );
});

test.describe("Smoke flow 3 (task 2.12)", () => {
  test(
    "Smoke 3: open v0.3 fixture -> migration banner visible -> set isAbout -> save -> assert persisted",
    async ({ page }) => {
      await page.goto("/");

      // ---- Step 1: Load v0.3 fixture. Migration runs automatically on open. ----
      await page.getByTestId("gw-file-input").setInputFiles(V03_FIXTURE);
      await expect(page.getByTestId("gw-btn-save")).toBeEnabled();

      // Migration banner must be visible immediately (gw-migration-banner per FR-U029).
      const migrationBanner = page.getByTestId("gw-migration-banner");
      await expect(migrationBanner).toBeVisible();

      // ---- Step 2: Open Project Settings; add iao:isAbout subject IRI. ----
      await page.getByTestId("gw-btn-project-settings").click();
      await expect(
        page.getByTestId("gw-dialog-project-settings"),
      ).toBeVisible();

      await page
        .getByTestId("gw-input-isabout-iri")
        .fill("https://example.org/subjects/AlphaTopic");
      await page.getByTestId("gw-btn-add-iri").click();
      await page.getByTestId("gw-btn-settings-save").click();
      await expect(
        page.getByTestId("gw-dialog-project-settings"),
      ).not.toBeVisible();

      // ---- Step 3: Save; capture downloaded JSON-LD. ----
      const [download] = await Promise.all([
        page.waitForEvent("download"),
        page.getByTestId("gw-btn-save").click(),
      ]);
      const downloadPath = await download.path();
      expect(downloadPath, "download must be saved to disk").not.toBeNull();

      const content = fs.readFileSync(downloadPath!, "utf-8");
      const saved = JSON.parse(content) as Record<string, unknown>;

      // ---- Assertions ----

      // iao:isAbout must contain the added subject IRI.
      const isAbout = saved["iao:isAbout"];
      expect(
        Array.isArray(isAbout),
        "iao:isAbout must be an array",
      ).toBe(true);
      expect(
        isAbout as string[],
        "iao:isAbout must contain the AlphaTopic IRI",
      ).toContain("https://example.org/subjects/AlphaTopic");

      // ecm:_legacyAnchorPlaceholder must not be true in the saved document.
      // migrate() sets it to true; ProjectSettingsDialog.handleSave() clears it
      // (sets to undefined -> JSON.stringify omits it) when hasRealIri is true.
      expect(
        saved["ecm:_legacyAnchorPlaceholder"],
        "ecm:_legacyAnchorPlaceholder must be absent after setting a real subject IRI",
      ).not.toBe(true);
    },
  );
});
