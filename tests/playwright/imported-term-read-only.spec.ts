import { test, expect } from "@playwright/test";
import path from "path";
import fs from "fs";

/**
 * Phase 3 Chain 3.2-UI sub-task E -- Imported Term Read-Only acceptance tests.
 *
 * AC1: Fixture round-trip: load imported-term.jsonld -> Save -> re-parse:
 *      ecm:source === "ecm:imported-ontology" preserved on the imported term.
 *      (IMPL PLAN section 3.2 AC1; FR-U010)
 *
 * AC2: Clicking an imported term in the sidebar opens the Inspector in
 *      read-only term-mode: imported badge visible; no edit affordance reachable.
 *      (IMPL PLAN section 3.2 AC2; FR-U010)
 */

const IMPORTED_TERM_FIXTURE = path.join(
  process.cwd(),
  "tests",
  "playwright",
  "fixtures",
  "imported-term.jsonld",
);

test.describe("Imported Term Read-Only (Phase 3.2 AC1 + AC2; FR-U010)", () => {
  test(
    "AC1: Open imported-term fixture -> Save -> re-parse: ecm:source preserved as ecm:imported-ontology",
    async ({ page }) => {
      await page.goto("/");

      // FR-U002: load the imported-term fixture via hidden file input.
      await page.getByTestId("gw-file-input").setInputFiles(IMPORTED_TERM_FIXTURE);
      await expect(page.getByTestId("gw-btn-save")).toBeEnabled();

      // FR-U003: save and capture the downloaded file.
      const [download] = await Promise.all([
        page.waitForEvent("download"),
        page.getByTestId("gw-btn-save").click(),
      ]);

      const downloadPath = await download.path();
      expect(downloadPath, "download must be saved to disk").not.toBeNull();

      const content = fs.readFileSync(downloadPath!, "utf-8");
      const parsed = JSON.parse(content) as Record<string, unknown>;

      // ecm:terms must be present and be an array.
      const terms = parsed["ecm:terms"];
      expect(Array.isArray(terms), "ecm:terms must be an array").toBe(true);
      const termArray = terms as Array<Record<string, unknown>>;

      // Locate the imported term entry by its known IRI.
      const importedTerm = termArray.find(
        (t) => t["id"] === "https://example.org/ontology/ImportedClass",
      );
      expect(
        importedTerm,
        "ImportedClass term must be present in ecm:terms after round-trip",
      ).toBeDefined();

      // AC1: ecm:source must survive the Open -> Save -> re-parse round-trip.
      expect(
        importedTerm!["ecm:source"],
        "ecm:source must be ecm:imported-ontology after round-trip",
      ).toBe("ecm:imported-ontology");
    },
  );

  test(
    "AC2: Click imported term in sidebar -> Inspector shows read-only term panel with imported badge; no EditTermDialog",
    async ({ page }) => {
      await page.goto("/");

      // FR-U002: load the imported-term fixture via hidden file input.
      await page.getByTestId("gw-file-input").setInputFiles(IMPORTED_TERM_FIXTURE);
      await expect(page.getByTestId("gw-btn-save")).toBeEnabled();

      const classesSec = page.getByTestId("gw-term-section-classes");

      // Locate the imported class item in the Classes section.
      const importedItem = classesSec
        .getByTestId("gw-term-item")
        .filter({ hasText: "Imported Class" });

      // Structural read-only signal must still be present (negative regression guard;
      // compatible with term-crud.spec.ts AC4 which asserts the same attribute).
      await expect(importedItem).toHaveAttribute("aria-disabled", "true");

      // Click the imported term: onImportedTermClick fires -> selectedTermId set in App.
      await importedItem.click();

      // AC2: Inspector must switch to the read-only imported-term panel.
      await expect(page.getByTestId("gw-inspector-imported-term")).toBeVisible();

      // AC2: imported badge must be visible within the Inspector term panel.
      await expect(
        page.getByTestId("gw-inspector-term-imported-badge"),
      ).toBeVisible();

      // AC2: no edit affordance -- EditTermDialog must not be visible.
      await expect(
        page.getByTestId("gw-dialog-edit-term"),
      ).not.toBeVisible();
    },
  );
});
