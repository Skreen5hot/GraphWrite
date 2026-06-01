"""Operator-Decision Emission (v3.3.0) — substrate emission channel.

Closes the architectural gap Aaron identified 2026-05-24 → reaffirmed
2026-06-01: the substrate stored `awaiting_operator_decision` tasks in
state.jsonld but had no emission channel to make pending decisions
discoverable. Detection / recovery / decision-SHAPE all existed; the
*surface* that puts decisions in the operator's line of sight did not.

This module is the emission. Renders all `awaiting_operator_decision`
tasks in state.jsonld as human-readable Markdown. Operator-discoverable
via:

  1. `state_admin pending` — on-demand CLI emission
  2. `fnsr.operator_decisions.md` — auto-refreshed file the operator's
     IDE can show
  3. Watchdog recommendation — surfaces "PENDING DECISIONS: N" inline

Read-only over state.jsonld; pure renderer; no mutation. Per CLAUDE.md
§7.6 the daemon already commits tasks with status=awaiting_operator_decision
and the operator resolves via `state_admin resolve <task-id> --option N`.
"""
from __future__ import annotations

import datetime
import json
import os
import sys
from pathlib import Path


OPERATOR_DECISIONS_FILE = "fnsr.operator_decisions.md"


def _load_state(state_path: Path) -> dict | None:
    try:
        with state_path.open(encoding="utf-8") as f:
            return json.load(f)
    except (OSError, json.JSONDecodeError):
        return None


def _ascii_safe(text: str) -> str:
    """Replace non-ASCII chars with '?' to avoid Windows console encoding
    issues. Markdown file itself is UTF-8 so this is for stdout only."""
    return text.encode("ascii", "replace").decode("ascii")


def _collect_pending_decisions(state: dict) -> list[dict]:
    """Walk state.jsonld for tasks with status=awaiting_operator_decision."""
    pending = []
    for t in state.get("tasks", []) or []:
        if t.get("status") != "awaiting_operator_decision":
            continue
        outputs = t.get("outputs") or {}
        if not isinstance(outputs, dict):
            continue
        # Get most recent history ts
        last_ts = None
        for h in reversed(t.get("history", []) or []):
            if h.get("ts"):
                last_ts = h.get("ts")
                break
        pending.append({
            "task_id": t.get("@id", ""),
            "agent": t.get("agent", ""),
            "anchor_task": outputs.get("anchor_task", ""),
            "source_fixer_task": outputs.get("source_fixer_task", ""),
            "diagnosis": outputs.get("diagnosis", ""),
            "options": outputs.get("options", []) or [],
            "recommendation": outputs.get("recommendation", ""),
            "rationale": outputs.get("rationale", ""),
            "referenced_evidence": outputs.get("referenced_evidence", []) or [],
            "fixer_escalated": outputs.get("fixer_escalated", False),
            "last_ts": last_ts,
        })
    return pending


def render_markdown(state: dict) -> str:
    """Render all pending operator decisions as Markdown. Pure function."""
    now_iso = datetime.datetime.now(datetime.timezone.utc).isoformat()
    pending = _collect_pending_decisions(state)

    lines: list[str] = []
    lines.append("# Pending Operator Decisions")
    lines.append("")
    lines.append(f"_Generated: {now_iso}_  ")
    lines.append(f"_Source: v3.3.0 substrate emission per fnsr_operator_decisions.py_")
    lines.append("")
    lines.append(f"**Total: {len(pending)} task(s) awaiting operator decision.**")
    lines.append("")

    if not pending:
        lines.append("---")
        lines.append("")
        lines.append("No pending decisions. Substrate is either idle or actively dispatching.")
        lines.append("")
        return "\n".join(lines)

    # Group by anchor (duplicate Fixers per anchor produce duplicate surfaces)
    by_anchor: dict[str, list[dict]] = {}
    for d in pending:
        anchor = d["anchor_task"] or "(no anchor)"
        by_anchor.setdefault(anchor, []).append(d)

    if len(by_anchor) < len(pending):
        lines.append(f"_Note: {len(pending)} decisions across {len(by_anchor)} "
                      f"distinct anchor(s); some anchors have duplicate Fixer "
                      f"surfaces (consecutive Fixer attempts independently "
                      f"reached the same diagnosis)._")
        lines.append("")

    lines.append("---")
    lines.append("")

    decision_n = 0
    for anchor_id, decisions in by_anchor.items():
        anchor_short = anchor_id.split(":")[-1] if anchor_id else "(no anchor)"
        if len(decisions) > 1:
            lines.append(f"## Anchor: `{anchor_short}` ({len(decisions)} duplicate surfaces)")
        else:
            lines.append(f"## Anchor: `{anchor_short}`")
        lines.append("")

        # Use the FIRST decision as primary (subsequent duplicates referenced)
        primary = decisions[0]
        duplicates = decisions[1:]

        decision_n += 1
        lines.append(f"### Decision {decision_n}: `{primary['task_id'].split(':')[-1]}`")
        lines.append("")
        lines.append(f"- **Anchor:** `{anchor_id}`")
        if primary["source_fixer_task"]:
            lines.append(f"- **Source Fixer:** `{primary['source_fixer_task']}`")
        if primary["last_ts"]:
            lines.append(f"- **Surfaced at:** {primary['last_ts']}")
        lines.append("")

        if primary["diagnosis"]:
            lines.append("#### Diagnosis")
            lines.append("")
            lines.append("> " + primary["diagnosis"].strip().replace("\n", "\n> "))
            lines.append("")

        if primary["options"]:
            lines.append("#### Options")
            lines.append("")
            for i, opt in enumerate(primary["options"], start=1):
                if isinstance(opt, dict):
                    label = opt.get("label", "?")
                    tradeoff = opt.get("tradeoff", "")
                    if tradeoff:
                        lines.append(f"{i}. **{label}** — {tradeoff}")
                    else:
                        lines.append(f"{i}. **{label}**")
                else:
                    lines.append(f"{i}. {str(opt)}")
            lines.append("")

        if primary["recommendation"]:
            lines.append("#### Recommendation")
            lines.append("")
            lines.append("> " + primary["recommendation"].strip().replace("\n", "\n> "))
            lines.append("")

        if primary["rationale"]:
            lines.append("#### Rationale")
            lines.append("")
            lines.append("> " + primary["rationale"].strip().replace("\n", "\n> "))
            lines.append("")

        if primary["referenced_evidence"]:
            lines.append("#### Referenced evidence")
            lines.append("")
            for ev in primary["referenced_evidence"][:10]:
                lines.append(f"- {ev}")
            lines.append("")

        lines.append("#### Resolve via")
        lines.append("")
        lines.append("```bash")
        lines.append(f"python state_admin.py resolve {primary['task_id']} "
                      f"--option <1-{len(primary['options']) or 1}> --notes \"...\"")
        if duplicates:
            lines.append("")
            lines.append("# Duplicate surface(s) for the same anchor; resolve all:")
            for dup in duplicates:
                lines.append(f"python state_admin.py resolve {dup['task_id']} "
                              f"--option <N> --notes \"duplicate; resolved via {primary['task_id'].split(':')[-1]}\"")
        lines.append("```")
        lines.append("")
        lines.append("---")
        lines.append("")

    return "\n".join(lines)


def emit(state_path: str | os.PathLike = "state.jsonld",
         output_path: str | os.PathLike | None = None) -> dict:
    """Probe state.jsonld; render pending decisions to Markdown file.

    Returns a summary dict:
        {
          "pending_count": int,
          "anchors_count": int,
          "output_path": str,
          "wrote_file": bool,
        }
    """
    sp = Path(state_path)
    if output_path is None:
        output_path = sp.parent / OPERATOR_DECISIONS_FILE
    out = Path(output_path)

    state = _load_state(sp)
    if state is None:
        return {
            "pending_count": 0,
            "anchors_count": 0,
            "output_path": str(out),
            "wrote_file": False,
            "error": "state.jsonld unreadable",
        }

    pending = _collect_pending_decisions(state)
    anchors = {d["anchor_task"] or "(no anchor)" for d in pending}
    md = render_markdown(state)
    try:
        with out.open("w", encoding="utf-8") as f:
            f.write(md)
        wrote = True
    except OSError:
        wrote = False
    return {
        "pending_count": len(pending),
        "anchors_count": len(anchors),
        "output_path": str(out),
        "wrote_file": wrote,
    }


def main() -> int:
    import argparse
    ap = argparse.ArgumentParser(
        description="Emit pending operator decisions as Markdown (v3.3.0).",
    )
    ap.add_argument("--state", default="state.jsonld",
                     help="path to state.jsonld (default: cwd)")
    ap.add_argument("--output", default=None,
                     help=f"output file path (default: <state-parent>/{OPERATOR_DECISIONS_FILE})")
    ap.add_argument("--print", action="store_true",
                     help="print rendered markdown to stdout in addition to writing the file")
    ap.add_argument("--no-write", action="store_true",
                     help="render only; do not write the file")
    args = ap.parse_args()

    state = _load_state(Path(args.state))
    if state is None:
        print("state.jsonld unreadable", file=sys.stderr)
        return 1

    md = render_markdown(state)

    if not args.no_write:
        out = Path(args.output) if args.output else Path(args.state).parent / OPERATOR_DECISIONS_FILE
        with out.open("w", encoding="utf-8") as f:
            f.write(md)
        # Print a compact summary
        pending = _collect_pending_decisions(state)
        anchors = {d["anchor_task"] or "(no anchor)" for d in pending}
        print(f"emitted {len(pending)} pending decision(s) "
              f"across {len(anchors)} anchor(s) to {out}")

    if args.print:
        print()
        print(_ascii_safe(md))

    return 0


if __name__ == "__main__":
    sys.exit(main())
