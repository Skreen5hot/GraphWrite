# GraphWrite UI Walkthrough

A guided tour of the deployed UI at **https://skreen5hot.github.io/GraphWrite/** for structured testing and feedback. Run through each step, note what does/doesn't work, and what feels intuitive vs confusing.

---

## Setup

1. Open **https://skreen5hot.github.io/GraphWrite/** in Chrome (or any modern browser).
2. Download the demo project: [demo/library-catalog.jsonld](library-catalog.jsonld) — right-click → Save Link As, or download from the repo at [github.com/Skreen5hot/GraphWrite/blob/main/demo/library-catalog.jsonld](https://github.com/Skreen5hot/GraphWrite/blob/main/demo/library-catalog.jsonld) → Raw → Save As. Save it somewhere you can find (Desktop is fine).

The demo file contains a small **Library Catalog** project with 3 classes (Book / Author / Publisher), 2 object properties (writtenBy / publishedBy), 2 datatype properties (hasISBN / hasPublicationYear), 5 instances, 3 relations, and 3 literal assertions. Already canvas-laid-out so you see a meaningful graph immediately.

---

## Section 1 — First impressions (empty new project)

**Action:** On the live site, click **New** in the header.

**What you should see:**
- 4-panel layout: header (with action buttons) / left sidebar (Term Manager) / center canvas (empty) / right sidebar (Inspector — empty) / bottom panel (Validation Report — should show `MISSING_REALIST_ANCHOR` since no subject IRI declared).
- A red banner near the top: **"MISSING_REALIST_ANCHOR"** indicator.
- All sidebar sections empty ("No classes yet" / "No object properties yet" / "No datatype properties yet").

**Feedback to note:**
- [ ] Are the 4 panels visually distinct enough?
- [ ] Is it obvious what each panel is for?
- [ ] Is the missing-anchor banner prominent enough? Too prominent?
- [ ] What would you click first if you didn't know the app?

---

## Section 2 — Loading the demo project (Open flow)

**Action:** Click **Open** in the header. Pick the `library-catalog.jsonld` file you downloaded.

**What you should see:**
- Term sidebar populates with 3 classes (Author / Book / Publisher), 2 object properties (publishedBy / writtenBy), 2 datatype properties (hasISBN / hasPublicationYear), each with a small badge saying "project-created".
- Canvas shows 5 nodes laid out in a 2×2+1 pattern: Dune + Foundation on the left (books); Frank Herbert + Isaac Asimov in the middle (authors); Chilton Books on the right (publisher).
- 3 edges connecting them: Dune→Frank Herbert, Foundation→Isaac Asimov, Dune→Chilton Books.
- The MISSING_REALIST_ANCHOR banner is **gone** (this project declares `iao:isAbout: LibraryCatalog`).
- Validation panel at bottom: should be empty or show only info-level findings (no errors).

**Feedback to note:**
- [ ] Did the file load cleanly, or did anything look broken?
- [ ] Are the node labels readable?
- [ ] Are the relation edges visible? Do they point in the right direction?
- [ ] Do you understand what each sidebar item represents?

---

## Section 3 — Inspecting an existing relation (Inspector + Triple Preview)

**Action:** Click on the edge from **Dune** to **Frank Herbert** in the canvas.

**What you should see (in the right Inspector panel):**
- Header: "Relation"
- Subject: Dune (the book)
- Predicate: dropdown showing "writtenBy" selected
- Object: Frank Herbert (the author)
- Triple Preview section:
  - Plain-language narration: `Dune (Book) writtenBy Frank Herbert (Author)`
  - Angle-bracket triple: `<urn:uuid:...0001> <urn:uuid:...0004> <urn:uuid:...0003> .`
- Buttons: **Reverse**, **Delete**

**Feedback to note:**
- [ ] Is the Inspector content clear?
- [ ] Is "Triple Preview" useful? Do you understand what it's showing?
- [ ] Are Reverse / Delete buttons appropriately placed?
- [ ] Would you ever use the angle-bracket triple form?

---

## Section 4 — Editing a relation (predicate dropdown)

**Action:** With the Dune→Frank Herbert edge still selected, click the predicate dropdown and pick **publishedBy**. (Note: nonsensical semantically — author was published; this is just to test the mechanic.)

**What you should see:**
- The edge label updates immediately (Inspector reflects the new predicate).
- The relation in the underlying document is mutated.

**Action:** Click **Save** in the header. The browser downloads `project.jsonld`. Open it in a text editor; search for `eeeeeeeee001` (the relation id). Verify its `ecm:predicateIri` now ends in `cccccccc0005` (publishedBy) instead of `cccccccc0004` (writtenBy).

**Feedback to note:**
- [ ] Did the predicate change feel responsive / immediate?
- [ ] Was the save→download obvious?

(After testing, click **Open** and re-load `library-catalog.jsonld` to reset.)

---

## Section 5 — Creating a new instance (FR-U011)

**Action:** Double-click anywhere on the **empty canvas background** (not on an existing node). Pick a spot in the lower-left area.

**What you should see:**
- A new node appears with auto-generated label (probably "New Instance" or similar).
- Click on the new node.
- Inspector switches to instance-mode showing:
  - Instance label / IRI header
  - Class Assignments section (empty — "No classes assigned")
  - Literal Assertions section (empty — "No literals yet" + "Add literal" button)
  - "Add class assignment" select dropdown

**Action:** Use the "Add class assignment" dropdown to assign the new instance to the **Book** class.

**What you should see:**
- The Class Assignments section now shows "Book" with a Remove button.

**Feedback to note:**
- [ ] Was double-click-to-create discoverable? Did you guess it, or did you need this guide?
- [ ] Is the Inspector instance-mode laid out usefully?
- [ ] Is "Add class assignment" obvious vs hidden?

---

## Section 6 — Drawing a relation between nodes (FR-U014)

**Action:** Hover over one of the existing nodes. You should see a small handle (dot or stub) appear on its edges. Drag from one node's handle to another node.

**What you should see:**
- A new edge connects the two nodes.
- If you click the new edge, the Inspector shows it with no predicate (or default). Use the predicate dropdown to pick **writtenBy** or another.

**Feedback to note:**
- [ ] Were the connection handles visible / discoverable?
- [ ] Did the drag feel responsive?
- [ ] What did you expect to happen vs what actually happened?

---

## Section 7 — Adding a literal assertion to an instance

**Action:** Click **Dune** on the canvas.

**What you should see:**
- Inspector instance-mode for Dune.
- Literal Assertions section already shows two entries: hasISBN = "978-0-441-17271-9" and hasPublicationYear = 1965.

**Action:** Click **Add literal**. Pick **hasISBN** from the datatype property dropdown. Enter a fake ISBN string. Click submit.

**What you should see:**
- New entry in Literal Assertions list.
- Click **Save**. Open downloaded file. Search for the new ISBN value to verify it persisted to `ecm:literalAssertions`.

**Feedback to note:**
- [ ] Is the Add Literal dialog clear?
- [ ] Does "datatype" make sense, or would you call it something else?
- [ ] Did anything feel like extra clicks for no reason?

---

## Section 8 — Adding a new term (Term CRUD)

**Action:** In the left Term Sidebar, find the **Classes** section. Click the **+** button next to "Classes".

**What you should see:**
- Add Class dialog: label input + optional IRI override field.
- Type "Genre" as label. Leave IRI blank (auto-generates).

**Action:** Click submit.

**What you should see:**
- New "Genre" entry in Classes section with "project-created" badge.
- A new IRI was assigned (you can verify by saving + inspecting).

**Action:** Click the **Genre** entry in the sidebar.

**What you should see:**
- Edit Term dialog opens (because it's project-created; imported terms would be read-only).
- You can change label / IRI / comment.

**Action:** Change the label to "BookGenre". Click submit.

**Feedback to note:**
- [ ] Is the add/edit dialog flow intuitive?
- [ ] What about edit-IRI — did you see the Refactor-IRI confirmation? (Try: edit Genre's IRI to something else; should warn if there are references.)

---

## Section 9 — Project Settings (iao:isAbout)

**Action:** Click **Project Settings** (or however it's labeled — likely a header button or a gear icon).

**What you should see:**
- Dialog listing the current `iao:isAbout` IRI(s) — for the loaded demo, "https://example.org/subjects/LibraryCatalog".
- Input field to add a new IRI; per-row Remove button.

**Action:** Add "https://example.org/subjects/ScienceFiction" as a second IRI. Save.

**Feedback to note:**
- [ ] Did you know what "iao:isAbout" means? (Hint: it's the "Realist anchor" — what the project is *about* in the real world.)
- [ ] Should this be in a more visible place than a settings dialog?

---

## Section 10 — Save → reload bytewise round-trip

**Action:** Click **Save**. Save the downloaded file. Click **Open** and re-load that same file.

**What you should see:**
- The graph should reload identically (same node positions, same labels, same Inspector content).

**Action:** Click **Save** again. Compare the new download to the previous one (diff in your editor).

**What you should see:**
- The two saved files should be **bytewise identical** (this is task 2.1 AC3 + Phase 2 Exit Gate #2).

**Feedback to note:**
- [ ] Did the round-trip feel reliable?
- [ ] Any unexpected layout shifts after reload?

---

## Section 11 — Turtle export

**Action:** Click **Save as Turtle** (header button).

**What you should see:**
- A `project.ttl` file downloads.
- Open it in a text editor. You should see Turtle syntax: prefix declarations + RDF triples.
- Search for "CanvasLayout" — should be **absent** (task 2.4 AC5 — canvas info is stripped from semantic export).

**Feedback to note:**
- [ ] Did you understand what Turtle is for vs JSON-LD?
- [ ] Would there be value in adding a preview of the Turtle output before download?

---

## Section 12 — Migration notice (v0.3 → v0.4)

**Action:** Download the v0.3 fixture: [tests/playwright/fixtures/minimal-v0.3.jsonld](../tests/playwright/fixtures/minimal-v0.3.jsonld). Open it via the **Open** button.

**What you should see:**
- Migration banner appears at the top: "Project was migrated from v0.3 to v0.4." with a dismiss button.
- Project loads with a `LEGACY_REALIST_ANCHOR_PLACEHOLDER` indicator (because v0.3 didn't have realist anchors; migration left a placeholder).

**Feedback to note:**
- [ ] Was the migration notice obvious?
- [ ] Is the legacy-anchor indicator different enough from the missing-anchor indicator?

---

## Feedback consolidation

Open feedback prompts:

1. **What confused you most?** (Most-likely-unrecognizable feature, opaque button label, unclear panel purpose.)
2. **What's missing that you expected?** (A keyboard shortcut, an undo, a tutorial overlay, a sample-projects menu, anything else.)
3. **What's there but in the wrong place?** (Buttons that should be elsewhere, dialogs that should be inline, etc.)
4. **What's not functional that you expected to work?** (Anything broken in the flows above; anything that fired an error in the console.)
5. **What's the elevator-pitch you'd give a stakeholder?** (Or: do you know what to tell someone this app is for, after using it?)

Drop responses inline in this doc, or in a fresh `demo/FEEDBACK.md`, or in chat — whatever's easiest.

---

## What this walkthrough deliberately does NOT cover

These are known Phase 2 scope-splits or deferrals; you'll see them in the audit chain but they're not in the live site yet:

- **Edit Literal Assertion** — FR-U019's edit-half deferred (task 2.7 follow-up; no AC binding); Add and Delete work.
- **Semantic JSON-LD export** — `ft-112-test-emitter-typefix-2` is still forward-tracked; Turtle export is the stand-in (per task 2.4 AC5 Aaron adjudication).
- **Validator codes 3-26** — Phase 1 shipped 2 of 26 (`MISSING_REALIST_ANCHOR` + `INVALID_SPEC_VERSION` + LEGACY-related via task 1.9 ft-097-test-validator-3); the remaining 24 are tracked at `ft-097-test-validator-2`. So the validation panel may show fewer findings than a fully-validated v0.4 would.
- **Mermaid + semantic-jsonld emitters** — Phase 1 deferral.

These are all expected. If you see something not on this list that doesn't work, that's real feedback.

---

## Where the substrate-side story lives

The deeper context for how this UI got built (operator-mediation events, gap surfacing, chain composition) lives in:

- [OPERATOR-MEDIATION-LOG.md](../OPERATOR-MEDIATION-LOG.md) — 10 events through Phase 2 close
- [V3.2-GAP-REGISTRY.md](../V3.2-GAP-REGISTRY.md) — substrate-discipline-refinement gaps
- [state.jsonld](../state.jsonld) — substrate audit chain (now ~260 tasks; chain-hashed)

Phase 2 substrate-as-substrate retrospective is the next planned milestone after this feedback round.
