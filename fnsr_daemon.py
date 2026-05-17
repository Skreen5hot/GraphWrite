#!/usr/bin/env python3
"""
fnsr_daemon.py — Minimal deterministic orchestrator for Claude Code subagents.
Cross-platform: Windows (msvcrt + .cmd shim handling) and POSIX (fcntl).

v0 skeleton — extension points marked with `# EXTENSION:`.
Single-worker by design. Stdlib only.
"""

from __future__ import annotations

import hashlib
import json
import logging
import os
import re
import shutil
import signal
import subprocess
import sys
import time
from contextlib import contextmanager
from dataclasses import dataclass
from pathlib import Path
from typing import Any, Iterator, Optional

# ---------- Cross-platform file locking ----------------------------------

if sys.platform == "win32":
    import msvcrt

    def _acquire_lock(fileobj) -> None:
        fileobj.seek(0)
        while True:
            try:
                msvcrt.locking(fileobj.fileno(), msvcrt.LK_LOCK, 1)
                return
            except OSError:
                time.sleep(0.1)

    def _release_lock(fileobj) -> None:
        try:
            fileobj.seek(0)
            msvcrt.locking(fileobj.fileno(), msvcrt.LK_UNLCK, 1)
        except OSError:
            pass
else:
    import fcntl

    def _acquire_lock(fileobj) -> None:
        fcntl.flock(fileobj, fcntl.LOCK_EX)

    def _release_lock(fileobj) -> None:
        fcntl.flock(fileobj, fcntl.LOCK_UN)


# ---------- Config --------------------------------------------------------

STATE_PATH = Path(os.environ.get("FNSR_STATE", "./state.jsonld"))
AGENTS_DIR = Path(os.environ.get("FNSR_AGENTS", "./.claude/agents"))
CLAUDE_BIN = os.environ.get("FNSR_CLAUDE_BIN", "claude")
POLL_INTERVAL_S = float(os.environ.get("FNSR_POLL_S", "2.0"))
TASK_TIMEOUT_S = int(os.environ.get("FNSR_TASK_TIMEOUT_S", "1800"))
MAX_ATTEMPTS = int(os.environ.get("FNSR_MAX_ATTEMPTS", "3"))
RAW_STDOUT_LOG_BYTES = int(os.environ.get("FNSR_RAW_STDOUT_BYTES", "4000"))
DAEMON_PID_PATH = Path(os.environ.get("FNSR_PID", "./fnsr.pid"))
API_BACKOFF_S = int(os.environ.get("FNSR_API_BACKOFF_S", "60"))

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s %(levelname)s %(name)s %(message)s",
)
log = logging.getLogger("fnsr-daemon")


# ---------- Atomic, locked state I/O -------------------------------------

@contextmanager
def locked_state() -> Iterator[dict[str, Any]]:
    STATE_PATH.parent.mkdir(parents=True, exist_ok=True)
    if not STATE_PATH.exists():
        _atomic_write(STATE_PATH, json.dumps(_empty_state(), indent=2))

    lock_path = STATE_PATH.with_suffix(STATE_PATH.suffix + ".lock")
    with open(lock_path, "a+b") as lockf:
        lockf.seek(0, os.SEEK_END)
        if lockf.tell() == 0:
            lockf.write(b" ")
            lockf.flush()
        _acquire_lock(lockf)
        try:
            state = json.loads(STATE_PATH.read_text(encoding="utf-8"))
            yield state
            _atomic_write(STATE_PATH, json.dumps(state, indent=2))
        finally:
            _release_lock(lockf)


def _atomic_write(path: Path, content: str) -> None:
    """
    Write content to a temp sibling and atomically rename into place.
    On Windows, transient locks (OneDrive sync, antivirus, Search indexer)
    can cause PermissionError on os.replace even though no other daemon
    holds the file. Retry with a short exponential backoff before giving
    up — total wait under 5 seconds across 6 attempts.
    """
    tmp = path.with_suffix(path.suffix + ".tmp")
    tmp.write_text(content, encoding="utf-8")
    delays = [0.0, 0.05, 0.15, 0.4, 1.0, 2.5]
    last_err: Optional[Exception] = None
    for delay in delays:
        if delay:
            time.sleep(delay)
        try:
            os.replace(tmp, path)
            return
        except PermissionError as e:
            last_err = e
    raise last_err if last_err else RuntimeError("atomic_write failed")


def _empty_state() -> dict[str, Any]:
    return {
        "@context": "https://fnsr.example/context.jsonld",
        "@id": "urn:fnsr:run:bootstrap",
        "tasks": [],
    }


# ---------- Deterministic routing ----------------------------------------

def next_ready_task(state: dict[str, Any]) -> Optional[dict[str, Any]]:
    """
    Deterministic task picker. Filters by `status=ready` and all deps `done`,
    then orders by:
      1. `priority` field (higher first; default 0 when absent)
      2. `@id` lexicographically (tiebreaker, also a deterministic seed
         that pre-SPL state files inherit naturally)
    SPL v0.1: priority-as-int is the smallest plan-language step that
    gives operators routing control without introducing a separate plan
    object. Phase / branch / conditional structure is future work.
    """
    by_id = {t["@id"]: t for t in state.get("tasks", [])}
    done_ids = {tid for tid, t in by_id.items() if t.get("status") == "done"}
    candidates = []
    for t in state.get("tasks", []):
        if t.get("status") != "ready":
            continue
        deps = t.get("depends_on", []) or []
        if all(d in done_ids for d in deps):
            candidates.append(t)
    if not candidates:
        return None
    return min(candidates, key=lambda t: (-int(t.get("priority", 0)), t["@id"]))


# ---------- CPS containment + HIRI signature stubs -----------------------

class ContainmentVeto(Exception):
    pass


_REQUIRED_OUTPUTS_RE = re.compile(
    r"^required_outputs:\s*\[(.*?)\]\s*$", re.MULTILINE
)


def _agent_required_outputs(agent_name: str) -> list[str]:
    """
    Read an agent's `required_outputs` from its frontmatter. Returns the
    list of keys an agent's `outputs` dict MUST contain on success; empty
    list if the agent has no declaration (or no .md file). Single-line
    list syntax only: `required_outputs: [a, b, c]`.
    """
    agent_path = AGENTS_DIR / f"{agent_name}.md"
    if not agent_path.exists():
        return []
    text = agent_path.read_text(encoding="utf-8")
    if not text.startswith("---"):
        return []
    end = text.find("---", 3)
    if end < 0:
        return []
    frontmatter = text[3:end]
    match = _REQUIRED_OUTPUTS_RE.search(frontmatter)
    if not match:
        return []
    return [
        s.strip().strip('"').strip("'")
        for s in match.group(1).split(",")
        if s.strip()
    ]


def cps_check(task: dict[str, Any], proposed_outputs: Any) -> None:
    if proposed_outputs is None:
        raise ContainmentVeto("null outputs not permitted")
    if isinstance(proposed_outputs, dict):
        err = proposed_outputs.get("error")
        if err:
            raise ContainmentVeto(
                f"agent reported structured error: {err!r}"
            )
        agent_name = task.get("agent")
        if agent_name:
            required = _agent_required_outputs(agent_name)
            missing = [k for k in required if k not in proposed_outputs]
            if missing:
                raise ContainmentVeto(
                    f"agent {agent_name!r} missing required output keys: "
                    f"{missing}"
                )


def hiri_sign(prev_hash: str, payload: dict[str, Any]) -> str:
    """
    Return the chain hash for an audit entry: SHA-256 over the canonical
    JSON of {prev, payload}. Currently a hash-chain only — there is no
    cryptographic signature. The function name is preserved as a stub for
    future re-introduction of real signing (HMAC or asymmetric); for now
    the audit trail's integrity guarantee is "tamper-evident via chain
    consistency" only, not "tamper-proof against keyholder forgery."
    """
    blob = json.dumps(
        {"prev": prev_hash, "payload": payload},
        sort_keys=True,
        separators=(",", ":"),
    ).encode("utf-8")
    return hashlib.sha256(blob).hexdigest()


# ---------- Subagent invocation ------------------------------------------

@dataclass
class WorkerResult:
    ok: bool
    outputs: Any
    stderr: str
    raw_stdout: str


def _resolve_upstream(state: dict[str, Any], task: dict[str, Any]) -> dict[str, Any]:
    """
    For each dependency in task.depends_on, return its current outputs
    keyed by @id. Workers receive this in their prompt's UPSTREAM block
    so they never have to read state.jsonld themselves — keeping the
    orchestrator's state schema sealed behind the daemon. Routing
    already gates on deps being `done`, so outputs should always be
    populated; the error sentinels here are belt-and-suspenders for
    crash-recovery edge cases or manual state edits.
    """
    out: dict[str, Any] = {}
    by_id = {t.get("@id"): t for t in state.get("tasks", [])}
    for dep_id in (task.get("depends_on") or []):
        dep = by_id.get(dep_id)
        if dep is None:
            out[dep_id] = {"_error": "task_not_found"}
        elif dep.get("outputs") is None:
            out[dep_id] = {"_error": "outputs_not_ready",
                           "status": dep.get("status")}
        else:
            out[dep_id] = dep["outputs"]
    return out


def _resolve_claude_command(agent_name: str) -> Optional[list[str]]:
    """
    Build the claude invocation. The prompt is NOT included on the command
    line — it's piped via stdin in invoke_subagent. This avoids Windows's
    8191-character cmd.exe argument limit, which trivially breaks when
    UPSTREAM blocks carry a few KB of prior task outputs.
    """
    claude_exe = shutil.which(CLAUDE_BIN)
    if claude_exe is None:
        return None
    base_args = [
        "-p",
        "--agent", agent_name,
        "--output-format", "json",
    ]
    if sys.platform == "win32" and claude_exe.lower().endswith((".cmd", ".bat")):
        return ["cmd.exe", "/c", claude_exe] + base_args
    return [claude_exe] + base_args


def invoke_subagent(agent_name: str, task: dict[str, Any],
                    upstream: dict[str, Any]) -> WorkerResult:
    prompt = _build_prompt(task, upstream)
    cmd = _resolve_claude_command(agent_name)
    if cmd is None:
        return WorkerResult(False, None,
                            f"could not find '{CLAUDE_BIN}' on PATH", "")

    log.info("dispatch task=%s agent=%s", task["@id"], agent_name)
    try:
        proc = subprocess.run(
            cmd,
            input=prompt,
            capture_output=True,
            text=True,
            timeout=TASK_TIMEOUT_S,
            check=False,
            shell=False,
        )
    except subprocess.TimeoutExpired as e:
        out = e.stdout
        if isinstance(out, bytes):
            out = out.decode(errors="replace")
        return WorkerResult(False, None, f"timeout after {TASK_TIMEOUT_S}s", out or "")
    except FileNotFoundError as e:
        return WorkerResult(False, None,
                            f"subprocess could not start: {e}", "")

    if proc.returncode != 0:
        if _is_api_transient_error(proc.stdout):
            log.warning("api transient error for task=%s; sleeping %ds before "
                        "returning failure", task["@id"], API_BACKOFF_S)
            time.sleep(API_BACKOFF_S)
        return WorkerResult(False, None,
                            (proc.stderr or "")[:2000],
                            proc.stdout)

    outputs = _extract_outputs(proc.stdout)
    if outputs is None:
        if _is_api_transient_error(proc.stdout):
            log.warning("api transient error for task=%s; sleeping %ds before "
                        "returning failure", task["@id"], API_BACKOFF_S)
            time.sleep(API_BACKOFF_S)
        return WorkerResult(False, None,
                            "no JSON object found in stdout",
                            proc.stdout)
    outputs = _coerce_developer_envelope(outputs, task["@id"])
    return WorkerResult(True, outputs, proc.stderr, proc.stdout)


_API_TRANSIENT_RE = re.compile(
    r'"is_error"\s*:\s*true.*?"api_error_status"\s*:\s*5\d\d',
    re.DOTALL,
)


def _is_api_transient_error(stdout: str) -> bool:
    """Detect Anthropic API 5xx errors in claude's JSON envelope. These are
    transient external failures; the daemon sleeps before letting the next
    retry attempt fire, so Anthropic gets time to recover instead of us
    burning all our retries in a 15-second window."""
    if not stdout:
        return False
    return bool(_API_TRANSIENT_RE.search(stdout))


def _coerce_developer_envelope(outputs: Any, task_id: str) -> Any:
    """Auto-coerce a bare-change-shape dict to the developer envelope. The
    developer / planner agent's contract is `{changes: [...], summary,
    self_assessment}`. LLMs occasionally drop the wrapper on simple tasks
    and return a single change-shape dict at the top level. Rather than
    fail the CPS required-keys check and burn an attempt, the daemon
    auto-wraps a recognizable single-change dict and marks the result
    `_auto_coerced: True` so operators can audit."""
    if not isinstance(outputs, dict):
        return outputs
    if "changes" in outputs:
        return outputs
    # Heuristic: looks like a single change object?
    change_keys = {"file", "before", "after"}
    if not change_keys.issubset(outputs.keys()):
        return outputs
    log.info("auto-coerced bare change dict to envelope for task=%s", task_id)
    return {
        "changes": [outputs],
        "summary": "auto-coerced from bare change object emitted by agent; "
                   "operator should review intent",
        "self_assessment": "needs_review",
        "_auto_coerced": True,
    }


# ---------- System agents (deterministic, local Python) -----------------

def _apply_changes(task: dict[str, Any],
                   upstream: dict[str, Any]) -> "WorkerResult":
    """
    Apply a `developer` agent's proposed changes to the filesystem.

    Multi-change atomic semantics: when several edits target the same
    file, the applier finds each `before` snippet's position in the
    ORIGINAL file (not the intermediate state), checks for overlap, and
    applies all non-overlapping edits in a single end-to-start pass.
    This avoids the cascade failure mode where applying change C1 mutates
    the file and breaks C2's `before` match.

    Per-change rejection (recorded in `failed` list, doesn't block other
    changes):
      - `before_not_found`   — snippet not in original
      - `before_not_unique`  — snippet appears multiple times in original
      - `overlaps_other_change` — change's region intersects another's
      - `file_not_found`     — edit target missing
      - `new_file_exists`    — create target already exists
      - `missing_required_field` — file or after absent
      - `io_error` / `io_error_on_write`

    All-applied success returns `{applied, failed: [], summary}`; any
    failure returns a structured error which CPS will veto, leaving the
    task `blocked` for operator inspection with full applied/failed lists.

    Inputs schema:
      source_task : str   <- @id of an upstream task whose outputs
                              contain a `changes[]` list (the developer
                              agent's contract). MUST be present in
                              `depends_on`; daemon-resolved upstream
                              provides it via `upstream` dict.
      apply_root  : str?  <- root directory for relative file paths
                              (default ".").
    """
    log.info("dispatch task=%s system_agent=applier", task["@id"])
    inputs = task.get("inputs") or {}
    source_id = inputs.get("source_task")
    apply_root = Path(inputs.get("apply_root", "."))

    if not source_id:
        return WorkerResult(True,
                            {"error": "missing_source_task",
                             "needed": ["inputs.source_task"]},
                            "", "")

    source = upstream.get(source_id)
    if source is None:
        return WorkerResult(True,
                            {"error": "source_not_in_upstream",
                             "source_task": source_id,
                             "hint": "add the source task to depends_on"},
                            "", "")
    if not isinstance(source, dict):
        return WorkerResult(True,
                            {"error": "source_outputs_not_a_dict",
                             "source_task": source_id},
                            "", "")
    changes = source.get("changes")
    if not isinstance(changes, list):
        return WorkerResult(True,
                            {"error": "source_has_no_changes",
                             "source_task": source_id},
                            "", "")

    applied: list[dict[str, Any]] = []
    failed: list[dict[str, Any]] = []

    # Classify changes into new-files (before is null/empty) and edits.
    new_files: list[tuple[str, str, str]] = []
    edits_by_file: dict[str, list[tuple[str, str, str]]] = {}
    for change in changes:
        if not isinstance(change, dict):
            failed.append({"id": "?", "reason": "change_not_a_dict"})
            continue
        cid = change.get("id", "?")
        file_rel = change.get("file")
        before = change.get("before")
        after = change.get("after")

        if not file_rel or after is None:
            failed.append({"id": cid, "reason": "missing_required_field",
                           "needed": ["file", "after"]})
            continue

        if before in (None, ""):
            new_files.append((cid, file_rel, after))
        else:
            edits_by_file.setdefault(file_rel, []).append((cid, before, after))

    # Process new-file creates. Prepend a UTF-8 BOM if the content doesn't
    # already have one — Claude Code's Read tool on Windows otherwise defaults
    # to cp1252 decoding for BOM-less UTF-8 files, producing mojibake (e.g.,
    # `§` rendered as `Â§`) on subsequent reads by downstream agents.
    for cid, file_rel, after in new_files:
        file_path = apply_root / file_rel
        if file_path.exists():
            failed.append({"id": cid, "reason": "new_file_exists",
                           "path": str(file_path)})
            continue
        content_to_write = after if after.startswith("﻿") else "﻿" + after
        try:
            file_path.parent.mkdir(parents=True, exist_ok=True)
            file_path.write_text(content_to_write, encoding="utf-8")
            applied.append({"id": cid, "path": str(file_path), "mode": "create",
                            "bytes_written": len(content_to_write.encode("utf-8")),
                            "bom_prepended": not after.startswith("﻿")})
        except OSError as e:
            failed.append({"id": cid, "reason": "io_error", "error": str(e)})

    # Process edits per file, applying all non-overlapping in one pass.
    for file_rel, edits in edits_by_file.items():
        file_path = apply_root / file_rel
        if not file_path.exists():
            for cid, _, _ in edits:
                failed.append({"id": cid, "reason": "file_not_found",
                               "path": str(file_path)})
            continue

        try:
            original = file_path.read_text(encoding="utf-8")
        except OSError as e:
            for cid, _, _ in edits:
                failed.append({"id": cid, "reason": "io_error", "error": str(e)})
            continue

        # Locate each edit's region in the ORIGINAL content.
        positions: list[tuple[int, int, str, str]] = []  # (pos, len, cid, after)
        for cid, before, after in edits:
            count = original.count(before)
            if count == 0:
                failed.append({"id": cid, "reason": "before_not_found",
                               "path": str(file_path)})
                continue
            if count > 1:
                failed.append({"id": cid, "reason": "before_not_unique",
                               "path": str(file_path), "count": count})
                continue
            pos = original.find(before)
            positions.append((pos, len(before), cid, after))

        # Greedy overlap rejection: sort by start position; keep an edit
        # only if it starts at or after the previously-kept edit's end.
        positions.sort(key=lambda x: x[0])
        keep: list[tuple[int, int, str, str]] = []
        last_end = -1
        for pos, length, cid, after in positions:
            if pos < last_end:
                failed.append({"id": cid, "reason": "overlaps_other_change",
                               "path": str(file_path)})
            else:
                keep.append((pos, length, cid, after))
                last_end = pos + length

        if not keep:
            continue

        # Apply kept edits end-to-start so earlier positions don't shift.
        new_content = original
        for pos, length, cid, after in sorted(keep, key=lambda x: -x[0]):
            new_content = new_content[:pos] + after + new_content[pos + length:]

        try:
            file_path.write_text(new_content, encoding="utf-8")
            for pos, length, cid, after in keep:
                applied.append({
                    "id": cid, "path": str(file_path), "mode": "edit",
                    "delta_bytes": len(after.encode("utf-8")) - length,
                })
        except OSError as e:
            for pos, length, cid, after in keep:
                failed.append({"id": cid, "reason": "io_error_on_write",
                               "path": str(file_path), "error": str(e)})

    if failed:
        return WorkerResult(True,
                            {"error": "apply_partial_failure",
                             "applied": applied,
                             "failed": failed,
                             "summary": (f"{len(applied)} applied, "
                                         f"{len(failed)} failed")},
                            "", "")
    return WorkerResult(True,
                        {"applied": applied,
                         "failed": [],
                         "summary": f"{len(applied)} changes applied"},
                        "", "")


# Known mojibake patterns: UTF-8 byte sequences misinterpreted as cp1252
# and then re-encoded as UTF-8. Mostly produced by Claude Code's Read tool
# on Windows when reading BOM-less UTF-8 files, and by LLM agents that
# echo such mis-decoded characters back into their output.
_MOJIBAKE_PATTERNS = [
    ("â€”", "—"),     # U+2014 em-dash
    ("â€“", "–"),     # U+2013 en-dash
    ("â€¦", "…"),     # U+2026 horizontal ellipsis
    ("â€œ", "“"),  # U+201C left double quotation mark
    ("â€", "”"),  # U+201D right double quotation mark (rare ctrl-char form)
    ("â€™", "’"),  # U+2019 right single quotation mark
    ("â€˜", "‘"),  # U+2018 left single quotation mark
    # Arrow mojibake: UTF-8 starts with U+00E2 U+2020 (â†), then third char
    # is U+2019 / U+2018 / U+201C depending on direction.
    ("â†’", "→"),  # → right arrow (U+2192)
    ("â†‘", "↑"),  # ↑ up arrow (U+2191)
    ("â†“", "↓"),  # ↓ down arrow (U+2193)
    ("Â§", "§"),       # U+00A7 section sign
    ("Â¶", "¶"),       # U+00B6 pilcrow
    ("Â°", "°"),       # U+00B0 degree sign
    ("Â©", "©"),       # U+00A9 copyright
    ("Â®", "®"),       # U+00AE registered
    ("Â±", "±"),       # U+00B1 plus-minus
    ("Â´", "´"),       # U+00B4 acute accent
    ("Â·", "·"),       # U+00B7 middle dot
    ("Â¹", "¹"),       # U+00B9 superscript 1
    ("Â²", "²"),       # U+00B2 superscript 2
    ("Â³", "³"),       # U+00B3 superscript 3
    ("Â½", "½"),       # U+00BD one half
    ("Â¼", "¼"),       # U+00BC one quarter
    ("Â¾", "¾"),       # U+00BE three quarters
    ("Â«", "«"),       # U+00AB left guillemet
    ("Â»", "»"),       # U+00BB right guillemet
]


def _repair_mojibake(text: Any) -> Any:
    """Replace known cp1252-misinterpreted-as-UTF-8 mojibake patterns with
    the intended characters. Returns input unchanged if not a string."""
    if not isinstance(text, str):
        return text
    for bad, good in _MOJIBAKE_PATTERNS:
        text = text.replace(bad, good)
    return text


def _mojibake_repair(task: dict[str, Any],
                     upstream: dict[str, Any]) -> "WorkerResult":
    """
    System agent: clean known mojibake patterns from an upstream content-
    producing agent's `changes[]` (developer or planner). Produces the
    same `changes[]` shape so the next applier task consumes it
    transparently. Sits between content-producing agents and the applier
    in the kickoff ritual.

    Inputs schema:
      source_task : str  <- @id of upstream task whose outputs.changes[]
                            need mojibake cleanup
    """
    log.info("dispatch task=%s system_agent=mojibake-repair", task["@id"])
    inputs = task.get("inputs") or {}
    source_id = inputs.get("source_task")

    if not source_id:
        return WorkerResult(True,
                            {"error": "missing_source_task",
                             "needed": ["inputs.source_task"]},
                            "", "")

    source = upstream.get(source_id)
    if not isinstance(source, dict):
        return WorkerResult(True,
                            {"error": "source_not_in_upstream",
                             "source_task": source_id},
                            "", "")

    changes = source.get("changes")
    if not isinstance(changes, list):
        return WorkerResult(True,
                            {"error": "source_has_no_changes",
                             "source_task": source_id},
                            "", "")

    repaired: list[dict[str, Any]] = []
    total_replacements = 0
    fields_affected = 0
    for c in changes:
        if not isinstance(c, dict):
            repaired.append(c)
            continue
        new_c = dict(c)
        for field in ("before", "after"):
            orig = new_c.get(field)
            if not isinstance(orig, str):
                continue
            fixed = _repair_mojibake(orig)
            if fixed != orig:
                new_c[field] = fixed
                fields_affected += 1
                for bad, _ in _MOJIBAKE_PATTERNS:
                    total_replacements += orig.count(bad)
        repaired.append(new_c)

    return WorkerResult(True, {
        "changes": repaired,
        "summary": (f"repaired {total_replacements} mojibake instance(s) "
                    f"across {fields_affected} field(s) in "
                    f"{len(changes)} change(s)"),
        "self_assessment": "confident",
    }, "", "")


_ADR_NUMBER_RE = re.compile(r"^## ADR-(\d+):", re.MULTILINE)


def _question_resolver(task: dict[str, Any],
                       upstream: dict[str, Any]) -> "WorkerResult":
    """
    System agent: take a synthesist's outstanding_questions and operator-
    provided structured answers, draft proper ADR entries for DECISIONS.md.

    Eliminates the manual operator step of "write the dev's instruction to
    encode these decisions as ADRs." Deterministic Python template fill.

    Inputs schema:
      source_task      : str   <- @id of synthesist task whose outputs
                                   contain `outstanding_questions: [...]`
      answers          : list  <- one entry per question, in the same
                                   order as outstanding_questions. Each
                                   entry is either:
                                     None  -> defer this question (skipped)
                                     dict  -> {title, decision, context,
                                              consequences: [list]}
      decisions_path   : str?  <- default "project/DECISIONS.md"

    Output: changes[] with a single full-file replacement appending all
    drafted ADRs to the end of DECISIONS.md. ADR numbers auto-discover
    from existing `## ADR-NNN:` headers (next = max + 1).
    """
    log.info("dispatch task=%s system_agent=question-resolver", task["@id"])
    inputs = task.get("inputs") or {}
    source_id = inputs.get("source_task")
    answers = inputs.get("answers")
    decisions_path = inputs.get("decisions_path", "project/DECISIONS.md")

    if not source_id:
        return WorkerResult(True,
                            {"error": "missing_source_task",
                             "needed": ["inputs.source_task"]},
                            "", "")
    if not isinstance(answers, list):
        return WorkerResult(True,
                            {"error": "answers_must_be_list",
                             "needed": ["inputs.answers as list "
                                        "(one entry per outstanding question, "
                                        "None to defer)"]},
                            "", "")

    source = upstream.get(source_id)
    if not isinstance(source, dict):
        return WorkerResult(True,
                            {"error": "source_not_in_upstream",
                             "source_task": source_id},
                            "", "")
    questions = source.get("outstanding_questions")
    if not isinstance(questions, list):
        return WorkerResult(True,
                            {"error": "source_has_no_outstanding_questions",
                             "source_task": source_id},
                            "", "")

    decisions_file = Path(decisions_path)
    if not decisions_file.exists():
        return WorkerResult(True,
                            {"error": "decisions_file_not_found",
                             "path": decisions_path},
                            "", "")
    # Read preserving BOM (so before-snippet matches what the applier reads).
    decisions_text = decisions_file.read_text(encoding="utf-8")

    adr_nums = [int(m.group(1)) for m in _ADR_NUMBER_RE.finditer(decisions_text)]
    next_n = (max(adr_nums) + 1) if adr_nums else 1

    date_str = time.strftime("%Y-%m-%d", time.gmtime())
    adr_blocks: list[str] = []
    encoded = 0
    deferred = 0
    for i, answer in enumerate(answers):
        if answer is None:
            deferred += 1
            continue
        if not isinstance(answer, dict):
            return WorkerResult(True,
                                {"error": "malformed_answer", "index": i,
                                 "hint": "each answer must be a dict or None"},
                                "", "")
        required = {"title", "decision", "context"}
        missing = [k for k in required if k not in answer]
        if missing:
            return WorkerResult(True,
                                {"error": "answer_missing_fields",
                                 "index": i, "missing": missing},
                                "", "")
        consequences = answer.get("consequences", [])
        if not isinstance(consequences, list):
            return WorkerResult(True,
                                {"error": "consequences_must_be_list",
                                 "index": i},
                                "", "")
        cons_lines = ("\n".join(f"- {c}" for c in consequences)
                      if consequences else "- (none specified)")
        adr_block = (
            f"## ADR-{next_n + encoded:03d}: {answer['title']}\n\n"
            f"**Date:** {date_str}\n\n"
            f"**Decision:** {answer['decision']}\n\n"
            f"**Context:** {answer['context']}\n\n"
            f"**Consequences:**\n{cons_lines}\n\n"
            f"---\n"
        )
        adr_blocks.append(adr_block)
        encoded += 1

    if not adr_blocks:
        return WorkerResult(True,
                            {"error": "no_answers_provided",
                             "deferred": deferred,
                             "hint": "answers list contained only None / "
                                     "deferrals"},
                            "", "")

    new_content = decisions_text + "\n" + "\n".join(adr_blocks)
    last_adr = next_n + encoded - 1

    return WorkerResult(True, {
        "changes": [{
            "id": "C1",
            "file": decisions_path,
            "rationale": (f"Append {encoded} ADR(s) for operator-answered "
                          f"outstanding questions from {source_id}"),
            "before": decisions_text,
            "after": new_content,
            "scope": "broad",
        }],
        "summary": (f"drafted {encoded} ADR(s) (ADR-{next_n:03d} through "
                    f"ADR-{last_adr:03d}); {deferred} question(s) deferred"),
        "self_assessment": "confident" if deferred == 0 else "uncertain",
    }, "", "")


SYSTEM_AGENTS = {
    "applier": _apply_changes,
    "mojibake-repair": _mojibake_repair,
    "question-resolver": _question_resolver,
}


def invoke_agent(agent_name: str, task: dict[str, Any],
                 upstream: dict[str, Any]) -> "WorkerResult":
    """
    Dispatch entry point. Routes to a deterministic system-agent function
    if one is registered for the given name; otherwise dispatches via
    Claude Code subagent (LLM). This is the single seam between
    orchestrator-internal automation and external reasoning.
    """
    handler = SYSTEM_AGENTS.get(agent_name)
    if handler is not None:
        return handler(task, upstream)
    return invoke_subagent(agent_name, task, upstream)


def _build_prompt(task: dict[str, Any], upstream: dict[str, Any]) -> str:
    inputs = task.get("inputs", {})
    return (
        f"TASK_ID: {task['@id']}\n"
        f"INPUTS:\n{json.dumps(inputs, indent=2, sort_keys=True)}\n\n"
        f"UPSTREAM:\n{json.dumps(upstream, indent=2, sort_keys=True)}\n\n"
        "UPSTREAM is a JSON object keyed by upstream task @id; each value "
        "is that task's full outputs at dispatch time. Read upstream data "
        "from this block — do not open state.jsonld.\n\n"
        "Produce your result per your agent contract. Return a single JSON "
        "object as your final message; no prose outside it."
    )


def _extract_outputs(stdout: str) -> Optional[Any]:
    """
    Find the agent's result in claude's stdout, robust to output format.
    Tries fast paths first, then always falls back to a raw-text scan
    that finds any embedded {"outputs": ...} JSON, so markdown-fenced
    output, mixed prose+JSON, and pretty-printed multi-line JSON all
    work without requiring a specific envelope shape.
    """
    try:
        whole = json.loads(stdout)
    except json.JSONDecodeError:
        whole = None

    if isinstance(whole, dict):
        if "outputs" in whole:
            return whole["outputs"]
        for key in ("result", "response"):
            v = whole.get(key)
            if isinstance(v, str):
                hit = _scan_for_result(v)
                if hit is not None:
                    return hit

    texts: list[str] = []
    for line in stdout.splitlines():
        line = line.strip()
        if not line:
            continue
        try:
            msg = json.loads(line)
        except json.JSONDecodeError:
            continue
        if isinstance(msg, dict) and "outputs" in msg:
            return msg["outputs"]
        _walk_text(msg, texts)
    for t in texts:
        hit = _scan_for_result(t)
        if hit is not None:
            return hit

    return _scan_for_result(stdout)


def _walk_text(node: Any, out: list[str]) -> None:
    if isinstance(node, str):
        out.append(node)
        return
    if isinstance(node, list):
        for item in node:
            _walk_text(item, out)
        return
    if isinstance(node, dict):
        for key in ("text", "content", "result", "response", "message", "input"):
            if key in node:
                _walk_text(node[key], out)


def _scan_for_result(text: str) -> Optional[Any]:
    """Scan text for an embedded JSON object. Prefer one with an 'outputs'
    key (returning its value); fall back to the first bare JSON object."""
    if not isinstance(text, str):
        return None
    decoder = json.JSONDecoder()
    first_obj: Optional[Any] = None
    i = 0
    while i < len(text):
        if text[i] != "{":
            i += 1
            continue
        try:
            obj, end = decoder.raw_decode(text, i)
            if isinstance(obj, dict):
                if "outputs" in obj:
                    return obj["outputs"]
                if first_obj is None:
                    first_obj = obj
            i = end
        except json.JSONDecodeError:
            i += 1
    return first_obj


# ---------- Task runner --------------------------------------------------

def run_one_cycle() -> bool:
    with locked_state() as state:
        task = next_ready_task(state)
        if task is None:
            return False
        task["status"] = "in_progress"
        task["attempts"] = task.get("attempts", 0) + 1
        agent_name = task["agent"]
        snapshot = json.loads(json.dumps(task))
        upstream = _resolve_upstream(state, task)

    result = invoke_agent(agent_name, snapshot, upstream)

    with locked_state() as state:
        live = _find_task(state, snapshot["@id"])
        if live is None:
            log.error("task vanished during dispatch: %s", snapshot["@id"])
            return True

        prev_hash = _last_hash(live)
        if result.ok:
            try:
                cps_check(live, result.outputs)
            except ContainmentVeto as veto:
                # Preserve the rejected payload on the task so operators
                # can inspect what was actually returned, and embed it
                # in the audit entry so the record is self-contained
                # even if `live["outputs"]` is later overwritten by an
                # operator_reset or manual intervention.
                live["outputs"] = result.outputs
                _record(live, prev_hash, "cps_veto", {
                    "reason": str(veto),
                    "rejected_outputs": result.outputs,
                })
                live["status"] = "blocked"
                log.warning("task %s blocked by CPS: %s", live["@id"], veto)
                return True

            live["outputs"] = result.outputs
            live["status"] = "done"
            _record(live, prev_hash, "completed", {"agent": agent_name})
            log.info("task %s done", live["@id"])
        else:
            # Include raw_stdout in failure record so post-hoc diagnosis
            # doesn't require manual reproduction. Truncated to keep state
            # file size bounded.
            failure_payload: dict[str, Any] = {
                "stderr": (result.stderr or "")[:2000],
            }
            if result.raw_stdout:
                failure_payload["raw_stdout"] = result.raw_stdout[:RAW_STDOUT_LOG_BYTES]
            _record(live, prev_hash, "attempt_failed", failure_payload)
            if live["attempts"] >= MAX_ATTEMPTS:
                live["status"] = "failed"
                log.error("task %s failed after %d attempts",
                          live["@id"], live["attempts"])
            else:
                live["status"] = "ready"
                log.warning("task %s requeued (attempt %d/%d)",
                            live["@id"], live["attempts"], MAX_ATTEMPTS)
    return True


def _find_task(state: dict[str, Any], tid: str) -> Optional[dict[str, Any]]:
    for t in state.get("tasks", []):
        if t.get("@id") == tid:
            return t
    return None


def _last_hash(task: dict[str, Any]) -> str:
    """Return the chain hash of the most recent history entry. Reads the
    `chain_hash` field; falls back to the legacy `hash` field for entries
    written before the sig-removal rename, so a partially-migrated state
    file still chains correctly."""
    history = task.get("history") or []
    if not history:
        return "0" * 64
    last = history[-1]
    return last.get("chain_hash") or last.get("hash") or ("0" * 64)


def _record(task: dict[str, Any], prev_hash: str,
            event: str, payload: dict[str, Any]) -> None:
    new_hash = hiri_sign(prev_hash, {"event": event, "payload": payload})
    task.setdefault("history", []).append({
        "ts": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()),
        "event": event,
        "payload": payload,
        "prev_hash": prev_hash,
        "chain_hash": new_hash,
    })


# ---------- Daemon lock + startup reconciliation ------------------------

def _acquire_daemon_lock() -> Optional[Any]:
    """
    Non-blocking attempt to acquire an exclusive OS lock on the daemon
    PID file. Returns the open file handle (caller must keep it alive
    for the lifetime of the daemon) or None if another instance holds
    the lock. Cross-platform: msvcrt on Windows, fcntl on POSIX.
    """
    DAEMON_PID_PATH.parent.mkdir(parents=True, exist_ok=True)
    f = open(DAEMON_PID_PATH, "a+b")
    try:
        if sys.platform == "win32":
            f.seek(0, os.SEEK_END)
            if f.tell() == 0:
                f.write(b" ")
                f.flush()
            f.seek(0)
            try:
                msvcrt.locking(f.fileno(), msvcrt.LK_NBLCK, 1)
            except OSError:
                f.close()
                return None
        else:
            try:
                fcntl.flock(f, fcntl.LOCK_EX | fcntl.LOCK_NB)
            except OSError:
                f.close()
                return None
        f.seek(0)
        f.truncate()
        f.write(str(os.getpid()).encode("utf-8"))
        f.flush()
        return f
    except Exception:
        f.close()
        return None


def _reconcile_in_progress(state: dict[str, Any]) -> int:
    """
    Find tasks left in `in_progress` by a prior daemon instance (single-
    worker design means any in_progress at startup is by definition stale)
    and revive them to `ready`. Records a `recovered_from_in_progress`
    audit entry on each so the chain captures the intervention. Returns
    the count of tasks reconciled. Does NOT decrement `attempts` — the
    crashed dispatch counts as one of the allowed retries; operator can
    issue an operator_reset for full clemency.
    """
    count = 0
    for t in state.get("tasks", []):
        if t.get("status") != "in_progress":
            continue
        prev_hash = _last_hash(t)
        _record(t, prev_hash, "recovered_from_in_progress", {
            "prior_status": "in_progress",
            "prior_attempts": t.get("attempts", 0),
            "action": "revived to ready",
            "reason": "daemon startup found task in_progress; prior daemon instance died mid-dispatch",
        })
        t["status"] = "ready"
        count += 1
    return count


# ---------- Main loop ----------------------------------------------------

_shutdown = False


def _handle_signal(signum: int, _frame: Any) -> None:
    global _shutdown
    log.info("received signal %d, finishing current cycle then exiting", signum)
    _shutdown = True


def main() -> int:
    daemon_lock = _acquire_daemon_lock()
    if daemon_lock is None:
        log.error(
            "could not acquire daemon lock at %s; another fnsr-daemon "
            "appears to be running. Refusing to start.",
            DAEMON_PID_PATH,
        )
        return 1

    try:
        signal.signal(signal.SIGINT, _handle_signal)
        if sys.platform != "win32" and hasattr(signal, "SIGTERM"):
            signal.signal(signal.SIGTERM, _handle_signal)

        with locked_state() as state:
            n = _reconcile_in_progress(state)
        if n:
            log.warning(
                "reconciled %d in_progress task(s) left by prior daemon "
                "instance; revived to ready",
                n,
            )

        log.info("fnsr-daemon starting: state=%s agents=%s pid=%d",
                 STATE_PATH, AGENTS_DIR, os.getpid())
        while not _shutdown:
            try:
                did_work = run_one_cycle()
            except Exception:
                log.exception("uncaught error in cycle; backing off")
                time.sleep(POLL_INTERVAL_S * 3)
                continue
            if not did_work:
                time.sleep(POLL_INTERVAL_S)
        log.info("fnsr-daemon stopped cleanly")
        return 0
    finally:
        try:
            daemon_lock.close()
        except Exception:
            pass


if __name__ == "__main__":
    sys.exit(main())