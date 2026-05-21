import { test, expect } from "@playwright/test";
import path from "path";
import fs from "fs";

/**
 * Task 2.3 Chain A -- Term CRUD acceptance tests.
 *
 * AC1: Add class form: new owl:Class entry appears in ecm:terms with a valid
 *      urn:uuid: IRI after save.
 *
 * Chain B: AC2 (Edit label) + AC3 (Edit IRI / Refactor-IRI dialog).
 * Chain C: AC4 (Imported term read-only stub; FR-U010).
 */

const SIDEBAR_FIXTURE = path.join(
  process.cwd(),
  "tests",
  "playwright",
  "fixtures",
  "term-sidebar-2c-1op-1dp.jsonld",
);

const CROSS_REFS_FIXTURE = path.join(
  process.cwd(),
  "tests",
  "playwright",
  "fixtures",
  "term-sidebar-cross-refs.jsonld",
);

const IMPORTED_TERM_FIXTURE = path.join(
  process.cwd(),
  "tests",
  "playwright",
  "fixtures",
  "imported-term.jsonld",
);

test.describe("Term CRUD (task 2.3 Chain A)", () => {
  test(
    "AC1: Add class -> Save -> re-parse: new owl:Class in ecm:terms with urn:uuid: IRI",
    async ({ page }) => {
      await page.goto("/");

      // Load the 2-class / 1-OP / 1-DP fixture.
      await page.getByTestId("gw-file-input").setInputFiles(SIDEBAR_FIXTURE);
      await expect(page.getByTestId("gw-btn-save")).toBeEnabled();

      // Open the Add Class dialog via the "+" button in the Classes section header.
      await page.getByTestId("gw-btn-add-class").click();
      await expect(page.getByTestId("gw-dialog-add-term")).toBeVisible();

      // Fill in the label; leave IRI override blank for auto-generation.
      await page.getByTestId("gw-input-term-label").fill("Test Class");

      // Submit.
      await page.getByTestId("gw-btn-term-submit").click();

      // Dialog must close after successful submit.
      await expect(
        page.getByTestId("gw-dialog-add-term"),
      ).not.toBeVisible();

      // Classes section must now show 3 items (2 original + 1 new).
      const classesSec = page.getByTestId("gw-term-section-classes");
      await expect(classesSec.getByTestId("gw-term-item")).toHaveCount(3);

      // Save and capture the downloaded file.
      const [download] = await Promise.all([
        page.waitForEvent("download"),
        page.getByTestId("gw-btn-save").click(),
      ]);

      const downloadPath = await download.path();
      expect(downloadPath, "download must be saved to disk").not.toBeNull();

      const content = fs.readFileSync(downloadPath!, "utf-8");
      const parsed = JSON.parse(content) as Record<string, unknown>;

      // ecm:terms must contain the new entry.
      const terms = parsed["ecm:terms"];
      expect(Array.isArray(terms), "ecm:terms must be an array").toBe(true);
      const termArray = terms as Array<Record<string, unknown>>;

      // Fixture has 4 terms; after adding 1 the total must be 5.
      expect(
        termArray.length,
        "ecm:terms length must be 5 after adding 1 term",
      ).toBe(5);

      // Locate the new entry by label + source + type.
      const newClass = termArray.find(
        (t) =>
          t["type"] === "owl:Class" &&
          t["rdfs:label"] === "Test Class" &&
          t["ecm:source"] === "ecm:project-created",
      );
      expect(newClass, "new owl:Class entry must be in ecm:terms").toBeDefined();

      // IRI must match the auto-generation policy (urn:uuid: prefix).
      const newIri = newClass!["id"];
      expect(typeof newIri, "new term id must be a string").toBe("string");
      expect(
        (newIri as string).startsWith("urn:uuid:"),
        "auto-generated IRI must start with urn:uuid:",
      ).toBe(true);
    },
  );

  test(
    "AC2: Edit class label -> Save -> re-parse: rdfs:label updated",
    async ({ page }) => {
      await page.goto("/");

      // Load the 2-class / 1-OP / 1-DP fixture (Person is project-created).
      await page.getByTestId("gw-file-input").setInputFiles(SIDEBAR_FIXTURE);
      await expect(page.getByTestId("gw-btn-save")).toBeEnabled();

      // Click the Person class item ([role="button"] = project-created only).
      const classesSec = page.getByTestId("gw-term-section-classes");
      await classesSec
        .locator('[role="button"]')
        .filter({ hasText: "Person" })
        .click();

      await expect(page.getByTestId("gw-dialog-edit-term")).toBeVisible();

      // Replace the label.
      await page.getByTestId("gw-input-edit-label").clear();
      await page.getByTestId("gw-input-edit-label").fill("Person (Edited)");

      // Submit -- IRI unchanged, so no confirmation dialog expected.
      await page.getByTestId("gw-btn-edit-submit").click();

      // Dialog must close after successful submit.
      await expect(
        page.getByTestId("gw-dialog-edit-term"),
      ).not.toBeVisible();

      // Save and capture the downloaded file.
      const [download] = await Promise.all([
        page.waitForEvent("download"),
        page.getByTestId("gw-btn-save").click(),
      ]);

      const downloadPath = await download.path();
      expect(downloadPath, "download must be saved to disk").not.toBeNull();

      const content = fs.readFileSync(downloadPath!, "utf-8");
      const parsed = JSON.parse(content) as Record<string, unknown>;
      const terms = parsed["ecm:terms"] as Array<Record<string, unknown>>;

      const person = terms.find(
        (t) => t["id"] === "https://example.org/ontology/Person",
      );
      expect(person, "Person term must still be in ecm:terms").toBeDefined();
      expect(
        person!["rdfs:label"],
        "rdfs:label must reflect the edited value",
      ).toBe("Person (Edited)");
    },
  );

  test(
    "AC3: Edit class IRI -> confirmation dialog appears with reference count > 0",
    async ({ page }) => {
      await page.goto("/");

      // Load fixture with Person class + one instance referencing it.
      await page.getByTestId("gw-file-input").setInputFiles(CROSS_REFS_FIXTURE);
      await expect(page.getByTestId("gw-btn-save")).toBeEnabled();

      // Click the Person class item.
      const classesSec = page.getByTestId("gw-term-section-classes");
      await classesSec
        .locator('[role="button"]')
        .filter({ hasText: "Person" })
        .click();

      await expect(page.getByTestId("gw-dialog-edit-term")).toBeVisible();

      // Change the IRI to a new value.
      await page.getByTestId("gw-input-edit-iri").clear();
      await page
        .getByTestId("gw-input-edit-iri")
        .fill("https://example.org/ontology/Human");

      // Submit -- IRI changed, so confirmation dialog must appear.
      await page.getByTestId("gw-btn-edit-submit").click();

      // Edit dialog must be replaced by the confirmation dialog.
      await expect(
        page.getByTestId("gw-dialog-confirm-refactor"),
      ).toBeVisible();

      // Reference count must be > 0 (one instance classifies as Person).
      const countEl = page.getByTestId("gw-refactor-reference-count");
      await expect(countEl).toBeVisible();
      const countText = await countEl.innerText();
      const match = /update\s+(\d+)\s+reference/.exec(countText);
      expect(match, "reference count pattern must be present").not.toBeNull();
      const count = parseInt(match![1], 10);
      expect(
        count,
        "reference count must be > 0 for a class with an instance",
      ).toBeGreaterThan(0);
    },
  );

  test(
    "AC4: Imported term read-only: aria-disabled present; click does not open EditTermDialog (FR-U010; Chain C)",
    async ({ page }) => {
      await page.goto("/");

      await page.getByTestId("gw-file-input").setInputFiles(IMPORTED_TERM_FIXTURE);
      await expect(page.getByTestId("gw-btn-save")).toBeEnabled();

      const classesSec = page.getByTestId("gw-term-section-classes");

      // Locate the imported class in the Classes section.
      const importedItem = classesSec
        .getByTestId("gw-term-item")
        .filter({ hasText: "Imported Class" });

      // Structural read-only signal: aria-disabled="true" must be present (FR-U010; Chain C).
      await expect(importedItem).toHaveAttribute("aria-disabled", "true");

      // Imported-ontology terms must NOT carry role="button".
      await expect(importedItem).not.toHaveAttribute("role", "button");

      // Clicking the imported term must NOT open the EditTermDialog.
      await importedItem.click();
      await expect(
        page.getByTestId("gw-dialog-edit-term"),
      ).not.toBeVisible();
    },
  );
});
