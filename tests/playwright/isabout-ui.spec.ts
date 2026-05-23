import { test, expect } from "@playwright/test";
import path from "path";
import fs from "fs";

/**
 * Task 2.9 -- FR-U031 iao:isAbout Declaration UI.
 *
 * AC1: New project shows MISSING_REALIST_ANCHOR indicator banner.
 * AC2: Open settings, add IRI, Save dialog, download file, parse:
 *      iao:isAbout contains the added IRI.
 * AC3: After IRI declaration via settings, indicator banner not visible.
 * AC4: Open v0.3 fixture: LEGACY_REALIST_ANCHOR_PLACEHOLDER indicator +
 *      "Set real subject" affordance visible.
 */

const V03_FIXTURE = path.join(
  process.cwd(),
  "tests",
  "playwright",
  "fixtures",
  "minimal-v0.3.jsonld",
);

test.describe("iao:isAbout Declaration UI (FR-U031 task 2.9)", () => {
  test("AC1: New project (skip dialog) shows subject guidance indicator", async ({
    page,
  }) => {
    await page.goto("/");
    await page.getByTestId("gw-btn-new").click();
    await expect(page.getByTestId("gw-dialog-new-project")).toBeVisible();
    await page.getByTestId("gw-btn-new-project-skip").click();
    // Wait for React state update -- Save becomes enabled once project != null
    await expect(page.getByTestId("gw-btn-save")).toBeEnabled();

    // Per S1-03: muted guidance affordance instead of accusatory banner.
    const guidance = page.getByTestId("gw-subject-guidance");
    await expect(guidance).toBeVisible();
  });

  test(
    "AC2: Add subject IRI via settings dialog; saved file contains the IRI",
    async ({ page }) => {
      await page.goto("/");
      await page.getByTestId("gw-btn-new").click();
      await expect(page.getByTestId("gw-dialog-new-project")).toBeVisible();
      await page.getByTestId("gw-btn-new-project-skip").click();
      await expect(page.getByTestId("gw-btn-save")).toBeEnabled();

      // Open Project Settings dialog
      await page.getByTestId("gw-btn-project-settings").click();
      await expect(
        page.getByTestId("gw-dialog-project-settings"),
      ).toBeVisible();

      // Add a real subject IRI
      await page
        .getByTestId("gw-input-isabout-iri")
        .fill("https://example.org/MySubject");
      await page.getByTestId("gw-btn-add-iri").click();

      // Save dialog -- updates in-memory project
      await page.getByTestId("gw-btn-settings-save").click();
      await expect(
        page.getByTestId("gw-dialog-project-settings"),
      ).not.toBeVisible();

      // Download project JSON-LD
      const [download] = await Promise.all([
        page.waitForEvent("download"),
        page.getByTestId("gw-btn-save").click(),
      ]);
      const downloadPath = await download.path();
      expect(downloadPath, "download must be saved to disk").not.toBeNull();

      const content = fs.readFileSync(downloadPath!, "utf-8");
      const parsed = JSON.parse(content) as Record<string, unknown>;
      const isAbout = parsed["iao:isAbout"];
      expect(
        Array.isArray(isAbout),
        "iao:isAbout must be an array",
      ).toBe(true);
      expect(
        isAbout as string[],
        "iao:isAbout must contain the added IRI",
      ).toContain("https://example.org/MySubject");
    },
  );

  test(
    "AC3: After IRI declaration via settings, subject guidance not visible",
    async ({ page }) => {
      await page.goto("/");
      await page.getByTestId("gw-btn-new").click();
      await expect(page.getByTestId("gw-dialog-new-project")).toBeVisible();
      await page.getByTestId("gw-btn-new-project-skip").click();
      await expect(page.getByTestId("gw-btn-save")).toBeEnabled();

      // Confirm soft guidance is shown before subject declaration (S1-03).
      await expect(page.getByTestId("gw-subject-guidance")).toBeVisible();

      // Open settings, add a real IRI, save dialog
      await page.getByTestId("gw-btn-project-settings").click();
      await page
        .getByTestId("gw-input-isabout-iri")
        .fill("https://example.org/DeclaredSubject");
      await page.getByTestId("gw-btn-add-iri").click();
      await page.getByTestId("gw-btn-settings-save").click();

      // Soft guidance must not be visible after subject is declared.
      await expect(page.getByTestId("gw-subject-guidance")).not.toBeVisible();
    },
  );

  test(
    "AC4: Open v0.3 fixture shows LEGACY_REALIST_ANCHOR_PLACEHOLDER indicator",
    async ({ page }) => {
      await page.goto("/");
      // FR-U002: load v0.3 fixture via hidden file input
      await page.getByTestId("gw-file-input").setInputFiles(V03_FIXTURE);
      // Wait for async FileReader + React state update
      await expect(page.getByTestId("gw-btn-save")).toBeEnabled();

      // Per S1-03: legacy placeholder guidance shown (muted, no red/yellow).
      const legacyGuidance = page.getByTestId("gw-subject-guidance-legacy");
      await expect(legacyGuidance).toBeVisible();

      // "Set real subject" affordance must be present and visible
      const actionBtn = page.getByTestId("gw-btn-subject-guidance-legacy");
      await expect(actionBtn).toBeVisible();
      await expect(actionBtn).toContainText("Set real subject");
    },
  );
});
