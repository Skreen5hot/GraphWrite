"""SVG (State Verification Gate) probe — v3.1.0-bridge implementation.

Per surfaces/_primitives/state-verification-gate.md. Read-only deterministic
Python probe over canonical docs + git state + audit chain. Emits structured
drift findings to fnsr.svg_status.json. Does NOT mutate canonical state.

v3.1.0-bridge ships SVG-1.1, SVG-1.2, SVG-2.1, SVG-3.1.
v3.2 will add daemon-side gate integration + SVG-4/5 (banking/FT lifecycle).

Run: python fnsr_state_verification.py [--print] [--blocking-only]
"""
from __future__ import annotations

import argparse
import datetime
import json
import os
import re
import subprocess
import sys
from pathlib import Path

# Per blueprint operator decision: 30 min threshold for commit-gap escalation
COMMIT_GAP_BLOCK_THRESHOLD_MINUTES = 30
# How far back to look for done applier tasks (avoid scanning the whole chain)
RECENT_APPLIER_LOOKBACK_HOURS = 48

# Reuses FNSR_CANONICAL_DOCS per blueprint default (CLAUDE.md §7.5 convention)
DEFAULT_CANONICAL_DOCS = (
    "project/ROADMAP.md",
    "project/IMPLEMENTATION_PLAN.md",
    "project/SPEC.md",
    "project/DECISIONS.md",
)


def _git_run(args: list[str], root: Path) -> tuple[str, str, int]:
    """Run a git command; return (stdout, stderr, returncode). Never raises."""
    try:
        out = subprocess.run(
            ["git"] + args,
            cwd=str(root),
            capture_output=True,
            text=True,
            timeout=10,
            check=False,
        )
        return out.stdout, out.stderr, out.returncode
    except Exception as e:
        return "", str(e), -1


def _load_state(state_path: Path) -> dict | None:
    """Load state.jsonld; return None on parse error (don't crash the gate)."""
    try:
        with state_path.open(encoding="utf-8") as f:
            return json.load(f)
    except (OSError, json.JSONDecodeError):
        return None


def _parse_phase_status(doc_path: Path) -> list[dict]:
    """Parse a ROADMAP-style doc; return list of {phase_num, phase_name, status}.

    Conservative parser: matches `## Phase N:` headers and the first
    `**Status:**` line within each section. Unknown formats return empty.
    """
    if not doc_path.exists():
        return []
    try:
        text = doc_path.read_text(encoding="utf-8")
    except OSError:
        return []
    header_re = re.compile(r"^## Phase (\d+):\s*(.+?)$", re.MULTILINE)
    matches = list(header_re.finditer(text))
    phases = []
    for i, m in enumerate(matches):
        phase_num = int(m.group(1))
        phase_name = m.group(2).strip()
        section_start = m.end()
        section_end = matches[i + 1].start() if i + 1 < len(matches) else len(text)
        section = text[section_start:section_end]
        status_match = re.search(r"\*\*Status:\*\*\s+([^\n]+)", section)
        status_raw = status_match.group(1).strip() if status_match else "<unspecified>"
        # Truncate to first sentence / 120 chars (whichever shorter) for clean reports
        status = status_raw.split(".")[0][:120].strip()
        if len(status_raw) > len(status):
            status = status + "..."
        phases.append({
            "phase_num": phase_num,
            "phase_name": phase_name,
            "status": status,
            "section_text": section,
            "doc_path": str(doc_path),
        })
    return phases


def svg_1_1_phase_not_started_with_commits(
    state, fs_context, git_context
) -> list[dict]:
    """SVG-1.1: phase claimed Not Started in canonical doc but Phase N commits exist."""
    findings = []
    git_log = git_context.get("git_log", "")
    for doc_path in fs_context["canonical_doc_paths"]:
        for p in _parse_phase_status(doc_path):
            if "not started" not in p["status"].lower():
                continue
            # Search git log for commits mentioning this phase
            pattern = re.compile(rf"\bPhase {p['phase_num']}\b", re.IGNORECASE)
            matching = [ln for ln in git_log.splitlines() if pattern.search(ln)]
            if matching:
                findings.append({
                    "predicate_id": "svg-1.1-phase-not-started-with-commits",
                    "severity": "warn",
                    "drift_kind": "canonical_doc_phase_status_drift",
                    "phase_num": p["phase_num"],
                    "phase_name": p["phase_name"],
                    "claimed_status": p["status"],
                    "canonical_doc": p["doc_path"],
                    "evidence": {
                        "matching_commit_sample": matching[:5],
                        "match_count": len(matching),
                    },
                    "reconciliation_options": [
                        f"Update {Path(p['doc_path']).name} Phase {p['phase_num']} Status field",
                        f"Declare phase boundary: python state_admin.py phase-boundary phase-N phase-{p['phase_num']} --anchor-task <id>",
                    ],
                })
    return findings


def svg_1_2_phase_complete_with_open_oeds(
    state, fs_context, git_context
) -> list[dict]:
    """SVG-1.2: phase claims Substantively Complete but open exit-gate OEDs mentioned."""
    findings = []
    for doc_path in fs_context["canonical_doc_paths"]:
        for p in _parse_phase_status(doc_path):
            if "complete" not in p["status"].lower():
                continue
            section = p.get("section_text", "")
            # Pattern: OED-NNN ... (remain[s]? open | MUST be resolved | MUST close | still open | pending)
            open_oed_pattern = re.compile(
                r"OED-(\d+)[^\n]{0,300}?(remain[s]? open|MUST be resolved|MUST close|still open|pending)",
                re.IGNORECASE | re.DOTALL,
            )
            matches = open_oed_pattern.findall(section)
            open_oeds = sorted({f"OED-{m[0]}" for m in matches})
            if open_oeds:
                findings.append({
                    "predicate_id": "svg-1.2-phase-complete-with-open-oeds",
                    "severity": "warn",
                    "drift_kind": "phase_complete_but_exit_gates_open",
                    "phase_num": p["phase_num"],
                    "phase_name": p["phase_name"],
                    "claimed_status": p["status"],
                    "canonical_doc": p["doc_path"],
                    "evidence": {"open_oeds": open_oeds},
                    "reconciliation_options": [
                        "Resolve OEDs in canonical doc + declare phase-complete via state_admin",
                        f"Update {Path(p['doc_path']).name} Phase {p['phase_num']} Status to honestly reflect open exit gates",
                    ],
                })
    return findings


def svg_2_1_commit_gap(state, fs_context, git_context) -> list[dict]:
    """SVG-2.1: applier landed src/ or demo/ changes; uncommitted diff present."""
    findings: list[dict] = []
    if not state:
        return findings
    git_status = git_context.get("git_status", "")
    if not git_status.strip():
        return findings
    # Parse `git status --short` for uncommitted paths
    uncommitted: set[str] = set()
    for line in git_status.splitlines():
        if len(line) < 4:
            continue
        path = line[3:].strip()
        if path.startswith('"') and path.endswith('"'):
            path = path[1:-1]
        # Handle renames "old -> new"
        if " -> " in path:
            path = path.split(" -> ", 1)[1]
        path = path.replace("\\", "/")
        uncommitted.add(path)
    if not uncommitted:
        return findings
    # Walk done applier tasks within lookback window
    now = datetime.datetime.now(datetime.timezone.utc)
    cutoff = now - datetime.timedelta(hours=RECENT_APPLIER_LOOKBACK_HOURS)
    recent_applier_paths = []
    for t in state.get("tasks", []) or []:
        if t.get("agent") != "applier" or t.get("status") != "done":
            continue
        ts = None
        for h in reversed(t.get("history", []) or []):
            ts_str = h.get("ts") or h.get("when") or h.get("timestamp")
            if not ts_str:
                continue
            try:
                ts = datetime.datetime.fromisoformat(ts_str.replace("Z", "+00:00"))
                break
            except ValueError:
                continue
        if ts is None or ts < cutoff:
            continue
        outputs = t.get("outputs") or {}
        if not isinstance(outputs, dict):
            continue
        for a in outputs.get("applied", []) or []:
            p = a.get("path", "") or ""
            if not p:
                continue
            p = p.replace("\\", "/")
            # Only flag paths under src/ or demo/ (deployed-artifact concern)
            if not (p.startswith("src/") or p.startswith("demo/")):
                continue
            recent_applier_paths.append({"path": p, "task": t["@id"], "ts": ts})
    # Match
    matches = []
    for ap in recent_applier_paths:
        if ap["path"] in uncommitted:
            age_min = (now - ap["ts"]).total_seconds() / 60
            matches.append({
                "path": ap["path"],
                "applier_task": ap["task"],
                "age_minutes": round(age_min, 1),
            })
    if matches:
        max_age = max(m["age_minutes"] for m in matches)
        sev = (
            "block"
            if max_age >= COMMIT_GAP_BLOCK_THRESHOLD_MINUTES
            else "warn"
        )
        unique_paths = sorted({m["path"] for m in matches})
        findings.append({
            "predicate_id": "svg-2.1-commit-gap",
            "severity": sev,
            "drift_kind": "commit_gap",
            "evidence": {
                "uncommitted_applier_paths": matches,
                "max_age_minutes": max_age,
                "block_threshold_minutes": COMMIT_GAP_BLOCK_THRESHOLD_MINUTES,
            },
            "reconciliation_options": [
                f"git add {' '.join(unique_paths)}",
                "git commit + push",
            ],
        })
    return findings


def svg_3_1_push_gap(state, fs_context, git_context) -> list[dict]:
    """SVG-3.1: local HEAD ahead of origin/main."""
    findings = []
    ahead_behind = git_context.get("ahead_behind", "").strip()
    if not ahead_behind:
        return findings
    parts = ahead_behind.split()
    if len(parts) != 2:
        return findings
    try:
        ahead = int(parts[0])
        behind = int(parts[1])
    except ValueError:
        return findings
    if ahead > 0:
        findings.append({
            "predicate_id": "svg-3.1-push-gap",
            "severity": "warn",
            "drift_kind": "push_gap",
            "evidence": {
                "commits_ahead": ahead,
                "commits_behind": behind,
            },
            "reconciliation_options": [
                "git push origin main",
            ],
        })
    return findings


def _plo_current_state_local(state: dict | None, phase_id: str) -> str:
    """Local copy of PLO state derivation; avoids importing state_admin
    (which would create a circular dep on the daemon)."""
    if not state:
        return "unknown"
    last_ts: str | None = None
    last_state = "unknown"
    for t in state.get("tasks", []) or []:
        for h in t.get("history", []) or []:
            if h.get("event") != "phase_state_changed":
                continue
            payload = h.get("payload") or {}
            if payload.get("phase_id") != phase_id:
                continue
            ts = h.get("ts", "")
            if last_ts is None or ts >= last_ts:
                last_ts = ts
                last_state = payload.get("to_state", "unknown")
    return last_state, last_ts


def _plo_discover_phase_ids(state: dict | None) -> set[str]:
    """Discover all phase_ids referenced in PLO + legacy events."""
    ids: set[str] = set()
    if not state:
        return ids
    for t in state.get("tasks", []) or []:
        for h in t.get("history", []) or []:
            evt = h.get("event")
            payload = h.get("payload") or {}
            if evt == "phase_state_changed":
                if payload.get("phase_id"):
                    ids.add(payload["phase_id"])
            elif evt == "phase_boundary_declared":
                for k in ("from_phase", "to_phase"):
                    if payload.get(k):
                        ids.add(payload[k])
            elif evt == "phase_complete_declared":
                pid = payload.get("phase") or payload.get("phase_id")
                if pid:
                    ids.add(pid)
    return ids


def svg_7_1_demo_released_without_deploy(
    state, fs_context, git_context
) -> list[dict]:
    """SVG-7.1: phase claims state=demo-released but no commit since the
    demo-released event timestamp. Per PLO blueprint."""
    findings: list[dict] = []
    if not state:
        return findings
    git_log_with_dates = git_context.get("git_log_with_dates", "")
    for phase_id in _plo_discover_phase_ids(state):
        cur_state, cur_ts = _plo_current_state_local(state, phase_id)
        if cur_state != "demo-released":
            continue
        # Find the demo-released event's payload (build_ref / deploy_url)
        latest_payload = None
        for t in state.get("tasks", []) or []:
            for h in t.get("history", []) or []:
                if h.get("event") != "phase_state_changed":
                    continue
                payload = h.get("payload") or {}
                if (
                    payload.get("phase_id") == phase_id
                    and payload.get("to_state") == "demo-released"
                    and h.get("ts") == cur_ts
                ):
                    latest_payload = payload
                    break
            if latest_payload is not None:
                break
        # If no build_ref AND no commits since the demo-released ts, drift
        no_build_ref = not (latest_payload or {}).get("build_ref")
        commits_since = []
        if cur_ts and git_log_with_dates:
            # Each line: "<sha> <iso_date> <subject>"
            for line in git_log_with_dates.splitlines():
                parts = line.split(" ", 2)
                if len(parts) < 2:
                    continue
                commit_ts = parts[1]
                if commit_ts >= cur_ts:
                    commits_since.append(line)
        if no_build_ref and not commits_since:
            findings.append({
                "predicate_id": "svg-7.1-demo-released-without-deploy",
                "severity": "warn",
                "drift_kind": "demo_released_without_evidence",
                "phase_id": phase_id,
                "evidence": {
                    "demo_released_at": cur_ts,
                    "build_ref": None,
                    "commits_since_demo_release": 0,
                },
                "reconciliation_options": [
                    f"Emit phase demo-released again with --build-ref <sha>: state_admin phase demo-released {phase_id} --anchor-task <id> --build-ref <sha>",
                    "If demo-released was emitted in error, transition back to implementing",
                ],
            })
    return findings


def svg_7_3_closed_without_canonical_doc(
    state, fs_context, git_context
) -> list[dict]:
    """SVG-7.3: phase claims state=closed but canonical-doc Status field
    doesn't reflect closure (still says 'In Progress' or 'Not Started')."""
    findings: list[dict] = []
    if not state:
        return findings
    for phase_id in _plo_discover_phase_ids(state):
        cur_state, _ = _plo_current_state_local(state, phase_id)
        if cur_state != "closed":
            continue
        # Walk canonical docs; look for the Phase N Status field
        # Phase id format like "phase-1" maps to "Phase 1" header
        m = re.match(r"phase-(\d+)$", phase_id)
        if not m:
            continue
        phase_num = int(m.group(1))
        canonical_says_closed = False
        scanned_docs = []
        for doc_path in fs_context["canonical_doc_paths"]:
            scanned_docs.append(str(doc_path))
            for p in _parse_phase_status(doc_path):
                if p["phase_num"] != phase_num:
                    continue
                status_lower = p["status"].lower()
                # "Complete" or "Closed" in the status field is acceptable
                if "closed" in status_lower or "complete" in status_lower:
                    canonical_says_closed = True
                    break
            if canonical_says_closed:
                break
        if not canonical_says_closed:
            findings.append({
                "predicate_id": "svg-7.3-closed-without-canonical-doc",
                "severity": "warn",
                "drift_kind": "closed_state_canonical_doc_drift",
                "phase_id": phase_id,
                "evidence": {
                    "substrate_state": "closed",
                    "canonical_docs_scanned": scanned_docs,
                    "canonical_says_closed": False,
                },
                "reconciliation_options": [
                    f"Update ROADMAP.md and/or IMPLEMENTATION_PLAN.md Phase {phase_num} Status field to 'Complete' or 'Closed'",
                    "Emit a phase_complete_declared event via state_admin phase-complete-declaration if not already present",
                ],
            })
    return findings


PREDICATES = (
    svg_1_1_phase_not_started_with_commits,
    svg_1_2_phase_complete_with_open_oeds,
    svg_2_1_commit_gap,
    svg_3_1_push_gap,
    svg_7_1_demo_released_without_deploy,
    svg_7_3_closed_without_canonical_doc,
)


def probe(root_path: str | os.PathLike) -> dict:
    """Single-shot probe. Returns the structured drift report dict."""
    root = Path(root_path).resolve()
    state_path = root / "state.jsonld"
    state = _load_state(state_path)

    # Git context (per blueprint default 4: no auto-fetch in v3.1.0-bridge;
    # operator runs git fetch manually if they want fresh origin/main info)
    git_log_stdout, _, _ = _git_run(["log", "--oneline", "-50"], root)
    git_status_stdout, _, _ = _git_run(["status", "--short"], root)
    ahead_behind_stdout, _, _ = _git_run(
        ["rev-list", "--left-right", "--count", "HEAD...origin/main"], root
    )
    # For SVG-7.1 timestamp comparison: log with ISO commit dates
    git_log_with_dates_stdout, _, _ = _git_run(
        ["log", "--pretty=format:%h %cI %s", "-100"], root
    )

    git_context = {
        "git_log": git_log_stdout,
        "git_status": git_status_stdout,
        "ahead_behind": ahead_behind_stdout.strip(),
        "git_log_with_dates": git_log_with_dates_stdout,
    }

    # Canonical doc enumeration (reuses FNSR_CANONICAL_DOCS per blueprint)
    canonical_docs_env = os.environ.get("FNSR_CANONICAL_DOCS")
    if canonical_docs_env:
        canonical_doc_names = canonical_docs_env.split(":")
    else:
        canonical_doc_names = list(DEFAULT_CANONICAL_DOCS)
    canonical_doc_paths = [root / p for p in canonical_doc_names if (root / p).exists()]

    fs_context = {
        "root": root,
        "canonical_doc_paths": canonical_doc_paths,
    }

    findings: list[dict] = []
    for pred in PREDICATES:
        try:
            findings.extend(pred(state, fs_context, git_context))
        except Exception as e:
            findings.append({
                "predicate_id": pred.__name__,
                "severity": "info",
                "drift_kind": "predicate_error",
                "evidence": {"error": str(e), "error_type": type(e).__name__},
            })

    severity_counts = {"block": 0, "warn": 0, "info": 0}
    for f in findings:
        sev = f.get("severity", "info")
        severity_counts[sev] = severity_counts.get(sev, 0) + 1

    report = {
        "probe_timestamp_iso": datetime.datetime.now(datetime.timezone.utc).isoformat(),
        "root": str(root),
        "canonical_doc_paths_scanned": [str(p) for p in canonical_doc_paths],
        "findings": findings,
        "severity_counts": severity_counts,
        "has_blocking_drift": severity_counts["block"] > 0,
        "spec_reference": "surfaces/_primitives/state-verification-gate.md",
        "implementation_phase": "v3.1.0-bridge",
        "predicates_loaded": [p.__name__ for p in PREDICATES],
    }

    # Write status file
    status_out = root / "fnsr.svg_status.json"
    try:
        with status_out.open("w", encoding="utf-8") as f:
            json.dump(report, f, indent=2, default=str)
    except OSError as e:
        report["status_write_error"] = str(e)

    return report


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--root", default=".", help="GraphWrite root (default: cwd)")
    ap.add_argument("--print", action="store_true", help="Print full report as JSON")
    ap.add_argument("--blocking-only", action="store_true",
                    help="Print only blocking-severity findings")
    args = ap.parse_args()

    report = probe(args.root)

    if args.print:
        print(json.dumps(report, indent=2, default=str))
    else:
        sc = report["severity_counts"]
        print(f"SVG probe: block={sc['block']} warn={sc['warn']} info={sc['info']}")
        if not report["findings"]:
            print("  (no drift detected)")
        for f in report["findings"]:
            if args.blocking_only and f["severity"] != "block":
                continue
            pid = f.get("predicate_id", "?")
            sev = f.get("severity", "?")
            dk = f.get("drift_kind", "?")
            print(f"  [{sev:5s}] {pid}: {dk}")

    return 1 if report["has_blocking_drift"] else 0


if __name__ == "__main__":
    sys.exit(main())
