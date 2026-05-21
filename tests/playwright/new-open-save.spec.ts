import { test, expect } from "@playwright/test";
import path from "path";
import fs from "fs";

/**
 * Task 2.1 Chain 2 -- AC2 / AC3 / AC4.
 *
 * AC2: New -> Save -> re-parse: downloaded file has ecm:specVersion "0.4",
 *      correct type array, and iao:isAbout array.
 * AC3: Open v0.4 fixture -> Save -> re-parse: bytewise identical to the
 *      original fixture (assumes fixture has LF line endings; see SPEC
 *      section 5.3 rule 7 -- serializeVmp always emits LF).
 * AC4: Open v0.3 fixture -> migration banner visible before any user
 *      action; banner text includes version; banner dismissible.
 *
 * AC1 + AC5 live in tests/playwright/shell.spec.ts (Chain 1).
 */

// Resolve fixture paths from the project root (process.cwd()).
// Playwright is invoked from the project root via 'npm run test:e2e'.
const V04_FIXTURE = path.join(
  process.cwd(),
  "test",
  "fixtures",
  "canonical-v0.4",
  "minimal.jsonld",
);
const V03_FIXTURE = path.join(
  process.cwd(),
  "tests",
  "playwright",
  "fixtures",
  "minimal-v0.3.jsonld",
);

test.describe("GraphWrite shell (task 2.1 AC2 + AC3 + AC4)", () => {
  test("AC2: New -> Save -> re-parse has correct v0.4 fields", async ({
    page,
  }) => {
    await page.goto("/");

    // FR-U001: create a fresh document
    await page.getByTestId("gw-btn-new").click();

    // Wait for React state update -- Save becomes enabled once project != null
    await expect(page.getByTestId("gw-btn-save")).toBeEnabled();

    // FR-U003: save and capture the download
    const [download] = await Promise.all([
      page.waitForEvent("download"),
      page.getByTestId("gw-btn-save").click(),
    ]);

    const downloadPath = await download.path();
    expect(downloadPath, "download must be saved to disk").not.toBeNull();

    const content = fs.readFileSync(downloadPath!, "utf-8");
    const parsed = JSON.parse(content) as Record<string, unknown>;

    expect(parsed["ecm:specVersion"]).toBe("0.4");
    expect(Array.isArray(parsed["type"]), "type must be an array").toBe(true);
    expect(parsed["type"]).toContain("ecm:Project");
    expect(parsed["type"]).toContain("iao:OntologyDesignPattern");
    expect(
      Array.isArray(parsed["iao:isAbout"]),
      "iao:isAbout must be an array",
    ).toBe(true);
    expect(
      (parsed["iao:isAbout"] as string[]).length,
      "iao:isAbout must be non-empty",
    ).toBeGreaterThan(0);
  });

  test(
    "AC3: Open v0.4 fixture -> Save -> downloaded content bytewise identical to fixture",
    async ({ page }) => {
      await page.goto("/");

      // FR-U002: load v0.4 fixture via hidden file input (no OS dialog)
      await page.getByTestId("gw-file-input").setInputFiles(V04_FIXTURE);

      // Wait for async FileReader + React state update
      await expect(page.getByTestId("gw-btn-save")).toBeEnabled();

      // FR-U003: save and capture
      const [download] = await Promise.all([
        page.waitForEvent("download"),
        page.getByTestId("gw-btn-save").click(),
      ]);

      const downloadPath = await download.path();
      expect(downloadPath, "download must be saved to disk").not.toBeNull();

      const downloaded = fs.readFileSync(downloadPath!, "utf-8");
      const original = fs.readFileSync(V04_FIXTURE, "utf-8");

      expect(
        downloaded,
        "saved content must be bytewise identical to the v0.4 fixture",
      ).toBe(original);
    },
  );

  test(
    "AC4: Open v0.3 fixture -> migration banner visible; banner dismissible",
    async ({ page }) => {
      await page.goto("/");

      // FR-U002: load v0.3 fixture via hidden file input
      await page.getByTestId("gw-file-input").setInputFiles(V03_FIXTURE);

      // FR-U029: migration banner must appear before any additional user action
      const banner = page.getByTestId("gw-migration-banner");
      await expect(banner).toBeVisible();

      // Banner text must name source and target versions
      await expect(banner).toContainText("migrated from v0.3 to v0.4");

      // Dismiss removes the banner from the DOM
      await page.getByTestId("gw-migration-dismiss").click();
      await expect(banner).not.toBeVisible();
    },
  );
});
