"""Pre-dispatch chain validator — catches operator-composed chain JSON defects
before they reach state.jsonld and produce cascade failures.

Per Aaron 2026-05-25 root-cause analysis: the substrate has no third party
validating operator chain composition before dispatch. When my hand-written
JSON has wrong deps / missing source_task / unresolvable cmd, I detect after
cascade and rewrite. This module catches those defects pre-flight.

Predicate catalog (informed by THIS session's actual cascades):
  PRED-1: applier task with inputs.source_task MUST include it in depends_on
          (root cause of v2 cascade: source_not_in_upstream veto)
  PRED-2: on Windows, test-runner inputs.cmd starting with bare 'npm' will
          fail subprocess.run; suggest absolute npm.cmd path (root cause of
          v3→v4 cascade)
  PRED-3: every depends_on task ID resolves AND target is not in
          blocked/failed/abandoned status (root cause of v5 recon-front
          cascade: chain N recon depending on abandoned chain N-1 v1 test)
  PRED-4: per-agent required inputs.* fields present (e.g., architect
          requires mode; applier requires source_task)
  PRED-5: no @id collisions (within chain or against existing state.jsonld)
  PRED-6: no circular dependencies within the chain

Run:
  python fnsr_chain_validator.py <chain.json> [--state state.jsonld] [--print]

Integration:
  state_admin.py exposes `verify-chain` subcommand wrapping this module
  state_admin.py adds --verify-first flag on append-tasks
"""
from __future__ import annotations

import argparse
import json
import platform
import shlex
import sys
from pathlib import Path
from typing import Any

# ---- Per-agent required inputs (validated by PRED-4) ----------------------
# Conservative list: only agents whose contract genuinely requires an input
# field that, if missing, produces a CPS veto or runtime failure.
REQUIRED_INPUTS_PER_AGENT: dict[str, tuple[str, ...]] = {
    "architect": ("mode",),
    "applier": ("source_task",),
    "test-runner": ("cmd",),
    "verification-ritual-llm": ("mode",),
}


def _load_json(path: Path) -> Any:
    with path.open(encoding="utf-8") as f:
        return json.load(f)


# ---- Predicates -----------------------------------------------------------

def pred_1_applier_source_in_depends(
    chain_tasks: list[dict], current_state: dict
) -> list[dict]:
    """Applier with inputs.source_task MUST include that task in depends_on
    (UPSTREAM resolution requires the dep)."""
    findings = []
    for t in chain_tasks:
        if t.get("agent") != "applier":
            continue
        inputs = t.get("inputs") or {}
        src = inputs.get("source_task")
        if not src:
            continue  # source_task field is optional in general
        deps = t.get("depends_on", []) or []
        if src not in deps:
            findings.append({
                "predicate_id": "pred-1-applier-source-in-depends",
                "severity": "error",
                "task_id": t.get("@id"),
                "evidence": {
                    "source_task": src,
                    "depends_on": deps,
                },
                "fix_suggestion": (
                    f"Add '{src}' to depends_on. The applier reads "
                    "UPSTREAM by walking deps; source_task must be a dep."
                ),
            })
    return findings


def pred_2_windows_npm_bare(
    chain_tasks: list[dict], current_state: dict
) -> list[dict]:
    """On Windows, test-runner inputs.cmd starting with bare 'npm' or
    './npm' will fail subprocess.run(shell=False) because Windows expects
    'npm.cmd' (PATHEXT doesn't apply to CreateProcessW)."""
    findings = []
    if platform.system() != "Windows":
        return findings
    for t in chain_tasks:
        if t.get("agent") != "test-runner":
            continue
        inputs = t.get("inputs") or {}
        cmd = inputs.get("cmd", "") or ""
        if not cmd:
            continue
        try:
            tokens = shlex.split(cmd)
        except ValueError as e:
            findings.append({
                "predicate_id": "pred-2-windows-npm-bare",
                "severity": "error",
                "task_id": t.get("@id"),
                "evidence": {"cmd": cmd, "shlex_error": str(e)},
                "fix_suggestion": "Fix shlex-parseable quoting in inputs.cmd.",
            })
            continue
        if not tokens:
            continue
        first = tokens[0]
        # Bare "npm" without extension OR path-suffixed "npm" without .cmd/.exe
        bare = first == "npm"
        suffixed = (first.endswith("/npm") or first.endswith("\\npm"))
        if bare or suffixed:
            findings.append({
                "predicate_id": "pred-2-windows-npm-bare",
                "severity": "error",
                "task_id": t.get("@id"),
                "evidence": {"cmd": cmd, "platform": "Windows", "first_token": first},
                "fix_suggestion": (
                    "On Windows, subprocess.run(shell=False) cannot resolve "
                    "bare 'npm' to npm.cmd. Use absolute path: "
                    '"C:/Program Files/nodejs/npm.cmd" test'
                ),
            })
    return findings


def pred_3_deps_alive(
    chain_tasks: list[dict], current_state: dict
) -> list[dict]:
    """Every depends_on ID must resolve to a task that is alive (not
    blocked/failed/abandoned). Either in the chain itself OR in current state.
    This catches the recon-front cascade pattern."""
    findings = []
    chain_ids = {t.get("@id") for t in chain_tasks if t.get("@id")}
    state_tasks = {
        t.get("@id"): t for t in current_state.get("tasks", []) or []
    }
    dead_statuses = {"blocked", "failed", "abandoned"}
    for t in chain_tasks:
        deps = t.get("depends_on", []) or []
        for d in deps:
            if d in chain_ids:
                continue  # will be created by this same chain
            existing = state_tasks.get(d)
            if existing is None:
                findings.append({
                    "predicate_id": "pred-3-deps-alive",
                    "severity": "error",
                    "task_id": t.get("@id"),
                    "evidence": {"missing_dep_id": d},
                    "fix_suggestion": (
                        f"Dep '{d}' doesn't exist in state.jsonld or in "
                        "this chain. Check for task-id typos or chain "
                        "ordering."
                    ),
                })
                continue
            st = existing.get("status")
            if st in dead_statuses:
                findings.append({
                    "predicate_id": "pred-3-deps-alive",
                    "severity": "error",
                    "task_id": t.get("@id"),
                    "evidence": {
                        "dep_id": d,
                        "dep_status": st,
                    },
                    "fix_suggestion": (
                        f"Dep '{d}' is {st}; this task can never dispatch. "
                        "Either cascade-fix the dep, or retarget this "
                        "task's depends_on to a live alternative (e.g., "
                        "the replaced_by task from abandon)."
                    ),
                })
    return findings


def pred_4_required_inputs(
    chain_tasks: list[dict], current_state: dict
) -> list[dict]:
    """Per-agent required inputs.* fields must be present + truthy."""
    findings = []
    for t in chain_tasks:
        agent = t.get("agent", "")
        required = REQUIRED_INPUTS_PER_AGENT.get(agent)
        if not required:
            continue
        inputs = t.get("inputs") or {}
        for req in required:
            if not inputs.get(req):
                findings.append({
                    "predicate_id": "pred-4-required-inputs",
                    "severity": "error",
                    "task_id": t.get("@id"),
                    "evidence": {
                        "agent": agent,
                        "missing_field": f"inputs.{req}",
                        "inputs_present": sorted(inputs.keys()),
                    },
                    "fix_suggestion": (
                        f"Agent '{agent}' requires inputs.{req}. "
                        "See agent contract in .claude/agents/."
                    ),
                })
    return findings


def pred_5_no_id_collisions(
    chain_tasks: list[dict], current_state: dict
) -> list[dict]:
    """No duplicate @id within the chain OR against existing state.jsonld."""
    findings = []
    state_ids = {
        t.get("@id") for t in current_state.get("tasks", []) or []
        if t.get("@id")
    }
    seen_in_chain: set[str] = set()
    for i, t in enumerate(chain_tasks):
        cid = t.get("@id")
        if not cid:
            findings.append({
                "predicate_id": "pred-5-no-id-collisions",
                "severity": "error",
                "task_id": f"(chain index {i})",
                "evidence": {"chain_index": i, "task_keys": sorted(t.keys())},
                "fix_suggestion": "Every chain task MUST have an @id field.",
            })
            continue
        if cid in state_ids:
            findings.append({
                "predicate_id": "pred-5-no-id-collisions",
                "severity": "error",
                "task_id": cid,
                "evidence": {"collides_with": "existing state.jsonld task"},
                "fix_suggestion": (
                    f"Task @id '{cid}' already exists in state.jsonld. "
                    "Choose a different @id (e.g., bump version suffix: "
                    "-v2, -v3)."
                ),
            })
        if cid in seen_in_chain:
            findings.append({
                "predicate_id": "pred-5-no-id-collisions",
                "severity": "error",
                "task_id": cid,
                "evidence": {"collides_with": "another task in this chain"},
                "fix_suggestion": (
                    f"Task @id '{cid}' duplicated within the chain. "
                    "Every chain task @id must be unique."
                ),
            })
        seen_in_chain.add(cid)
    return findings


def pred_6_no_circular_deps(
    chain_tasks: list[dict], current_state: dict
) -> list[dict]:
    """No circular dependency cycle within the chain."""
    findings = []
    by_id = {t.get("@id"): t for t in chain_tasks if t.get("@id")}
    chain_ids = set(by_id.keys())

    def find_cycle(start_id: str) -> list[str] | None:
        # DFS; return cycle path if found
        stack: list[tuple[str, list[str]]] = [(start_id, [start_id])]
        local_visited: set[str] = set()
        while stack:
            node, path = stack.pop()
            if node in local_visited:
                continue
            local_visited.add(node)
            t = by_id.get(node)
            if t is None:
                continue
            for d in t.get("depends_on", []) or []:
                if d not in chain_ids:
                    continue
                if d in path:
                    # Cycle: path[index(d):] + [d]
                    return path[path.index(d):] + [d]
                stack.append((d, path + [d]))
        return None

    reported: set[frozenset[str]] = set()
    for tid in by_id:
        cycle = find_cycle(tid)
        if cycle is None:
            continue
        key = frozenset(cycle)
        if key in reported:
            continue
        reported.add(key)
        findings.append({
            "predicate_id": "pred-6-no-circular-deps",
            "severity": "error",
            "task_id": cycle[0],
            "evidence": {"cycle": cycle},
            "fix_suggestion": (
                "Break the dependency cycle. Chains MUST be acyclic; "
                "the daemon's picker would never dispatch any task in a "
                "cycle."
            ),
        })
    return findings


PREDICATES = (
    pred_1_applier_source_in_depends,
    pred_2_windows_npm_bare,
    pred_3_deps_alive,
    pred_4_required_inputs,
    pred_5_no_id_collisions,
    pred_6_no_circular_deps,
)


def validate_chain(
    chain_tasks: list[dict], current_state: dict | None = None,
) -> dict:
    """Run all predicates; return structured report. Pure function."""
    if current_state is None:
        current_state = {"tasks": []}
    findings: list[dict] = []
    for pred in PREDICATES:
        try:
            findings.extend(pred(chain_tasks, current_state))
        except Exception as e:
            findings.append({
                "predicate_id": pred.__name__,
                "severity": "info",
                "drift_kind": "predicate_error",
                "evidence": {"error": str(e), "error_type": type(e).__name__},
            })
    severity_counts = {"error": 0, "warn": 0, "info": 0}
    for f in findings:
        sev = f.get("severity", "info")
        severity_counts[sev] = severity_counts.get(sev, 0) + 1
    return {
        "validator_version": "1.0-v3.1.0-bridge",
        "task_count": len(chain_tasks),
        "predicates_run": [p.__name__ for p in PREDICATES],
        "findings": findings,
        "severity_counts": severity_counts,
        "verdict": "FAIL" if severity_counts["error"] > 0 else "PASS",
        "platform": platform.system(),
    }


def validate_chain_file(
    chain_path: Path, state_path: Path | None = None,
) -> dict:
    chain_tasks = _load_json(chain_path)
    if not isinstance(chain_tasks, list):
        return {
            "verdict": "FAIL",
            "error": "chain JSON must be a list of task objects",
            "chain_path": str(chain_path),
        }
    current_state = {"tasks": []}
    if state_path and state_path.exists():
        try:
            current_state = _load_json(state_path)
        except Exception as e:
            return {
                "verdict": "FAIL",
                "error": f"could not load state.jsonld: {e}",
                "state_path": str(state_path),
            }
    report = validate_chain(chain_tasks, current_state)
    report["chain_path"] = str(chain_path)
    if state_path:
        report["state_path"] = str(state_path)
    return report


def main() -> int:
    ap = argparse.ArgumentParser(
        description="Pre-dispatch chain validator (v3.1.0-bridge)."
    )
    ap.add_argument("chain_path", help="path to the chain JSON file")
    ap.add_argument("--state", default="state.jsonld",
                     help="path to state.jsonld (default: cwd/state.jsonld)")
    ap.add_argument("--print", action="store_true",
                     help="print full JSON report")
    args = ap.parse_args()
    state_path = Path(args.state) if args.state else None
    report = validate_chain_file(Path(args.chain_path), state_path)
    if args.print:
        print(json.dumps(report, indent=2, default=str))
    else:
        verdict = report.get("verdict", "?")
        sc = report.get("severity_counts", {})
        print(f"verify-chain {args.chain_path}: {verdict} "
              f"(errors={sc.get('error', 0)} warns={sc.get('warn', 0)} "
              f"info={sc.get('info', 0)})")
        for f in report.get("findings", []):
            pid = f.get("predicate_id", "?")
            sev = f.get("severity", "?")
            tid = f.get("task_id", "?")
            ev = f.get("evidence", {})
            ev_short = ", ".join(f"{k}={v}" for k, v in list(ev.items())[:3])[:120]
            print(f"  [{sev:5s}] {pid} @ {tid}")
            if ev_short:
                print(f"          evidence: {ev_short}")
            fix = f.get("fix_suggestion", "")
            if fix:
                print(f"          fix: {fix[:160]}")
    return 1 if report.get("verdict") == "FAIL" else 0


if __name__ == "__main__":
    sys.exit(main())
