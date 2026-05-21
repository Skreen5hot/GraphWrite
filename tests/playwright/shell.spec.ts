import { test, expect } from "@playwright/test";

/**
 * Task 2.1 Chain 1 smoke tests.
 *
 * AC1: App loads in Chromium >= 110 with no JS console errors;
 *      all four layout panels rendered (IMPLEMENTATION_PLAN.md section 2.1).
 * AC5: Bundle served by static file server only (no dynamic routes).
 *      Structurally guaranteed: webServer is 'vite preview' (static-only).
 *      Test confirms app loads and SPA fallback returns 200 for unknown paths.
 *
 * AC2-AC4 (New/Save roundtrip, Open v0.4 roundtrip, migration notice):
 *      implemented in task 2.1 Chain 2.
 */
test.describe("GraphWrite shell (task 2.1 AC1 + AC5)", () => {
  test("AC1: four layout panels visible with no console errors", async ({
    page,
  }) => {
    const consoleErrors: string[] = [];
    page.on("console", (msg) => {
      if (msg.type() === "error") {
        consoleErrors.push(msg.text());
      }
    });

    await page.goto("/");

    await expect(page.getByTestId("gw-header")).toBeVisible();
    await expect(page.getByTestId("gw-sidebar")).toBeVisible();
    await expect(page.getByTestId("gw-canvas")).toBeVisible();
    await expect(page.getByTestId("gw-inspector")).toBeVisible();
    await expect(page.getByTestId("gw-outputs")).toBeVisible();

    expect(consoleErrors, "no JS console errors on load").toHaveLength(0);
  });

  test("AC5: static server -- SPA fallback returns 200 for unknown path", async ({
    page,
  }) => {
    await page.goto("/");
    await expect(page.getByTestId("gw-header")).toBeVisible();

    // vite preview (sirv, appType:spa) falls back to index.html on 404 -> 200.
    const response = await page.goto("/__nonexistent_route__");
    expect(
      response?.status(),
      "vite preview SPA fallback serves 200 for any path",
    ).toBe(200);
  });
});
