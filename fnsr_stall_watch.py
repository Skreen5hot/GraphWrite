"""Small listener per Aaron 2026-05-24 request + Spec 09 candidate primitive.

Watches state.jsonld; when daemon work stops, classifies the stop as either:
  - DEMO_PAUSE: no ready work; substrate idle by design (operator must queue work)
  - STALL_WITH_WORK: ready tasks exist but daemon cannot dispatch (deps wedged,
    daemon dead, or hung in_progress)

Writes a structured status report to `fnsr.stall_status.json` with:
  - last_state_mtime (when state.jsonld last changed)
  - stable_for_seconds (how long state has been stable)
  - in_progress (current dispatching task or null)
  - daemon_alive (whether fnsr.pid points at a live process)
  - ready_count / blocked_count / done_count
  - stall_kind (none | demo_pause | stall_with_work)
  - dispatch_impossible_tasks (Category A per Spec 09)
  - hung_in_progress (Category B)
  - pass_2a_gated (Category C)
  - probe_timestamp_iso

Orchestrator-Agent reads this on scheduled wakeup. Does not modify state.jsonld.
Stateless probe; safe to run alongside the daemon.

Run once: `python fnsr_stall_watch.py`
Run in loop (every 30s): `python fnsr_stall_watch.py --watch`
"""
import argparse
import datetime
import json
import os
import sys
import time
from pathlib import Path

# Default thresholds
STABLE_THRESHOLD_SECONDS = 60  # state must be stable for >= N seconds before stall classified
HUNG_IN_PROGRESS_MINUTES = 30  # in_progress > N minutes counts as hung
STALE_RESIDUE_HOURS = 24  # blocked deps older than N hours = stale (informational), not ACTION
COMMIT_GAP_FRESH_HOURS = 2  # uncommitted src/ diff fresher than N hours = ACTION (commit-gap)


def _is_daemon_alive(pid_file: Path) -> tuple[bool, int | None]:
    """Check if fnsr.pid file points at a live process.

    Windows-aware: the daemon holds an exclusive lock on fnsr.pid while
    running, so `read_text` fails with PermissionError / OSError. That
    failure is itself strong evidence the daemon is ALIVE and holding the
    file. We fall back to a brute-force scan of running python processes
    when the lock prevents reading.
    """
    if not pid_file.exists():
        return False, None
    try:
        pid_text = pid_file.read_text(encoding="utf-8").strip()
        pid = int(pid_text)
    except (OSError, ValueError):
        # The file is locked by the daemon — daemon is alive but we can't
        # read which PID. Scan running python processes for an fnsr_daemon.
        return _scan_for_running_daemon(), None
    # Probe via OS
    if os.name == "nt":
        import subprocess
        try:
            out = subprocess.run(
                ["tasklist", "/FI", f"PID eq {pid}"],
                capture_output=True, text=True, timeout=5
            )
            alive = str(pid) in out.stdout
        except Exception:
            alive = False
    else:
        try:
            os.kill(pid, 0)
            alive = True
        except (OSError, ProcessLookupError):
            alive = False
    return alive, pid


def _scan_for_running_daemon() -> bool:
    """Fallback: scan for any python process running fnsr_daemon.py."""
    if os.name == "nt":
        import subprocess
        try:
            out = subprocess.run(
                ["wmic", "process", "where",
                 "name='python.exe'", "get", "CommandLine"],
                capture_output=True, text=True, timeout=10,
            )
            return "fnsr_daemon" in out.stdout
        except Exception:
            return False
    # POSIX fallback
    try:
        import subprocess
        out = subprocess.run(
            ["pgrep", "-f", "fnsr_daemon.py"],
            capture_output=True, text=True, timeout=5,
        )
        return bool(out.stdout.strip())
    except Exception:
        return False


def _load_state(state_path: Path) -> dict | None:
    """Safely load state.jsonld; returns None if corrupted or unreadable."""
    try:
        with state_path.open(encoding="utf-8") as f:
            return json.load(f)
    except (OSError, json.JSONDecodeError):
        return None


def _detect_stalls(state: dict) -> dict:
    """Classify stall categories per FNSR Spec 09 candidate primitive."""
    tasks = state.get("tasks", []) or []
    by_id = {t["@id"]: t for t in tasks}
    counts = {"ready": 0, "in_progress": 0, "done": 0, "blocked": 0,
              "failed": 0, "awaiting_operator_decision": 0}
    in_progress_tasks = []
    for t in tasks:
        st = t.get("status", "unknown")
        counts[st] = counts.get(st, 0) + 1
        if st == "in_progress":
            in_progress_tasks.append(t)

    # Category A: dispatch-impossible by deps
    # A task in status=ready whose deps include any blocked/failed/abandoned task.
    # Each bad-dep is annotated with `hours_since_blocked` (read from the dep's
    # history). Tasks where every bad-dep is older than STALE_RESIDUE_HOURS are
    # classified as `stale_residue` rather than fresh actionable stalls.
    now_iso = datetime.datetime.now(datetime.timezone.utc)

    def _hours_since_blocked(dep_task: dict) -> float | None:
        """Return hours since the dep's most recent status-changing event."""
        history = dep_task.get("history", []) or []
        for h in reversed(history):
            ts_str = h.get("ts") or h.get("when") or h.get("timestamp")
            if not ts_str:
                continue
            try:
                t = datetime.datetime.fromisoformat(ts_str.replace("Z", "+00:00"))
            except ValueError:
                continue
            return (now_iso - t).total_seconds() / 3600
        return None

    dispatch_impossible_fresh = []
    dispatch_impossible_stale = []
    for t in tasks:
        if t.get("status") != "ready":
            continue
        deps = t.get("depends_on", []) or []
        bad_deps = []
        max_age_hours = 0.0  # oldest bad dep age
        any_unknown_age = False
        for d in deps:
            dep = by_id.get(d)
            if dep is None:
                bad_deps.append({"dep_id": d, "dep_status": "MISSING", "hours_since_blocked": None})
                any_unknown_age = True
            elif dep.get("status") in ("blocked", "failed", "abandoned"):
                age = _hours_since_blocked(dep)
                bad_deps.append({
                    "dep_id": d,
                    "dep_status": dep.get("status"),
                    "hours_since_blocked": round(age, 1) if age is not None else None,
                })
                if age is None:
                    any_unknown_age = True
                else:
                    max_age_hours = max(max_age_hours, age)
        if bad_deps:
            entry = {
                "task_id": t["@id"],
                "agent": t.get("agent"),
                "bad_deps": bad_deps,
                "max_bad_dep_age_hours": round(max_age_hours, 1) if not any_unknown_age else None,
            }
            # Stale if ALL bad deps are older than threshold and ages are known
            if not any_unknown_age and max_age_hours >= STALE_RESIDUE_HOURS:
                dispatch_impossible_stale.append(entry)
            else:
                dispatch_impossible_fresh.append(entry)
    dispatch_impossible = dispatch_impossible_fresh + dispatch_impossible_stale

    # Category B: hung in_progress (no history transition for > threshold)
    hung_in_progress = []
    now_iso = datetime.datetime.now(datetime.timezone.utc)
    for t in in_progress_tasks:
        history = t.get("history", []) or []
        last_ts = None
        for h in reversed(history):
            ts_str = h.get("when") or h.get("timestamp")
            if ts_str:
                try:
                    last_ts = datetime.datetime.fromisoformat(ts_str.replace("Z", "+00:00"))
                    break
                except ValueError:
                    pass
        if last_ts is None:
            continue
        elapsed_min = (now_iso - last_ts).total_seconds() / 60
        if elapsed_min > HUNG_IN_PROGRESS_MINUTES:
            hung_in_progress.append({
                "task_id": t["@id"],
                "agent": t.get("agent"),
                "minutes_elapsed": round(elapsed_min, 1),
                "last_event": history[-1].get("event") if history else None,
            })

    # Category C: Pass 2a gated (architect ratification denied/deferred, applier blocked)
    pass_2a_gated = []
    for t in tasks:
        if t.get("agent") != "applier":
            continue
        if t.get("status") != "ready":
            continue
        for dep_id in t.get("depends_on", []) or []:
            dep = by_id.get(dep_id)
            if dep is None or dep.get("agent") != "architect":
                continue
            mode = (dep.get("inputs") or {}).get("mode")
            if mode != "ratification":
                continue
            outputs = dep.get("outputs") or {}
            ruling = outputs.get("ruling") if isinstance(outputs, dict) else None
            if ruling and ruling != "ratified":
                pass_2a_gated.append({
                    "applier_id": t["@id"],
                    "architect_id": dep_id,
                    "ruling": ruling,
                    "rationale_excerpt": (outputs.get("rationale") or "")[:200],
                })

    # Classify overall stall kind
    in_progress_count = counts.get("in_progress", 0)
    ready_count = counts.get("ready", 0)

    # If there's anything dispatchable (ready with all deps done) and no in_progress, that's a stall
    dispatchable_now = 0
    done_ids = {tid for tid, t in by_id.items() if t.get("status") == "done"}
    for t in tasks:
        if t.get("status") != "ready":
            continue
        deps = t.get("depends_on", []) or []
        if all(d in done_ids for d in deps):
            dispatchable_now += 1

    if in_progress_count > 0:
        stall_kind = "running"
    elif dispatchable_now > 0:
        stall_kind = "stall_with_work"
    elif len(dispatch_impossible_fresh) > 0:
        # Fresh bad-deps (< STALE_RESIDUE_HOURS) — actionable stall
        stall_kind = "stall_dispatch_impossible"
    elif len(dispatch_impossible_stale) > 0:
        # ALL bad-deps are stale residue (> STALE_RESIDUE_HOURS old) — informational, not action
        stall_kind = "demo_pause_with_stale_residue"
    else:
        stall_kind = "demo_pause"

    return {
        "counts": counts,
        "stall_kind": stall_kind,
        "dispatchable_now": dispatchable_now,
        "in_progress_task_ids": [t["@id"] for t in in_progress_tasks],
        "dispatch_impossible_fresh": dispatch_impossible_fresh[:20],
        "dispatch_impossible_fresh_total": len(dispatch_impossible_fresh),
        "dispatch_impossible_stale": dispatch_impossible_stale[:10],
        "dispatch_impossible_stale_total": len(dispatch_impossible_stale),
        "hung_in_progress": hung_in_progress,
        "pass_2a_gated": pass_2a_gated,
        "stale_residue_threshold_hours": STALE_RESIDUE_HOURS,
    }


def probe_once(root: Path) -> dict:
    """Single-shot probe; returns a structured stall-status report."""
    state_path = root / "state.jsonld"
    pid_file = root / "fnsr.pid"
    status_out = root / "fnsr.stall_status.json"

    if not state_path.exists():
        return {"error": "state.jsonld not found", "root": str(root)}

    state_mtime = state_path.stat().st_mtime
    state_mtime_iso = datetime.datetime.fromtimestamp(
        state_mtime, tz=datetime.timezone.utc
    ).isoformat()
    stable_for_seconds = time.time() - state_mtime

    daemon_alive, daemon_pid = _is_daemon_alive(pid_file)

    # Compose with State Verification Gate (SVG) per
    # surfaces/_primitives/state-verification-gate.md (v3.1.0-bridge).
    # SVG is its own probe module; we call its probe() and surface the
    # severity counts in the watchdog recommendation field.
    svg_summary = None
    try:
        import fnsr_state_verification
        svg_report = fnsr_state_verification.probe(root)
        svg_summary = {
            "has_blocking_drift": svg_report.get("has_blocking_drift", False),
            "severity_counts": svg_report.get("severity_counts", {}),
            "predicate_ids_firing": sorted({
                f.get("predicate_id", "") for f in svg_report.get("findings", [])
            }),
        }
    except Exception as e:
        svg_summary = {"error": f"svg probe failed: {e}"}

    state = _load_state(state_path)
    if state is None:
        report = {
            "probe_timestamp_iso": datetime.datetime.now(datetime.timezone.utc).isoformat(),
            "state_jsonld_path": str(state_path),
            "state_corrupted_or_unreadable": True,
            "last_state_mtime_iso": state_mtime_iso,
            "stable_for_seconds": round(stable_for_seconds, 1),
            "daemon_alive": daemon_alive,
            "daemon_pid": daemon_pid,
            "svg_summary": svg_summary,
            "recommendation": "INSPECT state.jsonld; possible concurrent-write corruption",
        }
    else:
        stall = _detect_stalls(state)
        report = {
            "probe_timestamp_iso": datetime.datetime.now(datetime.timezone.utc).isoformat(),
            "state_jsonld_path": str(state_path),
            "last_state_mtime_iso": state_mtime_iso,
            "stable_for_seconds": round(stable_for_seconds, 1),
            "stable_threshold_seconds": STABLE_THRESHOLD_SECONDS,
            "stable_long_enough_for_stall": stable_for_seconds >= STABLE_THRESHOLD_SECONDS,
            "daemon_alive": daemon_alive,
            "daemon_pid": daemon_pid,
            "svg_summary": svg_summary,
            **stall,
        }
        # Final recommendation classification
        if stall["stall_kind"] == "running":
            report["recommendation"] = "OK_RUNNING: daemon is actively dispatching"
        elif stall["stall_kind"] == "demo_pause":
            report["recommendation"] = "OK_DEMO_PAUSE: no work queued; substrate idle by design"
        elif stall["stall_kind"] == "demo_pause_with_stale_residue":
            report["recommendation"] = (
                f"OK_DEMO_PAUSE: no fresh work; "
                f"{stall.get('dispatch_impossible_stale_total', 0)} stale residue "
                f"task(s) with blocked deps older than {STALE_RESIDUE_HOURS}h "
                "(known-stuck from prior phase; not actionable)"
            )
        elif stall["stall_kind"] == "stall_with_work":
            if not daemon_alive:
                report["recommendation"] = "ACTION: daemon dead but dispatchable work exists; restart daemon"
            else:
                report["recommendation"] = (
                    "ACTION: daemon alive but not dispatching despite dispatchable work; "
                    "wait one polling cycle (~30s); if still stalled, investigate picker"
                )
        elif stall["stall_kind"] == "stall_dispatch_impossible":
            report["recommendation"] = (
                f"ACTION: {stall.get('dispatch_impossible_fresh_total', 0)} ready "
                f"task(s) have FRESH unsatisfiable deps "
                f"(blocked < {STALE_RESIDUE_HOURS}h). Cascade-fix the deps graph "
                "(the recon-front deadlock pattern from Round 5 v5 cascade is one example). "
                f"Plus {stall.get('dispatch_impossible_stale_total', 0)} stale-residue "
                "task(s) which are informational only."
            )
        else:
            report["recommendation"] = "INSPECT: unrecognized stall kind"

        # Annotate recommendation with SVG drift summary (Spec SVG v3.1.0-bridge).
        # SVG findings are additive — even when the daemon is OK_RUNNING the
        # operator may have canonical-doc drift / commit-gap / push-gap.
        if isinstance(svg_summary, dict) and not svg_summary.get("error"):
            sc = svg_summary.get("severity_counts", {})
            blocks = sc.get("block", 0)
            warns = sc.get("warn", 0)
            if blocks > 0:
                report["recommendation"] = (
                    f"SVG_BLOCK: {blocks} blocking drift finding(s) + "
                    + report["recommendation"]
                )
            elif warns > 0:
                report["recommendation"] = (
                    report["recommendation"]
                    + f" | SVG_WARN: {warns} drift finding(s) — see fnsr.svg_status.json"
                )

    # Write the report
    try:
        with status_out.open("w", encoding="utf-8") as f:
            json.dump(report, f, indent=2)
    except OSError as e:
        report["status_write_error"] = str(e)
    return report


def watch_loop(root: Path, interval: int = 30) -> None:
    """Run probe_once every N seconds until interrupted."""
    while True:
        report = probe_once(root)
        kind = report.get("stall_kind", "?")
        rec = report.get("recommendation", "?")
        print(f"[{datetime.datetime.now().strftime('%H:%M:%S')}] kind={kind} | {rec[:80]}",
              flush=True)
        time.sleep(interval)


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--root", default=".", help="GraphWrite root (default: cwd)")
    ap.add_argument("--watch", action="store_true", help="Run in poll loop")
    ap.add_argument("--interval", type=int, default=30, help="Poll interval seconds")
    ap.add_argument("--print", action="store_true", help="Print the report to stdout")
    args = ap.parse_args()

    root = Path(args.root).resolve()
    if args.watch:
        try:
            watch_loop(root, interval=args.interval)
        except KeyboardInterrupt:
            return 0
        return 0
    report = probe_once(root)
    if args.print:
        print(json.dumps(report, indent=2))
    else:
        # Print one-line summary
        kind = report.get("stall_kind", "?")
        rec = report.get("recommendation", "?")
        print(f"stall_kind={kind}")
        print(f"recommendation={rec}")
        print(f"counts={report.get('counts', {})}")
        print(f"daemon_alive={report.get('daemon_alive')}")
        fresh = report.get("dispatch_impossible_fresh_total", 0)
        stale = report.get("dispatch_impossible_stale_total", 0)
        if fresh > 0:
            print(f"dispatch_impossible_FRESH={fresh} (ACTION required)")
        if stale > 0:
            print(f"dispatch_impossible_STALE={stale} (informational; prior-phase residue)")
        svg = report.get("svg_summary") or {}
        if not svg.get("error"):
            sc = svg.get("severity_counts", {})
            blocks = sc.get("block", 0)
            warns = sc.get("warn", 0)
            if blocks or warns:
                print(f"svg_drift: block={blocks} warn={warns} "
                      f"(predicates firing: {', '.join(svg.get('predicate_ids_firing', []))[:120]})")
    return 0


if __name__ == "__main__":
    sys.exit(main())
