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


def _is_daemon_alive(pid_file: Path) -> tuple[bool, int | None]:
    """Check if fnsr.pid file points at a live process."""
    if not pid_file.exists():
        return False, None
    try:
        pid_text = pid_file.read_text(encoding="utf-8").strip()
        pid = int(pid_text)
    except (OSError, ValueError):
        return False, None
    # Probe via OS
    if os.name == "nt":
        # Windows: use tasklist
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
    # A task in status=ready whose deps include any blocked/failed/abandoned task
    dispatch_impossible = []
    for t in tasks:
        if t.get("status") != "ready":
            continue
        deps = t.get("depends_on", []) or []
        bad_deps = []
        for d in deps:
            dep = by_id.get(d)
            if dep is None:
                bad_deps.append({"dep_id": d, "dep_status": "MISSING"})
            elif dep.get("status") in ("blocked", "failed", "abandoned"):
                bad_deps.append({"dep_id": d, "dep_status": dep.get("status")})
        if bad_deps:
            dispatch_impossible.append({
                "task_id": t["@id"],
                "agent": t.get("agent"),
                "bad_deps": bad_deps,
            })

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
    elif ready_count > 0:
        # Ready tasks exist but all are dispatch-impossible (deps not done)
        stall_kind = "stall_dispatch_impossible"
    else:
        stall_kind = "demo_pause"

    return {
        "counts": counts,
        "stall_kind": stall_kind,
        "dispatchable_now": dispatchable_now,
        "in_progress_task_ids": [t["@id"] for t in in_progress_tasks],
        "dispatch_impossible_tasks": dispatch_impossible[:20],  # cap for size
        "dispatch_impossible_total": len(dispatch_impossible),
        "hung_in_progress": hung_in_progress,
        "pass_2a_gated": pass_2a_gated,
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
            **stall,
        }
        # Final recommendation classification
        if stall["stall_kind"] == "running":
            report["recommendation"] = "OK_RUNNING: daemon is actively dispatching"
        elif stall["stall_kind"] == "demo_pause":
            report["recommendation"] = "OK_DEMO_PAUSE: no work queued; substrate idle by design"
        elif stall["stall_kind"] == "stall_with_work":
            if not daemon_alive:
                report["recommendation"] = "ACTION: daemon dead but dispatchable work exists; restart daemon"
            else:
                report["recommendation"] = (
                    "ACTION: daemon alive but not dispatching despite dispatchable work; "
                    "investigate why picker is stuck"
                )
        elif stall["stall_kind"] == "stall_dispatch_impossible":
            report["recommendation"] = (
                "ACTION: ready tasks have unsatisfiable deps (blocked/abandoned). "
                "Cascade-fix the deps graph (the recon-front deadlock pattern from "
                "Round 5 v5 cascade is one example)"
            )
        else:
            report["recommendation"] = "INSPECT: unrecognized stall kind"

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
        if report.get("dispatch_impossible_total", 0) > 0:
            print(f"dispatch_impossible_tasks={report.get('dispatch_impossible_total')} "
                  f"(see fnsr.stall_status.json for details)")
    return 0


if __name__ == "__main__":
    sys.exit(main())
