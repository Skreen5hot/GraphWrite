import { test, expect, type Page } from "@playwright/test";
import path from "path";
import fs from "fs";

/**
 * Phase 3 Chain 6 sub-task D -- LARGE_IMPORT warning + degraded mode Playwright acceptance tests.
 *
 * Covers IMPLEMENTATION_PLAN section 3.3 acceptance criteria (Playwright subset):
 *
 * AC2: Import warning UI (gw-import-large-warning + gw-import-large-term-count) is
 *      visible after parsing a > 10,000-term Turtle source.
 *      (IMPLEMENTATION_PLAN section 3.3 AC2; SPEC section 14.2)
 *
 * AC3: Clicking Cancel (gw-btn-import-cancel-large) closes the dialog and leaves
 *      the project document unchanged.
 *      (IMPLEMENTATION_PLAN section 3.3 AC3; SPEC section 14.2)
 *
 * AC4: Clicking "Continue in degraded mode" (gw-btn-import-continue-degraded) causes
 *      the saved project to include an ecm:ontologies entry with
 *      ecm:importStatus = "ecm:degraded".
 *      (IMPLEMENTATION_PLAN section 3.3 AC4; SPEC section 14.2)
 *
 * AC5: DOM node count for rendered term-list items ([data-testid="gw-term-item"])
 *      is <= 200 after a degraded import of 10,001 terms (TermSidebar virtualization
 *      active per VIRT_THRESHOLD = 200 + hasDegradedOntology() check).
 *      (IMPLEMENTATION_PLAN section 3.3 AC5; SPEC section 14.2)
 *
 * Fixture strategy: the large Turtle source (10,001 owl:Class triples) is generated
 * programmatically at module load time via generateLargeTurtle() and passed to
 * setInputFiles as an in-memory buffer { name, mimeType, buffer }. No static large
 * .ttl file is committed (Risk 2 mitigation; IMPLEMENTATION_PLAN section 3.3).
 * Pattern mirrors the inline SIZE_EXCEEDED generation in tests/import-turtle.test.ts.
 *
 * SPEC refs: section 14.2, section 12.2.
 * IMPL refs: section 3.3 AC2-AC5.
 */

// ---------------------------------------------------------------------------
// Constants and fixture generator
// ---------------------------------------------------------------------------

const MINIMAL_FIXTURE = path.join(
  process.cwd(),
  "tests",
  "playwright",
  "fixtures",
  "minimal-v0.3.jsonld",
);

/**
 * Term count for the large import fixture.
 * Must exceed LARGE_IMPORT_THRESHOLD (10_000) in turtle-import.ts to trigger
 * the LARGE_IMPORT warning branch (terms.length > LARGE_IMPORT_THRESHOLD).
 */
const LARGE_TTL_TERM_COUNT = 10_001;

/**
 * Programmatically generate a valid Turtle string containing `termCount`
 * owl:Class terms. Each term has a unique named-node IRI and no rdfs:label
 * (minimises N3.js parse overhead). Source size for 10,001 terms is ~450 KB,
 * well within the 50 MB hard limit (SPEC section 12.2).
 *
 * Pattern mirrors tests/import-turtle.test.ts AC5 SIZE_EXCEEDED inline generation
 * (recon finding F15). Avoids committing a multi-hundred-KB static fixture file.
 */
function generateLargeTurtle(termCount: number): string {
  const lines: string[] = [
    "@prefix owl:  <http://www.w3.org/2002/07/owl#> .",
    "",
  ];
  for (let i = 1; i <= termCount; i++) {
    lines.push(`<https://example.org/large/Term${i}> a owl:Class .`);
  }
  return lines.join("\n");
}

/** Pre-generated Turtle content (evaluated once at module load; ~450 KB, <100 ms). */
const LARGE_TTL_CONTENT = generateLargeTurtle(LARGE_TTL_TERM_COUNT);

/**
 * Returns a Playwright setInputFiles buffer payload for the large Turtle fixture.
 * Using an in-memory Buffer avoids writing a temp file and keeps CI hermetic.
 * The dialog only checks file.name.endsWith('.ttl'); mimeType is not inspected.
 */
function largeTtlPayload(): { name: string; mimeType: string; buffer: Buffer } {
  return {
    name: "large-ontology.ttl",
    mimeType: "text/plain",
    buffer: Buffer.from(LARGE_TTL_CONTENT, "utf-8"),
  };
}

// ---------------------------------------------------------------------------
// Shared setup helpers
// ---------------------------------------------------------------------------

/**
 * Navigate to the app root and load the minimal-v0.3.jsonld fixture.
 * Returns after gw-btn-save is enabled (project fully loaded).
 */
async function loadMinimalProject(page: Page): Promise<void> {
  await page.goto("/");
  await page.getByTestId("gw-file-input").setInputFiles(MINIMAL_FIXTURE);
  await expect(page.getByTestId("gw-btn-save")).toBeEnabled();
}

/**
 * Open the Import Ontology dialog, attach the large Turtle buffer, and wait
 * for the large_import_warning panel (gw-import-large-warning) to appear.
 *
 * Allow up to 20 s for N3.js to parse 10,001 triples + Web Crypto sha256 digest
 * in the headless Chromium renderer. Typical runtime is < 2 s; 20 s guards
 * against slow CI machines.
 */
async function openDialogAndParseLarge(page: Page): Promise<void> {
  await page.getByTestId("gw-btn-import-ontology").click();
  await expect(page.getByTestId("gw-dialog-import-ontology")).toBeVisible();

  await page
    .getByTestId("gw-import-file-input")
    .setInputFiles(largeTtlPayload());

  // Wait for ImportOntologyDialog to transition to phase = "large_import_warning".
  // The async path is: FileReader.onload -> await importOntology() (N3.js parse +
  // sha256HexAsync) -> result.warning === "LARGE_IMPORT" -> setPhase("large_import_warning").
  await expect(page.getByTestId("gw-import-large-warning")).toBeVisible({
    timeout: 20_000,
  });
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

test.describe(
  "Large Import Warning and Degraded Mode (IMPL section 3.3 AC2-AC5; SPEC section 14.2)",
  () => {
    test(
      "AC2: Warning UI shows extracted term count after parsing > 10,000-term Turtle source",
      async ({ page }) => {
        await loadMinimalProject(page);
        await openDialogAndParseLarge(page);

        // gw-import-large-warning panel must be visible (phase = large_import_warning).
        await expect(page.getByTestId("gw-import-large-warning")).toBeVisible();

        // gw-import-large-term-count span must be visible and carry the exact count.
        // ImportOntologyDialog renders:
        //   <span data-testid="gw-import-large-term-count">{termCount}</span>
        // where termCount = pending.terms.length (all 10,001 owl:Class terms extracted).
        const termCountEl = page.getByTestId("gw-import-large-term-count");
        await expect(termCountEl).toBeVisible();
        await expect(termCountEl).toHaveText(String(LARGE_TTL_TERM_COUNT));
      },
    );

    test(
      "AC3: Cancel (gw-btn-import-cancel-large) closes dialog and leaves project unchanged",
      async ({ page }) => {
        await loadMinimalProject(page);
        await openDialogAndParseLarge(page);

        // Cancel invokes onClose -> App sets importOntologyDialogOpen(false) -> dialog unmounts.
        await page.getByTestId("gw-btn-import-cancel-large").click();
        await expect(
          page.getByTestId("gw-dialog-import-ontology"),
        ).not.toBeVisible();

        // Project must be unchanged: minimal-v0.3.jsonld has ecm:terms = [] so the
        // Classes section must still render the empty-state message.
        // TermSidebar emits: <p className="gw-term-empty">No classes yet</p>
        await expect(
          page.getByTestId("gw-term-section-classes"),
        ).toContainText("No classes yet");
      },
    );

    test(
      "AC4: Continue in degraded mode -> saved project includes ecm:importStatus = \"ecm:degraded\"",
      async ({ page }) => {
        await loadMinimalProject(page);
        await openDialogAndParseLarge(page);

        // handleContinueDegraded() merges with ecm:importStatus: "ecm:degraded" on the
        // ontology record, then calls onConfirm(updatedProject).
        await page.getByTestId("gw-btn-import-continue-degraded").click();

        // Dialog must close (App.tsx onConfirm -> setImportOntologyDialogOpen(false)).
        await expect(
          page.getByTestId("gw-dialog-import-ontology"),
        ).not.toBeVisible();

        // Save and capture the downloaded JSON-LD.
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

        // ecm:ontologies must include an entry with ecm:importStatus = "ecm:degraded"
        // (SPEC section 14.2; IMPLEMENTATION_PLAN section 3.3 AC4).
        const ontologies = parsed["ecm:ontologies"];
        expect(
          Array.isArray(ontologies),
          "ecm:ontologies must be an array in the saved project",
        ).toBe(true);

        const ontologyArray = ontologies as Array<Record<string, unknown>>;
        const degradedOntology = ontologyArray.find(
          (o) => o["ecm:importStatus"] === "ecm:degraded",
        );
        expect(
          degradedOntology,
          "ecm:ontologies must include a record with ecm:importStatus = \"ecm:degraded\"",
        ).toBeDefined();
      },
    );

    test(
      "AC5: DOM node count for term list is <= 200 after degraded import of 10,001 terms (virtualization active)",
      async ({ page }) => {
        await loadMinimalProject(page);
        await openDialogAndParseLarge(page);

        // Import in degraded mode (mirrors AC4 setup).
        await page.getByTestId("gw-btn-import-continue-degraded").click();
        await expect(
          page.getByTestId("gw-dialog-import-ontology"),
        ).not.toBeVisible();

        // Wait for at least one term item to be rendered. This confirms TermSidebar
        // has re-rendered with the 10,001-term list before taking the count snapshot.
        // (TermSidebar re-renders when App.tsx setProject(updatedProject) propagates.)
        await expect(
          page.locator('[data-testid="gw-term-item"]').first(),
        ).toBeVisible();

        // AC5: total rendered [data-testid="gw-term-item"] nodes on the page must be
        // <= 200. TermSidebar activates scroll-windowing (useVirt = true) when both
        // isDegraded (hasDegradedOntology returns true for ecm:importStatus=ecm:degraded)
        // AND filteredTerms.length > VIRT_THRESHOLD (200). All 10,001 imported owl:Class
        // terms land in the Classes section; at scrollTop = 0 only ~17 <li> nodes are
        // rendered (ceil(192px / 28px) + 2 * OVERSCAN_5 = 7 + 10 = 17).
        //
        // IMPL section 3.3 AC5 references data-testid="gw-term-item-class"; the actual
        // rendered testid in TermSidebar is "gw-term-item" (shared by all term types).
        // Since this fixture imports only owl:Class terms, counting all "gw-term-item"
        // nodes is equivalent. See open_questions in the developer proposal.
        const termItemCount = await page
          .locator('[data-testid="gw-term-item"]')
          .count();

        expect(
          termItemCount,
          `term-list DOM nodes must be <= 200 after virtualized degraded import; actual: ${termItemCount}`,
        ).toBeLessThanOrEqual(200);
      },
    );
  },
);
