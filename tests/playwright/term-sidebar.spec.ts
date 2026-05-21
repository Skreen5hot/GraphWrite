import { test, expect } from "@playwright/test";
import path from "path";

/**
 * Task 2.2 -- Term Sidebar acceptance tests.
 *
 * AC1: Project with 2 classes, 1 object property, 1 datatype property shows
 *      exactly those entries in the correct sidebar sections.
 * AC2: A ecm:project-created term shows the "project-created" indicator
 *      (aria-label="ecm:project-created" assertion).
 */

const SIDEBAR_FIXTURE = path.join(
  process.cwd(),
  "tests",
  "playwright",
  "fixtures",
  "term-sidebar-2c-1op-1dp.jsonld",
);

test.describe("TermSidebar (task 2.2)", () => {
  test("AC1: 2 classes / 1 object property / 1 datatype property in correct sections", async ({
    page,
  }) => {
    await page.goto("/");

    // FR-U002: load fixture via hidden file input
    await page.getByTestId("gw-file-input").setInputFiles(SIDEBAR_FIXTURE);

    // Wait for async FileReader + React state update
    await expect(page.getByTestId("gw-btn-save")).toBeEnabled();

    const classesSec = page.getByTestId("gw-term-section-classes");
    const opSec = page.getByTestId("gw-term-section-object-properties");
    const dpSec = page.getByTestId("gw-term-section-datatype-properties");

    await expect(classesSec.getByTestId("gw-term-item")).toHaveCount(2);
    await expect(opSec.getByTestId("gw-term-item")).toHaveCount(1);
    await expect(dpSec.getByTestId("gw-term-item")).toHaveCount(1);
  });

  test("AC2: ecm:project-created term shows project-created source indicator", async ({
    page,
  }) => {
    await page.goto("/");

    await page.getByTestId("gw-file-input").setInputFiles(SIDEBAR_FIXTURE);
    await expect(page.getByTestId("gw-btn-save")).toBeEnabled();

    // Badge aria-label carries the raw ecm: source value (TermSidebar.tsx AC2 contract).
    const badge = page.locator('[aria-label="ecm:project-created"]').first();
    await expect(badge).toBeVisible();
    await expect(badge).toHaveClass(/gw-badge--project-created/);
  });
});
