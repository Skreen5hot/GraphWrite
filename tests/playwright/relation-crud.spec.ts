import { test, expect } from "@playwright/test";
import path from "path";
import fs from "fs";

/**
 * Task 2.6 Chain A -- Object-Property Relation CRUD acceptance tests.
 *
 * AC1: Drag from one node's source handle to a second node; save; parse:
 *      a new ecm:RelationAssertion appears in ecm:relations with
 *      ecm:subjectIri and ecm:objectIri pointing to distinct fixture instances.
 *
 * Chain B (task 2.6): AC2 (select predicate via dropdown; FR-U015),
 *                     AC3 (reverse; FR-U016), AC4 (delete; FR-U017).
 *
 * Event 8 lesson applied: when positioning within the canvas, use
 * explicitly-empty regions to avoid React Flow element occlusion.
 */

const CANVAS_FIXTURE = path.join(
  process.cwd(),
  "tests",
  "playwright",
  "fixtures",
  "canvas-3i-2r.jsonld",
);

/** Instance IRIs present in the canvas-3i-2r.jsonld fixture. */
const FIXTURE_INSTANCE_IRIS = new Set([
  "urn:uuid:c3000000-0000-0000-0000-000000000001",
  "urn:uuid:c3000000-0000-0000-0000-000000000002",
  "urn:uuid:c3000000-0000-0000-0000-000000000003",
]);

/** Relation ids already in the fixture (used to identify the newly created entry). */
const ORIGINAL_REL_IDS = new Set([
  "urn:uuid:c3000000-0000-0000-0000-000000000011",
  "urn:uuid:c3000000-0000-0000-0000-000000000012",
]);

const CANVAS_FIXTURE_WITH_OPS = path.join(
  process.cwd(),
  "tests",
  "playwright",
  "fixtures",
  "canvas-3i-2r-with-ops.jsonld",
);

/** First relation id used by Chain B predicate-select and reverse tests. */
const CHAIN_B_REL_ID_1 = "urn:uuid:c3000000-0000-0000-0000-000000000011";

/** Second relation id used by Chain B delete test (the relation that survives). */
const CHAIN_B_REL_ID_2 = "urn:uuid:c3000000-0000-0000-0000-000000000012";

test.describe("Relation CRUD (task 2.6 Chain A)", () => {
  test(
    "AC1: drag from node source handle to second node; save; parse: new ecm:RelationAssertion with valid subject/object IRIs",
    async ({ page }) => {
      await page.goto("/");

      await page.getByTestId("gw-file-input").setInputFiles(CANVAS_FIXTURE);
      await expect(page.getByTestId("gw-btn-save")).toBeEnabled();

      const canvasView = page.getByTestId("gw-canvas-view");
      await expect(canvasView).toBeVisible();

      // Wait for all 3 fixture nodes and 2 fixture edges.
      const nodeLocators = canvasView.locator(".react-flow__node");
      await expect(nodeLocators).toHaveCount(3, { timeout: 10_000 });
      await expect(canvasView.locator(".react-flow__edge")).toHaveCount(2, {
        timeout: 5_000,
      });

      // Hover over the first node to reveal connection handles.
      // React Flow renders handles only when nodesConnectable is true and the
      // node is hovered. The source handle carries class `.source` in addition
      // to `.react-flow__handle`; see open_questions for selector verification.
      const firstNode = nodeLocators.first();
      await firstNode.hover();

      const srcHandle = firstNode.locator(".react-flow__handle.source").first();
      await expect(srcHandle).toBeVisible({ timeout: 5_000 });
      const srcBox = await srcHandle.boundingBox();
      expect(srcBox, "source handle must have a bounding box").not.toBeNull();

      // Target: center of the second node.
      const secondNode = nodeLocators.nth(1);
      const tgtBox = await secondNode.boundingBox();
      expect(tgtBox, "second node must have a bounding box").not.toBeNull();

      // Drag from source handle center to target node center.
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

      // A third edge must appear (2 original + 1 newly drawn).
      await expect(canvasView.locator(".react-flow__edge")).toHaveCount(3, {
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

      const relations = saved["ecm:relations"] as unknown[];
      expect(Array.isArray(relations)).toBe(true);
      expect(relations).toHaveLength(3);

      // Locate the newly created relation (id not present in the original fixture).
      const newRel = (relations as Record<string, unknown>[]).find(
        (r) => !ORIGINAL_REL_IDS.has(r["id"] as string),
      );
      expect(newRel, "a new ecm:RelationAssertion must be present").toBeDefined();
      expect(newRel!["type"]).toBe("ecm:RelationAssertion");

      // subjectIri and objectIri must both be known fixture instance IRIs.
      const subjectIri = newRel!["ecm:subjectIri"] as string;
      const objectIri = newRel!["ecm:objectIri"] as string;
      expect(
        FIXTURE_INSTANCE_IRIS.has(subjectIri),
        `ecm:subjectIri "${subjectIri}" must be a fixture instance IRI`,
      ).toBe(true);
      expect(
        FIXTURE_INSTANCE_IRIS.has(objectIri),
        `ecm:objectIri "${objectIri}" must be a fixture instance IRI`,
      ).toBe(true);

      // The relation must not be a self-loop.
      expect(
        subjectIri,
        "ecm:subjectIri and ecm:objectIri must be distinct instances",
      ).not.toBe(objectIri);
    },
  );
});

test.describe("Relation CRUD (task 2.6 Chain B)", () => {
  test(
    "AC2: select predicate from dropdown; save; parse: ecm:predicateIri updated on relation",
    async ({ page }) => {
      await page.goto("/");
      await page.getByTestId("gw-file-input").setInputFiles(CANVAS_FIXTURE_WITH_OPS);
      await expect(page.getByTestId("gw-btn-save")).toBeEnabled();

      const canvasView = page.getByTestId("gw-canvas-view");
      await expect(canvasView.locator(".react-flow__node")).toHaveCount(3, {
        timeout: 10_000,
      });
      await expect(canvasView.locator(".react-flow__edge")).toHaveCount(2, {
        timeout: 5_000,
      });

      // Click the first edge using bounding-box center (Event 8 lesson: raw
      // mouse click avoids SVG hit-target ambiguity on invisible interaction path).
      const firstEdge = canvasView.locator(".react-flow__edge").first();
      const edgeBB = await firstEdge.boundingBox();
      expect(edgeBB, "first edge must have a bounding box").not.toBeNull();
      await page.mouse.click(
        edgeBB!.x + edgeBB!.width / 2,
        edgeBB!.y + edgeBB!.height / 2,
      );

      // Inspector must show the selected relation.
      await expect(page.getByTestId("gw-inspector-relation")).toBeVisible({
        timeout: 5_000,
      });

      // Select "Has Role" -- a different predicate than the fixture's "relatesTo".
      await page
        .getByTestId("gw-select-predicate")
        .selectOption("https://example.org/ontology/HasRole");

      // Save and capture the download.
      const [download] = await Promise.all([
        page.waitForEvent("download"),
        page.getByTestId("gw-btn-save").click(),
      ]);

      const downloadPath = await download.path();
      expect(downloadPath, "download must be saved to disk").not.toBeNull();
      const content = fs.readFileSync(downloadPath!, "utf-8");
      const saved = JSON.parse(content) as Record<string, unknown>;

      const relations = saved["ecm:relations"] as Record<string, unknown>[];
      expect(Array.isArray(relations)).toBe(true);

      const rel = relations.find((r) => r["id"] === CHAIN_B_REL_ID_1);
      expect(rel, "first relation must still exist").toBeDefined();
      expect(rel!["ecm:predicateIri"]).toBe(
        "https://example.org/ontology/HasRole",
      );
    },
  );

  test(
    "AC3: Reverse button swaps ecm:subjectIri and ecm:objectIri",
    async ({ page }) => {
      await page.goto("/");
      await page.getByTestId("gw-file-input").setInputFiles(CANVAS_FIXTURE_WITH_OPS);
      await expect(page.getByTestId("gw-btn-save")).toBeEnabled();

      const canvasView = page.getByTestId("gw-canvas-view");
      await expect(canvasView.locator(".react-flow__node")).toHaveCount(3, {
        timeout: 10_000,
      });
      await expect(canvasView.locator(".react-flow__edge")).toHaveCount(2, {
        timeout: 5_000,
      });

      // Known subject and object IRIs for the first fixture relation.
      const originalSubject = "urn:uuid:c3000000-0000-0000-0000-000000000001";
      const originalObject = "urn:uuid:c3000000-0000-0000-0000-000000000002";

      // Click the first edge.
      const firstEdge = canvasView.locator(".react-flow__edge").first();
      const edgeBB = await firstEdge.boundingBox();
      expect(edgeBB, "first edge must have a bounding box").not.toBeNull();
      await page.mouse.click(
        edgeBB!.x + edgeBB!.width / 2,
        edgeBB!.y + edgeBB!.height / 2,
      );

      await expect(page.getByTestId("gw-inspector-relation")).toBeVisible({
        timeout: 5_000,
      });
      await expect(page.getByTestId("gw-inspector-subject")).toHaveText(
        originalSubject,
      );
      await expect(page.getByTestId("gw-inspector-object")).toHaveText(
        originalObject,
      );

      // Click Reverse.
      await page.getByTestId("gw-btn-reverse").click();

      // Inspector must immediately reflect the swap.
      await expect(page.getByTestId("gw-inspector-subject")).toHaveText(
        originalObject,
      );
      await expect(page.getByTestId("gw-inspector-object")).toHaveText(
        originalSubject,
      );

      // Save and verify in the parsed output.
      const [download] = await Promise.all([
        page.waitForEvent("download"),
        page.getByTestId("gw-btn-save").click(),
      ]);

      const downloadPath = await download.path();
      expect(downloadPath, "download must be saved to disk").not.toBeNull();
      const content = fs.readFileSync(downloadPath!, "utf-8");
      const saved = JSON.parse(content) as Record<string, unknown>;

      const relations = saved["ecm:relations"] as Record<string, unknown>[];
      const rel = relations.find((r) => r["id"] === CHAIN_B_REL_ID_1);
      expect(rel, "first relation must still exist after reverse").toBeDefined();
      expect(rel!["ecm:subjectIri"]).toBe(originalObject);
      expect(rel!["ecm:objectIri"]).toBe(originalSubject);
    },
  );

  test(
    "AC4: Delete button removes relation; Inspector returns to empty state; edge disappears from canvas",
    async ({ page }) => {
      await page.goto("/");
      await page.getByTestId("gw-file-input").setInputFiles(CANVAS_FIXTURE_WITH_OPS);
      await expect(page.getByTestId("gw-btn-save")).toBeEnabled();

      const canvasView = page.getByTestId("gw-canvas-view");
      await expect(canvasView.locator(".react-flow__node")).toHaveCount(3, {
        timeout: 10_000,
      });
      await expect(canvasView.locator(".react-flow__edge")).toHaveCount(2, {
        timeout: 5_000,
      });

      // Click the first edge to select it.
      const firstEdge = canvasView.locator(".react-flow__edge").first();
      const edgeBB = await firstEdge.boundingBox();
      expect(edgeBB, "first edge must have a bounding box").not.toBeNull();
      await page.mouse.click(
        edgeBB!.x + edgeBB!.width / 2,
        edgeBB!.y + edgeBB!.height / 2,
      );

      await expect(page.getByTestId("gw-inspector-relation")).toBeVisible({
        timeout: 5_000,
      });

      // Click Delete.
      await page.getByTestId("gw-btn-delete-relation").click();

      // Inspector must return to empty state (rel===undefined guard fires because
      // selectedRelationId in App still points to the now-removed relation id).
      await expect(page.getByTestId("gw-inspector-empty")).toBeVisible({
        timeout: 3_000,
      });

      // Canvas must now show one fewer edge.
      await expect(canvasView.locator(".react-flow__edge")).toHaveCount(1, {
        timeout: 5_000,
      });

      // Save and verify only the second relation remains.
      const [download] = await Promise.all([
        page.waitForEvent("download"),
        page.getByTestId("gw-btn-save").click(),
      ]);

      const downloadPath = await download.path();
      expect(downloadPath, "download must be saved to disk").not.toBeNull();
      const content = fs.readFileSync(downloadPath!, "utf-8");
      const saved = JSON.parse(content) as Record<string, unknown>;

      const relations = saved["ecm:relations"] as unknown[];
      expect(Array.isArray(relations)).toBe(true);
      expect(relations).toHaveLength(1);
      expect(
        (relations as Record<string, unknown>[])[0]["id"],
      ).toBe(CHAIN_B_REL_ID_2);
    },
  );
});
