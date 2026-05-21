import { test, expect } from "@playwright/test";
import path from "path";
import fs from "fs";

/**
 * Task 2.4 Chain A -- Instance Canvas acceptance tests.
 *
 * AC1: Project with 3 instances and 2 relations renders 3 React Flow nodes
 *      and 2 edges. Playwright test. IMPLEMENTATION_PLAN section 2.4.
 *
 * Chain B: AC2 (create instance via canvas; FR-U011).
 * Chain C: AC3 (move node; layout persistence to ecm:CanvasLayout).
 * Chain D: AC5 (semantic export strips ecm:CanvasLayout; requires export UI).
 */

const CANVAS_FIXTURE = path.join(
  process.cwd(),
  "tests",
  "playwright",
  "fixtures",
  "canvas-3i-2r.jsonld",
);

test.describe("Canvas view (task 2.4 Chain A)", () => {
  test(
    "AC1: 3-instance / 2-relation fixture renders 3 nodes and 2 edges",
    async ({ page }) => {
      await page.goto("/");

      await page.getByTestId("gw-file-input").setInputFiles(CANVAS_FIXTURE);
      await expect(page.getByTestId("gw-btn-save")).toBeEnabled();

      // Canvas view wrapper must be visible before asserting React Flow internals.
      const canvasView = page.getByTestId("gw-canvas-view");
      await expect(canvasView).toBeVisible();

      // React Flow renders one .react-flow__node div per node.
      // 10s timeout accommodates ResizeObserver + fitView initialization.
      await expect(canvasView.locator(".react-flow__node")).toHaveCount(3, {
        timeout: 10_000,
      });

      // React Flow renders one .react-flow__edge <g> per edge (SVG layer).
      await expect(canvasView.locator(".react-flow__edge")).toHaveCount(2);
    },
  );
});

test.describe("Canvas view (task 2.4 Chain B)", () => {
  test(
    "AC2: double-click on canvas pane creates a new ecm:Instance with valid IRI",
    async ({ page }) => {
      await page.goto("/");

      // Create a new empty project (no existing nodes to interfere).
      await page.getByTestId("gw-btn-new").click();
      await expect(page.getByTestId("gw-btn-save")).toBeEnabled();

      const canvasView = page.getByTestId("gw-canvas-view");
      await expect(canvasView).toBeVisible();

      // Wait for React Flow to initialise the pane.
      const pane = canvasView.locator(".react-flow__pane");
      await expect(pane).toBeVisible({ timeout: 10_000 });

      // Double-click the pane background; Playwright emits click(detail=1)
      // then click(detail=2). The handler fires on detail===2 only.
      await pane.dblclick();

      // Wait for the new node to render before saving.
      await expect(canvasView.locator(".react-flow__node")).toHaveCount(1, {
        timeout: 5_000,
      });

      // Save and capture the download.
      const [download] = await Promise.all([
        page.waitForEvent("download"),
        page.getByTestId("gw-btn-save").click(),
      ]);

      const downloadPath = await download.path();
      expect(downloadPath, "download must be saved to disk").not.toBeNull();

      const content = fs.readFileSync(downloadPath!, "utf-8");
      const saved = JSON.parse(content) as Record<string, unknown>;

      // Assert: ecm:instances must contain exactly one new ecm:Instance.
      const instances = saved["ecm:instances"] as unknown[];
      expect(Array.isArray(instances)).toBe(true);
      expect(instances).toHaveLength(1);

      const inst = instances[0] as Record<string, unknown>;
      expect(inst["type"]).toBe("ecm:Instance");
      expect(typeof inst["id"]).toBe("string");

      // IRI must match the canonical urn:uuid pattern.
      expect(inst["id"] as string).toMatch(
        /^urn:uuid:[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/,
      );
    },
  );
});

test.describe("Canvas view (task 2.4 Chain C)", () => {
  test(
    "AC3: dragging a node and saving persists updated ecm:x / ecm:y in ecm:CanvasLayout",
    async ({ page }) => {
      await page.goto("/");

      await page.getByTestId("gw-file-input").setInputFiles(CANVAS_FIXTURE);
      await expect(page.getByTestId("gw-btn-save")).toBeEnabled();

      const canvasView = page.getByTestId("gw-canvas-view");
      await expect(canvasView).toBeVisible();

      // Wait for all 3 fixture nodes to render before attempting drag.
      const nodeLocators = canvasView.locator(".react-flow__node");
      await expect(nodeLocators).toHaveCount(3, { timeout: 10_000 });

      // Canonical flow-coordinate positions for the three fixture nodes.
      const originalPositions = [
        { x: 100, y: 100 },
        { x: 400, y: 100 },
        { x: 700, y: 100 },
      ];

      // Drag the first rendered node 150 screen-px right and 100 screen-px down.
      // page.mouse is used in place of locator.dragTo() to guarantee the
      // mousedown + incremental mousemove + mouseup sequence React Flow expects.
      const firstNode = nodeLocators.first();
      const box = await firstNode.boundingBox();
      expect(box, "first node must have a bounding box").not.toBeNull();

      const cx = box!.x + box!.width / 2;
      const cy = box!.y + box!.height / 2;
      await page.mouse.move(cx, cy);
      await page.mouse.down();
      await page.mouse.move(cx + 150, cy + 100, { steps: 10 });
      await page.mouse.up();

      // Save and capture the download.
      const [download] = await Promise.all([
        page.waitForEvent("download"),
        page.getByTestId("gw-btn-save").click(),
      ]);

      const downloadPath = await download.path();
      expect(downloadPath, "download must be saved to disk").not.toBeNull();

      const content = fs.readFileSync(downloadPath!, "utf-8");
      const saved = JSON.parse(content) as Record<string, unknown>;

      // Locate the active ecm:CanvasLayout.
      const layouts = saved["ecm:layouts"] as unknown[];
      expect(Array.isArray(layouts)).toBe(true);

      const layout = (layouts as Record<string, unknown>[]).find(
        (l) => l["type"] === "ecm:CanvasLayout",
      );
      expect(layout, "saved file must contain an ecm:CanvasLayout").toBeDefined();

      const canvasNodes = layout!["ecm:nodes"] as Record<string, unknown>[];
      expect(Array.isArray(canvasNodes)).toBe(true);
      expect(canvasNodes).toHaveLength(3);

      // At least one node must have a position differing from every original
      // fixture position: the dragged node's new coordinates were persisted.
      const movedNode = canvasNodes.find((cn) => {
        const x = cn["ecm:x"] as number;
        const y = cn["ecm:y"] as number;
        return originalPositions.every(
          (orig) => Math.abs(x - orig.x) > 1 || Math.abs(y - orig.y) > 1,
        );
      });
      expect(
        movedNode,
        "at least one ecm:CanvasNode must have an updated position after drag",
      ).toBeDefined();

      // Updated coordinates must be valid numbers.
      expect(typeof movedNode!["ecm:x"]).toBe("number");
      expect(typeof movedNode!["ecm:y"]).toBe("number");
    },
  );
});

test.describe("Canvas view (task 2.4 Chain D)", () => {
  /** Recursively collect all object-key strings from a JSON value tree. */
  function collectAllKeys(value: unknown, sink: string[]): void {
    if (value === null || typeof value !== "object") return;
    if (Array.isArray(value)) {
      for (const item of value) collectAllKeys(item, sink);
      return;
    }
    const rec = value as Record<string, unknown>;
    for (const key of Object.keys(rec)) {
      sink.push(key);
      collectAllKeys(rec[key], sink);
    }
  }

  test(
    "AC4: saved JSON-LD contains no React Flow internal-state keys",
    async ({ page }) => {
      await page.goto("/");

      await page.getByTestId("gw-file-input").setInputFiles(CANVAS_FIXTURE);
      await expect(page.getByTestId("gw-btn-save")).toBeEnabled();

      const canvasView = page.getByTestId("gw-canvas-view");
      await expect(canvasView).toBeVisible();

      // Wait for all fixture nodes to render before interacting.
      await expect(canvasView.locator(".react-flow__node")).toHaveCount(3, {
        timeout: 10_000,
      });

      // Double-click the pane background to trigger a React Flow canvas event
      // (exercises the code path that could leak __rf_ / __reactflow state
      // into the project document if CanvasView wrote derived objects back).
      //
      // Use an explicit position offset from existing nodes. The fixture places
      // its 3 nodes at flow-coordinate y=100; pane.dblclick() defaults to the
      // center of the pane's bounding box, which collides with the middle node
      // and is intercepted before reaching the pane handler. A bottom-area
      // position (relative to the pane element) lands on empty pane.
      const pane = canvasView.locator(".react-flow__pane");
      await expect(pane).toBeVisible({ timeout: 10_000 });
      const paneBox = await pane.boundingBox();
      expect(paneBox, "pane must have a bounding box").not.toBeNull();
      await pane.dblclick({
        position: { x: 80, y: paneBox!.height - 80 },
      });

      // Wait for the fourth node (newly created instance) to appear.
      await expect(canvasView.locator(".react-flow__node")).toHaveCount(4, {
        timeout: 5_000,
      });

      // Save and capture the download.
      const [download] = await Promise.all([
        page.waitForEvent("download"),
        page.getByTestId("gw-btn-save").click(),
      ]);

      const downloadPath = await download.path();
      expect(downloadPath, "download must be saved to disk").not.toBeNull();

      const content = fs.readFileSync(downloadPath!, "utf-8");
      const saved = JSON.parse(content) as unknown;

      // Walk every key in the document tree; assert none match RF internal patterns.
      const allKeys: string[] = [];
      collectAllKeys(saved, allKeys);
      const rfPattern = /__rf_|__reactflow/i;
      const rfKeys = allKeys.filter((k) => rfPattern.test(k));
      expect(
        rfKeys,
        `Saved JSON-LD must not contain React Flow internal-state keys; found: ${rfKeys.join(", ")}`,
      ).toHaveLength(0);
    },
  );

  test(
    "AC5: Turtle export of canvas-laden project contains no canvas-layer triples",
    async ({ page }) => {
      await page.goto("/");

      await page.getByTestId("gw-file-input").setInputFiles(CANVAS_FIXTURE);
      await expect(page.getByTestId("gw-btn-save-turtle")).toBeEnabled();

      const canvasView = page.getByTestId("gw-canvas-view");
      await expect(canvasView).toBeVisible();

      // Wait for fixture nodes to confirm the project is fully loaded.
      await expect(canvasView.locator(".react-flow__node")).toHaveCount(3, {
        timeout: 10_000,
      });

      // Click Save as Turtle and capture the download.
      const [download] = await Promise.all([
        page.waitForEvent("download"),
        page.getByTestId("gw-btn-save-turtle").click(),
      ]);

      const downloadPath = await download.path();
      expect(downloadPath, "download must be saved to disk").not.toBeNull();

      const turtleText = fs.readFileSync(downloadPath!, "utf-8");

      // Assert: Turtle output must contain no canvas-layer vocabulary.
      // emitTurtle calls projectSemantic internally; the projection excludes
      // ecm:layouts by omission from ENTITY_ARRAY_KEYS and SEMANTIC_TYPE_ALLOWLIST.
      expect(turtleText).not.toContain("ecm:CanvasLayout");
      expect(turtleText).not.toContain("ecm:CanvasNode");
      expect(turtleText).not.toContain("ecm:CanvasEdge");
    },
  );
});
