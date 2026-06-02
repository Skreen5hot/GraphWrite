"""System Status Communication (v3.4.0) — unified operator-facing surface.

Per Aaron 2026-06-02: anytime the substrate stops, the operator needs a
SINGLE communication file that classifies current state and tells them
what to do. Three first-class action-required states:

  - Decision Necessary: {decision message; pointer to operator_decisions.md}
  - Ready for PO Review / UAT: Test at {url}; validate at {demo-doc};
    awaiting your review.
  - Done / Ready for Release: Ready for production deployment;
    awaiting your release.

Plus two informational states:

  - Working: daemon is actively dispatching; no operator action required
  - Idle: no work pending; no PLO signal; substrate awaiting next chain

Supersedes `fnsr.operator_decisions.md` as the primary entry-point
surface; operator_decisions.md remains as the detail file when the
classification is decision-necessary (linked from the status file).

Pure-Python read-only renderer; no mutation of state.jsonld. Hooks:

  1. `state_admin status-message` — on-demand CLI emission
  2. `fnsr.status.md` — auto-refreshed file the operator's IDE can show
  3. Watchdog calls `emit()` on every probe (fnsr_stall_watch.py)
  4. Daemon calls `emit()` after each cycle (run_one_cycle hook)

Aligns with the v3.3.0 operator_decisions emission pattern + the
Phase-Readiness Auto-Detect forward-track (ft-767-...-1), which this
primitive supersedes: ft-767 scoped four missing pieces (phase
membership signal, machine-readable acceptance criteria, readiness
probe, recommendation channel); v3.4.0 ships the recommendation
channel + the readiness probe (via PLO state walk); the phase
membership + machine-readable acceptance criteria remain forward-
tracked because they're observable-pattern-bound and need >=2 phase
cycles of friction observation before a stable shape emerges.
"""
from __future__ import annotations

import datetime
import json
from pathlib import Path
from typing import Any, Optional


STATUS_FILE = "fnsr.status.md"

# Classification states (closed enumeration)
STATE_DECISION_NECESSARY = "decision-necessary"
STATE_READY_FOR_REVIEW = "ready-for-review"
STATE_READY_FOR_RELEASE = "ready-for-release"
STATE_WORKING = "working"
STATE_CHAIN_COMPLETE = "chain-complete"
STATE_IDLE = "idle"

CLASSIFICATION_STATES = (
    STATE_DECISION_NECESSARY,
    STATE_READY_FOR_REVIEW,
    STATE_READY_FOR_RELEASE,
    STATE_WORKING,
    STATE_CHAIN_COMPLETE,
    STATE_IDLE,
)

# PLO states that map to communication states. Source: CLAUDE.md
# §7.12 / surfaces/_primitives/phase-lifecycle-orchestration.md
PLO_REVIEW_STATES = ("demo-released",)
PLO_RELEASE_STATES = ("po-satisfied", "drift-reconciled")


def _load_state(state_path: Path) -> Optional[dict[str, Any]]:
    try:
        with Path(state_path).open(encoding="utf-8") as f:
            return json.load(f)
    except (OSError, json.JSONDecodeError):
        return None


def _walk_plo_events(state: dict[str, Any]) -> dict[str, dict[str, Any]]:
    """Walk state.jsonld for `phase_state_changed` audit events; return
    the latest known PLO state per phase id with associated event
    metadata (deploy_url, build_ref, notes, ts).
    """
    phase_latest: dict[str, dict[str, Any]] = {}
    for t in state.get("tasks", []) or []:
        for h in t.get("history", []) or []:
            if h.get("event") != "phase_state_changed":
                continue
            payload = h.get("payload") or {}
            phase = payload.get("phase_id")
            ts = h.get("ts")
            if not phase or not ts:
                continue
            cur = phase_latest.get(phase)
            if cur is None or ts > cur.get("ts", ""):
                phase_latest[phase] = {
                    "state": payload.get("to_state"),
                    "ts": ts,
                    "anchor_task": payload.get("anchor_task"),
                    "build_ref": payload.get("build_ref"),
                    "deploy_url": payload.get("deploy_url"),
                    "notes": payload.get("notes"),
                }
    return phase_latest


def _count_pending_decisions(state: dict[str, Any]) -> tuple[int, list[str]]:
    awaiting = [
        t for t in state.get("tasks", []) or []
        if t.get("status") == "awaiting_operator_decision"
    ]
    return len(awaiting), [t.get("@id", "") for t in awaiting]


def _dispatchable_counts(
    state: dict[str, Any],
) -> tuple[int, int, list[str]]:
    """Return (in_progress_count, dispatchable_ready_count, dispatchable_ids).
    Ready tasks are dispatchable iff every dep is status=done.
    """
    tasks = state.get("tasks", []) or []
    by_id = {t.get("@id"): t for t in tasks}
    in_progress = sum(1 for t in tasks if t.get("status") == "in_progress")
    dispatchable: list[str] = []
    for t in tasks:
        if t.get("status") != "ready":
            continue
        deps = t.get("depends_on", []) or []
        deps_ok = all(
            (by_id.get(d) or {}).get("status") == "done" for d in deps
        )
        if deps_ok:
            dispatchable.append(t.get("@id", ""))
    return in_progress, len(dispatchable), dispatchable


def _find_demo_doc(phase_id: str, repo_root: Path = Path(".")) -> Optional[str]:
    """Try to find a demo doc by convention: demo/PHASE-N-*.md."""
    if not phase_id or not phase_id.startswith("phase-"):
        return None
    tail = phase_id.split("-", 1)[1].upper()
    demo_dir = repo_root / "demo"
    if not demo_dir.exists():
        return None
    # v3.5.1: use startswith (not substring) to filter — substring match
    # picks up WALKTHROUGH-PHASE-N.md and similar incidentally. The
    # substrate's demo-doc convention is filenames STARTING WITH PHASE-N-
    # (matches what the v3.5.0 auto-generation chain produces and what
    # operators hand-author as phase-specific demo docs).
    prefix = f"PHASE-{tail}-"
    candidates: list[Path] = []
    for p in demo_dir.iterdir():
        if not p.is_file():
            continue
        if p.suffix.lower() != ".md":
            continue
        if p.name.upper().startswith(prefix):
            candidates.append(p)
    if not candidates:
        return None
    # v3.5.1: pick the most-recently-modified-on-disk. Filename sort
    # is fragile when filenames mix case (CHAIN-1 vs chain-2 sort
    # order depends on ASCII byte ordering). mtime is the operator's
    # actual most-recent activity signal.
    candidates.sort(key=lambda p: p.stat().st_mtime, reverse=True)
    return f"demo/{candidates[0].name}"


def classify(state: dict[str, Any]) -> dict[str, Any]:
    """Pure function: classify current substrate state into one of the
    five closed-enum communication states. Returns a dict with `state`
    plus state-specific fields.

    Precedence order (highest wins):
      1. decision-necessary (any awaiting_operator_decision task)
      2. working (in_progress > 0 OR any dispatchable ready task)
      3. ready-for-review (any phase in demo-released; quiet queue)
      4. ready-for-release (any phase in po-satisfied / drift-reconciled)
      5. idle (fallback)
    """
    pending_n, pending_ids = _count_pending_decisions(state)
    if pending_n > 0:
        return {
            "state": STATE_DECISION_NECESSARY,
            "pending_count": pending_n,
            "pending_task_ids": pending_ids,
        }

    in_progress_n, dispatchable_n, dispatchable_ids = _dispatchable_counts(
        state
    )
    if in_progress_n > 0 or dispatchable_n > 0:
        return {
            "state": STATE_WORKING,
            "in_progress_count": in_progress_n,
            "dispatchable_count": dispatchable_n,
            "dispatchable_task_ids": dispatchable_ids,
        }

    phase_states = _walk_plo_events(state)

    review_phases = {
        p: v for p, v in phase_states.items()
        if v.get("state") in PLO_REVIEW_STATES
    }
    if review_phases:
        # Pick latest by timestamp
        phase_id, evt = max(review_phases.items(), key=lambda x: x[1]["ts"])
        return {
            "state": STATE_READY_FOR_REVIEW,
            "phase_id": phase_id,
            "phase_state": evt["state"],
            "deploy_url": evt.get("deploy_url"),
            "build_ref": evt.get("build_ref"),
            "notes": evt.get("notes"),
            "transition_ts": evt.get("ts"),
        }

    release_phases = {
        p: v for p, v in phase_states.items()
        if v.get("state") in PLO_RELEASE_STATES
    }
    if release_phases:
        phase_id, evt = max(release_phases.items(), key=lambda x: x[1]["ts"])
        return {
            "state": STATE_READY_FOR_RELEASE,
            "phase_id": phase_id,
            "phase_state": evt["state"],
            "notes": evt.get("notes"),
            "transition_ts": evt.get("ts"),
        }

    # v3.5.2: chain-complete state. Phase is in implementing (or planned)
    # AND no work is in flight AND a done task exists with a history
    # timestamp newer than the phase's most recent transition. The
    # operationally-meaningful signal: "a chain landed AFTER the latest
    # PLO transition for this phase" — i.e., something just finished
    # and the operator hasn't yet emitted the next state. Surfaces an
    # actionable next-command (commit + phase demo-released) instead
    # of falling through to the generic idle message.
    impl_phases = {
        p: v for p, v in phase_states.items()
        if v.get("state") in ("implementing", "planned")
    }
    if impl_phases:
        phase_id, plo_evt = max(
            impl_phases.items(), key=lambda x: x[1].get("ts", "")
        )
        plo_ts = plo_evt.get("ts", "")
        latest_done_task: Optional[str] = None
        latest_done_ts = ""
        for t in state.get("tasks", []) or []:
            if t.get("status") != "done":
                continue
            for h in t.get("history", []) or []:
                ts = h.get("ts", "")
                if ts > plo_ts and ts > latest_done_ts:
                    latest_done_ts = ts
                    latest_done_task = t.get("@id")
        if latest_done_task:
            return {
                "state": STATE_CHAIN_COMPLETE,
                "phase_id": phase_id,
                "phase_state": plo_evt.get("state"),
                "latest_done_task": latest_done_task,
                "latest_done_ts": latest_done_ts,
                "phase_transition_ts": plo_ts,
            }

    return {"state": STATE_IDLE}


def render_markdown(
    classification: dict[str, Any],
    repo_root: Path = Path("."),
) -> str:
    """Render the classification result as the system-status Markdown."""
    now = datetime.datetime.now(datetime.timezone.utc).isoformat()
    state = classification["state"]

    header = [
        "# System Status",
        "",
        f"_Generated: {now}_  ",
        "_Source: v3.4.0 substrate status primitive per fnsr_status.py_",
        "",
        "---",
        "",
    ]

    if state == STATE_DECISION_NECESSARY:
        n = classification["pending_count"]
        body = [
            "## State: Decision Necessary",
            "",
            f"**{n} operator decision(s) pending.** "
            f"See [fnsr.operator_decisions.md](fnsr.operator_decisions.md) "
            f"for the full decision payload, options, recommendations, "
            f"and resolve-via commands.",
            "",
        ]
        ids = classification.get("pending_task_ids") or []
        if ids:
            body.append("### Pending decisions:")
            body.append("")
            for tid in ids:
                body.append(f"- `{tid}`")
            body.append("")

    elif state == STATE_READY_FOR_REVIEW:
        phase = classification.get("phase_id") or ""
        url = classification.get("deploy_url")
        build = classification.get("build_ref")
        notes = classification.get("notes") or ""
        url_clause = (
            f"Test at {url}" if url
            else "Test at the deployed artifact"
            " (no --deploy-url recorded on the PLO transition)"
        )
        demo_doc = _find_demo_doc(phase, repo_root)
        if demo_doc:
            demo_clause = f"validate at [{demo_doc}]({demo_doc})"
        else:
            demo_clause = (
                "validate via the demo doc"
                f" (no demo/PHASE-{phase.split('-', 1)[1] if '-' in phase else '?'}-*.md"
                " found in demo/ directory)"
            )
        body = [
            "## State: Ready for PO Review / UAT",
            "",
            f"**{url_clause}** and **{demo_clause}**. "
            "Awaiting your review.",
            "",
            f"- Phase: `{phase}`",
        ]
        if build:
            body.append(f"- Build ref: `{build}`")
        if classification.get("transition_ts"):
            body.append(f"- Transitioned: {classification['transition_ts']}")
        if notes:
            body.append("")
            body.append(f"**Notes:** {notes}")
        body.append("")

    elif state == STATE_READY_FOR_RELEASE:
        phase = classification.get("phase_id") or ""
        phase_state = classification.get("phase_state") or "?"
        notes = classification.get("notes") or ""
        body = [
            "## State: Done / Ready for Release",
            "",
            "**Ready for production deployment. Awaiting your release.**",
            "",
            f"- Phase: `{phase}` (PLO state: `{phase_state}`)",
        ]
        if classification.get("transition_ts"):
            body.append(f"- Transitioned: {classification['transition_ts']}")
        if notes:
            body.append("")
            body.append(f"**Notes:** {notes}")
        body.append("")

    elif state == STATE_WORKING:
        ip = classification["in_progress_count"]
        rd = classification["dispatchable_count"]
        body = [
            "## State: Working",
            "",
            f"Substrate is actively dispatching: **{ip} in-progress**, "
            f"**{rd} dispatchable** task(s) in the ready queue. "
            "No operator action required; the daemon will continue "
            "autonomously.",
            "",
        ]

    elif state == STATE_CHAIN_COMPLETE:
        phase = classification.get("phase_id") or "?"
        plo = classification.get("phase_state") or "?"
        task_id = classification.get("latest_done_task") or ""
        ts = classification.get("latest_done_ts") or ""
        body = [
            "## State: Chain Complete (Ready for Review-Emission)",
            "",
            f"**A chain just completed on `{phase}`** (PLO state: "
            f"`{plo}`). Last task done: `{task_id}` at {ts}. "
            "No further work is queued and no decisions are pending. "
            "Next step is operator-authoritative: commit the disk "
            "state, then surface the chain for PO review via "
            "`phase demo-released`.",
            "",
            "### Suggested next actions",
            "",
            "1. **Review and commit disk state:**",
            "",
            "   ```bash",
            "   git status",
            "   git add <changed-files>",
            "   git commit -m \"Phase N Chain M: <subject>\"",
            "   ```",
            "",
            "2. **Emit `demo-released` to trigger v3.5.0 demo-doc "
            "auto-generation:**",
            "",
            "   ```bash",
            f"   python state_admin.py phase demo-released {phase} \\",
            f"       --anchor-task {task_id} \\",
            "       --build-ref <commit-sha-from-step-1> \\",
            "       --regenerate-demo-doc \\",
            "       --demo-doc-descriptor <short-name>",
            "   ```",
            "",
            "After step 2, the substrate auto-queues the 4-task "
            "demo-doc chain (`reconnaissance` → `demo-doc-author` → "
            "`architect` → `applier`). When the applier lands the new "
            "doc, this file reclassifies to `ready-for-review` with "
            "the demo doc linked verbatim.",
            "",
            "If the chain is NOT yet ready for review (e.g., scope "
            "rework needed, or this is one of several chains in the "
            "phase), use:",
            "",
            "- `state_admin append-tasks` to queue the next chain in "
            "the phase, or",
            "- `state_admin reset <task-id>` to retry a specific task",
            "",
        ]

    else:  # STATE_IDLE
        body = [
            "## State: Idle",
            "",
            "Substrate has no pending operator action and no eligible "
            "tasks to dispatch.",
            "",
            "Possible causes:",
            "",
            "- Last chain completed cleanly; awaiting the operator to "
            "queue the next chain or emit a PLO state transition "
            "(e.g., `state_admin phase demo-released <phase-id>` if "
            "the just-completed chain is ready for review).",
            "- All chains complete; phase is between PLO states.",
            "- Substrate is between user sessions.",
            "",
            "Run `state_admin status` for a task-level breakdown.",
            "",
        ]

    return "\n".join(header + body)


def emit(
    state_path: Path,
    output_path: Optional[Path] = None,
    repo_root: Optional[Path] = None,
) -> dict[str, Any]:
    """End-to-end: load state, classify, render, write file. Returns a
    summary dict with classification details and wrote_file flag.
    """
    if output_path is None:
        output_path = Path(STATUS_FILE)
    if repo_root is None:
        repo_root = Path(".")

    state = _load_state(Path(state_path))
    if state is None:
        summary: dict[str, Any] = {
            "state_classification": "error",
            "error": "state.jsonld unreadable or malformed",
            "wrote_file": False,
            "output_path": str(output_path),
        }
        # Still write a minimal error file so the operator sees the
        # surface even when state is broken.
        try:
            output_path.write_text(
                "# System Status\n\n"
                "_Generated: substrate could not read state.jsonld_\n\n"
                "## State: Error\n\n"
                "state.jsonld is unreadable or malformed. The substrate "
                "cannot classify current state until this is resolved.\n",
                encoding="utf-8",
            )
            summary["wrote_file"] = True
        except OSError:
            pass
        return summary

    classification = classify(state)
    md = render_markdown(classification, repo_root)
    try:
        output_path.write_text(md, encoding="utf-8")
        wrote = True
    except OSError as e:
        return {
            "state_classification": classification["state"],
            "error": f"write failed: {e}",
            "wrote_file": False,
            "output_path": str(output_path),
            **classification,
        }

    return {
        "state_classification": classification["state"],
        "wrote_file": wrote,
        "output_path": str(output_path),
        **classification,
    }
