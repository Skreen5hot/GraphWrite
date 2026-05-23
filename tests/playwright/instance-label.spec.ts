import { test, expect } from "@playwright/test";
import path from "path";
import fs from "fs";

/**
 * Round 3 Chain Beta -- S2-01 Instance Label Edit + S2-02 Edge Predicate Labels.
 *
 * AC1: Label input present in Inspector instance mode; pre-populated from rdfs:label (S2-01).
 * AC2: Editing label input persists rdfs:label in saved JSON (S2-01).
 * AC3: Edited label propagates to canvas node text without reload (S2-01 + S2-04 auto-resolve).
 * AC4: Edge labels display the predicate rdfs:label from ecm:terms (S2-02).
 */

const CANVAS_FIXTURE = path.join(
  process.cwd(),
  "tests",
  "playwright",
  "fixtures",
  "canvas-3i-2r.jsonld",
);

const CANVAS_FIXTURE_WITH_OPS = path.join(
  process.cwd(),
  "tests",
  "playwright",
  "fixtures",
  "canvas-3i-2r-with-ops.jsonld",
);

const INST_1 = "urn:uuid:c3000000-0000-0000-0000-000000000001";

test.describe("Instance Label Edit (R3-S2-01)", () => {
  test(
    "AC1: label input is visible in Inspector instance mode; pre-populated with existing rdfs:label",
    async ({ page }) => {
      await page.goto("/");
      // New-project Skip flow creates an instance with rdfs:label "New Instance"
      // (CanvasView double-click handler; canvas.spec.ts AC2 precedent).
      await page.getByTestId("gw-btn-new").click();
      await expect(page.getByTestId("gw-dialog-new-project")).toBeVisible();
      await page.getByTestId("gw-btn-new-project-skip").click();
      await expect(page.getByTestId("gw-btn-save")).toBeEnabled();

      const canvasView = page.getByTestId("gw-canvas-view");
      const pane = canvasView.locator(".react-flow__pane");
      await expect(pane).toBeVisible({ timeout: 10_000 });

      await pane.dblclick();
      await expect(canvasView.locator(".react-flow__node")).toHaveCount(1, { timeout: 5_000 });

      // Click the new node to open it in the Inspector.
      const node = canvasView.locator(".react-flow__node").first();
      const nodeBB = await node.boundingBox();
      expect(nodeBB, "node must have a bounding box").not.toBeNull();
      await page.mouse.click(
        nodeBB!.x + nodeBB!.width / 2,
        nodeBB!.y + nodeBB!.height / 2,
      );

      await expect(page.getByTestId("gw-inspector-instance")).toBeVisible({ timeout: 5_000 });

      // Label input must be visible and pre-populated with the default label.
      const labelInput = page.getByTestId("gw-inspector-instance-label-input");
      await expect(labelInput).toBeVisible();
      await expect(labelInput).toHaveValue("New Instance");
    },
  );

  test(
    "AC2: editing label input persists rdfs:label in saved JSON",
    async ({ page }) => {
      await page.goto("/");
      await page.getByTestId("gw-file-input").setInputFiles(CANVAS_FIXTURE);
      await expect(page.getByTestId("gw-btn-save")).toBeEnabled();

      const canvasView = page.getByTestId("gw-canvas-view");
      await expect(canvasView.locator(".react-flow__node")).toHaveCount(3, { timeout: 10_000 });

      // Click first node (instance 001; no rdfs:label in canvas-3i-2r fixture).
      const firstNode = canvasView.locator(".react-flow__node").first();
      const nodeBB = await firstNode.boundingBox();
      expect(nodeBB, "first node must have a bounding box").not.toBeNull();
      await page.mouse.click(
        nodeBB!.x + nodeBB!.width / 2,
        nodeBB!.y + nodeBB!.height / 2,
      );

      await expect(page.getByTestId("gw-inspector-instance")).toBeVisible({ timeout: 5_000 });

      // Label input must be empty (fixture instance has no rdfs:label).
      const labelInput = page.getByTestId("gw-inspector-instance-label-input");
      await expect(labelInput).toBeVisible();
      await expect(labelInput).toHaveValue("");

      // Type a label.
      await labelInput.fill("Alice");

      // Save and verify rdfs:label persisted in the downloaded document.
      const [download] = await Promise.all([
        page.waitForEvent("download"),
        page.getByTestId("gw-btn-save").click(),
      ]);

      const downloadPath = await download.path();
      expect(downloadPath, "download must be saved to disk").not.toBeNull();
      const content = fs.readFileSync(downloadPath!, "utf-8");
      const saved = JSON.parse(content) as Record<string, unknown>;

      const instances = saved["ecm:instances"] as Record<string, unknown>[];
      expect(Array.isArray(instances)).toBe(true);
      const inst1 = instances.find((i) => i["id"] === INST_1);
      expect(inst1, "instance 001 must still exist").toBeDefined();
      expect(inst1!["rdfs:label"]).toBe("Alice");
    },
  );

  test(
    "AC3: edited label propagates to canvas node text without reload (S2-01 + S2-04 auto-resolve)",
    async ({ page }) => {
      await page.goto("/");
      await page.getByTestId("gw-file-input").setInputFiles(CANVAS_FIXTURE);
      await expect(page.getByTestId("gw-btn-save")).toBeEnabled();

      const canvasView = page.getByTestId("gw-canvas-view");
      await expect(canvasView.locator(".react-flow__node")).toHaveCount(3, { timeout: 10_000 });

      // Click first node (instance 001).
      const firstNode = canvasView.locator(".react-flow__node").first();
      const nodeBB = await firstNode.boundingBox();
      expect(nodeBB, "first node must have a bounding box").not.toBeNull();
      await page.mouse.click(
        nodeBB!.x + nodeBB!.width / 2,
        nodeBB!.y + nodeBB!.height / 2,
      );

      await expect(page.getByTestId("gw-inspector-instance")).toBeVisible({ timeout: 5_000 });

      // Edit the label.
      const labelInput = page.getByTestId("gw-inspector-instance-label-input");
      await labelInput.fill("Alice");

      // Canvas node must reflect the new label immediately (no save/reload needed).
      await expect(firstNode).toContainText("Alice", { timeout: 3_000 });
    },
  );
});

test.describe("Edge Predicate Labels (R3-S2-02)", () => {
  test(
    "AC4: edges display rdfs:label of predicate term from ecm:terms",
    async ({ page }) => {
      await page.goto("/");
      await page.getByTestId("gw-file-input").setInputFiles(CANVAS_FIXTURE_WITH_OPS);
      await expect(page.getByTestId("gw-btn-save")).toBeEnabled();

      const canvasView = page.getByTestId("gw-canvas-view");
      await expect(canvasView.locator(".react-flow__node")).toHaveCount(3, { timeout: 10_000 });
      await expect(canvasView.locator(".react-flow__edge")).toHaveCount(2, { timeout: 5_000 });

      // Both fixture edges use the "relatesTo" predicate; its rdfs:label is "Relates To".
      // deriveEdges() resolves the label from ecm:terms and sets edge.label.
      // React Flow renders edge.label as visible text within the canvas view element.
      await expect(canvasView).toContainText("Relates To", { timeout: 3_000 });
    },
  );
});
