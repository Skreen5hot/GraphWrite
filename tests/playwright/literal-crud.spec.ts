import { test, expect } from "@playwright/test";
import path from "path";
import fs from "fs";

/**
 * Task 2.7 Chain A -- Literal-Property Assertion CRUD acceptance tests.
 *
 * AC1: Add literal; save; parse: ecm:literalAssertions entry with correct
 *      ecm:subjectIri, ecm:predicateIri, ecm:value, ecm:datatype.
 * AC2: Add literal with language='en'; save; parse: ecm:language='en'.
 * AC3: Add then delete literal; save; parse: ecm:literalAssertions empty.
 *
 * Event 8 lesson applied: node click uses bounding-box center via raw mouse.
 */

const LITERAL_CRUD_FIXTURE = path.join(
  process.cwd(),
  "tests",
  "playwright",
  "fixtures",
  "literal-crud-1i-1dp.jsonld",
);

const FIXTURE_INSTANCE_IRI = "urn:uuid:e7000000-0000-0000-0000-000000000001";
const FIXTURE_DATATYPE_PROP_IRI = "https://example.org/ontology/NameProperty";

test.describe("Literal CRUD (task 2.7 Chain A)", () => {
  test(
    "AC1: add literal; save; parse: entry in ecm:literalAssertions with correct subjectIri/predicateIri/value/datatype",
    async ({ page }) => {
      await page.goto("/");
      await page.getByTestId("gw-file-input").setInputFiles(LITERAL_CRUD_FIXTURE);
      await expect(page.getByTestId("gw-btn-save")).toBeEnabled();

      const canvasView = page.getByTestId("gw-canvas-view");
      await expect(canvasView.locator(".react-flow__node")).toHaveCount(1, {
        timeout: 10_000,
      });

      // Click node via bounding-box center (Event 8 lesson).
      const firstNode = canvasView.locator(".react-flow__node").first();
      const nodeBB = await firstNode.boundingBox();
      expect(nodeBB, "node must have a bounding box").not.toBeNull();
      await page.mouse.click(
        nodeBB!.x + nodeBB!.width / 2,
        nodeBB!.y + nodeBB!.height / 2,
      );

      // Inspector must switch to instance mode.
      await expect(page.getByTestId("gw-inspector-instance")).toBeVisible({
        timeout: 5_000,
      });

      // Open Add literal dialog.
      await page.getByTestId("gw-btn-add-literal").click();
      await expect(page.getByTestId("gw-dialog-add-literal")).toBeVisible({
        timeout: 3_000,
      });

      // Fill value; predicate auto-selected (only one DatatypeProperty);
      // datatype defaults to xsd:string.
      await page.getByTestId("gw-input-literal-value").fill("Alice");
      await page.getByTestId("gw-btn-literal-submit").click();

      // Dialog closes; literal entry visible.
      await expect(page.getByTestId("gw-dialog-add-literal")).not.toBeVisible({
        timeout: 3_000,
      });
      await expect(page.getByTestId("gw-literal-entry")).toBeVisible({
        timeout: 3_000,
      });

      // Save and verify.
      const [download] = await Promise.all([
        page.waitForEvent("download"),
        page.getByTestId("gw-btn-save").click(),
      ]);

      const downloadPath = await download.path();
      expect(downloadPath, "download must be saved to disk").not.toBeNull();
      const content = fs.readFileSync(downloadPath!, "utf-8");
      const saved = JSON.parse(content) as Record<string, unknown>;

      const literals = saved["ecm:literalAssertions"] as Record<string, unknown>[];
      expect(Array.isArray(literals)).toBe(true);
      expect(literals).toHaveLength(1);
      expect(literals[0]["ecm:subjectIri"]).toBe(FIXTURE_INSTANCE_IRI);
      expect(literals[0]["ecm:predicateIri"]).toBe(FIXTURE_DATATYPE_PROP_IRI);
      expect(literals[0]["ecm:value"]).toBe("Alice");
      expect(literals[0]["ecm:datatype"]).toBe("xsd:string");
    },
  );

  test(
    "AC2: add literal with language='en'; save; parse: ecm:language='en'",
    async ({ page }) => {
      await page.goto("/");
      await page.getByTestId("gw-file-input").setInputFiles(LITERAL_CRUD_FIXTURE);
      await expect(page.getByTestId("gw-btn-save")).toBeEnabled();

      const canvasView = page.getByTestId("gw-canvas-view");
      await expect(canvasView.locator(".react-flow__node")).toHaveCount(1, {
        timeout: 10_000,
      });

      const firstNode = canvasView.locator(".react-flow__node").first();
      const nodeBB = await firstNode.boundingBox();
      expect(nodeBB, "node must have a bounding box").not.toBeNull();
      await page.mouse.click(
        nodeBB!.x + nodeBB!.width / 2,
        nodeBB!.y + nodeBB!.height / 2,
      );

      await expect(page.getByTestId("gw-inspector-instance")).toBeVisible({
        timeout: 5_000,
      });

      await page.getByTestId("gw-btn-add-literal").click();
      await expect(page.getByTestId("gw-dialog-add-literal")).toBeVisible({
        timeout: 3_000,
      });

      await page.getByTestId("gw-input-literal-value").fill("Alice");
      await page.getByTestId("gw-input-literal-language").fill("en");
      await page.getByTestId("gw-btn-literal-submit").click();

      await expect(page.getByTestId("gw-dialog-add-literal")).not.toBeVisible({
        timeout: 3_000,
      });

      const [download] = await Promise.all([
        page.waitForEvent("download"),
        page.getByTestId("gw-btn-save").click(),
      ]);

      const downloadPath = await download.path();
      expect(downloadPath, "download must be saved to disk").not.toBeNull();
      const content = fs.readFileSync(downloadPath!, "utf-8");
      const saved = JSON.parse(content) as Record<string, unknown>;

      const literals = saved["ecm:literalAssertions"] as Record<string, unknown>[];
      expect(Array.isArray(literals)).toBe(true);
      expect(literals).toHaveLength(1);
      expect(literals[0]["ecm:language"]).toBe("en");
      expect(literals[0]["ecm:value"]).toBe("Alice");
    },
  );

  test(
    "AC3: add then delete literal; save; parse: ecm:literalAssertions empty",
    async ({ page }) => {
      await page.goto("/");
      await page.getByTestId("gw-file-input").setInputFiles(LITERAL_CRUD_FIXTURE);
      await expect(page.getByTestId("gw-btn-save")).toBeEnabled();

      const canvasView = page.getByTestId("gw-canvas-view");
      await expect(canvasView.locator(".react-flow__node")).toHaveCount(1, {
        timeout: 10_000,
      });

      const firstNode = canvasView.locator(".react-flow__node").first();
      const nodeBB = await firstNode.boundingBox();
      expect(nodeBB, "node must have a bounding box").not.toBeNull();
      await page.mouse.click(
        nodeBB!.x + nodeBB!.width / 2,
        nodeBB!.y + nodeBB!.height / 2,
      );

      await expect(page.getByTestId("gw-inspector-instance")).toBeVisible({
        timeout: 5_000,
      });

      // Add a literal.
      await page.getByTestId("gw-btn-add-literal").click();
      await expect(page.getByTestId("gw-dialog-add-literal")).toBeVisible({
        timeout: 3_000,
      });
      await page.getByTestId("gw-input-literal-value").fill("Alice");
      await page.getByTestId("gw-btn-literal-submit").click();
      await expect(page.getByTestId("gw-literal-entry")).toBeVisible({
        timeout: 3_000,
      });

      // Delete the literal.
      await page.getByTestId("gw-btn-delete-literal").click();
      await expect(page.getByTestId("gw-inspector-no-literals")).toBeVisible({
        timeout: 3_000,
      });

      // Save and verify empty array.
      const [download] = await Promise.all([
        page.waitForEvent("download"),
        page.getByTestId("gw-btn-save").click(),
      ]);

      const downloadPath = await download.path();
      expect(downloadPath, "download must be saved to disk").not.toBeNull();
      const content = fs.readFileSync(downloadPath!, "utf-8");
      const saved = JSON.parse(content) as Record<string, unknown>;

      const literals = saved["ecm:literalAssertions"] as unknown[];
      expect(Array.isArray(literals)).toBe(true);
      expect(literals).toHaveLength(0);
    },
  );
});
