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

    // FR-U001: create a fresh document via NewProjectDialog (FR-U001 amendment)
    await page.getByTestId("gw-btn-new").click();
    await expect(page.getByTestId("gw-dialog-new-project")).toBeVisible();
    await page.getByTestId("gw-btn-new-project-skip").click();

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
    expect(parsed["type"]).toContain("ecm:OntologyDesignPattern");
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

  test(
    "S1-04: ValidationPanel clears MISSING_REALIST_ANCHOR after subject set via Project Settings",
    async ({ page }) => {
      await page.goto("/");

      // Create new project with placeholder (skip dialog) -- MISSING_REALIST_ANCHOR fires.
      await page.getByTestId("gw-btn-new").click();
      await expect(page.getByTestId("gw-dialog-new-project")).toBeVisible();
      await page.getByTestId("gw-btn-new-project-skip").click();
      await expect(page.getByTestId("gw-btn-save")).toBeEnabled();

      // MISSING_REALIST_ANCHOR error must appear in ValidationPanel.
      const errorItem = page.locator(
        '[data-testid="gw-finding-item"][data-code="MISSING_REALIST_ANCHOR"]',
      );
      await expect(errorItem).toBeVisible();

      // Open Project Settings; add a real subject IRI; save.
      await page.getByTestId("gw-btn-project-settings").click();
      await expect(
        page.getByTestId("gw-dialog-project-settings"),
      ).toBeVisible();
      await page
        .getByTestId("gw-input-isabout-iri")
        .fill("https://example.org/subjects/TestSubject");
      await page.getByTestId("gw-btn-add-iri").click();
      await page.getByTestId("gw-btn-settings-save").click();
      await expect(
        page.getByTestId("gw-dialog-project-settings"),
      ).not.toBeVisible();

      // ValidationPanel must clear the MISSING_REALIST_ANCHOR error (S1-04 fix).
      await expect(errorItem).not.toBeVisible();
    },
  );

  test(
    "S4-02: New project has starter terms pre-populated (3 annotation properties per R4)",
    async ({ page }) => {
      await page.goto("/");

      // FR-U001: create a fresh document via NewProjectDialog (skip title/subject)
      await page.getByTestId("gw-btn-new").click();
      await expect(page.getByTestId("gw-dialog-new-project")).toBeVisible();
      await page.getByTestId("gw-btn-new-project-skip").click();
      await expect(page.getByTestId("gw-btn-save")).toBeEnabled();

      // FR-U003: download and parse the new project document
      const [download] = await Promise.all([
        page.waitForEvent("download"),
        page.getByTestId("gw-btn-save").click(),
      ]);

      const downloadPath = await download.path();
      expect(downloadPath, "download must be saved to disk").not.toBeNull();

      const content = fs.readFileSync(downloadPath!, "utf-8");
      const parsed = JSON.parse(content) as Record<string, unknown>;

      // S4-02 (Round 4 corrected): new project includes 3 annotation-property
      // starter terms (rdfs:label, rdfs:comment, rdfs:seeAlso) per SPEC §5.7.
      // Round 3's 16-entry list was reduced per Aaron's R4-STARTER-1/2/4/5 +
      // SME verification (only canonical annotation properties belong here).
      expect(
        Array.isArray(parsed["ecm:terms"]),
        "ecm:terms must be an array",
      ).toBe(true);
      const terms = parsed["ecm:terms"] as unknown[];
      expect(terms.length, "ecm:terms must have 3 annotation-property starter entries").toBe(3);
      const annotationProps = terms.filter((t): t is Record<string, unknown> => {
        return typeof t === "object" && t !== null && (t as Record<string, unknown>)["type"] === "owl:AnnotationProperty";
      });
      expect(annotationProps.length, "all starter terms must be owl:AnnotationProperty").toBe(3);
    },
  );
});
