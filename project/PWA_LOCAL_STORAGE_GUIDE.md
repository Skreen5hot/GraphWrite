# Persistent Local Storage for Progressive Web Apps

**A Practical Implementation Guide for the File System Access API — v1.3.1**

This document describes how to add user-owned, persistent, on-disk storage to a Progressive Web App built for Chromium-based browsers (Edge, Chrome, Brave, Opera, Arc). It is the result of four rounds of review against working prototypes and a Go/No-Go verdict, and is intended to be a reusable pattern for tools that need durable, user-visible storage.

It is self-contained: an engineering team should be able to implement a secure, durable storage layer in a new app using only this document.

---

## Changelog

**v1.3.1** — final hardening pass from the Go/No-Go verdict:

- **`readBytes` no longer calls `guardPublicPath`.** The `.app/` guard exists to prevent the audit-log self-deadlock, which is write-only. Reads do not take the audit lock and are safe. The previous version's `readBytes(".app/audit.log")` threw `reserved_path`, contradicting §5.4's "Settings → Activity log" UX and §4.9's "list accepts `.app/` paths." Adding `readText`/`readBytes` accept `.app/`; only writes and mutations refuse it.
- **`pickRoot` resets the pending `foreignParent` at the top** of every call, so the natural "Pick a different folder" UX flow (which re-invokes `pickRoot`) clears any stale adoption state. `Storage.cancelForeignAdoption()` is also exported for explicit cancellation.
- **§5.4 documents the dual audit emission on the non-atomic rename fallback.** The fallback genuinely is `write + remove` rather than `move`, so it correctly emits one `write` (with `atomic: false`) and one `rename` (also `atomic: false`). Telemetry consumers de-duplicate by source path within a small time window.
- **Changelog wording on the rename fallback clarified.** v1.3's bullet read as if all rename operations were covered by the fallback; in fact only file renames are. Directory renames without `handle.move()` still throw `move_unsupported`, as §5.5's error table correctly states.
- **Onboarding-required constants flagged inline.** Comments near `APP_FOLDER`, `APP_ID`, and `APP_ID_HISTORY` mark them as MUST-CHANGE before first commit, so an app shipped with template defaults is caught at code review rather than after collision.
- **Pre-handoff readiness gate** added to §1 so each team's tech lead has a single checklist to sign off against.

**v1.3** — closes bugs surfaced in the v1.2 review:

- **`maybeRotateAuditLog` is now exported on `Storage`**, and `init()` invokes it on app start in a non-blocking try/catch. The previous version documented "call this on app start" with no way to do so.
- **`adoptOrCreate` no longer silently claims an existing unrelated `<picked>/<AppName>/` directory.** When Case 2 finds an existing folder without a matching `.app/version`, it raises `foreign_app_folder` so the UX can ask the user whether to adopt-with-acknowledgment or pick a different folder. Without this, picking a parent that coincidentally contained `MyApp/` from another tool would overwrite that data.
- **`writeBytes` rejects `relPath` values that begin with `.app/` at the boundary**, preventing a latent self-deadlock where `writeBytes(".app/audit.log", …)` would acquire `write:.app/audit.log` and then call `audit()` which tries to acquire the same lock. The audit log and version marker have their own internal writers; public callers cannot touch `.app/*`.
- **`rename` has a non-atomic fallback for files on browsers without `handle.move()`** (read source bytes → `writeBytes` to destination with `ifAbsent` → remove source). Directory renames without `move()` still throw `move_unsupported`, as the §5.5 error table specifies; recursive copy is out of scope. The fallback is documented as degraded and surfaced in audit telemetry as `atomic: false`.
- **Test corpus rewritten with `\uNNNN` escapes** so rows with control characters are readable, reviewable, and survive copy-paste. The previous rendering hid the bytes under test.
- **Audit event schema unified.** Both the on-disk line and the `Storage.on("audit", …)` payload use `{time, action, ...detail}`. Canonical keys (`time`, `action`) appear *after* the detail spread so a caller's `detail.action` cannot shadow the real one.
- **`emit("permissionchange")` is now unconditional in both `init()` and `ensurePermission()`** — late-binding listeners get the current state on every entry point.
- **`rename` returns the new relPath**, matching `duplicate`'s contract. The cross-directory limitation is documented in §4.9.
- **`pickRoot` catches `AbortError`** (user cancels the picker) and returns `null`. The Appendix A example uses the return value to skip toast notifications on cancel, matching the §5.5 "silent on cancel" rule.
- **Audit log retention.** `maybeRotateAuditLog` now deletes the oldest rotated files past `AUDIT_KEEP_ROTATED` (default 8), so a long-lived app does not accumulate years of `audit-*.log` files.
- **`detectPersistentPermissions` is wired to the Reconnect banner UX** in §5.2 — the banner shows "(remembered for this site)" when persistent permissions are available, so users understand why subsequent visits don't re-prompt.
- **APP_ID upgrade strategy documented** in §4.1: `isAppRoot` accepts a set of historical IDs (`APP_ID_HISTORY`), not just the current one, so version bumps don't orphan installations.
- **§3.3 rule 3 qualified** to acknowledge the documented non-atomic fallback on legacy browsers.
- **§1 decision matrix** changes "unlimited" to "disk-bound" for FSA capacity.
- **`writeBytes` audit payload** includes `atomic: true|false` so the fallback path is observable in telemetry.
- Minor: `rename` audit fields renamed for clarity (`from`, `to` are full relPaths), `move_unsupported` is no longer thrown by `rename` (the fallback handles it; if both paths fail, the underlying FSA error surfaces).

---

## Contents

1. [Why this pattern](#1-why-this-pattern)
2. [Architecture](#2-architecture)
3. [Security model](#3-security-model)
4. [Implementation](#4-implementation)
   - 4.1 [The capability module](#41-the-capability-module)
   - 4.2 [Atomic writes](#42-atomic-writes)
   - 4.3 [Filename and path sanitization](#43-filename-and-path-sanitization)
   - 4.4 [Permission lifecycle](#44-permission-lifecycle)
   - 4.5 [Persisting the handle (IndexedDB)](#45-persisting-the-handle-indexeddb)
   - 4.6 [Service worker hygiene](#46-service-worker-hygiene)
   - 4.7 [Content Security Policy](#47-content-security-policy)
   - 4.8 [Concurrency: locks, lock order, multi-tab](#48-concurrency-locks-lock-order-multi-tab)
   - 4.9 [Reads, remaining mutations, events](#49-reads-remaining-mutations-events)
5. [UX patterns](#5-ux-patterns)
6. [Testing checklist](#6-testing-checklist)
7. [Browser support & fallbacks](#7-browser-support--fallbacks)
8. [Appendix A — Minimal working example](#appendix-a--minimal-working-example)
9. [Appendix B — Threat model](#appendix-b--threat-model)
10. [Appendix C — `sanitizeName` test corpus](#appendix-c--sanitizename-test-corpus)

---

## 1. Why this pattern

PWAs frequently need to store user data that is:

- **Durable across sessions** — survives cache wipes and browser updates.
- **User-owned** — the user can see, back up, and move it without the app's help.
- **Larger than IndexedDB quotas** — multi-GB datasets, model files, document archives.
- **Inspectable and exportable** — users can open the files in other tools.

IndexedDB fails most of these. The **File System Access API** (FSA) — `window.showDirectoryPicker()` and friends — does. The pattern below uses FSA as the system of record, with IndexedDB used only to remember a single capability token (the directory handle).

### Decision matrix

| Need                                       | IndexedDB | OPFS (Origin Private FS) | FSA (this guide)              |
|--------------------------------------------|:---------:|:------------------------:|:-----------------------------:|
| Persists across sessions                   |     ✓     |            ✓             |              ✓                |
| File *data* survives "Clear site data"     |     ✗     |            ✗             |   ✓ (handle does not — see note) |
| User can see / back up the files           |     ✗     |            ✗             |              ✓                |
| User can open in other apps                |     ✗     |            ✗             |              ✓                |
| Multi-GB capacity                          |   limited |          large           |         disk-bound            |
| Zero permission prompts                    |     ✓     |            ✓             |              ✗                |
| Works in all modern browsers               |     ✓     |       Chromium + FF      |        Chromium only*         |
| Strong atomicity / locking                 |     ✓     |            ✓             |          OS-bound             |

\* Safari/Firefox only support `showDirectoryPicker()` partially or not at all; see §7.

**Note on "Clear site data":** the *files on disk* belong to the user and survive any browser-level reset. The *directory handle* used to reach them is stored in IndexedDB; if site data is cleared, that handle is wiped and the app falls back to the first-run picker. If the user re-picks the same folder, all data is recovered via the `.app/version` marker (§4.1). The handle is a token; the data is the truth.

**Pick FSA** when users will move, back up, or inspect their data; or when capacity exceeds IndexedDB's practical limits.
**Pick OPFS** for app-only data that should be sandboxed but doesn't need to survive site-data clears.
**Pick IndexedDB** for small structured data, metadata, and indexes.

A real app typically uses **all three**: FSA for blobs, OPFS for derived caches, IndexedDB for indexes and the FSA handle itself.

### 1.1 Pre-handoff readiness gate

Before any team starts implementing against this guide, the tech lead signs off on the following. Items that cannot be answered at handoff are blockers, not deferrable risks.

- [ ] **Branding constants set.** `APP_FOLDER`, `APP_ID`, `APP_ID_HISTORY`, and `DB_NAME` (§4.1) all changed from the template defaults. Code review must reject any PR that still has `MyApp` / `myapp.v1`.
- [ ] **Threat model accepted.** Team has read §3.1 and Appendix B and acknowledges threats 16, 17, 18, and 19 as residual (symlink traversal, TOCTOU, CSS-injection keylogging, OS write-back power-loss window).
- [ ] **Browser target set.** Primary target is Chromium ≥ 110. The team explicitly decides whether the non-atomic fallback paths (§4.2, §4.9, §5.4) are in scope for a legacy slice or out of scope entirely.
- [ ] **Cloud-sync UX wired.** First-run sync question (§5.3) is in the design, not deferred. Heuristic detection is documented as best-effort; the question is mandatory.
- [ ] **Telemetry sink chosen.** Audit events carry `atomic: true|false`. The team has chosen where `atomic: false` events go and who reads them. An app without a place to observe fallback writes cannot measure deployment health.
- [ ] **Activity log feature scoped in or out.** If in, the team has design for a Settings → Activity log view that renders `.app/audit.log` lines via `textContent` (§5.4). If out, the §5.4 paragraph about that view is dropped from the team's local copy of the guide. Either way, decide before the first PR.
- [ ] **Test corpus runner exists.** Appendix C (`sanitizeName`, `splitPath`, `lockKey`, `guardPublicPath`) is wired into CI before the first PR that touches `storage.js` is merged. A regression in any of these is a security regression.

Re-review of the guide is required when a change touches: lock-acquisition order, the `.app/` guard, atomic-write semantics, the audit-log schema, or the CSP. Other edits do not require re-review.

---

## 2. Architecture

### 2.1 Layers

```
+---------------------------------------------------------+
|  UI components (renders, listens to events)             |
|  - Never touches FileSystemDirectoryHandle directly     |
+---------------------------------------------------------+
|  Application services (queries, business logic)         |
|  - Calls Storage capability methods only                |
+---------------------------------------------------------+
|  Storage capability module (storage.js)                 |
|  - Holds the directory handle                           |
|  - Exposes: readFile, writeFileAtomic, list, delete...  |
|  - Sanitizes every path that enters or leaves           |
|  - Owns the permission state machine                    |
+---------------------------------------------------------+
|  Persistence (IndexedDB) + File System Access API       |
+---------------------------------------------------------+
```

The **rule** is that the `FileSystemDirectoryHandle` is a **capability**: only the storage module is allowed to hold it. Every other module receives sanitized strings (paths, names, file contents) through a typed interface. This is the single most important design choice in the guide — it shrinks the attack surface from "everywhere DOM code runs" to "one module."

### 2.2 Module boundaries

| Module                  | May call FSA? | May call DOM? | May read IndexedDB? |
|-------------------------|:-------------:|:-------------:|:-------------------:|
| `storage.js`            |       ✓       |       ✗       |          ✓          |
| `ui/*`                  |       ✗       |       ✓       |          ✗          |
| `services/*`            |       ✗       |       ✗       |   via storage.js    |
| `service-worker.js`     |       ✗       |       ✗       |          ✗          |

If a UI component needs to display a directory listing, the storage module returns a plain array of `{name, kind, size, modified}` objects. UI never sees a `FileSystemHandle`.

### 2.3 Folder layout on disk

The user picks one root directory; the app creates a single namespaced subfolder inside it.

```
<user picked folder>/
  └── <AppName>/                  <-- the only thing the app may touch
      ├── .app/                   <-- app-private state; off-limits to public API
      │   ├── version             <-- adoption marker; identifies this folder as our root
      │   ├── audit.log
      │   └── audit-<rotated>.log <-- rotated audit logs
      ├── <ProjectName>/
      │   ├── source/
      │   └── derived/
      └── <AnotherProject>/
```

- Never write outside `<AppName>/`. Never read outside it either.
- The `.app/` folder is for the app's internal bookkeeping. Public `Storage` methods reject `relPath` values that begin with `.app/`; only internal helpers (audit, version marker, rotation) write there.
- `.app/version` is written on first init and is how subsequent picks identify a folder as an existing app root (§4.1).
- Project structure is opinionated: a fixed shape lets you reason about migrations.

---

## 3. Security model

### 3.1 Threat model summary

The user grants your app read-write access to a folder. That folder may also be:

- Synced to OneDrive, iCloud, Dropbox (very common on Windows).
- Shared on a network drive.
- Modified by other apps, by the OS, by VS Code, by the user.
- Indexed by spotlight/search.
- Traversed via OS-level symlinks the user did not create.

This produces four threat classes (see Appendix B for the full table):

1. **External content reaching the app's origin.** A filename or file body planted by another process is loaded by your DOM. If the app renders it unsafely → script execution in your origin → full filesystem capability is compromised.
2. **Third-party JS reaching the FSA handle.** Any script running in your origin has full read-write to the user's folder. A compromised CDN or unverified vendor script is a full disclosure.
3. **App bugs corrupting user data.** Non-atomic writes, missing aborts, recursive deletes without confirmation, traversal in filenames, silent adoption of unrelated folders.
4. **Filesystem-level escape.** Symlinks or hardlinks placed inside the app folder by another process can cause FSA traversals to read or write outside the intended scope. TOCTOU windows between sanitization and `getFileHandle` allow a hostile process to swap a sanitized name for a different inode between the check and the use.

Everything in §3 follows from these.

### 3.2 Required mitigations

| Mitigation                                            | Where                | Priority |
|-------------------------------------------------------|----------------------|:--------:|
| Strict CSP                                            | `index.html` `<meta>` |   MUST   |
| Trusted Types enforcement via CSP                     | `index.html`         |   MUST   |
| No floating-version third-party scripts               | `index.html`         |   MUST   |
| SRI hashes on every external script                   | `index.html`         |   MUST   |
| `textContent` (not `innerHTML`) for any FS data       | UI modules           |   MUST   |
| Filename **and** total-path sanitization at boundary  | `storage.js`         |   MUST   |
| Atomic writes (temp + rename) for every mutation*     | `storage.js`         |   MUST   |
| Public API rejects `.app/` paths                      | `storage.js`         |   MUST   |
| Permission re-check on every gesture-bound write      | `storage.js`         |   MUST   |
| Web Locks around every mutation, single lock scheme   | `storage.js`         |   MUST   |
| Lock-order rule: `.app/audit.log` is a leaf           | `storage.js`         |   MUST   |
| Adoption refusal on `foreign_app_folder`              | `storage.js` + UX    |   MUST   |
| Service worker never caches cross-origin opaque       | `service-worker.js`  |   MUST   |
| Vendor third-party scripts same-origin                | build                | SHOULD   |
| Audit log of mutations                                | `storage.js`         | SHOULD   |
| Audit log rotation and retention                      | `storage.js`         | SHOULD   |
| Cloud-sync first-run question                         | first-run UX         | SHOULD   |
| Persistent permissions where available                | `storage.js`         | SHOULD   |

\* Atomic on Chromium ≥ 110 via `handle.move()`. A documented non-atomic fallback is used on older versions; runs of the fallback are emitted in audit telemetry as `atomic: false`.

### 3.3 The non-negotiables

These are the rules every app must follow:

1. **No `innerHTML` with any string that came from the filesystem, a `prompt()`, or a user upload.** Use `textContent` and DOM construction. Inline `onclick=` attributes are banned (they violate CSP). Where supported, enforce via Trusted Types (§4.7).
2. **No floating versions** (`latest`, no version, `@^x`). Pin every external dependency to a SemVer and an SRI hash, or vendor it.
3. **Every write is atomic at the rename boundary on supported browsers, and a documented non-atomic fallback on older ones.** Temp file → write → close → rename. Wrapped in `try/finally` that aborts the writable on failure. The fallback path is observable in audit telemetry so its incidence can be measured.

   *Caveat: FSA exposes no `fsync` equivalent. After `writable.close()` resolves, bytes are in OS write-back cache and may not yet be on disk. The tmp+rename pattern narrows but does not close the power-loss window. See §4.2 for the residual risk and mitigations.*
4. **Every filename is sanitized, and every relative path is length-checked, at the storage-module boundary.** No traversal, no NULs, no Windows reserved names, segment-capped and full-path-capped.
5. **The directory handle is private to one module.** No other module imports or receives it.
6. **Every mutation takes a Web Lock via `lockKey(relPath)`.** A single canonical key per path means a write, a rename, and a duplicate of the same file all serialize against each other.
7. **`.app/audit.log` is the leaf in the lock graph.** Never acquire another write lock while holding it. See §4.8 for the full rule.
8. **Public API methods reject `relPath` values that begin with `.app/`.** Only internal helpers write there. This prevents the self-deadlock that would occur if a caller routed a public write through `lockKey(".app/audit.log")`.

---

## 4. Implementation

### 4.1 The capability module

This is the *only* file in your app that imports the FSA API surface.

```js
// storage.js — the one and only owner of the FileSystemDirectoryHandle.
// Export the public surface; never export the handle itself.

// =========================================================================
// MUST-CHANGE BEFORE FIRST COMMIT
// Two apps that ship with the same APP_ID will adopt each other's data
// folders. Change all four constants below to your app's identifiers.
// Code review should reject any branch that still has "MyApp" / "myapp.v1".
// =========================================================================
const APP_FOLDER = "MyApp";              // on-disk folder name (basename only)
const APP_ID     = "myapp.v1";           // written to .app/version on first init
const APP_ID_HISTORY = new Set([         // every ID this codebase has ever shipped;
  "myapp.v1",                            // append, never replace, so version bumps
]);                                      // don't orphan existing installations
const DB_NAME    = "MyApp.handles";      // IndexedDB database name
// =========================================================================

const HANDLE_KEY = "rootHandle";

// ---------- module-private state ----------
let rootHandle = null;        // FileSystemDirectoryHandle for <picked>/<AppName>
let permissionState = "unknown"; // "granted" | "prompt" | "denied" | "unknown"
const listeners = new Map();  // event -> Set<fn>

export class StorageError extends Error {
  constructor(code, detail) {
    super(code);
    this.name = "StorageError";
    this.code = code;
    this.detail = detail;
  }
}

// ---------- public API ----------
export const Storage = {
  // Lifecycle
  init,                 // call once on app start
  pickRoot,             // user-gesture: open directory picker; returns true/false/null
  ensurePermission,     // user-gesture: re-grant if needed
  isReady,              // boolean — handle + granted permission
  hasRoot,              // boolean — handle is present (may or may not be granted)
  rootName,             // string — basename of the picked folder (for UI display)
  detectPersistentPermissions,  // boolean — true if the grant survives sessions

  // Maintenance
  maybeRotateAuditLog,  // exported so the app can also trigger rotation manually

  // Adoption flow (used after pickRoot raises foreign_app_folder)
  adoptForeignFolder,   // (acknowledgment: true) => void; nests AppName inside picked
  cancelForeignAdoption, // () => void; clears the pending parent if UX dismisses

  // Reads
  list,                 // (relPath, {includeHidden}?) => [{name, kind, size, modified}]
  readText,             // (relPath) => string                   (UTF-8 strict)
  readTextLossy,        // (relPath) => string                   (UTF-8 with U+FFFD)
  readBytes,            // (relPath) => Uint8Array

  // Writes (all atomic on supported browsers, all locked)
  writeText,            // (relPath, string, opts?) => void
  writeBytes,           // (relPath, Uint8Array|Blob, opts?) => void
                        //   opts.ifAbsent: true → throws StorageError("target_exists") if path exists

  // Mutations
  rename,               // (relPath, newName) => newRelPath
  remove,               // (relPath, {recursive?}) => void
  duplicate,            // (relPath) => newRelPath (unique name)
  mkdir,                // (relPath) => void

  // Events
  on,                   // ("permissionchange" | "audit", fn) => unsubscribe
};

// ---------- lifecycle ----------
async function init() {
  const db = await openHandleDB();
  const stored = await idbGet(db, HANDLE_KEY);
  if (stored) {
    rootHandle = stored;
    permissionState = await queryPermission(stored);
    emit("permissionchange", permissionState);          // unconditional: late listeners
    if (permissionState === "granted") {
      // Non-blocking. A rotation failure should never prevent the app from starting.
      maybeRotateAuditLog().catch(() => { /* swallowed; reported via telemetry */ });
    }
  }
}

// pickRoot returns:
//   true  — folder picked and adopted, or freshly created.
//   null  — user cancelled the picker (AbortError). UX should treat as no-op.
//   false — pickRoot raised foreign_app_folder; UX should call adoptForeignFolder().
//
// In the foreign-folder case, the picked parent is held in module-private state
// (foreignParent) until the UX resolves the question. Every pickRoot() call
// clears this at the top, so the natural "Pick a different folder" UX (which
// re-invokes pickRoot) cannot accidentally adopt a stale parent. Apps that
// dismiss the foreign-folder UI without re-picking should call
// cancelForeignAdoption() explicitly.
let foreignParent = null;

function cancelForeignAdoption() {
  foreignParent = null;
}

async function pickRoot() {                  // MUST be called from a click handler
  // Clear any pending adoption from a prior pickRoot that hit foreign_app_folder
  // but was not resolved. The next picker decides what (if anything) we adopt.
  foreignParent = null;

  let parent;
  try {
    parent = await window.showDirectoryPicker({
      id: "app-root",                        // remembers last location per id
      mode: "readwrite",
      startIn: "documents",
    });
  } catch (e) {
    if (e.name === "AbortError") return null;
    throw e;
  }

  try {
    rootHandle = await adoptOrCreate(parent);
  } catch (e) {
    if (e instanceof StorageError && e.code === "foreign_app_folder") {
      foreignParent = parent;
      return false;
    }
    throw e;
  }

  const db = await openHandleDB();
  await idbPut(db, HANDLE_KEY, rootHandle);
  permissionState = "granted";

  // Audit first, then emit. Listeners on "permissionchange" can assume that
  // any side-effect described by Storage has already been recorded on disk.
  await audit("init", { folder: APP_FOLDER });
  emit("permissionchange", permissionState);
  return true;
}

// Called by the UX after the user has acknowledged that the existing
// <picked>/<AppName>/ folder is not the app's root. We nest one level deeper.
async function adoptForeignFolder(acknowledgment) {
  if (!foreignParent) throw new StorageError("no_pending_adoption");
  if (acknowledgment !== true) throw new StorageError("acknowledgment_required");

  // Create <picked>/<AppName>/<AppName>/, giving us a private nested root.
  const outer = await foreignParent.getDirectoryHandle(APP_FOLDER, { create: false });
  const inner = await outer.getDirectoryHandle(APP_FOLDER, { create: true });
  await initAppMarker(inner);
  rootHandle = inner;
  foreignParent = null;

  const db = await openHandleDB();
  await idbPut(db, HANDLE_KEY, rootHandle);
  permissionState = "granted";

  await audit("init_nested", { folder: APP_FOLDER });
  emit("permissionchange", permissionState);
}

// Pick-time adoption logic. Four cases:
//   1. The picked folder *is* an existing app root (.app/version matches history).
//   2. The picked folder *contains* an existing app root at ./AppName/.
//   3. The picked folder *contains* an unrelated ./AppName/ directory with no
//      matching .app/version — raise foreign_app_folder; the UX decides.
//   4. Fresh init: create <picked>/AppName/ and write .app/version.
async function adoptOrCreate(picked) {
  if (await isAppRoot(picked)) return picked;

  let candidate = null;
  try {
    candidate = await picked.getDirectoryHandle(APP_FOLDER, { create: false });
  } catch (e) {
    if (e.name !== "NotFoundError") throw e;
  }

  if (candidate) {
    if (await isAppRoot(candidate)) return candidate;     // case 2
    // Case 3: an existing AppName directory that isn't ours. Refuse to adopt.
    // The UX may choose to nest (adoptForeignFolder) or to ask the user to
    // pick a different folder.
    throw new StorageError("foreign_app_folder", { basename: APP_FOLDER });
  }

  // Case 4: fresh.
  const fresh = await picked.getDirectoryHandle(APP_FOLDER, { create: true });
  await initAppMarker(fresh);
  return fresh;
}

async function isAppRoot(handle) {
  try {
    const appDir = await handle.getDirectoryHandle(".app", { create: false });
    const versionFile = await appDir.getFileHandle("version", { create: false });
    const text = (await (await versionFile.getFile()).text()).trim();
    return APP_ID_HISTORY.has(text);
  } catch { return false; }
}

async function initAppMarker(root) {
  const appDir = await root.getDirectoryHandle(".app", { create: true });
  const v = await appDir.getFileHandle("version", { create: true });
  const w = await v.createWritable({ keepExistingData: false });
  try {
    await w.write(new TextEncoder().encode(APP_ID + "\n"));
    await w.close();
  } catch (e) {
    try { await w.abort(); } catch {}
    throw e;
  }
}

async function ensurePermission() {          // MUST be called from a click handler
  if (!rootHandle) throw new StorageError("no_root");
  let result;
  try {
    result = await rootHandle.requestPermission({ mode: "readwrite" });
  } catch (e) {
    if (e.name === "SecurityError" || e.name === "NotAllowedError") {
      throw new StorageError("gesture_required");
    }
    throw e;
  }
  permissionState = result;
  emit("permissionchange", permissionState);   // unconditional: matches init()
  if (result !== "granted") throw new StorageError("permission_denied");
  // Permission just granted; this is a fine time to rotate.
  maybeRotateAuditLog().catch(() => {});
}

function isReady()  { return !!rootHandle && permissionState === "granted"; }
function hasRoot()  { return !!rootHandle; }
function rootName() { return rootHandle?.name || null; }
```

**APP_ID upgrade strategy.** `APP_ID_HISTORY` is the set of every `APP_ID` value this codebase has ever shipped. When you bump the version (`myapp.v1` → `myapp.v2`), *append* the new ID to the set; do not replace. `isAppRoot` accepts any historical ID, so existing installations recognize themselves on next launch. New `.app/version` files are written with the current `APP_ID`. If a future migration requires distinguishing layouts by version, branch in `init()` on the file's contents — but never let the recognition step return false for an installation you actually shipped.

Notes:

- **None of the public methods take a `FileSystemHandle` as a parameter.** They take `relPath` strings, resolved internally against `rootHandle`. This is what keeps the handle private.
- **`relPath` values starting with `.app/` are rejected at the public API boundary** (§4.3). The app's bookkeeping is off-limits to callers.
- `hasRoot()` is the right check for "do we know about a folder at all?" — used by UI to decide between "show first-run picker" and "show reconnect banner."
- `isReady()` is the stronger check for "are we ready to read or write?" — handle present AND permission granted.
- `rootName()` returns the basename of the picked folder so UX can show "Working in: **MyApp**" — never used as a security boundary.
- The `audit("init")` call inside `pickRoot` happens *before* `emit("permissionchange")` so any listener can assume the on-disk record is already written by the time the event fires.

### 4.2 Atomic writes

The single most important correctness primitive. Every mutation goes through this helper.

```js
// storage.js (continued)

// Internal writeBytes — used by both the public writeBytes (which guards .app/)
// and by internal helpers like the audit log writer. The guard is enforced
// at the public boundary, not here, so internal callers can write to .app/.
async function writeBytesInternal(relPath, data, { ifAbsent = false } = {}) {
  return withLock(lockKey(relPath), async () => {
    requireReady();
    const { dir, name } = await resolveParent(relPath, { create: true });
    const safeName = sanitizeName(name);

    if (ifAbsent) {
      const existing = await probeEntry(dir, safeName);
      if (existing !== null) throw new StorageError("target_exists", { kind: existing });
    }

    const tmpName  = `.${safeName}.${cryptoRandom()}.tmp`;
    const tmpHandle = await dir.getFileHandle(tmpName, { create: true });

    let writable;
    let atomic = true;
    try {
      writable = await tmpHandle.createWritable({ keepExistingData: false });

      // Blob is the streaming-friendly path: chunks flow through the writable
      // without materializing the whole payload in memory. Uint8Array is fine
      // for files that comfortably fit in memory (< ~100 MB rule of thumb).
      if (data instanceof Blob || data instanceof Uint8Array) {
        await writable.write(data);
      } else {
        throw new StorageError("bad_data_type");
      }
      await writable.close();    // OS may still buffer briefly; see "Durability" below
      writable = null;           // committed: prevent the catch branch from aborting it

      // Atomic replace.
      if (typeof tmpHandle.move === "function") {
        await tmpHandle.move(dir, safeName);   // Chromium ≥ 110: atomic overwrite
      } else {
        atomic = false;
        await copyTempToTarget(dir, tmpHandle, safeName);
        try { await dir.removeEntry(tmpName); } catch {}
      }
      await audit("write", { path: relPath, bytes: byteLengthOf(data), atomic });
    } catch (err) {
      if (writable) { try { await writable.abort(); } catch {} }
      try { await dir.removeEntry(tmpName); } catch {}
      throw err;
    }
  });
}

// Public writeBytes — same as the internal version, but refuses to write
// anywhere under .app/. This is the rule from §3.3 item 8 and prevents the
// self-deadlock where writeBytes(".app/audit.log", ...) would acquire the
// audit lock and then try to acquire it again via audit().
async function writeBytes(relPath, data, opts) {
  guardPublicPath(relPath);
  return writeBytesInternal(relPath, data, opts);
}

function guardPublicPath(relPath) {
  if (typeof relPath !== "string") throw new StorageError("bad_path");
  // splitPath validates the rest of the structure; here we only block .app/.
  const first = relPath.split("/")[0];
  if (first === ".app") throw new StorageError("reserved_path", { prefix: ".app/" });
}

async function copyTempToTarget(dir, tmpHandle, safeName) {
  const targetHandle = await dir.getFileHandle(safeName, { create: true });
  const writable = await targetHandle.createWritable({ keepExistingData: false });
  try {
    const tmpFile = await tmpHandle.getFile();
    await writable.write(tmpFile);     // stream the Blob
    await writable.close();
  } catch (e) {
    try { await writable.abort(); } catch {}
    throw e;
  }
}

function byteLengthOf(data) {
  if (data instanceof Uint8Array) return data.byteLength;
  if (data instanceof Blob)       return data.size;
  return undefined;
}

async function writeText(relPath, text, opts) {
  const bytes = new TextEncoder().encode(text);
  return writeBytes(relPath, bytes, opts);
}

function cryptoRandom() {
  const a = new Uint8Array(8);
  crypto.getRandomValues(a);
  return Array.from(a, b => b.toString(16).padStart(2, "0")).join("");
}

function requireReady() {
  if (!isReady()) throw new StorageError("not_ready");
}
```

**Why this works:**
- The temp file is in the same directory as the target, so the `move()` rename is a single inode operation on most filesystems.
- If the writable throws mid-stream, `abort()` releases the lock and we delete the temp.
- If the page is closed between `close()` and `move()`, the worst outcome is an orphan `.foo.<rand>.tmp` file — the original target is untouched. (`list()` skips dotfiles by default; see §4.9.)
- `keepExistingData: false` makes the semantics explicit (you are writing a fresh file).
- Setting `writable = null` after `close()` prevents the catch branch from calling `abort()` on an already-closed stream — `abort()` on a closed stream throws in some browsers.
- The `ifAbsent` option turns `writeBytes` into a primitive useful for race-free name allocation (used by `duplicate`, §4.9). The existence probe runs **inside** the lock, so two concurrent `writeBytes(p, …, {ifAbsent: true})` cannot both succeed.
- The public `writeBytes` guards against `.app/` paths *before* taking any lock, so the self-deadlock case raises a clean `reserved_path` error rather than hanging.
- Every successful write emits an audit entry with `atomic: true|false`. Telemetry can count fallback-path writes and surface them as a deployment health metric.

**Large files.** For payloads more than a few hundred MB, prefer passing a `Blob` (e.g. from another file, a `ReadableStream`-backed `new Response(stream).blob()`, or `new Blob([typedArray])`). `writable.write(blob)` streams the blob through the OS without copying it into a single JS buffer. A `Uint8Array` argument materializes the whole payload in memory and is fine for small writes but not for multi-GB files.

**Durability caveat.** FSA exposes no `fsync`-equivalent. After `writable.close()` resolves, bytes are committed to the OS but may sit in OS write-back cache before reaching the disk. A power loss in that window can still produce loss of the most recent write. There is no portable way to force a flush from the browser. Apps that care about durability should:

- write a "last-known-good" marker after a quiescence period, not after each individual write;
- accept that the residual window is small (typically < 30 seconds on a modern OS) but non-zero;
- not rely on FSA for the storage of values that require sub-second durability guarantees.

**Fallback caveat.** The `else` branch above is genuinely non-atomic — a crash *during* `copyTempToTarget` leaves a zero-length target under the real name (the same bug the temp+move pattern is meant to prevent). A crash *between* the copy and the `removeEntry(tmpName)` leaves both the target and the temp file present. The temp is hidden (`.`-prefixed) and ignored by `list()`, but it is real on disk. `tmpHandle.move()` has shipped in Chromium since version 110 (January 2023); apps targeting recent Chromium should treat the fallback as an emergency path only — count its incidence via the `atomic: false` audit field.

Never use `getFileHandle(name, {create:true}) + createWritable()` directly to overwrite an existing file. It truncates on open, so a crash mid-write leaves you with a zero-length file under the real name.

### 4.3 Filename and path sanitization

Two functions, applied at every boundary where a string becomes a path component or a relative path. A `lockKey()` helper guarantees that every caller agrees on the canonical form of a path.

```js
// storage.js (continued)

const WIN_RESERVED = new Set([
  "CON","PRN","AUX","NUL",
  "COM1","COM2","COM3","COM4","COM5","COM6","COM7","COM8","COM9",
  "LPT1","LPT2","LPT3","LPT4","LPT5","LPT6","LPT7","LPT8","LPT9",
]);

const MAX_SEGMENT_LEN = 200;   // UTF-16 code units in any single name
const MAX_PATH_LEN    = 380;   // total relative path; OneDrive caps the full path
                               // at ~400 chars — leave headroom for the user's prefix

function sanitizeName(name) {
  if (typeof name !== "string") throw new StorageError("bad_name");
  let s = name.normalize("NFC");

  // 1. No NUL, no control characters.
  if (/[\x00-\x1f\x7f]/.test(s)) throw new StorageError("control_char");

  // 2. No path separators.
  if (s.includes("/") || s.includes("\\")) throw new StorageError("separator");

  // 3. No traversal.
  if (s === "." || s === "..") throw new StorageError("traversal");

  // 4. No Windows-forbidden chars.
  if (/[<>:"|?*]/.test(s)) throw new StorageError("forbidden_char");

  // 5. No trailing dots or spaces (Windows trims them silently).
  s = s.replace(/[. ]+$/g, "");
  if (!s) throw new StorageError("empty");

  // 6. No Windows reserved device names (with or without extension).
  //    Match the first segment before any dot: "CON.txt" → "CON" → reserved.
  const base = s.split(".")[0].toUpperCase();
  if (WIN_RESERVED.has(base)) throw new StorageError("reserved");

  // 7. Per-segment length cap.
  if (s.length > MAX_SEGMENT_LEN) throw new StorageError("too_long");

  return s;
}

function splitPath(relPath) {
  if (typeof relPath !== "string") throw new StorageError("bad_path");
  if (relPath.length === 0)        throw new StorageError("empty_path");

  const raw = relPath.split("/");

  // Reject empty segments anywhere — i.e. "//", or leading/trailing "/".
  for (const seg of raw) {
    if (seg.length === 0) throw new StorageError("empty_segment");
  }

  const segments = raw.map(sanitizeName);

  // Total relative-path length cap (sum of segments plus separators).
  const total = segments.reduce((n, s) => n + s.length + 1, 0) - 1;
  if (total > MAX_PATH_LEN) throw new StorageError("path_too_long");

  return segments;
}

// Single source of truth for the canonical form of a path.
// All Web Lock names are derived from this so concurrent operations
// on the same path always agree on the lock name.
function lockKey(relPath) {
  return `write:${splitPath(relPath).join("/")}`;
}

async function resolveParent(relPath, { create } = {}) {
  const parts = splitPath(relPath);
  if (parts.length === 0) throw new StorageError("empty_path");
  const name = parts.pop();
  let dir = rootHandle;
  for (const seg of parts) {
    try {
      dir = await dir.getDirectoryHandle(seg, { create: !!create });
    } catch (e) {
      // A file exists where we expected a directory along the path.
      if (e.name === "TypeMismatchError") {
        throw new StorageError("path_collision", { segment: seg });
      }
      throw e;
    }
  }
  return { dir, name };
}

// Probe-without-throwing: returns "file" | "directory" | null.
async function probeEntry(dir, name) {
  try {
    await dir.getFileHandle(name);
    return "file";
  } catch (e) {
    if (e.name === "TypeMismatchError") return "directory";
    if (e.name !== "NotFoundError") throw e;
  }
  return null;
}
```

**Important:** these checks are not redundant with the OS. The OS will reject some of these but silently accept others (Windows trimming trailing dots, macOS accepting `:`). Be strict at *your* boundary — it's the only one that holds across platforms.

A table-driven test corpus for `sanitizeName`, `splitPath`, and `lockKey` is in Appendix C. Every implementation should run against it before shipping. The corpus uses `\uNNNN` escapes for non-printable characters so the rows survive copy-paste and visual review.

### 4.4 Permission lifecycle

Permissions in FSA are a four-state machine. Treat them explicitly.

```
                +---------+
                | unknown |   <- first run, or fresh page load before init()
                +----+----+
                     | init() calls queryPermission
       +-------------+-------------+
       v             v             v
  +---------+   +---------+   +---------+
  | granted | <-| prompt  | ->| denied  |
  +----+----+   +---------+   +----+----+
       |           ^   ^           |
       | revoke    |   | clear     |
       +-----------+   +-----------+
```

Transitions, with cause:

| From → To           | Trigger                                                                       |
|---------------------|-------------------------------------------------------------------------------|
| `unknown → *`       | `init()` calls `queryPermission()` on the stored handle.                      |
| `prompt → granted`  | User clicks Reconnect; `requestPermission()` resolves with `"granted"`.       |
| `prompt → denied`   | User clicks Reconnect; user dismisses or denies the browser prompt.           |
| `granted → prompt`  | Session expiry on a non-persistent grant; next page load.                     |
| `granted → denied`  | User revokes the permission via browser UI mid-session.                       |
| `denied → prompt`   | User clears the per-site permission in browser settings; next page load.      |

Rules:
- `requestPermission()` *must* be invoked from a user gesture handler (click/key). Calling it from `setTimeout`, `load`, or async-chained off page boot will throw `NotAllowedError` / `SecurityError`; `ensurePermission()` translates this into `StorageError("gesture_required")`.
- `queryPermission()` is fine from any context — use it to decide whether to show a re-auth button.
- On Chromium ≥ 122 with the Persistent Permissions feature enabled (and on installed PWAs), permissions can outlive the session. The feature detection is non-standardized; the test below treats any failure as "not supported."
- Permissions are *per origin* and *per handle*. Don't try to share a handle across origins.

```js
async function queryPermission(handle) {
  const r = await handle.queryPermission({ mode: "readwrite" });
  return r; // "granted" | "prompt" | "denied"
}

async function detectPersistentPermissions() {
  // navigator.permissions.query for "file-system-access" is not in the
  // Permissions API spec. Chromium accepts it experimentally; other browsers
  // throw on the unknown name. Wrap and treat any failure as "not supported."
  if (!navigator.permissions?.query) return false;
  try {
    const r = await navigator.permissions.query({ name: "file-system-access" });
    return r.state === "granted";
  } catch {
    return false;
  }
}
```

UX layer: every write path checks `Storage.isReady()` first; if false, the UI surfaces a single, prominent **Reconnect** button bound to `ensurePermission`. Where `detectPersistentPermissions()` returns true, the banner adds "(remembered for this site)" so the user understands subsequent visits will not re-prompt. Never silently fail. Never auto-retry — only the user can grant.

### 4.5 Persisting the handle (IndexedDB)

```js
// storage.js (continued) — minimal IDB shim

function openHandleDB() {
  return new Promise((resolve, reject) => {
    const r = indexedDB.open(DB_NAME, 1);
    r.onupgradeneeded = () => r.result.createObjectStore("h");
    r.onsuccess = () => resolve(r.result);
    r.onerror   = () => reject(r.error);
  });
}
function idbGet(db, key) {
  return new Promise((res, rej) => {
    const tx = db.transaction("h", "readonly");
    const rq = tx.objectStore("h").get(key);
    rq.onsuccess = () => res(rq.result);
    rq.onerror   = () => rej(rq.error);
  });
}
function idbPut(db, key, val) {
  return new Promise((res, rej) => {
    const tx = db.transaction("h", "readwrite");
    const rq = tx.objectStore("h").put(val, key);
    rq.onsuccess = () => res();
    rq.onerror   = () => rej(rq.error);
  });
}
```

`FileSystemDirectoryHandle` is *structured-cloneable*, so IDB stores it natively. **Do not** stringify it, do not try to serialize it any other way. If IDB is wiped (user clears site data, or browser-level reset), the handle is lost and the user must re-pick — the files themselves are unaffected because they live in the user's own folder. The `.app/version` marker (§4.1) ensures re-pick correctly adopts the existing root.

### 4.6 Service worker hygiene

The service worker is part of the app's origin and ships into the same trust boundary as `index.html`. Three rules and one caveat:

```js
// service-worker.js
//
// CACHE should be derived from a build hash, not hand-edited. Use a build
// step that substitutes a content hash here. The literal version is a
// placeholder for the example.
const CACHE = "app-shell-v1.0.0";

// 1. Only pre-cache same-origin app shell files (never CDN URLs).
const SHELL = [
  "/", "/index.html", "/manifest.webmanifest",
  "/styles/main.css",
  "/scripts/tt-policy.js", "/scripts/storage.js", "/scripts/app.js",
  "/vendor/lib.min.js",                  // vendored, same-origin
  "/icons/icon-192.png", "/icons/icon-512.png",
  "/offline.html",
];

self.addEventListener("install", e => {
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(SHELL)));
  // skipWaiting is convenient but swaps the SW out under any open tab.
  // FSA bypasses the SW entirely, so storage operations are unaffected, but
  // in-flight fetches will retry against the new worker.
  self.skipWaiting();
});

self.addEventListener("activate", e => {
  e.waitUntil(
    caches.keys().then(keys =>
      Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k)))
    )
  );
  self.clients.claim();
});

self.addEventListener("fetch", event => {
  const url = new URL(event.request.url);

  // 2. Never cache cross-origin responses. Let them go straight to the network.
  if (url.origin !== location.origin) return;

  // 3. Stale-while-revalidate for same-origin, network fallback to offline page.
  event.respondWith((async () => {
    const cache = await caches.open(CACHE);
    const cached = await cache.match(event.request);
    const networking = fetch(event.request).then(resp => {
      if (resp.ok && resp.type === "basic") cache.put(event.request, resp.clone());
      return resp;
    }).catch(() => null);

    return cached || (await networking) ||
           (event.request.mode === "navigate" ? cache.match("/offline.html") : Response.error());
  })());
});
```

**Why this matters for storage:** if the SW caches a poisoned cross-origin script, the poison persists across reloads. The pattern above means a compromised CDN affects at most one session, not forever. With vendored scripts (recommended), the question doesn't arise.

**FSA bypasses the service worker.** FSA reads and writes are direct OS calls — they do not go through `fetch()`, and the SW cannot intercept or cache them. This is good (the SW can't corrupt FSA data) and worth knowing (you cannot debug FSA traffic in DevTools' Network tab).

### 4.7 Content Security Policy

Ship a CSP via `<meta http-equiv>` in `index.html`. The HTTP header version is stronger but GitHub Pages and similar static hosts can't set custom headers; the meta tag is sufficient for most cases.

```html
<meta http-equiv="Content-Security-Policy" content="
  default-src 'self';
  script-src 'self';
  style-src  'self' 'unsafe-inline';
  img-src    'self' data: blob:;
  font-src   'self';
  connect-src 'self';
  object-src 'none';
  base-uri 'self';
  form-action 'self';
  frame-ancestors 'none';
  manifest-src 'self';
  require-trusted-types-for 'script';
  trusted-types default;
">
```

Notes:
- `script-src 'self'` rules out **all** inline JS, including `onclick=` attributes. This is intentional — it is the cheapest possible defense against the filename-injection class of bugs from §3.1.
- `require-trusted-types-for 'script'` and `trusted-types default` turn `innerHTML`, `eval`, `Function` and similar sinks into runtime errors unless the value has passed through a registered Trusted Types policy. This makes rule §3.3.1 enforceable in dev, not aspirational. Chromium supports it; Safari and Firefox ignore unknown CSP directives, so this is defense-in-depth that fails open on other browsers.
- `style-src 'unsafe-inline'` is a common compromise. The most realistic residual risk it leaves open is **CSS-injection keylogging via attribute selectors**: an attacker who can inject a `<style>` block writes rules like `input[value^="a"] { background-image: url(/leak/a); }`. The `url()` is gated by `img-src`, so external exfil is blocked by the example CSP — but same-origin URLs are not, so any endpoint on your own origin that logs requests (server access logs, analytics, anything that records the request path) becomes an exfil channel. On a static host with no request logging, the risk is lower but not zero (a stale SW cache entry can still surface a logged path on next deploy). If your framework supports nonces, tighten: `style-src 'self' 'nonce-…'`.
- If you must load a vendor script from a CDN, list its specific origin (`script-src 'self' https://cdn.jsdelivr.net`) and add `integrity="sha384-…" crossorigin="anonymous"` on the `<script>` tag.
- `manifest-src` in a meta-CSP is silently ignored by Chromium for the manifest fetch itself (the manifest is requested before the meta tag is parsed). For full coverage, serve a real `Content-Security-Policy` HTTP header.
- Tight `connect-src` means a compromised script *cannot exfiltrate* to a random origin. Tighten this aggressively.

**Trusted Types skeleton.** With `require-trusted-types-for 'script'` set, every sink that takes a string needs a policy. Most apps need only one — a default policy that throws, so any unaudited write fails loudly:

```js
// tt-policy.js — load before any UI code.
if (window.trustedTypes && window.trustedTypes.createPolicy) {
  window.trustedTypes.createPolicy("default", {
    createHTML:      () => { throw new Error("innerHTML sink: use textContent and DOM construction"); },
    createScript:    () => { throw new Error("createScript not permitted"); },
    createScriptURL: () => { throw new Error("createScriptURL not permitted"); },
  });
}
```

**Library policies.** Some libraries create their own named Trusted Types policy. Examples: DOMPurify creates a `dompurify` policy when configured with `{RETURN_TRUSTED_TYPE: true}`; Lit creates a `lit-html` policy in some versions. Check each library's documentation for the exact policy name and whether it is created automatically. When you add such a library, extend the CSP directive so the policy name is allowlisted:

```
trusted-types default dompurify lit-html;
```

Libraries that auto-create policies will throw at policy creation under `trusted-types default;` alone — this is the desired behavior for unaudited code but breaks legitimate sanitizers until the directive is updated.

If you have a legitimate `innerHTML` site (a static template, say), give it its own named policy, not the default.

### 4.8 Concurrency: locks, lock order, multi-tab

The FSA spec offers minimal concurrency guarantees. Two operations against the same file can interleave, and one may overwrite the other. Two tabs of the same origin share the same handle (via IDB) and can race each other.

Use **Web Locks** (`navigator.locks`) for an in-process and cross-tab mutex. It is widely supported (Chromium ≥ 69, Firefox ≥ 96, Safari ≥ 15.4) and serializes callers by string name.

```js
async function withLock(name, fn) {
  // Exclusive mode is the default. Lock name is scoped to the origin.
  return navigator.locks.request(name, async () => fn());
}
```

**Single locking scheme.** Every lock name comes from `lockKey(relPath)` (§4.3). This guarantees that `writeBytes("foo")`, `rename("foo", "bar")`, and `duplicate("foo")` all serialize against each other through the same name.

#### Lock acquisition order

To prevent deadlock under concurrent multi-tab use, follow these rules. Treat them as part of the public contract of `storage.js` — code review should reject changes that violate them.

1. **Per-path uniqueness.** A given path has exactly one lock name, produced by `lockKey(relPath)`. `splitPath` canonicalizes the path so every caller agrees.
2. **Lexicographic ordering when holding multiple locks.** When a function needs two locks (notably `rename`, which takes source and destination), acquire them in lexicographic order of their full lock-name string. Apply this rule to any future code that takes more than one.
3. **`.app/audit.log` is a leaf.** It is always the *last* lock acquired in any chain. No code path may acquire another `write:` lock while holding `write:.app/audit.log`. `audit()` is safe to call from inside any other write-locked function precisely because of this rule.
4. **Public API rejects `.app/` paths.** This is the structural enforcement of rule 3: a public caller cannot accidentally route a write through `lockKey(".app/audit.log")` and deadlock the audit lock against itself.
5. **Reads are unlocked.** They see a snapshot of the file at `getFile()` time; if a write commits during a read, the read returns pre-write bytes. Acquiring read locks would slow down listing and offer no useful guarantee given how FSA reads already work.

If you add a new lock-acquiring function, write its lock-order contract in a comment above its definition. The rules above are enforceable by reading the code; nothing in the runtime catches a violation.

**Multi-tab fallback.** If you must support browsers without Web Locks, fall back to an in-process `Promise` chain keyed by name. This handles the single-tab case but does not serialize across tabs. Document this clearly in your support matrix.

**TOCTOU residual.** Web Locks serialize *your* app, not the entire filesystem. A second process (a sync client, VS Code, the user) can drop or modify a file between your `sanitizeName(name)` and your `getFileHandle(name)`. There is no portable defense; the mitigations are: keep the app folder out of cloud-sync locations (§5.3), keep the app's writes atomic at the rename boundary (§4.2), and detect external changes on each read so the UI reflects truth.

### 4.9 Reads, remaining mutations, events

The implementations below complete the public surface declared in §4.1.

```js
// storage.js (continued)

// ---------- Reads ----------

async function list(relPath, { includeHidden = false } = {}) {
  requireReady();
  const dir = await resolveDir(relPath);
  const out = [];
  for await (const entry of dir.values()) {
    if (!includeHidden && entry.name.startsWith(".")) continue;     // skip dotfiles and temps
    let size, modified;
    if (entry.kind === "file") {
      try {
        const f = await entry.getFile();
        size = f.size;
        modified = f.lastModified;
      } catch { /* may be a transient ENOENT — leave undefined */ }
    }
    out.push({ name: entry.name, kind: entry.kind, size, modified });
  }
  // Stable order: NFC-normalized, case-insensitive sort by name.
  out.sort((a, b) => {
    const an = a.name.normalize("NFC").toLowerCase();
    const bn = b.name.normalize("NFC").toLowerCase();
    return an < bn ? -1 : an > bn ? 1 : 0;
  });
  return out;
}

async function readBytes(relPath) {
  requireReady();
  // No guardPublicPath here: reads are safe under .app/. The guard exists
  // to prevent the audit self-deadlock, which is a write-only concern.
  // The Settings → Activity log UX in §5.4 depends on this.
  const { dir, name } = await resolveParent(relPath);
  const safeName = sanitizeName(name);
  const handle = await dir.getFileHandle(safeName);
  const file = await handle.getFile();
  return new Uint8Array(await file.arrayBuffer());
}

async function readText(relPath) {
  const bytes = await readBytes(relPath);
  return new TextDecoder("utf-8", { fatal: true }).decode(bytes);
}

// Use when the caller knows the file may not be valid UTF-8 (e.g., reading
// a user-supplied document). Replaces invalid sequences with U+FFFD instead
// of throwing.
async function readTextLossy(relPath) {
  const bytes = await readBytes(relPath);
  return new TextDecoder("utf-8", { fatal: false }).decode(bytes);
}

async function resolveDir(relPath) {
  // resolveDir("")  → rootHandle
  // resolveDir("a") → rootHandle/a
  if (relPath === "" || relPath === "/") return rootHandle;
  const parts = splitPath(relPath);
  let dir = rootHandle;
  for (const seg of parts) {
    try {
      dir = await dir.getDirectoryHandle(seg, { create: false });
    } catch (e) {
      if (e.name === "TypeMismatchError") {
        throw new StorageError("path_collision", { segment: seg });
      }
      throw e;
    }
  }
  return dir;
}

// ---------- Mutations ----------

// rename is leaf-only: it renames within the same parent directory and
// returns the new relPath. To move a file to a different folder, use
// readBytes + writeBytes({ifAbsent:true}) + remove. A path-changing rename
// would require multi-parent locks and is intentionally out of scope.
//
// Lock contract: rename takes lockKey(srcPath) and lockKey(dstPath), in
// lexicographic order. Both must be acquired before any FSA operation.
// On browsers without handle.move(), falls back to copy-then-remove.
async function rename(relPath, newName) {
  guardPublicPath(relPath);
  const safeNew = sanitizeName(newName);
  // Reject ".app" exactly so a root-level rename can't shadow the app's
  // bookkeeping directory. Names that merely *start with* ".app" (e.g.
  // ".apple.txt") are fine — guardPublicPath already prevented the source
  // path from being under .app/, so the destination cannot land there.
  if (safeNew === ".app") {
    throw new StorageError("reserved_path", { name: safeNew });
  }

  const srcParts = splitPath(relPath);
  const safeOld = srcParts.pop();
  const parentSegs = srcParts;
  if (safeOld === safeNew) return relPath;

  const srcPath = [...parentSegs, safeOld].join("/");
  const dstPath = [...parentSegs, safeNew].join("/");
  const a = `write:${srcPath}`;
  const b = `write:${dstPath}`;
  const [first, second] = a < b ? [a, b] : [b, a];

  return withLock(first, () => withLock(second, async () => {
    requireReady();
    const dir = parentSegs.length ? await resolveDir(parentSegs.join("/")) : rootHandle;

    // Resolve the source. Try file first; fall back to directory.
    let handle, sourceKind;
    try {
      handle = await dir.getFileHandle(safeOld);
      sourceKind = "file";
    } catch (e) {
      if (e.name !== "NotFoundError" && e.name !== "TypeMismatchError") throw e;
      try {
        handle = await dir.getDirectoryHandle(safeOld);
        sourceKind = "directory";
      } catch (e2) {
        if (e2.name === "NotFoundError") throw new StorageError("source_not_found");
        throw e2;
      }
    }

    // Refuse to silently overwrite — check both file and directory at the destination.
    const collision = await probeEntry(dir, safeNew);
    if (collision !== null) throw new StorageError("target_exists", { kind: collision });

    let atomic = true;
    if (typeof handle.move === "function") {
      await handle.move(dir, safeNew);
    } else {
      // Non-atomic fallback. Only files are supported here; directory rename
      // without move() would require recursive copy and is not implemented.
      if (sourceKind !== "file") {
        throw new StorageError("move_unsupported", { kind: sourceKind });
      }
      atomic = false;
      const bytes = new Uint8Array(await (await handle.getFile()).arrayBuffer());
      // writeBytesInternal so the guard on .app/ doesn't reject a legitimate
      // rename within the user-visible tree. The guardPublicPath check at the
      // top of rename has already excluded .app/ paths from both sides.
      await writeBytesInternal(dstPath, bytes, { ifAbsent: true });
      try { await dir.removeEntry(safeOld); }
      catch (e) {
        // The copy succeeded but the remove failed; the source still exists.
        // Surface a structured error so the UX can offer to delete manually.
        throw new StorageError("rename_orphan", { src: srcPath, dst: dstPath });
      }
    }
    await audit("rename", { from: srcPath, to: dstPath, atomic });
    return dstPath;
  }));
}

async function remove(relPath, { recursive = false } = {}) {
  guardPublicPath(relPath);
  return withLock(lockKey(relPath), async () => {
    requireReady();
    const { dir, name } = await resolveParent(relPath);
    const safeName = sanitizeName(name);
    try {
      await dir.removeEntry(safeName, { recursive: !!recursive });
    } catch (e) {
      if (e.name === "InvalidModificationError") {
        // Directory not empty and recursive was false.
        throw new StorageError("not_empty");
      }
      if (e.name === "NotFoundError") throw new StorageError("source_not_found");
      throw e;
    }
    await audit("remove", { path: relPath, recursive });
  });
}

// duplicate finds the first available name like "foo (copy).txt",
// "foo (copy 2).txt", ... and writes the copy. The existence check
// happens inside writeBytes's lock via ifAbsent:true, so two concurrent
// duplicates of the same source produce two distinct targets.
async function duplicate(relPath) {
  guardPublicPath(relPath);
  requireReady();
  const srcBytes = await readBytes(relPath);
  const parts = splitPath(relPath);
  const baseName = parts.pop();
  const parentSegs = parts;

  for (let n = 1; n < 1000; n++) {
    const candidate = nextCopyName(baseName, n);
    const newPath = [...parentSegs, candidate].join("/");
    try {
      await writeBytes(newPath, srcBytes, { ifAbsent: true });
      await audit("duplicate", { from: relPath, to: newPath });
      return newPath;
    } catch (e) {
      if (e instanceof StorageError && e.code === "target_exists") continue;
      throw e;
    }
  }
  throw new StorageError("duplicate_exhausted");
}

function nextCopyName(safeName, n) {
  const dot = safeName.lastIndexOf(".");
  const base = dot > 0 ? safeName.slice(0, dot) : safeName;
  const ext  = dot > 0 ? safeName.slice(dot)    : "";
  return n === 1 ? `${base} (copy)${ext}` : `${base} (copy ${n})${ext}`;
}

async function mkdir(relPath) {
  guardPublicPath(relPath);
  return withLock(lockKey(relPath), async () => {
    requireReady();
    const parts = splitPath(relPath);
    let dir = rootHandle;
    for (const seg of parts) {
      try {
        dir = await dir.getDirectoryHandle(seg, { create: true });
      } catch (e) {
        if (e.name === "TypeMismatchError") {
          throw new StorageError("path_collision", { segment: seg });
        }
        throw e;
      }
    }
    await audit("mkdir", { path: relPath });
  });
}

// ---------- Events ----------

function on(eventName, fn) {
  if (!listeners.has(eventName)) listeners.set(eventName, new Set());
  listeners.get(eventName).add(fn);
  return () => listeners.get(eventName)?.delete(fn);
}

function emit(eventName, payload) {
  const set = listeners.get(eventName);
  if (!set) return;
  for (const fn of set) {
    try { fn(payload); } catch (e) { /* listener errors must not break storage */ }
  }
}
```

The `list` function skips dotfiles (including the `.app/` directory and any `.tmp` orphans) by default. UI code that wants to surface the audit log should call `Storage.list(".app", { includeHidden: true })` — and yes, `list` accepts `.app/` paths even though `writeBytes` does not, because reading is safe and the audit-log viewer needs it.

**Cross-directory moves.** `rename` is leaf-only by design. To move a file to a different folder:

```js
const bytes = await Storage.readBytes(oldPath);
await Storage.writeBytes(newPath, bytes, { ifAbsent: true });
await Storage.remove(oldPath);
```

This is not atomic — a crash between the write and the remove leaves both copies. For atomic cross-directory moves, you would need multi-parent locks and a directory-aware version of the same temp+rename dance, which is out of scope for this guide.

---

## 5. UX patterns

### 5.1 First-run flow

Five screens, in this order:

1. **Why we need a folder.** One paragraph. Be specific about: it stays on your machine, you can move/back it up, we never see it. No marketing fluff.
2. **Pick a folder.** A single primary button (`Choose folder…`). Below it, a "Recommended location: your Documents folder (not OneDrive — see why)" link that opens an info popover.
3. **Foreign-folder confirmation, if triggered.** When `pickRoot()` returns `false`, the picked folder already contains a `MyApp/` directory that isn't ours. Show:

   > **There's already a folder called "MyApp" here.**
   >
   > It might belong to another app, or it might be a leftover. We don't want to overwrite anything important.
   >
   > [ Use a nested folder inside it ]   [ Pick a different folder ]

   "Use a nested folder" calls `Storage.adoptForeignFolder(true)`, which creates `<picked>/MyApp/MyApp/`. "Pick a different folder" reopens the picker.
4. **Sync confirmation.** Always ask, regardless of any heuristic detection (§5.3 explains why). One question, two options.
5. **Confirmation.** Show the resolved path (`Storage.rootName()`). Offer a **Change folder** secondary action.

Example copy for screen 1:

> **Where should we keep your data?**
>
> The app needs a folder on your computer to store your projects. The files stay on your device — we never see them. You can move them, back them up, or open them in other tools any time.
>
> We'll create a single folder called **MyApp** inside the location you pick. Everything else stays untouched.
>
> [ Choose folder… ]

### 5.2 Re-auth flow

On every page load, `Storage.init()` restores the handle and queries permission. If `Storage.hasRoot() && !Storage.isReady()`, surface a single banner:

```
+-----------------------------------------------------------+
|  MyApp needs permission to open your folder.              |
|  [ Reconnect ]              (remembered for this site)    |
+-----------------------------------------------------------+
```

Show "(remembered for this site)" when `await Storage.detectPersistentPermissions()` returns true, so users understand why later visits won't re-prompt. The Reconnect button calls `Storage.ensurePermission()` (which calls `requestPermission` from the user gesture). Never auto-trigger this — it will throw `StorageError("gesture_required")`.

### 5.3 Folder-location guidance

OneDrive, iCloud, Dropbox, and Google Drive sync the user's Documents folder by default on most setups. This is fine for backup but can interfere with atomic writes (sync clients sometimes hold file handles open) and quota-burns the user's cloud plan.

**FSA does not give the app the absolute path of the picked folder.** Only `handle.name` (the basename) is available. This means we can detect the *obvious* case — the user clicking the literal `OneDrive` folder — but cannot detect the much more common case where OneDrive is silently syncing the user's `Documents/`. There is no programmatic fix.

```js
function maybeCloudSyncedHint(handle) {
  // Last-ditch heuristic. Only catches the case where the user picked
  // the cloud-sync root itself; misses Documents-synced setups entirely.
  const n = (handle.name || "").toLowerCase();
  return /^(onedrive|onedrive - .+|icloud drive|dropbox|google drive|nextcloud)$/.test(n);
}
```

The reliable mitigation is to **always ask the user** during first-run:

> **Is this folder synced to a cloud service?**
>
> OneDrive, iCloud, Dropbox, and Google Drive will upload everything you save here. That's fine if you want a backup, but it can slow the app and use your cloud storage quota.
>
> [ Yes, that's fine ]   [ No, let me pick a different folder ]

For users who answer "yes", proceed and store a flag in IndexedDB so you don't ask again. For users who answer "no", reopen the picker.

Recommend `C:\Users\<name>\AppData\Local\<AppName>` on Windows or `~/Library/Application Support/<AppName>` on macOS for app-private storage if cloud sync is undesirable. For user-visible storage, a non-synced subfolder of Documents is best.

### 5.4 Audit log

A simple append-only log inside `.app/audit.log` shows users (and you) what the app has written. Format: one JSON object per line, newline-delimited.

**Schema.** Both the on-disk line and the `Storage.on("audit", …)` event payload use the same shape:

```json
{"time": "2026-05-14T13:31:09.214Z", "action": "write", "path": "notes/today.md", "bytes": 1024, "atomic": true}
```

The canonical keys (`time`, `action`) appear *after* the detail spread in the implementation so a caller's `detail.action` cannot shadow the real one.

**Dual emission on the non-atomic rename fallback.** When `rename` falls back to read-write-delete on a browser without `handle.move()`, it correctly emits two records: a `write` (created by `writeBytesInternal`, `atomic: false`) and a `rename` (`atomic: false`). This reflects what actually happened on disk — a write followed by a remove — and the two records share the same destination path within milliseconds. Telemetry consumers that want to count user-visible operations rather than syscalls should de-duplicate by destination path within a short time window when `atomic === false`. The atomic path emits only the `rename` record.

Use **seek-to-end with `keepExistingData: true`** for O(1) append, not read-the-whole-file-and-rewrite. The audit lock is `write:.app/audit.log` — the same path-based key as any other file. Per §4.8 rule 3, this lock is always acquired last; the surrounding write functions hold their own per-path locks when they call `audit()`.

```js
const AUDIT_LOCK = "write:.app/audit.log";

async function audit(action, detail) {
  if (!isReady()) return;
  // Canonical keys after the spread so detail cannot override them.
  const record = { ...detail, time: new Date().toISOString(), action };
  const line = JSON.stringify(record) + "\n";

  await withLock(AUDIT_LOCK, async () => {
    const handle = await ensureAuditFile();
    const file = await handle.getFile();
    const writable = await handle.createWritable({ keepExistingData: true });
    try {
      await writable.seek(file.size);
      await writable.write(new TextEncoder().encode(line));
      await writable.close();
    } catch (e) {
      try { await writable.abort(); } catch {}
      throw e;
    }
  });

  emit("audit", record);
}

async function ensureAuditFile() {
  const appDir = await rootHandle.getDirectoryHandle(".app", { create: true });
  return appDir.getFileHandle("audit.log", { create: true });
}
```

**Rotation and retention.** The log will still grow without bound over years. Roll over when it exceeds a size threshold; sweep older rotated files past a count cap. The function has two paths — atomic move on modern Chromium, copy-then-truncate on older versions — so it works everywhere.

```js
const AUDIT_MAX_BYTES   = 8 * 1024 * 1024;   // rotate at 8 MB
const AUDIT_KEEP_ROTATED = 8;                // keep the most recent 8 rotated files

async function maybeRotateAuditLog() {
  await withLock(AUDIT_LOCK, async () => {
    const appDir = await rootHandle.getDirectoryHandle(".app", { create: true });
    let handle;
    try { handle = await appDir.getFileHandle("audit.log"); } catch { return; }
    const f = await handle.getFile();

    if (f.size >= AUDIT_MAX_BYTES) {
      const stamp = new Date().toISOString().replace(/[:.]/g, "-");
      const rotatedName = `audit-${stamp}.log`;

      if (typeof handle.move === "function") {
        await handle.move(appDir, rotatedName);
        // Next audit() call will create a fresh audit.log via ensureAuditFile.
      } else {
        // Fallback: copy current → audit-<stamp>.log, then truncate the original.
        // Crash window: a crash between the copy completing and the truncate
        // leaves the rotated copy on disk and the original full. Next rotation
        // attempt will retry. This is acceptable for an audit log.
        const rotated = await appDir.getFileHandle(rotatedName, { create: true });
        const wCopy = await rotated.createWritable({ keepExistingData: false });
        try { await wCopy.write(f); await wCopy.close(); }
        catch (e) { try { await wCopy.abort(); } catch {}; throw e; }

        const wTrunc = await handle.createWritable({ keepExistingData: false });
        try { await wTrunc.close(); }
        catch (e) { try { await wTrunc.abort(); } catch {}; throw e; }
      }
    }

    // Retention sweep: list rotated files, sort by name (timestamp is ISO-like
    // so lexicographic order == chronological order), delete the oldest past
    // AUDIT_KEEP_ROTATED.
    const rotated = [];
    for await (const entry of appDir.values()) {
      if (entry.kind === "file" && /^audit-.*\.log$/.test(entry.name)) {
        rotated.push(entry.name);
      }
    }
    rotated.sort();   // oldest first
    while (rotated.length > AUDIT_KEEP_ROTATED) {
      const oldest = rotated.shift();
      try { await appDir.removeEntry(oldest); } catch {}
    }
  });
}
```

`init()` calls `maybeRotateAuditLog()` automatically (non-blocking) when the app starts with a granted permission. It is also exported on `Storage` so the app can trigger rotation manually (for example, after a long session or after explicit user action).

Surface a **Settings → Activity log** view that reads and renders the audit log file. Render every line via `textContent`, never `innerHTML`. Users will trust an app that shows them its own actions.

### 5.5 Error states

Each error class needs a distinct UX:

| Error                     | What to show                                                | Action               |
|---------------------------|-------------------------------------------------------------|----------------------|
| `permission_denied`       | "Reconnect" banner (§5.2)                                   | User-gesture reconn  |
| `gesture_required`        | Same as `permission_denied` — likely a coding bug           | Bind to a click      |
| `no_root`                 | First-run picker (§5.1)                                     | Choose folder        |
| `not_ready`               | "Reconnect" banner (§5.2)                                   | User-gesture reconn  |
| `foreign_app_folder`      | Foreign-folder confirmation screen (§5.1 step 3)            | Nest or repick       |
| `no_pending_adoption`     | Coding bug — call `pickRoot` first                          | Bug fix              |
| `acknowledgment_required` | UX did not pass `true` — coding bug                         | Bug fix              |
| `reserved_path`           | Inline form error: "Names starting with `.app/` are reserved" | User picks new name |
| `forbidden_char`/`empty`/`control_char`/`separator`/`traversal`/`reserved` | Inline form error on rename/new dialog | User edits the name  |
| `too_long` / `path_too_long` | Inline form error with character count                   | User shortens        |
| `target_exists`           | Inline error: "A file by that name already exists"          | User picks new name  |
| `source_not_found`        | "This file was moved or deleted outside the app"            | Refresh listing      |
| `path_collision`          | "A file blocks the folder this app needs to create"         | User reorganizes     |
| `not_empty`               | "This folder isn't empty. Delete its contents?"             | Confirm + recursive  |
| `rename_orphan`           | "Copy succeeded but the original couldn't be removed"       | Offer manual delete  |
| `NotFoundError` (FSA)     | "This file was moved or deleted outside the app"            | Refresh listing      |
| `QuotaExceededError`      | "Out of disk space"                                         | None                 |
| `AbortError` (picker)     | Silent — `pickRoot` returns `null`                          | None                 |
| `move_unsupported`        | "Renaming this folder requires a newer browser."            | None                 |
| `duplicate_exhausted`     | "More than 1000 copies of this file already exist."         | User cleans up       |
| `bad_data_type`           | Coding bug — pass `Uint8Array` or `Blob`                    | Bug fix              |

### 5.6 In-app dialogs

`prompt()`, `confirm()`, and `alert()` are blocked in installed PWAs on some platforms and bypass your sanitizer. Build three small custom elements. A minimal `<app-prompt>` follows; `<app-confirm>` and `<app-toast>` are structurally similar (< 100 lines each).

```js
// app-prompt.js — minimal custom element. Style the shell with your design system.

class AppPrompt extends HTMLElement {
  constructor() {
    super();
    this._shadow = this.attachShadow({ mode: "open" });
    this._resolve = null;
    this._validator = null;
  }

  connectedCallback() {
    // Build the DOM imperatively; never innerHTML on shadow root with user data.
    const wrap = document.createElement("div");
    wrap.className = "panel";

    const label = document.createElement("p");
    label.id = "label";

    const input = document.createElement("input");
    input.id = "input";
    input.autocomplete = "off";
    input.autocapitalize = "off";
    input.spellcheck = false;

    const err = document.createElement("div");
    err.id = "err";
    err.className = "err";

    const actions = document.createElement("div");
    actions.style.textAlign = "right";
    actions.style.marginTop = "0.5rem";

    const cancel = document.createElement("button");
    cancel.id = "cancel";
    cancel.textContent = "Cancel";

    const ok = document.createElement("button");
    ok.id = "ok";
    ok.textContent = "OK";

    actions.append(cancel, ok);
    wrap.append(label, input, err, actions);

    const style = document.createElement("style");
    style.textContent = `
      :host { display: none; position: fixed; inset: 0; background: rgba(0,0,0,.4);
              align-items: center; justify-content: center; z-index: 1000; }
      :host([open]) { display: flex; }
      .panel { background: var(--app-bg, #fff); padding: 1rem;
               min-width: 320px; border-radius: 8px; }
      .err { color: var(--app-err, #b00); font-size: 0.9em; min-height: 1.2em; }
      button { margin-left: 0.5em; }
    `;

    this._shadow.append(style, wrap);
    this._input = input;
    this._err   = err;
    this._label = label;

    ok.addEventListener("click",      () => this._submit());
    cancel.addEventListener("click",  () => this._cancel());
    input.addEventListener("input",   () => this._validate());
    input.addEventListener("keydown", (e) => {
      if (e.key === "Enter")  this._submit();
      if (e.key === "Escape") this._cancel();
    });
  }

  open({ label, placeholder = "", validator = null } = {}) {
    this._label.textContent = label || "";     // textContent — never innerHTML
    this._input.placeholder = placeholder;
    this._input.value = "";
    this._err.textContent = "";
    this._validator = validator;
    this.setAttribute("open", "");
    this._input.focus();
    return new Promise(resolve => { this._resolve = resolve; });
  }

  _validate() {
    if (!this._validator) return true;
    try {
      this._validator(this._input.value);
      this._err.textContent = "";
      return true;
    } catch (e) {
      this._err.textContent = e.code || e.message || "Invalid";
      return false;
    }
  }

  _submit() {
    if (!this._validate()) return;
    const v = this._input.value;
    this.removeAttribute("open");
    const r = this._resolve; this._resolve = null;
    if (r) r(v);
  }

  _cancel() {
    this.removeAttribute("open");
    const r = this._resolve; this._resolve = null;
    if (r) r(null);
  }
}
customElements.define("app-prompt", AppPrompt);
```

Usage:

```js
import { Storage, StorageError } from "/scripts/storage.js";

const promptEl = document.querySelector("app-prompt");
const newName = await promptEl.open({
  label: "Rename file to:",
  placeholder: "filename.txt",
  // The validator throws StorageError on bad input; the dialog displays e.code.
  // The storage module re-validates internally, so this is a UX echo, not security.
  validator: (v) => { /* call sanitizeName via a thin wrapper if you export it,
                         or duplicate the rule set here */ },
});
if (newName !== null) {
  try {
    const newPath = await Storage.rename(currentPath, newName);
    currentPath = newPath;     // rename returns the new relPath
  } catch (e) {
    if (e instanceof StorageError && e.code === "target_exists") {
      // surface via toast
    } else { throw e; }
  }
}
```

All three components render same-origin DOM via `textContent` and DOM construction, never `innerHTML` on input strings.

---

## 6. Testing checklist

For each new app, run through this list before shipping.

### Security
- [ ] CSP meta tag present, `script-src` excludes `'unsafe-inline'`, `require-trusted-types-for 'script'` set
- [ ] Default Trusted Types policy throws on `createHTML` / `createScript`
- [ ] No `onclick=`/`onload=` attributes in any HTML
- [ ] Every external script has `integrity=` and a pinned version, or is vendored
- [ ] No `innerHTML` write with any string derived from FS, prompt, or upload
- [ ] All filename inputs pass through `sanitizeName`; all relative paths through `splitPath`
- [ ] Every lock name comes from `lockKey()` — no hand-built `write:…` strings
- [ ] Traversal payload (`../../etc/passwd`) rejected at every entry point
- [ ] Total path length > `MAX_PATH_LEN` rejected
- [ ] `writeBytes(".app/audit.log", …)` rejected with `reserved_path` (no deadlock)
- [ ] `readText(".app/audit.log")` **succeeds** (returns a string); `writeText(".app/audit.log", …)` is rejected with `reserved_path` (this is the asymmetric read/write rule that the Settings → Activity log UX in §5.4 depends on)
- [ ] `rename(".app/x", "y")` and `rename("x", ".app")` both rejected with `reserved_path`
- [ ] Service worker does not cache cross-origin responses
- [ ] `FileSystemDirectoryHandle` is referenced only inside `storage.js`
- [ ] `sanitizeName`, `splitPath`, `lockKey` pass the Appendix C corpus

### Correctness
- [ ] Every public write goes through `writeBytes`/`writeText` (no raw `createWritable` outside `storage.js`)
- [ ] Kill the browser mid-write — verify original file is intact
- [ ] Power off the laptop mid-write — verify either old or new content; never zero-length under the real name
- [ ] Rename to existing **file** name → rejected with `target_exists`
- [ ] Rename to existing **directory** name → rejected with `target_exists` (`detail.kind === "directory"`)
- [ ] Rename non-existent path → `source_not_found` (not raw `NotFoundError`)
- [ ] Rename returns the new relPath (test that `await rename(...)` is a string, not undefined)
- [ ] Create file named `CON.txt` → rejected
- [ ] Create file named `<script>alert(1)</script>.txt` → rejected
- [ ] Create file at `a/b/c.txt` where `a/b` is a regular file → `path_collision` (not raw `TypeMismatchError`)
- [ ] Pick the same folder twice → no duplicate `AppName/AppName/` nesting
- [ ] Pick the `AppName/` folder itself → reused (detected via `.app/version`)
- [ ] Pick an unrelated folder containing `AppName/` (no `.app/version`) → `pickRoot()` returns `false`; `adoptForeignFolder(true)` then creates `AppName/AppName/`
- [ ] Bump `APP_ID` to a new value with `APP_ID_HISTORY` retaining the old → existing installation still recognized
- [ ] Two simultaneous `writeBytes` to the same path → serialized; both succeed in order
- [ ] Two tabs renaming the same file → one succeeds, one surfaces `target_exists` or `source_not_found`
- [ ] Two concurrent `duplicate("foo.txt")` → produce `foo (copy).txt` and `foo (copy 2).txt`, both with full content
- [ ] `writeBytes(p, data, {ifAbsent: true})` on existing path → `target_exists`, original untouched
- [ ] Audit log append at 100k entries → < 50 ms per append
- [ ] Audit log on-disk schema matches `Storage.on("audit", …)` payload shape
- [ ] Audit `detail.action` cannot shadow the canonical `action` field
- [ ] Audit log rotates at threshold using `move()` (modern Chromium)
- [ ] Audit log rotates at threshold using copy-then-truncate (force the fallback path)
- [ ] Rotated audit files past `AUDIT_KEEP_ROTATED` are deleted
- [ ] `readText` on non-UTF-8 file → throws; `readTextLossy` returns replacement chars
- [ ] `pickRoot` returns `null` when the user cancels the picker (test by spying on `AbortError`)

### Permissions
- [ ] First run shows picker; second run does not
- [ ] Revoke permission in browser settings; reload → Reconnect banner shows
- [ ] Click Reconnect → permission prompt; grant → app works
- [ ] Click Reconnect → deny → app shows denied state, not crash
- [ ] `ensurePermission()` outside a user gesture → `gesture_required`, not raw `NotAllowedError`
- [ ] Wipe IDB → reload → first-run flow
- [ ] Re-pick the same folder after IDB wipe → all files visible (adoption via `.app/version`)
- [ ] When `detectPersistentPermissions()` returns true, banner shows "(remembered for this site)"
- [ ] `emit("permissionchange")` fires unconditionally on `init()` and `ensurePermission()` (test by counting listener invocations)

### UX
- [ ] Path basename shown via `Storage.rootName()`
- [ ] First-run sync question always asked, regardless of heuristic
- [ ] Foreign-folder screen shows when `pickRoot` returns `false`
- [ ] Audit log shows recent operations
- [ ] Audit log rotates at threshold
- [ ] Offline page renders when network is down

---

## 7. Browser support & fallbacks

| Browser              | `showDirectoryPicker` | `handle.move()` | Persistent permissions | Notes                    |
|----------------------|:---------------------:|:---------------:|:----------------------:|--------------------------|
| Edge (Chromium)      |           ✓           |        ✓        |           ✓            | primary target           |
| Chrome ≥ 110         |           ✓           |        ✓        |           ✓            | works                    |
| Chrome < 110         |           ✓           |        ✗        |           ✓            | degraded write/rename    |
| Firefox              |           ✗           |        ✗        |           ✗            | OPFS only                |
| Safari               |        partial        |        ✗        |           ✗            | OPFS only on most builds |
| Mobile (any)         |        limited        |        ✗        |           ✗            | OPFS only                |

For non-Chromium browsers, fall back to **OPFS** (`navigator.storage.getDirectory()`). The same `storage.js` API can be implemented over OPFS; only the picker disappears and the data is no longer user-visible. OPFS also exposes `createSyncAccessHandle` (synchronous, in a Worker) which is significantly faster than the async surface for small writes like audit appends — an OPFS-backed implementation should use it. Detect at init and surface a clear "limited mode" message:

```js
async function detectStorageMode() {
  if (typeof window.showDirectoryPicker === "function") return "fsa";
  if (navigator.storage?.getDirectory)                  return "opfs";
  return "none";
}
```

For "none" (very rare), tell the user the app needs a Chromium-based browser — do not try to limp along with localStorage.

---

## Appendix A — Minimal working example

A fully functional skeleton, four files, no dependencies. Drop into a folder and serve over HTTPS (or `localhost`).

### `index.html`

```html
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <meta http-equiv="Content-Security-Policy" content="
    default-src 'self';
    script-src 'self';
    style-src 'self' 'unsafe-inline';
    img-src 'self' data: blob:;
    connect-src 'self';
    object-src 'none';
    base-uri 'self';
    frame-ancestors 'none';
    manifest-src 'self';
    require-trusted-types-for 'script';
    trusted-types default;">
  <title>Local Storage Demo</title>
  <link rel="manifest" href="/manifest.webmanifest">
</head>
<body>
  <h1>Local Storage Demo</h1>

  <section id="setup" hidden>
    <p>Choose a folder for the app to store your projects.</p>
    <button id="pick">Choose folder…</button>
  </section>

  <section id="foreign" hidden>
    <p>There's already a folder called "MyApp" here.</p>
    <button id="nest">Use a nested folder</button>
    <button id="repick">Pick a different folder</button>
  </section>

  <section id="reauth" hidden>
    <p>MyApp needs permission to open your folder.</p>
    <button id="reconnect">Reconnect</button>
    <span id="persistent-note" hidden>(remembered for this site)</span>
  </section>

  <section id="main" hidden>
    <h2>Files in <span id="root-name"></span></h2>
    <ul id="files"></ul>
    <input id="name" placeholder="filename.txt">
    <textarea id="body" placeholder="content"></textarea>
    <button id="save">Save</button>
  </section>

  <!-- Trusted Types default policy must be installed before any other script. -->
  <script type="module" src="/scripts/tt-policy.js"></script>
  <script type="module" src="/scripts/app.js"></script>

  <!--
    Example of loading an external dependency with SRI.
    The integrity hash must match the byte content of the file at that URL.
    Floating versions ('latest', '@^x') are not permitted; pin the version.

  <script
    src="https://cdn.example.com/some-lib@1.2.3/dist/lib.min.js"
    integrity="sha384-EXAMPLE_HASH_REPLACE_ME"
    crossorigin="anonymous"></script>
  -->
</body>
</html>
```

### `scripts/tt-policy.js`

```js
// Runs before any other script. Installs a default Trusted Types policy
// that refuses every dynamic HTML/script sink. Any innerHTML site that
// has not been migrated to textContent/DOM construction will throw here.
if (window.trustedTypes && window.trustedTypes.createPolicy) {
  window.trustedTypes.createPolicy("default", {
    createHTML:      () => { throw new Error("innerHTML sink: use textContent"); },
    createScript:    () => { throw new Error("createScript not permitted"); },
    createScriptURL: () => { throw new Error("createScriptURL not permitted"); },
  });
}
```

### `scripts/storage.js`

Implement §4.1–§4.9 as one ES module. The full public surface:

```js
export { Storage, StorageError };

// Where:
//
//   Storage = {
//     // Lifecycle
//     init, pickRoot, ensurePermission, isReady, hasRoot, rootName,
//     detectPersistentPermissions,
//     // Maintenance
//     maybeRotateAuditLog,
//     // Adoption flow
//     adoptForeignFolder, cancelForeignAdoption,
//     // Reads
//     list, readText, readTextLossy, readBytes,
//     // Writes
//     writeText, writeBytes,
//     // Mutations
//     rename, remove, duplicate, mkdir,
//     // Events
//     on,
//   };
```

### `scripts/app.js`

The UI never sees a handle. It only calls `Storage.*` and renders via `textContent`.

```js
import { Storage, StorageError } from "/scripts/storage.js";

const $ = id => document.getElementById(id);

// Top-level await blocks initial render until IDB opens. For an app this small
// it is fine; production code should defer non-essential init until after
// first paint and gate the UI on a "ready" event from the Storage module.
await Storage.init();
await render();

$("pick").addEventListener("click", async () => {
  try {
    const result = await Storage.pickRoot();
    if (result === null) return;         // user cancelled — silent
    if (result === false) {              // foreign folder — show confirmation
      $("setup").hidden = true;
      $("foreign").hidden = false;
      return;
    }
    await render();
  } catch (e) { toast(errMsg(e)); }
});

$("nest").addEventListener("click", async () => {
  try {
    await Storage.adoptForeignFolder(true);
    $("foreign").hidden = true;
    await render();
  } catch (e) { toast(errMsg(e)); }
});

$("repick").addEventListener("click", async () => {
  Storage.cancelForeignAdoption();   // clear the pending parent before re-picking
  $("foreign").hidden = true;
  $("setup").hidden = false;
});

$("reconnect").addEventListener("click", async () => {
  try { await Storage.ensurePermission(); await render(); }
  catch (e) { toast(errMsg(e)); }
});

$("save").addEventListener("click", async () => {
  if (!Storage.isReady()) return toast("Reconnect first.");
  try {
    await Storage.writeText($("name").value, $("body").value);
    $("name").value = ""; $("body").value = "";
    await render();
  } catch (e) { toast(errMsg(e)); }
});

Storage.on("permissionchange", () => render());

async function render() {
  const ready   = Storage.isReady();
  const hasRoot = Storage.hasRoot();

  $("setup").hidden   = ready || hasRoot;
  $("reauth").hidden  = !hasRoot || ready;
  $("foreign").hidden = $("foreign").hidden;     // managed by handlers above
  $("main").hidden    = !ready;

  if (hasRoot && !ready) {
    const persistent = await Storage.detectPersistentPermissions();
    $("persistent-note").hidden = !persistent;
  }
  if (!ready) return;

  $("root-name").textContent = Storage.rootName() || "";

  const list = await Storage.list("");
  const ul = $("files");
  // Replace children safely; never innerHTML.
  while (ul.firstChild) ul.removeChild(ul.firstChild);
  for (const entry of list) {
    const li = document.createElement("li");
    li.textContent = `${entry.name} (${entry.size ?? "—"} bytes)`;
    //  ^^^^^^^^^^^   textContent for FS-derived data
    ul.append(li);
  }
}

function errMsg(e) {
  if (e instanceof StorageError) return e.code;
  return String(e?.message || e);
}

function toast(msg) {
  // Use an <app-toast> custom element in production. console.log here for brevity.
  console.log("[toast]", msg);
}
```

Register the service worker exactly as in §4.6.

---

## Appendix B — Threat model

| #  | Threat                                                      | Vector                                  | Mitigation (§)                 |
|:--:|-------------------------------------------------------------|-----------------------------------------|--------------------------------|
| 1  | Filename containing HTML rendered via `innerHTML`           | Other process / sync client drops file  | §3.3, §4.3, §4.7 (TT)          |
| 2  | File body rendered via `innerHTML`                          | User opens a malicious project          | §3.3, §4.7 (TT)                |
| 3  | Compromised CDN script ships JS with handle access          | Floating-version `<script src>` tag     | §4.7, §3.2                     |
| 4  | Stale poisoned response served from SW cache forever        | Cross-origin caching in `fetch` handler | §4.6                           |
| 5  | Mid-write crash leaves zero-length file under real name     | Naive `createWritable` truncates target | §4.2                           |
| 6  | Rename leaves both original and new file                    | Non-atomic copy-then-delete             | §4.2, §4.9 (`move()` + fallback) |
| 7  | Path traversal `../` escapes app folder                     | UI-supplied path concatenation          | §4.3 (`splitPath`)             |
| 8  | Reserved name `CON`, `NUL` on Windows                       | User input or upload                    | §4.3                           |
| 9  | Permission silently lost across sessions                    | Browser revokes by default              | §4.4, §5.2                     |
| 10 | OneDrive uploads private files                              | User picked Documents folder            | §5.3 (first-run question)      |
| 11 | Concurrent writes corrupt audit log                         | Two tabs open                           | §4.8, §5.4 (Web Locks)         |
| 12 | UI code receives handle, leaks via closure                  | Sloppy abstraction                      | §2.1, §2.2 (capability)        |
| 13 | Service worker scope mismatch breaks offline navigation     | `scope` in manifest wrong               | §4.6 + manifest review         |
| 14 | `prompt()` blocked in installed PWA                         | Platform behaviour                      | §5.6 (in-app dialogs)          |
| 15 | Total path length exceeds OneDrive's ~400-char limit        | Deep nesting + long names               | §4.3 (`MAX_PATH_LEN`)          |
| 16 | Symlink inside app folder traverses to `~/.ssh` etc.        | Hostile process or sync conflict        | §3.1, §5.3 (avoid sync)        |
| 17 | TOCTOU: sanitize → external swap → use                      | Concurrent local process                | §4.8 (residual; documented)    |
| 18 | CSS-injection keylogging via attribute selectors            | `style-src 'unsafe-inline'`             | §4.7 (tighten to nonce)        |
| 19 | Power loss after `close()` before OS flush                  | OS write-back cache                     | §4.2 (residual; documented)    |
| 20 | Audit log grows unbounded                                   | No rotation or retention                | §5.4 (`AUDIT_MAX_BYTES`, `AUDIT_KEEP_ROTATED`) |
| 21 | Lock-order inversion deadlocks two tabs                     | Inconsistent acquisition order          | §4.8 rules 2–3                 |
| 22 | Re-pick adopts an unrelated folder named `MyApp`            | Coincidental basename match             | §4.1 (`foreign_app_folder`)    |
| 23 | `duplicate` overwrites the prior copy                       | Missing existence check                 | §4.9 (`ifAbsent` + retry)      |
| 24 | `rename` target check misses directory at destination       | File-only probe                         | §4.9 (`probeEntry` both kinds) |
| 25 | Self-deadlock: public write to `.app/audit.log`             | Recursive same-name lock acquisition    | §4.2 (`guardPublicPath`)       |
| 26 | APP_ID bump orphans existing installations                  | Naive equality check on version marker  | §4.1 (`APP_ID_HISTORY`)        |
| 27 | Picker cancel surfaces as error                             | Unhandled `AbortError`                  | §4.1 (`pickRoot` returns `null`) |

**Note on threats 16 and 17.** These are filesystem-level escapes that the browser does not defend against. The browser sees the handle as a directory; if the OS-level filesystem contains a symlink at that path, FSA traversals will follow it. The realistic mitigations are organizational: keep the app folder out of cloud-sync and shared-drive locations, and treat the app folder as semi-trusted rather than fully sealed. Treating the user's folder as a hostile filesystem is the correct mental model — your sanitizer and your atomic writes are defenses against *that* environment, not assumptions of clean room.

---

## Appendix C — `sanitizeName` test corpus

Run your `sanitizeName`, `splitPath`, and `lockKey` implementations against the tables below. Each row supplies an `input` and either an expected return value (literal string or array) or an expected `StorageError.code`. Rows whose `expect` is a literal return value assert the function *returned* that value (i.e., the input was accepted, possibly after trimming). Rows whose `expect` is an error code (e.g. `"control_char"`) assert that a `StorageError` with that `.code` was thrown.

**Important:** the trailing-trim rule applies to *trailing* dots and spaces only, never to interior ones. `"foo.bar.baz"` is unmodified; `"foo.bar."` becomes `"foo.bar"`. The corpus rows marked `trailing.*` exercise that boundary.

**Control characters use `\uNNNN` escapes** so the rows are readable and survive copy-paste without losing data. A JSON parser will decode the escape to the byte under test.

### `sanitizeName`

```json
[
  { "input": "foo.txt",                "expect": "foo.txt" },
  { "input": "Hello World.md",         "expect": "Hello World.md" },
  { "input": "café.json",              "expect": "café.json" },

  { "input": "",                       "expect": "empty" },
  { "input": ".",                      "expect": "traversal" },
  { "input": "..",                     "expect": "traversal" },
  { "input": "...",                    "expect": "empty" },

  { "input": "foo/bar.txt",            "expect": "separator" },
  { "input": "foo\\bar.txt",           "expect": "separator" },

  { "input": "foo\u0000bar",           "expect": "control_char" },
  { "input": "foo\u0007bar",           "expect": "control_char" },
  { "input": "foo\u001Fbar",           "expect": "control_char" },
  { "input": "foo\u007Fbar",           "expect": "control_char" },
  { "input": "foo\nbar",               "expect": "control_char" },
  { "input": "foo\tbar",               "expect": "control_char" },

  { "input": "foo<script>.txt",        "expect": "forbidden_char" },
  { "input": "foo>bar",                "expect": "forbidden_char" },
  { "input": "foo:bar",                "expect": "forbidden_char" },
  { "input": "foo\"bar",               "expect": "forbidden_char" },
  { "input": "foo|bar",                "expect": "forbidden_char" },
  { "input": "foo?bar",                "expect": "forbidden_char" },
  { "input": "foo*bar",                "expect": "forbidden_char" },

  { "input": "trailing.   ",           "expect": "trailing" },
  { "input": "trailing.dot.",          "expect": "trailing.dot" },
  { "input": "trailing.space ",        "expect": "trailing.space" },
  { "input": "   ",                    "expect": "empty" },
  { "input": "...   ",                 "expect": "empty" },
  { "input": "foo.bar.baz",            "expect": "foo.bar.baz",   "note": "interior dots preserved" },

  { "input": "CON",                    "expect": "reserved" },
  { "input": "con",                    "expect": "reserved" },
  { "input": "CON.txt",                "expect": "reserved" },
  { "input": "PRN.json",               "expect": "reserved" },
  { "input": "NUL",                    "expect": "reserved" },
  { "input": "COM1",                   "expect": "reserved" },
  { "input": "LPT9.tmp",               "expect": "reserved" },

  { "input": "CONFIG.txt",             "expect": "CONFIG.txt" },
  { "input": "NULL.txt",               "expect": "NULL.txt" },
  { "input": "AUXILIARY",              "expect": "AUXILIARY" },

  { "input": "<construct: 'a'.repeat(201)>", "expect": "too_long" },
  { "input": "<construct: 'a'.repeat(200)>", "expect": "<echo>",   "note": "expect the input back unchanged" },

  { "input": "café",                   "expect": "café",          "note": "NFC: precomposed é" },
  { "input": "cafe\u0301",             "expect": "café",          "note": "NFD: combining acute, normalized to NFC" }
]
```

Errors should be `instanceof StorageError` with the matching `.code`. Outputs should be `===` to the expected string.

### `splitPath`

```json
[
  { "input": "",                       "expect": "empty_path" },
  { "input": "/foo",                   "expect": "empty_segment" },
  { "input": "foo//bar",               "expect": "empty_segment" },
  { "input": "foo/",                   "expect": "empty_segment" },

  { "input": "foo/bar",                "expect": ["foo","bar"] },
  { "input": "a/b/c/d.txt",            "expect": ["a","b","c","d.txt"] },

  { "input": "foo/../bar",             "expect": "traversal" },
  { "input": "foo/CON/baz",            "expect": "reserved" },

  { "input": "<construct so joined length > 380>", "expect": "path_too_long" }
]
```

### `lockKey`

```json
[
  { "input": "foo.txt",                "expect": "write:foo.txt" },
  { "input": "a/b/c.txt",              "expect": "write:a/b/c.txt" },
  { "input": ".app/audit.log",         "expect": "write:.app/audit.log",
    "note": "lockKey itself accepts .app/ — the public-API guard is separate" },

  { "input": "",                       "expect": "empty_path" },
  { "input": "//foo",                  "expect": "empty_segment" },
  { "input": "foo/..",                 "expect": "traversal" }
]
```

### `guardPublicPath` (new in v1.3; scope clarified in v1.3.1)

**Scope of the guard.** `guardPublicPath` is called by the *write* and *mutation* paths (`writeBytes`, `rename`, `remove`, `duplicate`, `mkdir`). The *read* paths (`readBytes`, `readText`, `readTextLossy`, `list`) do **not** call it — reads under `.app/` are safe and required by the Settings → Activity log UX. The corpus below tests the guard's input filter; whether a given public method calls the guard is verified by the §6 testing checklist.

```json
[
  { "input": "foo.txt",                "expect": "<ok>" },
  { "input": "subdir/foo.txt",         "expect": "<ok>" },

  { "input": ".app/audit.log",         "expect": "reserved_path" },
  { "input": ".app/version",           "expect": "reserved_path" },
  { "input": ".app",                   "expect": "reserved_path",
    "note": "exact match of the reserved prefix without trailing slash" },

  { "input": ".apple/foo",             "expect": "<ok>",
    "note": ".app must be the first segment exactly; .apple is unrelated" },
  { "input": "foo/.app/bar",           "expect": "<ok>",
    "note": ".app deeper in the path is fine; only the leading segment is reserved" }
]
```

Rows with `"expect": "<ok>"` should not throw. Rows with `"expect": "reserved_path"` should throw `StorageError("reserved_path")`.

---

*End of guide — v1.3.1*
