/**
 * Task 2.5 IRI Field Affordances -- Playwright acceptance tests.
 * FR-U013 / IMPLEMENTATION_PLAN.md section 2.5.
 *
 * AC1: Already covered by term-crud.spec.ts AC1 (task 2.3 Chain A):
 *      a new term without a custom IRI override receives a urn:uuid: IRI.
 *
 * AC2: Typing a duplicate IRI in AddTermDialog shows an inline warning
 *      (data-testid="gw-iri-duplicate-warning") and disables the Save button
 *      until the IRI is unique or cleared.
 *
 * AC3: Clicking the Regenerate IRI button (data-testid="gw-btn-regenerate-iri")
 *      in EditTermDialog opens the Refactor-IRI confirmation dialog
 *      (gw-dialog-confirm-refactor) with referenceCount > 0 when the term
 *      has at least one referencing instance.
 */

import { test, expect } from "@playwright/test";
import path from "path";

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

test.describe("IRI Field Affordances (task 2.5 FR-U013)", () => {
  test(
    "AC2: Add dialog -- typing a duplicate IRI shows inline warning and disables Save button",
    async ({ page }) => {
      await page.goto("/");

      // Load the 2-class / 1-OP / 1-DP fixture.
      // Existing IRIs include https://example.org/ontology/Person.
      await page.getByTestId("gw-file-input").setInputFiles(SIDEBAR_FIXTURE);
      await expect(page.getByTestId("gw-btn-save")).toBeEnabled();

      // Open the Add Class dialog.
      await page.getByTestId("gw-btn-add-class").click();
      await expect(page.getByTestId("gw-dialog-add-term")).toBeVisible();

      // Fill in a label so the form is otherwise valid.
      await page.getByTestId("gw-input-term-label").fill("Duplicate Test");

      // Type a duplicate IRI (Person already exists in the fixture).
      await page
        .getByTestId("gw-input-term-iri")
        .fill("https://example.org/ontology/Person");

      // Inline warning must be visible immediately after typing.
      await expect(
        page.getByTestId("gw-iri-duplicate-warning"),
      ).toBeVisible();

      // Save button must be disabled while the duplicate IRI is entered.
      await expect(page.getByTestId("gw-btn-term-submit")).toBeDisabled();

      // Clear the IRI override; warning must disappear and Save must re-enable.
      await page.getByTestId("gw-input-term-iri").clear();
      await expect(
        page.getByTestId("gw-iri-duplicate-warning"),
      ).not.toBeVisible();
      await expect(page.getByTestId("gw-btn-term-submit")).toBeEnabled();
    },
  );

  test(
    "AC3: Edit dialog -- Regenerate IRI opens Refactor-IRI confirmation dialog with reference count > 0",
    async ({ page }) => {
      await page.goto("/");

      // Load fixture with Person class + one instance referencing it.
      await page.getByTestId("gw-file-input").setInputFiles(CROSS_REFS_FIXTURE);
      await expect(page.getByTestId("gw-btn-save")).toBeEnabled();

      // Click the Person class item to open EditTermDialog.
      const classesSec = page.getByTestId("gw-term-section-classes");
      await classesSec
        .locator('[role="button"]')
        .filter({ hasText: "Person" })
        .click();

      await expect(page.getByTestId("gw-dialog-edit-term")).toBeVisible();

      // Click the Regenerate IRI button (AC3 FR-U013).
      await page.getByTestId("gw-btn-regenerate-iri").click();

      // The Refactor-IRI confirmation dialog must appear.
      await expect(
        page.getByTestId("gw-dialog-confirm-refactor"),
      ).toBeVisible();

      // Reference count must be > 0: one instance classifies as Person.
      const countEl = page.getByTestId("gw-refactor-reference-count");
      await expect(countEl).toBeVisible();
      const countText = await countEl.innerText();
      const match = /update\s+(\d+)\s+reference/.exec(countText);
      expect(
        match,
        "reference count pattern must be present in confirmation dialog text",
      ).not.toBeNull();
      const count = parseInt(match![1], 10);
      expect(
        count,
        "reference count must be > 0 for a class with a referencing instance",
      ).toBeGreaterThan(0);
    },
  );
});
