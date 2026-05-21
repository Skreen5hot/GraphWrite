import { test, expect } from "@playwright/test";
import path from "path";

/**
 * Task 2.8 -- Triple Previews acceptance tests (FR-U020).
 *
 * AC1: Select relation -> gw-triple-narration shows subject label, predicate
 *      label, object label in plain language per FR-C008 template.
 * AC2: gw-triple-iri shows IRI strings in angle-bracket notation.
 *
 * Fixture: canvas-3i-2r-with-ops.jsonld (2 relations, 2 ObjectProperty terms,
 * no rdfs:label on instances -- label fallback is the instance IRI itself).
 *
 * Event 8 lesson applied: raw mouse click via bounding-box center for edge
 * selection, avoiding SVG hit-target ambiguity.
 */

const CANVAS_FIXTURE_WITH_OPS = path.join(
  process.cwd(),
  "tests",
  "playwright",
  "fixtures",
  "canvas-3i-2r-with-ops.jsonld",
);

/** Relation 1 subject IRI; no rdfs:label in fixture so IRI is the label fallback. */
const SUBJECT_IRI = "urn:uuid:c3000000-0000-0000-0000-000000000001";
/** Predicate rdfs:label resolved from ecm:terms in the fixture. */
const PREDICATE_LABEL = "Relates To";
/** Relation 1 object IRI; no rdfs:label in fixture so IRI is the label fallback. */
const OBJECT_IRI = "urn:uuid:c3000000-0000-0000-0000-000000000002";

test.describe("Triple Preview (task 2.8)", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto("/");
    await page.getByTestId("gw-file-input").setInputFiles(CANVAS_FIXTURE_WITH_OPS);
    await expect(page.getByTestId("gw-btn-save")).toBeEnabled();

    const canvasView = page.getByTestId("gw-canvas-view");
    await expect(canvasView.locator(".react-flow__node")).toHaveCount(3, {
      timeout: 10_000,
    });
    await expect(canvasView.locator(".react-flow__edge")).toHaveCount(2, {
      timeout: 5_000,
    });

    // Click the first edge using bounding-box center (Event 8 lesson).
    const firstEdge = canvasView.locator(".react-flow__edge").first();
    const edgeBB = await firstEdge.boundingBox();
    expect(edgeBB, "first edge must have a bounding box").not.toBeNull();
    await page.mouse.click(
      edgeBB!.x + edgeBB!.width / 2,
      edgeBB!.y + edgeBB!.height / 2,
    );

    await expect(page.getByTestId("gw-inspector-relation")).toBeVisible({
      timeout: 5_000,
    });
  });

  test(
    "AC1: gw-triple-narration contains subject label, predicate label, object label",
    async ({ page }) => {
      const narration = page.getByTestId("gw-triple-narration");
      await expect(narration).toBeVisible();
      // Instances have no rdfs:label in the fixture; label fallback is the instance IRI.
      await expect(narration).toContainText(SUBJECT_IRI);
      await expect(narration).toContainText(PREDICATE_LABEL);
      await expect(narration).toContainText(OBJECT_IRI);
    },
  );

  test(
    "AC2: gw-triple-iri shows IRI strings in angle-bracket notation",
    async ({ page }) => {
      const iriTriple = page.getByTestId("gw-triple-iri");
      await expect(iriTriple).toBeVisible();
      await expect(iriTriple).toHaveText(/<.*> <.*> <.*> \./); 
    },
  );
});
