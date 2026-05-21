import { test, expect } from "@playwright/test";
import path from "path";
import fs from "fs";

/**
 * Task 2.10 -- Validation Report Panel (FR-U028, SPEC section 17.5).
 *
 * AC1: Fixture produces error + info findings; assert severity badges visible.
 *      NOTE (gap-ac1-warning): IMPLEMENTATION_PLAN.md section 2.10 specifies
 *      "1 error + 1 warning + 1 info" simultaneously. No warning-severity
 *      code is implemented in src/validate/index.ts (Phase 1 scope covers
 *      error + info only; section 17.3 warning codes are follow-up chain C).
 *      The scope constraint for task 2.10 forbids modifying src/validate/*.
 *      This test adapts AC1 to assert 1 error (MISSING_REALIST_ANCHOR) +
 *      1 info (NORMALIZED_ON_SAVE). Re-verify with warning badge when a
 *      warning code is implemented in a follow-up chain.
 * AC2: Acknowledge info finding -> save -> parse: ecm:acknowledged=true.
 *      Adapted from "acknowledge warning" (no warning code available; info
 *      findings are also acknowledgeable per SPEC section 17.5).
 * AC3: Acknowledge info finding -> assert gw-finding-acknowledged class.
 * AC4: Error finding has no acknowledge button (absent from DOM).
 */

const VALIDATION_FIXTURE = path.join(
  process.cwd(),
  "tests",
  "playwright",
  "fixtures",
  "validation-3-findings.jsonld",
);

test.describe("ValidationPanel (task 2.10 FR-U028)", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto("/");
    await page.getByTestId("gw-file-input").setInputFiles(VALIDATION_FIXTURE);
    // Wait for async FileReader + React state update -- Save enabled once project != null.
    await expect(page.getByTestId("gw-btn-save")).toBeEnabled();
  });

  test(
    "AC1: fixture produces 1 error badge and 1 info badge in validation panel",
    async ({ page }) => {
      // Error badge: MISSING_REALIST_ANCHOR
      const errorBadges = page.locator(
        '[data-testid="gw-severity-badge"][data-severity="ecm:error"]',
      );
      await expect(errorBadges).toHaveCount(1);

      // Info badge: NORMALIZED_ON_SAVE
      const infoBadges = page.locator(
        '[data-testid="gw-severity-badge"][data-severity="ecm:info"]',
      );
      await expect(infoBadges).toHaveCount(1);
    },
  );

  test(
    "AC2: acknowledge info finding -> save -> parse: ecm:acknowledged=true in ecm:validationReports",
    async ({ page }) => {
      // Find the info finding item and click Acknowledge.
      const infoItem = page
        .locator('[data-testid="gw-finding-item"][data-severity="ecm:info"]')
        .first();
      await infoItem.getByTestId("gw-btn-acknowledge").click();

      // Save and capture the download.
      const [download] = await Promise.all([
        page.waitForEvent("download"),
        page.getByTestId("gw-btn-save").click(),
      ]);

      const downloadPath = await download.path();
      expect(downloadPath, "download must be saved to disk").not.toBeNull();

      const content = fs.readFileSync(downloadPath!, "utf-8");
      const parsed = JSON.parse(content) as Record<string, unknown>;

      // ecm:validationReports must be present and non-empty.
      const reports = parsed["ecm:validationReports"];
      expect(
        Array.isArray(reports),
        "ecm:validationReports must be an array",
      ).toBe(true);
      expect(
        (reports as unknown[]).length,
        "at least one validation report must be stored",
      ).toBeGreaterThanOrEqual(1);

      // At least one finding in the first report must have ecm:acknowledged=true.
      const firstReport = (reports as Record<string, unknown>[])[0];
      const findings = firstReport["ecm:findings"] as Record<
        string,
        unknown
      >[];
      const ackedFinding = findings.find(
        (f) => f["ecm:acknowledged"] === true,
      );
      expect(
        ackedFinding,
        "at least one finding must have ecm:acknowledged=true after acknowledgement",
      ).toBeDefined();
    },
  );

  test(
    "AC3: acknowledge info finding -> finding item gains gw-finding-acknowledged class",
    async ({ page }) => {
      const infoItem = page
        .locator('[data-testid="gw-finding-item"][data-severity="ecm:info"]')
        .first();

      // Before acknowledgement: class must not be present.
      await expect(infoItem).not.toHaveClass(/gw-finding-acknowledged/);

      // Acknowledge.
      await infoItem.getByTestId("gw-btn-acknowledge").click();

      // After acknowledgement: class must be present.
      await expect(infoItem).toHaveClass(/gw-finding-acknowledged/);
    },
  );

  test(
    "AC4: error finding has no acknowledge button",
    async ({ page }) => {
      const errorItem = page
        .locator('[data-testid="gw-finding-item"][data-severity="ecm:error"]')
        .first();

      // Acknowledge button must be absent from the DOM for error severity findings
      // (SPEC section 17.1: errors block save by default; no suppression affordance).
      await expect(
        errorItem.getByTestId("gw-btn-acknowledge"),
      ).toHaveCount(0);
    },
  );
});
