import { test, expect } from "@playwright/test";
import path from "path";
import fs from "fs";

/**
 * Phase 3 G1 -- Delete Instance (FR-U032) Playwright acceptance tests.
 *
 * AC1: Delete instance 001 from canvas-3i-2r fixture; assert all 4 cascade
 *      arrays updated: ecm:instances (2 remain), ecm:layouts[*].ecm:nodes
 *      (2 remain), ecm:literalAssertions (still 0), ecm:relations (1 remains);
 *      assert Inspector returns to empty state; assert canvas node count drops.
 *
 * AC2: Delete instance 002 (participates in both relations as subject and
 *      object); assert both relations removed (0 remain).
 *
 * Event 8 lesson: node click via bounding-box center, not locator .click().
 */

const CANVAS_FIXTURE = path.join(
  process.cwd(),
  "tests",
  "playwright",
  "fixtures",
  "canvas-3i-2r.jsonld",
);

const INST_1 = "urn:uuid:c3000000-0000-0000-0000-000000000001";
const INST_2 = "urn:uuid:c3000000-0000-0000-0000-000000000002";
const INST_3 = "urn:uuid:c3000000-0000-0000-0000-000000000003";
const REL_2  = "urn:uuid:c3000000-0000-0000-0000-000000000012"; // 002->003, survives AC1

test.describe("Delete Instance (Phase 3 G1, FR-U032)", () => {
  test(
    "AC1: delete instance 001; cascade removes 1 instance + 1 relation + 1 canvas node; Inspector returns to empty state",
    async ({ page }) => {
      await page.goto("/");
      await page.getByTestId("gw-file-input").setInputFiles(CANVAS_FIXTURE);
      await expect(page.getByTestId("gw-btn-save")).toBeEnabled();

      const canvasView = page.getByTestId("gw-canvas-view");
      await expect(canvasView.locator(".react-flow__node")).toHaveCount(3, {
        timeout: 10_000,
      });

      // Click first node (instance 001) via bounding-box center (Event 8 lesson).
      const firstNode = canvasView.locator(".react-flow__node").first();
      const nodeBB = await firstNode.boundingBox();
      expect(nodeBB, "first node must have a bounding box").not.toBeNull();
      await page.mouse.click(
        nodeBB!.x + nodeBB!.width / 2,
        nodeBB!.y + nodeBB!.height / 2,
      );

      // Inspector must switch to instance mode.
      await expect(page.getByTestId("gw-inspector-instance")).toBeVisible({
        timeout: 5_000,
      });

      // Verify instance 001 is selected.
      await expect(page.getByTestId("gw-inspector-instance-iri")).toHaveText(
        INST_1,
        { timeout: 3_000 },
      );

      // Open delete confirmation dialog.
      await page.getByTestId("gw-btn-delete-instance").click();
      await expect(page.getByTestId("gw-dialog-delete-instance")).toBeVisible({
        timeout: 3_000,
      });

      // Confirm deletion.
      await page.getByTestId("gw-btn-delete-instance-confirm").click();

      // Inspector must return to empty state (deleted instance no longer in project).
      await expect(page.getByTestId("gw-inspector-empty")).toBeVisible({
        timeout: 3_000,
      });

      // Canvas must now show 2 nodes (instance 001 removed).
      await expect(canvasView.locator(".react-flow__node")).toHaveCount(2, {
        timeout: 5_000,
      });

      // Save and verify cascade in downloaded document.
      const [download] = await Promise.all([
        page.waitForEvent("download"),
        page.getByTestId("gw-btn-save").click(),
      ]);

      const downloadPath = await download.path();
      expect(downloadPath, "download must be saved to disk").not.toBeNull();
      const content = fs.readFileSync(downloadPath!, "utf-8");
      const saved = JSON.parse(content) as Record<string, unknown>;

      // ecm:instances: 001 removed; 002 and 003 remain.
      const instances = saved["ecm:instances"] as Record<string, unknown>[];
      expect(Array.isArray(instances)).toBe(true);
      expect(instances).toHaveLength(2);
      expect(instances.some((i) => i["id"] === INST_1)).toBe(false);
      expect(instances.some((i) => i["id"] === INST_2)).toBe(true);
      expect(instances.some((i) => i["id"] === INST_3)).toBe(true);

      // ecm:relations: REL_1 (001->002) removed; REL_2 (002->003) remains.
      const relations = saved["ecm:relations"] as unknown[];
      expect(Array.isArray(relations)).toBe(true);
      expect(relations).toHaveLength(1);
      expect((relations as Record<string, unknown>[])[0]["id"]).toBe(REL_2);

      // ecm:literalAssertions: was empty in fixture; still empty.
      const literals = saved["ecm:literalAssertions"] as unknown[];
      expect(Array.isArray(literals)).toBe(true);
      expect(literals).toHaveLength(0);

      // ecm:layouts[0].ecm:nodes: 001's node removed; 2 remain.
      const layouts = saved["ecm:layouts"] as Record<string, unknown>[];
      expect(Array.isArray(layouts)).toBe(true);
      const nodes = layouts[0]["ecm:nodes"] as Record<string, unknown>[];
      expect(nodes).toHaveLength(2);
      expect(nodes.some((n) => n["ecm:instanceIri"] === INST_1)).toBe(false);
    },
  );

  test(
    "AC2: delete instance 002 (subject of REL_2, object of REL_1); both relations removed",
    async ({ page }) => {
      await page.goto("/");
      await page.getByTestId("gw-file-input").setInputFiles(CANVAS_FIXTURE);
      await expect(page.getByTestId("gw-btn-save")).toBeEnabled();

      const canvasView = page.getByTestId("gw-canvas-view");
      await expect(canvasView.locator(".react-flow__node")).toHaveCount(3, {
        timeout: 10_000,
      });

      // Click second node (instance 002: x=400 in fixture, nth(1) in DOM order).
      const secondNode = canvasView.locator(".react-flow__node").nth(1);
      const nodeBB = await secondNode.boundingBox();
      expect(nodeBB, "second node must have a bounding box").not.toBeNull();
      await page.mouse.click(
        nodeBB!.x + nodeBB!.width / 2,
        nodeBB!.y + nodeBB!.height / 2,
      );

      await expect(page.getByTestId("gw-inspector-instance")).toBeVisible({
        timeout: 5_000,
      });

      // Verify instance 002 is selected (documents nth(1) assumption).
      await expect(page.getByTestId("gw-inspector-instance-iri")).toHaveText(
        INST_2,
        { timeout: 3_000 },
      );

      await page.getByTestId("gw-btn-delete-instance").click();
      await expect(page.getByTestId("gw-dialog-delete-instance")).toBeVisible({
        timeout: 3_000,
      });
      await page.getByTestId("gw-btn-delete-instance-confirm").click();

      await expect(page.getByTestId("gw-inspector-empty")).toBeVisible({
        timeout: 3_000,
      });

      // Save and verify.
      const [download] = await Promise.all([
        page.waitForEvent("download"),
        page.getByTestId("gw-btn-save").click(),
      ]);

      const downloadPath = await download.path();
      expect(downloadPath).not.toBeNull();
      const content = fs.readFileSync(downloadPath!, "utf-8");
      const saved = JSON.parse(content) as Record<string, unknown>;

      // ecm:instances: 002 removed; 001 and 003 remain.
      const instances = saved["ecm:instances"] as Record<string, unknown>[];
      expect(instances).toHaveLength(2);
      expect(instances.some((i) => i["id"] === INST_2)).toBe(false);
      expect(instances.some((i) => i["id"] === INST_1)).toBe(true);
      expect(instances.some((i) => i["id"] === INST_3)).toBe(true);

      // ecm:relations: both removed (002 is subject of REL_2 AND object of REL_1).
      const relations = saved["ecm:relations"] as unknown[];
      expect(Array.isArray(relations)).toBe(true);
      expect(relations).toHaveLength(0);

      // ecm:layouts[0].ecm:nodes: 002's node removed; 2 remain.
      const layouts = saved["ecm:layouts"] as Record<string, unknown>[];
      const nodes = layouts[0]["ecm:nodes"] as Record<string, unknown>[];
      expect(nodes).toHaveLength(2);
      expect(nodes.some((n) => n["ecm:instanceIri"] === INST_2)).toBe(false);
    },
  );
});
