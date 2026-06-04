import { test, expect } from "@playwright/test";
import path from "path";

/**
 * Phase 3 Chain 8 sub-task PW -- Scope Filter Playwright acceptance tests.
 *
 * Covers IMPLEMENTATION_PLAN section 3.4 AC2:
 * "Project-created only filter hides all imported terms."
 *
 * Tests:
 * AC2a: Selecting "Project-created only" removes the imported term from the
 *       Classes section and leaves the project-created term visible.
 * AC2b: Selecting "Imported only" removes the project-created term from the
 *       Classes section and leaves the imported term visible.
 * AC2c: Switching back to "All" after "Project-created only" restores both
 *       terms in the Classes section.
 * ACd:  Degraded-mode affordance (Q-CONFIRM-1 verdict; IMPL section 3.4
 *       sub-task 3): when isDegraded is true and the per-section search query
 *       is empty, TermSection renders "Search to find terms" in place of the
 *       term list, preventing scroll-based navigation.
 *
 * Fixture strategy for AC2a-AC2c:
 *   Reuses tests/playwright/fixtures/imported-term.jsonld (Chain 3.2-UI).
 *   That fixture contains exactly one owl:Class imported term ("Imported Class",
 *   ecm:source: "ecm:imported-ontology") and one owl:Class project-created term
 *   ("Local Class", ecm:source: "ecm:project-created"). Both land in the Classes
 *   section, providing the minimal deterministic setup for the filter assertion.
 *
 * Fixture strategy for ACd:
 *   Programmatic in-memory JSON-LD with ecm:importStatus: "ecm:degraded" on its
 *   ecm:ontologies entry and a single owl:Class term. Generated as a Buffer and
 *   passed to setInputFiles -- mirrors the large-import.spec.ts in-memory pattern.
 *   hasDegradedOntology() in TermSidebar.tsx reads ecm:importStatus directly from
 *   the parsed JSON, so a full JSON-LD expansion is not required at runtime.
 *
 * SPEC refs: FR-U005, section 14.2.
 * IMPL refs: IMPLEMENTATION_PLAN section 3.4 AC2, sub-task 2, sub-task 3.
 */

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const IMPORTED_TERM_FIXTURE = path.join(
  process.cwd(),
  "tests",
  "playwright",
  "fixtures",
  "imported-term.jsonld",
);

/**
 * Minimal JSON-LD project document whose ecm:ontologies entry carries
 * ecm:importStatus: "ecm:degraded". hasDegradedOntology() in TermSidebar.tsx
 * returns true for this document, so TermSection renders the degraded hint
 * ("Search to find terms") when searchQuery is empty.
 *
 * One owl:Class term is included so the Classes section is non-empty; the
 * degraded hint renders regardless of term count because the isDegraded branch
 * fires before the filteredTerms.length check.
 */
const DEGRADED_FIXTURE_JSON = JSON.stringify({
  "@context": {
    ecm: "https://edgecanonical.org/ns/modeler#",
    "ecm:instances": { "@container": "@set" },
    "ecm:layouts": { "@container": "@set" },
    "ecm:literalAssertions": { "@container": "@set" },
    "ecm:ontologies": { "@container": "@set" },
    "ecm:relations": { "@container": "@set" },
    "ecm:serializations": { "@container": "@set" },
    "ecm:snapshots": { "@container": "@set" },
    "ecm:terms": { "@container": "@set" },
    id: "@id",
    owl: "http://www.w3.org/2002/07/owl#",
    rdfs: "http://www.w3.org/2000/01/rdf-schema#",
    type: "@type",
  },
  id: "urn:uuid:00000000-0000-0000-0000-000000000099",
  type: ["ecm:OntologyDesignPattern", "ecm:Project"],
  "ecm:specVersion": "0.4",
  "ecm:createdAt": "2026-01-01T00:00:00Z",
  "ecm:name": "Degraded Scope Filter Test Fixture",
  "ecm:instances": [],
  "ecm:layouts": [],
  "ecm:literalAssertions": [],
  "ecm:ontologies": [
    {
      id: "urn:uuid:00000000-0000-0000-0000-000000000098",
      "ecm:importStatus": "ecm:degraded",
    },
  ],
  "ecm:relations": [],
  "ecm:serializations": [],
  "ecm:snapshots": [],
  "ecm:terms": [
    {
      id: "https://example.org/degraded/TestClass",
      type: "owl:Class",
      "rdfs:label": { text: "Degraded Test Class", lang: "en" },
      "ecm:source": "ecm:imported-ontology",
      "ecm:ontologyId": null,
      "ecm:createdAt": "2026-01-01T00:00:00Z",
      "ecm:updatedAt": "2026-01-01T00:00:00Z",
    },
  ],
  "ecm:updatedAt": "2026-01-01T00:00:00Z",
});

/**
 * Returns a Playwright setInputFiles buffer payload for the degraded fixture.
 * Using an in-memory Buffer avoids writing a temp file and keeps CI hermetic.
 * The file name uses the .jsonld extension expected by the gw-file-input handler.
 */
function degradedFixturePayload(): {
  name: string;
  mimeType: string;
  buffer: Buffer;
} {
  return {
    name: "degraded-scope-filter.jsonld",
    mimeType: "application/ld+json",
    buffer: Buffer.from(DEGRADED_FIXTURE_JSON, "utf-8"),
  };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

test.describe(
  "Scope Filter (IMPL section 3.4 AC2; SPEC FR-U005)",
  () => {
    test(
      "AC2a: 'Project-created only' filter removes imported term from Classes section; project-created term remains visible",
      async ({ page }) => {
        await page.goto("/");
        await page
          .getByTestId("gw-file-input")
          .setInputFiles(IMPORTED_TERM_FIXTURE);
        await expect(page.getByTestId("gw-btn-save")).toBeEnabled();

        const classesSec = page.getByTestId("gw-term-section-classes");
        const importedItem = classesSec
          .getByTestId("gw-term-item")
          .filter({ hasText: "Imported Class" });
        const localItem = classesSec
          .getByTestId("gw-term-item")
          .filter({ hasText: "Local Class" });

        // Baseline: both terms visible before any filter is applied.
        await expect(importedItem).toBeVisible();
        await expect(localItem).toBeVisible();

        // Select "Project-created only" via the global scope filter.
        await page
          .getByTestId("gw-term-scope-filter-global")
          .selectOption("project-created");

        // AC2a: imported term must be absent from the DOM (scopeFilter filters
        // out ecm:imported-ontology terms before React renders the list).
        await expect(importedItem).toHaveCount(0);
        // AC2a: project-created term must remain visible.
        await expect(localItem).toBeVisible();
      },
    );

    test(
      "AC2b: 'Imported only' filter removes project-created term from Classes section; imported term remains visible",
      async ({ page }) => {
        await page.goto("/");
        await page
          .getByTestId("gw-file-input")
          .setInputFiles(IMPORTED_TERM_FIXTURE);
        await expect(page.getByTestId("gw-btn-save")).toBeEnabled();

        const classesSec = page.getByTestId("gw-term-section-classes");
        const importedItem = classesSec
          .getByTestId("gw-term-item")
          .filter({ hasText: "Imported Class" });
        const localItem = classesSec
          .getByTestId("gw-term-item")
          .filter({ hasText: "Local Class" });

        // Select "Imported only" via the global scope filter.
        await page
          .getByTestId("gw-term-scope-filter-global")
          .selectOption("imported");

        // AC2b: project-created term must be absent from the DOM.
        await expect(localItem).toHaveCount(0);
        // AC2b: imported term must remain visible.
        await expect(importedItem).toBeVisible();
      },
    );

    test(
      "AC2c: Switching back to 'All' after 'Project-created only' restores both terms in the Classes section",
      async ({ page }) => {
        await page.goto("/");
        await page
          .getByTestId("gw-file-input")
          .setInputFiles(IMPORTED_TERM_FIXTURE);
        await expect(page.getByTestId("gw-btn-save")).toBeEnabled();

        const classesSec = page.getByTestId("gw-term-section-classes");
        const importedItem = classesSec
          .getByTestId("gw-term-item")
          .filter({ hasText: "Imported Class" });
        const localItem = classesSec
          .getByTestId("gw-term-item")
          .filter({ hasText: "Local Class" });

        // Apply "Project-created only" to hide imported term.
        await page
          .getByTestId("gw-term-scope-filter-global")
          .selectOption("project-created");
        await expect(importedItem).toHaveCount(0);

        // Reset to "All".
        await page
          .getByTestId("gw-term-scope-filter-global")
          .selectOption("all");

        // AC2c: both terms must be visible again after the reset.
        await expect(importedItem).toBeVisible();
        await expect(localItem).toBeVisible();
      },
    );

    test(
      "ACd: Degraded mode + empty search shows 'Search to find terms' in place of term list (IMPL section 3.4 sub-task 3; Q-CONFIRM-1 affordance)",
      async ({ page }) => {
        await page.goto("/");

        // Load degraded fixture via in-memory buffer (mirrors large-import.spec.ts pattern).
        // hasDegradedOntology() in TermSidebar.tsx reads ecm:importStatus: "ecm:degraded"
        // from ecm:ontologies and sets isDegraded = true.
        await page
          .getByTestId("gw-file-input")
          .setInputFiles(degradedFixturePayload());
        await expect(page.getByTestId("gw-btn-save")).toBeEnabled();

        const classesSec = page.getByTestId("gw-term-section-classes");

        // ACd: When isDegraded === true and searchQuery is empty, TermSection renders
        // the degraded hint (IMPL section 3.4 sub-task 3; TermSidebar.tsx isDegraded branch).
        await expect(
          classesSec.getByText("Search to find terms"),
        ).toBeVisible();

        // ACd: No gw-term-item nodes should be rendered in the Classes section;
        // the list is suppressed in favour of the degraded navigation hint.
        await expect(
          classesSec.getByTestId("gw-term-item"),
        ).toHaveCount(0);
      },
    );
  },
);
