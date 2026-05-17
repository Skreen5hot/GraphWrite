"""Operator utilities for state.jsonld manipulation.

Replaces the ad-hoc one-off Python scripts operators wrote to reset failed
tasks, abandon failing chains, append new tasks, or verify audit-chain
integrity. Every modification preserves the SHA-256 hash chain by routing
through fnsr_daemon's `hiri_sign` and `_last_hash` helpers.

Usage:
    python state_admin.py reset <task_id> --reason "..." [--operator NAME]
    python state_admin.py abandon <task_id> --reason "..." \\
        [--replaced-by id1,id2,id3] [--operator NAME]
    python state_admin.py append-tasks <json-file>
    python state_admin.py verify [--quiet]
    python state_admin.py status [--filter STATUS]

All commands operate on `state.jsonld` in the current directory by default;
pass `--state-path PATH` to override. STOP THE DAEMON before modifying state
to avoid race conditions on the lock file.
"""
from __future__ import annotations

import argparse
import json
import os
import sys
import time
from pathlib import Path
from typing import Any, Optional

# Import daemon helpers from sibling module
_THIS_DIR = Path(__file__).resolve().parent
if str(_THIS_DIR) not in sys.path:
    sys.path.insert(0, str(_THIS_DIR))
import fnsr_daemon as d


def _load_state(state_path: Path) -> dict[str, Any]:
    if not state_path.exists():
        raise SystemExit(f"state file not found: {state_path}")
    with open(state_path, encoding="utf-8") as f:
        return json.load(f)


def _save_state(state_path: Path, state: dict[str, Any]) -> None:
    tmp = state_path.with_suffix(state_path.suffix + ".tmp")
    with open(tmp, "w", encoding="utf-8") as f:
        json.dump(state, f, indent=2)
    os.replace(tmp, state_path)


def _find_task(state: dict[str, Any], task_id: str) -> Optional[dict[str, Any]]:
    for t in state.get("tasks", []):
        if t.get("@id") == task_id:
            return t
    return None


def _append_audit(task: dict[str, Any], event: str,
                  payload: dict[str, Any]) -> None:
    """Append an audit entry chained from the task's last hash. Mutates task
    in place. Uses fnsr_daemon's hiri_sign so the chain is verifiable by
    the existing daemon-side audit-integrity check."""
    prev_hash = d._last_hash(task)
    new_hash = d.hiri_sign(prev_hash, {"event": event, "payload": payload})
    task.setdefault("history", []).append({
        "ts": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()),
        "event": event,
        "payload": payload,
        "prev_hash": prev_hash,
        "chain_hash": new_hash,
    })


# ---------- Commands ----------------------------------------------------

def cmd_reset(args: argparse.Namespace) -> int:
    """Reset a task to status=ready, clearing attempts and outputs. Adds an
    operator_reset audit entry recording the reason."""
    state_path = Path(args.state_path)
    state = _load_state(state_path)
    task = _find_task(state, args.task_id)
    if task is None:
        print(f"task not found: {args.task_id}", file=sys.stderr)
        return 1
    old_status = task.get("status")
    old_attempts = task.get("attempts", 0)
    payload = {
        "reason": args.reason,
        "reset_fields": {
            "status": f"{old_status} -> ready",
            "attempts": f"{old_attempts} -> 0",
            "outputs": "cleared",
        },
        "operator": args.operator,
    }
    _append_audit(task, "operator_reset", payload)
    task["status"] = "ready"
    task["attempts"] = 0
    task["outputs"] = None
    _save_state(state_path, state)
    print(f"reset: {args.task_id}  (was status={old_status}, attempts={old_attempts})")
    return 0


def cmd_abandon(args: argparse.Namespace) -> int:
    """Mark a task as blocked with an operator_reset audit entry. Used when
    a task's scope is wrong and operator is replacing it with new tasks."""
    state_path = Path(args.state_path)
    state = _load_state(state_path)
    task = _find_task(state, args.task_id)
    if task is None:
        print(f"task not found: {args.task_id}", file=sys.stderr)
        return 1
    payload: dict[str, Any] = {
        "reason": args.reason,
        "reset_fields": {"status": f"{task.get('status')} -> blocked (abandoned)"},
        "operator": args.operator,
    }
    if args.replaced_by:
        payload["replaced_by"] = [
            x.strip() for x in args.replaced_by.split(",") if x.strip()
        ]
    _append_audit(task, "operator_reset", payload)
    task["status"] = "blocked"
    _save_state(state_path, state)
    print(f"abandoned: {args.task_id}  (status now blocked)")
    if payload.get("replaced_by"):
        print(f"  replaced by: {', '.join(payload['replaced_by'])}")
    return 0


def cmd_append_tasks(args: argparse.Namespace) -> int:
    """Append new tasks from a JSON file to state.jsonld. The JSON file
    must contain either a list of task objects or an object with a "tasks"
    key. IDs that already exist in state.jsonld are skipped (no overwrite)."""
    state_path = Path(args.state_path)
    state = _load_state(state_path)
    src = Path(args.tasks_file)
    if not src.exists():
        print(f"tasks file not found: {src}", file=sys.stderr)
        return 1
    with open(src, encoding="utf-8") as f:
        data = json.load(f)
    new_tasks = data.get("tasks", data) if isinstance(data, dict) else data
    if not isinstance(new_tasks, list):
        print("tasks file must contain a list or an object with `tasks` key",
              file=sys.stderr)
        return 1
    existing = {t["@id"] for t in state.get("tasks", [])}
    added = 0
    skipped = 0
    for nt in new_tasks:
        if not isinstance(nt, dict) or "@id" not in nt:
            print(f"skipping malformed task: {nt!r}", file=sys.stderr)
            continue
        if nt["@id"] in existing:
            skipped += 1
            continue
        state["tasks"].append(nt)
        added += 1
    _save_state(state_path, state)
    print(f"appended {added} task(s); skipped {skipped} duplicate(s)")
    return 0


def cmd_verify(args: argparse.Namespace) -> int:
    """Verify audit-chain integrity across all tasks' history. Re-derives
    each entry's chain_hash from prev_hash + event + payload via hiri_sign
    and reports any mismatch or chain break."""
    state_path = Path(args.state_path)
    state = _load_state(state_path)
    ok = True
    total_entries = 0
    for t in state.get("tasks", []):
        prev = "0" * 64
        for i, h in enumerate(t.get("history", [])):
            total_entries += 1
            if h.get("prev_hash") != prev:
                ok = False
                print(f"BREAK  {t['@id']}  history[{i}]  prev_hash mismatch "
                      f"(expected {prev[:16]}..., got "
                      f"{(h.get('prev_hash') or 'missing')[:16]}...)",
                      file=sys.stderr)
                break
            recomputed = d.hiri_sign(
                prev, {"event": h["event"], "payload": h["payload"]}
            )
            actual = h.get("chain_hash") or h.get("hash")
            if recomputed != actual:
                ok = False
                print(f"MISMATCH  {t['@id']}  history[{i}]  chain_hash mismatch "
                      f"(recomputed {recomputed[:16]}..., stored "
                      f"{(actual or 'missing')[:16]}...)", file=sys.stderr)
                break
            prev = recomputed
    if not args.quiet:
        print(f"verified {total_entries} audit entries across "
              f"{len(state.get('tasks', []))} tasks: "
              f"{'PASS' if ok else 'FAIL'}")
    return 0 if ok else 1


def cmd_status(args: argparse.Namespace) -> int:
    """Print task statuses. Optional --filter STATUS to show only one bucket.
    `awaiting_operator_decision` tasks are surfaced at the top regardless of
    filter so operators don't miss them."""
    state_path = Path(args.state_path)
    state = _load_state(state_path)
    by_status: dict[str, list[str]] = {}
    for t in state.get("tasks", []):
        by_status.setdefault(t.get("status", "?"), []).append(t["@id"])
    if args.filter:
        ids = by_status.get(args.filter, [])
        for tid in ids:
            print(tid)
        return 0
    # Surface awaiting_operator_decision at the top — operators must see it
    awaiting = by_status.pop("awaiting_operator_decision", [])
    if awaiting:
        print(f"!! AWAITING OPERATOR DECISION ({len(awaiting)}):")
        for tid in awaiting:
            print(f"  {tid}")
            print(f"    resolve: python state_admin.py resolve {tid} --option N")
        print()
    for status, ids in sorted(by_status.items()):
        print(f"{status} ({len(ids)}):")
        for tid in ids:
            print(f"  {tid}")
    return 0


def cmd_resolve(args: argparse.Namespace) -> int:
    """Resolve an `awaiting_operator_decision` task by picking one of the
    options the agent surfaced. Records the operator_resolution audit event,
    annotates the task's outputs with the chosen option, and marks the task
    done so downstream chain dependencies advance.

    The chosen ADR (if the operator wants one drafted) is the operator's
    next step — queue a question-resolver task with the resolution as a
    structured answer, or edit DECISIONS.md directly.
    """
    state_path = Path(args.state_path)
    state = _load_state(state_path)
    task = _find_task(state, args.task_id)
    if task is None:
        print(f"task not found: {args.task_id}", file=sys.stderr)
        return 1
    if task.get("status") != "awaiting_operator_decision":
        print(f"task {args.task_id} status is {task.get('status')!r}, "
              f"not awaiting_operator_decision", file=sys.stderr)
        return 1
    outputs = task.get("outputs") or {}
    options = outputs.get("options")
    if not isinstance(options, list) or not options:
        print(f"task {args.task_id} has no options to resolve", file=sys.stderr)
        return 1
    if args.option < 1 or args.option > len(options):
        print(f"option {args.option} out of range; task has {len(options)} "
              f"option(s)", file=sys.stderr)
        return 1
    chosen_option = options[args.option - 1]
    payload = {
        "chosen_option_index": args.option,
        "chosen_option": chosen_option,
        "operator": args.operator,
    }
    if args.notes:
        payload["notes"] = args.notes
    _append_audit(task, "operator_resolution", payload)
    # Annotate outputs with the resolution so downstream agents reading
    # via UPSTREAM see the resolved choice
    if isinstance(task.get("outputs"), dict):
        task["outputs"]["operator_resolution"] = payload
    task["status"] = "done"
    _save_state(state_path, state)
    print(f"resolved: {args.task_id}  (option {args.option} of "
          f"{len(options)})")
    return 0


def cmd_bank(args: argparse.Namespace) -> int:
    """Record a forward-track audit event against a task. Captures a pattern
    observation, risk callout, methodology candidate, or other operational
    intelligence as an append-only audit entry — no task state change.
    Phase-exit-retro (v3.0) will consume these events.

    The cycle number is operator-provided in v2.6.0 (no cycle counter yet
    until v2.8.0's commit-finalize lands). Pass --cycle if you have one.
    """
    state_path = Path(args.state_path)
    state = _load_state(state_path)
    task = _find_task(state, args.task_id)
    if task is None:
        print(f"task not found: {args.task_id}", file=sys.stderr)
        return 1
    payload: dict[str, Any] = {
        "candidate_class": args.candidate_class,
        "content": args.content,
        "operator": args.operator,
    }
    if args.cycle is not None:
        payload["surfacing_cycle"] = args.cycle
    _append_audit(task, "forward_track", payload)
    _save_state(state_path, state)
    print(f"banked: {args.task_id}  class={args.candidate_class}"
          + (f"  cycle={args.cycle}" if args.cycle is not None else ""))
    return 0


# ---------- CLI ---------------------------------------------------------

def _build_parser() -> argparse.ArgumentParser:
    p = argparse.ArgumentParser(
        description="Operator utilities for state.jsonld manipulation.",
        formatter_class=argparse.RawDescriptionHelpFormatter,
        epilog="STOP THE DAEMON before modifying state (Ctrl-C in its terminal).",
    )
    p.add_argument("--state-path", default="state.jsonld",
                   help="path to state.jsonld (default: ./state.jsonld)")
    sub = p.add_subparsers(dest="cmd", required=True)

    p_reset = sub.add_parser("reset", help="reset task to ready with audit")
    p_reset.add_argument("task_id")
    p_reset.add_argument("--reason", required=True)
    p_reset.add_argument("--operator", default="operator")
    p_reset.set_defaults(func=cmd_reset)

    p_abandon = sub.add_parser("abandon", help="mark task blocked with audit")
    p_abandon.add_argument("task_id")
    p_abandon.add_argument("--reason", required=True)
    p_abandon.add_argument("--replaced-by",
                            help="comma-separated replacement task @ids")
    p_abandon.add_argument("--operator", default="operator")
    p_abandon.set_defaults(func=cmd_abandon)

    p_append = sub.add_parser("append-tasks", help="append tasks from JSON file")
    p_append.add_argument("tasks_file")
    p_append.set_defaults(func=cmd_append_tasks)

    p_verify = sub.add_parser("verify", help="verify audit-chain integrity")
    p_verify.add_argument("--quiet", action="store_true")
    p_verify.set_defaults(func=cmd_verify)

    p_status = sub.add_parser("status", help="print task statuses")
    p_status.add_argument("--filter",
                           help="show only this status (ready|in_progress|"
                                "done|blocked|failed|awaiting_operator_decision)")
    p_status.set_defaults(func=cmd_status)

    p_resolve = sub.add_parser("resolve",
                                help="resolve an awaiting_operator_decision task")
    p_resolve.add_argument("task_id")
    p_resolve.add_argument("--option", type=int, required=True,
                            help="1-based index of the option to pick")
    p_resolve.add_argument("--notes",
                            help="optional operator notes recorded with the "
                                 "resolution")
    p_resolve.add_argument("--operator", default="operator")
    p_resolve.set_defaults(func=cmd_resolve)

    p_bank = sub.add_parser("bank",
                             help="record a forward-track audit event")
    p_bank.add_argument("task_id",
                         help="task @id to anchor the audit entry against")
    p_bank.add_argument("--candidate-class", required=True,
                         help="pattern | risk | methodology | decision | other")
    p_bank.add_argument("--content", required=True,
                         help="the observation / candidate text")
    p_bank.add_argument("--cycle", type=int, default=None,
                         help="optional surfacing cycle number "
                              "(operator-provided in v2.6.0)")
    p_bank.add_argument("--operator", default="operator")
    p_bank.set_defaults(func=cmd_bank)

    return p


def main(argv: Optional[list[str]] = None) -> int:
    parser = _build_parser()
    args = parser.parse_args(argv)
    return args.func(args)


if __name__ == "__main__":
    sys.exit(main())
