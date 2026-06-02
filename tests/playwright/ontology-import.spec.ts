import { test, expect } from "@playwright/test";
import path from "path";
import fs from "fs";

/**
 * Phase 3 Chain 4 sub-task D -- Ontology Import E2E acceptance tests.
 *
 * AC1-5 (happy path):
 *   Launch app -> load minimal-v0.3.jsonld project -> click gw-btn-import-ontology ->
 *   attach sample-ontology.ttl via gw-import-file-input ->
 *   gw-import-preview-count shows "5 terms ready to import." ->
 *   click gw-btn-import-confirm -> dialog closes -> sidebar Classes section shows
 *   Animal / Dog / Cat with aria-disabled="true" (imported read-only treatment;
 *   SPEC section 13.3; FR-U010); Object Properties shows "has pet"; Datatype
 *   Properties shows "pet name".
 *   (IMPLEMENTATION_PLAN section 3.1 AC1-AC5; FR-C011)
 *
 * AC6 (round-trip):
 *   Save after import -> re-parse downloaded JSON-LD ->
 *   all five imported terms carry ecm:source === "ecm:imported-ontology";
 *   ecm:ontologies has one entry with ecm:format === "text/turtle".
 *   (IMPLEMENTATION_PLAN section 3.1 AC6; mirrors Chain 3.2-UI AC1; FR-C011)
 */

const MINIMAL_FIXTURE = path.join(
  process.cwd(),
  "tests",
  "playwright",
  "fixtures",
  "minimal-v0.3.jsonld",
);

const SAMPLE_ONTOLOGY = path.join(
  process.cwd(),
  "tests",
  "playwright",
  "fixtures",
  "sample-ontology.ttl",
);

test.describe("Ontology Import (Phase 3 Chain 4 AC1-AC6; FR-C011)", () => {
  test(
    "AC1-5: Load project -> open dialog -> attach .ttl -> verify preview count -> confirm -> sidebar shows imported terms",
    async ({ page }) => {
      await page.goto("/");

      // Step 1: Load a project so gw-btn-import-ontology is enabled.
      await page.getByTestId("gw-file-input").setInputFiles(MINIMAL_FIXTURE);
      await expect(page.getByTestId("gw-btn-save")).toBeEnabled();
      await expect(page.getByTestId("gw-btn-import-ontology")).toBeEnabled();

      // Step 2: Open Import Ontology dialog.
      await page.getByTestId("gw-btn-import-ontology").click();
      await expect(
        page.getByTestId("gw-dialog-import-ontology"),
      ).toBeVisible();

      // Step 3: Attach the Turtle fixture to the hidden file input inside the dialog.
      // (3 owl:Class + 1 owl:ObjectProperty + 1 owl:DatatypeProperty = 5 terms)
      // setInputFiles bypasses the Browse button; works on display:none inputs (Playwright contract).
      await page
        .getByTestId("gw-import-file-input")
        .setInputFiles(SAMPLE_ONTOLOGY);

      // Step 4: Preview count must appear once async FileReader + crypto.subtle.digest
      // + importOntology completes. Auto-retry waits up to expect.timeout.
      await expect(
        page.getByTestId("gw-import-preview-count"),
      ).toBeVisible();
      await expect(
        page.getByTestId("gw-import-preview-count"),
      ).toContainText("5 terms ready to import.");

      // Step 5: Import confirm button enabled once preview is ready.
      await expect(
        page.getByTestId("gw-btn-import-confirm"),
      ).toBeEnabled();
      await page.getByTestId("gw-btn-import-confirm").click();

      // Step 6a: Dialog must close after confirm (parent sets importOntologyDialogOpen=false).
      await expect(
        page.getByTestId("gw-dialog-import-ontology"),
      ).not.toBeVisible();

      // Step 6b: Classes section must show the three imported classes.
      const classesSec = page.getByTestId("gw-term-section-classes");

      const animalItem = classesSec
        .getByTestId("gw-term-item")
        .filter({ hasText: "Animal" });
      await expect(animalItem).toBeVisible();
      // Imported visual treatment: aria-disabled="true" (FR-U010; SPEC section 13.3).
      await expect(animalItem).toHaveAttribute("aria-disabled", "true");

      const dogItem = classesSec
        .getByTestId("gw-term-item")
        .filter({ hasText: "Dog" });
      await expect(dogItem).toBeVisible();
      await expect(dogItem).toHaveAttribute("aria-disabled", "true");

      const catItem = classesSec
        .getByTestId("gw-term-item")
        .filter({ hasText: "Cat" });
      await expect(catItem).toBeVisible();
      await expect(catItem).toHaveAttribute("aria-disabled", "true");

      // Step 6c: Object Properties section shows the imported ObjectProperty.
      const opSec = page.getByTestId("gw-term-section-object-properties");
      const hasPetItem = opSec
        .getByTestId("gw-term-item")
        .filter({ hasText: "has pet" });
      await expect(hasPetItem).toBeVisible();
      await expect(hasPetItem).toHaveAttribute("aria-disabled", "true");

      // Step 6d: Datatype Properties section shows the imported DatatypeProperty.
      const dpSec = page.getByTestId(
        "gw-term-section-datatype-properties",
      );
      const petNameItem = dpSec
        .getByTestId("gw-term-item")
        .filter({ hasText: "pet name" });
      await expect(petNameItem).toBeVisible();
      await expect(petNameItem).toHaveAttribute("aria-disabled", "true");
    },
  );

  test(
    "AC6 (round-trip): Save after import -> re-parse -> ecm:source and ecm:ontologies entry preserved",
    async ({ page }) => {
      await page.goto("/");

      // Setup: load project + run the full import flow (mirrors AC1-5 setup).
      await page.getByTestId("gw-file-input").setInputFiles(MINIMAL_FIXTURE);
      await expect(page.getByTestId("gw-btn-save")).toBeEnabled();

      await page.getByTestId("gw-btn-import-ontology").click();
      await expect(
        page.getByTestId("gw-dialog-import-ontology"),
      ).toBeVisible();
      await page
        .getByTestId("gw-import-file-input")
        .setInputFiles(SAMPLE_ONTOLOGY);
      await expect(
        page.getByTestId("gw-import-preview-count"),
      ).toBeVisible();
      await page.getByTestId("gw-btn-import-confirm").click();
      await expect(
        page.getByTestId("gw-dialog-import-ontology"),
      ).not.toBeVisible();

      // AC6: Save -> capture downloaded JSON-LD -> re-parse.
      const [download] = await Promise.all([
        page.waitForEvent("download"),
        page.getByTestId("gw-btn-save").click(),
      ]);

      const downloadPath = await download.path();
      expect(
        downloadPath,
        "download must be saved to disk",
      ).not.toBeNull();

      const content = fs.readFileSync(downloadPath!, "utf-8");
      const parsed = JSON.parse(content) as Record<string, unknown>;

      // ecm:terms must be present and contain exactly five imported terms.
      const terms = parsed["ecm:terms"];
      expect(
        Array.isArray(terms),
        "ecm:terms must be an array",
      ).toBe(true);

      const importedTerms = (
        terms as Array<Record<string, unknown>>
      ).filter((t) => t["ecm:source"] === "ecm:imported-ontology");
      expect(
        importedTerms.length,
        "all five imported terms must survive round-trip with ecm:source = ecm:imported-ontology",
      ).toBe(5);

      // ecm:ontologies must contain one entry from the import.
      const ontologies = parsed["ecm:ontologies"];
      expect(
        Array.isArray(ontologies),
        "ecm:ontologies must be an array",
      ).toBe(true);
      const ontologyArray = ontologies as Array<Record<string, unknown>>;
      expect(
        ontologyArray.length,
        "one imported ontology record must be present in ecm:ontologies",
      ).toBeGreaterThanOrEqual(1);

      // The imported ontology record must carry ecm:format = "text/turtle"
      // (IMPLEMENTATION_PLAN section 3.1 AC4; SPEC section 5.6).
      const importedOntology = ontologyArray.find(
        (o) => o["ecm:format"] === "text/turtle",
      );
      expect(
        importedOntology,
        "imported ontology record must carry ecm:format = \"text/turtle\"",
      ).toBeDefined();
    },
  );
});
