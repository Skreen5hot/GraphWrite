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
DECISIONS_PATH = Path(os.environ.get("FNSR_DECISIONS_PATH",
                                       "./project/DECISIONS.md"))
# Files where ADR citations are load-bearing. Citations to non-existent
# ADRs in these files veto via CPS. Override via env vars per project.
CANONICAL_DOC_PATHS = [
    p.strip() for p in os.environ.get(
        "FNSR_CANONICAL_DOCS",
        "project/DECISIONS.md,project/SPEC.md,project/ROADMAP.md,"
        "project/IMPLEMENTATION_PLAN.md"
    ).split(",") if p.strip()
]
CANONICAL_DOC_PREFIXES = [
    p.strip() for p in os.environ.get(
        "FNSR_CANONICAL_DOC_PREFIXES", "arc/"
    ).split(",") if p.strip()
]

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
_REQUIRED_OUTPUTS_BY_MODE_BLOCK_RE = re.compile(
    r"^required_outputs:\s*\n((?:[ \t]+\S+:\s*\[.*?\]\s*\n)+)",
    re.MULTILINE,
)
_REQUIRED_OUTPUTS_BY_MODE_ENTRY_RE = re.compile(
    r"^[ \t]+(\S+):\s*\[(.*?)\]\s*$", re.MULTILINE
)


def _parse_outputs_list(raw: str) -> list[str]:
    return [
        s.strip().strip('"').strip("'")
        for s in raw.split(",")
        if s.strip()
    ]


def _agent_required_outputs(
    agent_name: str, mode: Optional[str] = None
) -> list[str]:
    """
    Read an agent's `required_outputs` from its frontmatter.

    Two frontmatter syntaxes are supported:

      1. Flat list (single-mode agents):
            required_outputs: [a, b, c]

      2. Per-mode dict (multi-mode agents like architect which has both
         `review` and `ratification` modes per Spec 03):
            required_outputs:
              review: [findings, recommendations, summary, recommendation]
              ratification: [ruling, editorial_verdict, ...]

    When the frontmatter uses dict syntax, `mode` selects which list to
    return. If `mode` is None or unrecognized, returns the empty list —
    callers MUST pass the task's `inputs.mode` for multi-mode agents.

    Returns empty list when the agent has no declaration (or no .md
    file). Single-mode agents ignore the `mode` argument entirely.
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

    flat = _REQUIRED_OUTPUTS_RE.search(frontmatter)
    if flat:
        return _parse_outputs_list(flat.group(1))

    block = _REQUIRED_OUTPUTS_BY_MODE_BLOCK_RE.search(frontmatter)
    if block:
        modes = {
            m.group(1): _parse_outputs_list(m.group(2))
            for m in _REQUIRED_OUTPUTS_BY_MODE_ENTRY_RE.finditer(block.group(1))
        }
        if mode is None:
            return []
        return modes.get(mode, [])

    return []


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
            # Multi-mode agents (architect: review|ratification) declare
            # required_outputs keyed by mode in frontmatter. The task's
            # inputs.mode selects which list applies.
            inputs = task.get("inputs") or {}
            mode = inputs.get("mode") if isinstance(inputs, dict) else None
            required = _agent_required_outputs(agent_name, mode=mode)
            missing = [k for k in required if k not in proposed_outputs]
            if missing:
                raise ContainmentVeto(
                    f"agent {agent_name!r} missing required output keys: "
                    f"{missing}"
                )


def _validate_awaiting_decision_shape(outputs: dict[str, Any]) -> Optional[str]:
    """Return None if `outputs` is a well-formed awaiting_operator_decision
    envelope, or a veto-reason string if malformed. Required fields:
      status         : "awaiting_operator_decision"  (caller already checked)
      options        : non-empty list of dict|str entries describing choices
      recommendation : str — the agent's suggested option (free-form, can
                       reference an option by index or content)
    """
    options = outputs.get("options")
    if not isinstance(options, list) or len(options) == 0:
        return ("awaiting_operator_decision output must include a non-empty "
                "`options` list")
    rec = outputs.get("recommendation")
    if not isinstance(rec, str) or not rec.strip():
        return ("awaiting_operator_decision output must include a "
                "non-empty `recommendation` string")
    return None


_ADR_CITATION_RE = re.compile(r"\bADR-(\d{3})\b")
_ADR_HEADER_RE = re.compile(r"^## ADR-(\d{3}):", re.MULTILINE)


def _load_adr_registry(decisions_path: Path = DECISIONS_PATH) -> set[str]:
    """Parse DECISIONS.md and return the set of ADR numbers that exist
    (as three-digit strings). Returns empty set if file missing — callers
    should treat that as "no registry available; skip the check."
    """
    if not decisions_path.exists():
        return set()
    try:
        text = decisions_path.read_text(encoding="utf-8-sig")
    except OSError:
        return set()
    return {m.group(1) for m in _ADR_HEADER_RE.finditer(text)}


def _is_canonical_doc(file_rel: str) -> bool:
    """True if file_rel is in the canonical-docs allowlist (exact match
    or under a canonical-prefix directory like arc/). Canonical docs are
    where ADR citations are load-bearing; the CPS check only enforces on
    these paths to avoid false positives in casual mentions elsewhere."""
    if not file_rel:
        return False
    # Normalize Windows / forward slashes for comparison.
    normalized = file_rel.replace("\\", "/")
    if normalized in CANONICAL_DOC_PATHS:
        return True
    for prefix in CANONICAL_DOC_PREFIXES:
        if normalized.startswith(prefix):
            return True
    return False


def _check_adr_citations(proposed_outputs: Any,
                          decisions_path: Path = DECISIONS_PATH) -> None:
    """Veto when proposed changes cite a non-existent ADR in canonical docs.

    Scoped to `changes[*].after` content destined for files in the
    canonical-docs allowlist. ADR citations elsewhere (casual mentions in
    commit messages, test fixtures, code comments) are not checked — this
    avoids false positives. Kills the "ADR-NNN ghost" class: agent
    cites ADR-012 but DECISIONS.md has no ADR-012 entry, or its ADR-012
    is a different decision than the agent thinks.

    No-op when:
      - proposed_outputs has no `changes` (not a developer-shaped output)
      - DECISIONS.md doesn't exist yet (no registry to check against)
      - No change targets a canonical doc
    """
    if not isinstance(proposed_outputs, dict):
        return
    changes = proposed_outputs.get("changes")
    if not isinstance(changes, list):
        return
    registry: Optional[set[str]] = None  # lazily loaded only if needed
    missing_per_change: list[tuple[str, str, list[str]]] = []
    for c in changes:
        if not isinstance(c, dict):
            continue
        file_rel = c.get("file")
        if not _is_canonical_doc(file_rel or ""):
            continue
        after = c.get("after")
        if not isinstance(after, str):
            continue
        cites = sorted({m.group(1) for m in _ADR_CITATION_RE.finditer(after)})
        if not cites:
            continue
        if registry is None:
            registry = _load_adr_registry(decisions_path)
            if not registry:
                # No DECISIONS.md or empty — skip the check; nothing to
                # validate against. Operator can build the registry later.
                return
        bad = [n for n in cites if n not in registry]
        if bad:
            missing_per_change.append(
                (c.get("id", "?"), file_rel, [f"ADR-{n}" for n in bad])
            )
    if missing_per_change:
        # First entry's detail is the headline; full list goes to message.
        cid, fpath, bad_list = missing_per_change[0]
        more = (f" (and {len(missing_per_change) - 1} more change(s))"
                if len(missing_per_change) > 1 else "")
        raise ContainmentVeto(
            f"change {cid!r} on canonical doc {fpath!r} cites non-existent "
            f"ADR(s) {bad_list}{more}; canonical ADR registry is "
            f"DECISIONS.md"
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


# ---------- Verification ritual (FNSR Spec 02, v2.8.0 Checkpoint 1) ------
#
# The verification ritual catches references that drift from canonical
# sources at machine speed. This implementation provides the
# deterministic Cat 1-7 predicates plus the orchestrator. Cat 8/9/10
# (hybrid / LLM / TypeScript-parser) land in Checkpoints 2-3.

SURFACES_DIR = Path(os.environ.get("FNSR_SURFACES_DIR", "./surfaces"))


def _parse_category_frontmatter(text: str) -> Optional[dict]:
    """Parse a category spec's YAML-ish frontmatter (stdlib-only).

    Supports flat key: value and key: [a, b, c] list syntax. Multi-line
    nested values are not supported; category specs use flat fields.
    """
    if not text.startswith("---"):
        return None
    end = text.find("---", 3)
    if end < 0:
        return None
    frontmatter = text[3:end]
    out: dict[str, Any] = {}
    for line in frontmatter.splitlines():
        stripped = line.strip()
        if not stripped or stripped.startswith("#"):
            continue
        if ":" not in stripped:
            continue
        key, _, value = stripped.partition(":")
        key = key.strip()
        value = value.strip()
        if value.startswith("[") and value.endswith("]"):
            inner = value[1:-1]
            out[key] = [
                s.strip().strip('"').strip("'")
                for s in inner.split(",")
                if s.strip()
            ]
        else:
            out[key] = value.strip('"').strip("'")
    return out


def _load_category_specs(surface: str = "verification") -> list[dict]:
    """Load every cat-*.md under surfaces/<surface>/categories/.

    Returns category-spec dicts (frontmatter fields populated, plus
    `_path`). Files without frontmatter or with no `category_id` are
    skipped. Order is sorted by filename (cat-01-... before cat-02-...).
    """
    categories_dir = SURFACES_DIR / surface / "categories"
    if not categories_dir.exists():
        return []
    specs = []
    for path in sorted(categories_dir.glob("cat-*.md")):
        try:
            text = path.read_text(encoding="utf-8")
        except OSError:
            continue
        fm = _parse_category_frontmatter(text)
        if not fm or "category_id" not in fm:
            continue
        fm["_path"] = str(path)
        specs.append(fm)
    return specs


def _resolve_predicate(qualified_name: str):
    """Resolve a 'fnsr_daemon.cat_NN_xxx' style reference to a callable.

    Only looks up names within this module's globals — category specs
    declaring predicates in other modules are intentionally not
    supported in v2.8.0 (subject-project hook predicates land in
    Checkpoint 2 with Cat 10).
    """
    if not isinstance(qualified_name, str) or "." not in qualified_name:
        return None
    module_part, attr = qualified_name.rsplit(".", 1)
    if module_part not in ("fnsr_daemon", "__main__"):
        return None
    return globals().get(attr)


def _read_canonical_source(value: Any) -> Any:
    """Resolve a canonical-source value: file path -> file content,
    inline string -> as-is, dict -> recursively resolve each value."""
    if isinstance(value, dict):
        return {k: _read_canonical_source(v) for k, v in value.items()}
    if isinstance(value, str):
        # Treat as file path only when it looks pathlike AND the file
        # exists. Inline strings (with newlines, or non-existent paths)
        # are passed through.
        if value and "\n" not in value and len(value) < 500:
            try:
                p = Path(value)
                if p.exists() and p.is_file():
                    return p.read_text(encoding="utf-8")
            except (OSError, ValueError):
                pass
        return value
    return value


# ---- Category predicates (Cat 1-7) --------------------------------------

_SECTION_NUMBER_RE = re.compile(r"\b(\d+(?:\.\d+){1,3})\b")
_SECTION_CITATION_RE = re.compile(r"§\s*(\d+(?:\.\d+)+)")


def _extract_spec_sections(spec_text: str) -> set:
    """Extract section numbers from markdown headers in a spec document.
    Recognizes patterns like `## 3.4.1 Title`, `### §3.4.1: Title`,
    `## 3.4.1.2 Sub-title`, etc.
    """
    sections = set()
    for line in spec_text.splitlines():
        stripped = line.strip()
        if not stripped.startswith("#"):
            continue
        for m in _SECTION_NUMBER_RE.finditer(stripped):
            sections.add(m.group(1))
    return sections


def cat_01_spec_section_existence(
    artifact: str, canonical_sources: dict
) -> dict:
    """Cat 1: §N.M citations exist as section headers in the spec.

    STRUCTURAL only. Does not check cited content matches the citing
    framing — that boundary is Cat 9 candidacy.
    """
    spec = canonical_sources.get("spec")
    if not isinstance(spec, str):
        return {"status": "miss",
                "evidence": {"reason": "canonical source 'spec' missing"}}
    cited = sorted(set(m.group(1) for m in _SECTION_CITATION_RE.finditer(artifact)))
    if not cited:
        return {"status": "pass",
                "evidence": {"cited_sections": [], "note": "no §N.M citations in artifact"}}
    spec_sections = _extract_spec_sections(spec)
    unmatched = [s for s in cited if s not in spec_sections]
    if unmatched:
        return {"status": "veto",
                "evidence": {"cited_sections": cited,
                              "unmatched": unmatched,
                              "spec_section_count": len(spec_sections)}}
    return {"status": "pass", "evidence": {"cited_sections": cited}}


def cat_02_adr_cross_reference(
    artifact: str, canonical_sources: dict
) -> dict:
    """Cat 2: ADR-NNN citations exist as `## ADR-NNN:` headers in the
    canonical decisions registry. Same registry parser as v2.6.0's
    `_check_adr_citations`; the verification-ritual variant runs
    against arbitrary artifact text.
    """
    decisions = canonical_sources.get("decisions")
    if not isinstance(decisions, str):
        return {"status": "miss",
                "evidence": {"reason": "canonical source 'decisions' missing"}}
    cited = sorted(set(_ADR_CITATION_RE.findall(artifact)))
    if not cited:
        return {"status": "pass",
                "evidence": {"cited_adrs": [], "note": "no ADR-NNN citations in artifact"}}
    registered = set(_ADR_HEADER_RE.findall(decisions))
    unmatched = [c for c in cited if c not in registered]
    if unmatched:
        return {"status": "veto",
                "evidence": {"cited_adrs": cited, "unmatched": unmatched,
                              "registered_count": len(registered)}}
    return {"status": "pass", "evidence": {"cited_adrs": cited}}


_Q_RULING_RE = re.compile(r"\bQ-\d+(?:-Step\d+)?-[A-Z](?:\.\d+)?\b")


def cat_03_q_ruling_cross_reference(
    artifact: str, canonical_sources: dict
) -> dict:
    """Cat 3: Q-N-X / Q-N-StepM-X citations resolve to identifiers in
    a prior cycle artifact.

    canonical_sources['prior_cycle_artifacts'] is a {path: text} dict.
    A Q-ruling is found if any prior artifact contains it as a header
    anchor OR (weaker) as an inline reference.
    """
    prior = canonical_sources.get("prior_cycle_artifacts")
    if not isinstance(prior, dict):
        return {"status": "miss",
                "evidence": {"reason": "canonical source 'prior_cycle_artifacts' "
                                        "missing or not a dict"}}
    cited = sorted(set(_Q_RULING_RE.findall(artifact)))
    if not cited:
        return {"status": "pass",
                "evidence": {"cited_q_rulings": [], "note": "no Q-ruling citations"}}
    found = {}
    for q in cited:
        for path, text in prior.items():
            if not isinstance(text, str):
                continue
            header_pattern = re.compile(
                rf"^#{{1,6}}.*?\b{re.escape(q)}\b", re.MULTILINE)
            if header_pattern.search(text):
                found[q] = {"path": path, "match": "header"}
                break
            if re.search(rf"\b{re.escape(q)}\b", text):
                found[q] = {"path": path, "match": "inline"}
                break
    unmatched = [q for q in cited if q not in found]
    if unmatched:
        return {"status": "veto",
                "evidence": {"cited_q_rulings": cited, "unmatched": unmatched,
                              "matched": found}}
    return {"status": "pass",
            "evidence": {"cited_q_rulings": cited, "matched": found}}


_REASON_CITATION_RE = re.compile(r'"expectedReason"\s*:\s*"([^"]+)"')
# Object.freeze([...]) — body capture must tolerate `] as const)` suffix
# (TypeScript `as const` assertion between the array close and the call
# close).
_FROZEN_ENUM_BODY_RE = re.compile(
    r"Object\.freeze\s*\(\s*\[([\s\S]*?)\][^)]*\)", re.MULTILINE
)
_TS_STRING_LITERAL_RE = re.compile(r'"([^"]+)"')


def cat_04_reason_code_frozen_enum(
    artifact: str, canonical_sources: dict
) -> dict:
    """Cat 4: `expectedReason: "X"` citations are members of the frozen
    Object.freeze'd enum in the canonical reason-codes source.

    Logic Team instance: src/kernel/reason-codes.ts. Subject projects
    with different conventions override the predicate via the category
    spec's python_predicate field.
    """
    text = canonical_sources.get("reason_codes")
    if not isinstance(text, str):
        return {"status": "miss",
                "evidence": {"reason": "canonical source 'reason_codes' missing"}}
    cited = sorted(set(_REASON_CITATION_RE.findall(artifact)))
    if not cited:
        return {"status": "pass",
                "evidence": {"cited_reasons": [],
                              "note": "no expectedReason citations in artifact"}}
    members = set()
    for m in _FROZEN_ENUM_BODY_RE.finditer(text):
        body = m.group(1)
        for sm in _TS_STRING_LITERAL_RE.finditer(body):
            members.add(sm.group(1))
    if not members:
        return {"status": "miss",
                "evidence": {"reason": "no Object.freeze([...]) block found in "
                                        "canonical reason_codes source; cannot "
                                        "extract the frozen enum"}}
    unmatched = [c for c in cited if c not in members]
    if unmatched:
        return {"status": "veto",
                "evidence": {"cited_reasons": cited, "unmatched": unmatched,
                              "frozen_enum_size": len(members)}}
    return {"status": "pass",
            "evidence": {"cited_reasons": cited, "frozen_enum_size": len(members)}}


_TYPE_CITATION_RE = re.compile(r'"@type"\s*:\s*"([^"]+)"')
# Match `type X = "a" | "b" | "c"` or pipe-prefixed multi-line form
# `type X =\n  | "a"\n  | "b"`. The body capture is permissive: optional
# leading pipe per string member.
_TS_UNION_RE = re.compile(
    r"(?:type\s+\w+\s*=|export\s+type\s+\w+\s*=)\s*"
    r"((?:\s*\|?\s*\"[^\"]+\"\s*)+)",
    re.MULTILINE,
)


def cat_05_fol_owl_type_discriminator(
    artifact: str, canonical_sources: dict
) -> dict:
    """Cat 5: `@type: "X"` citations are members of the union of FOL and
    OWL canonical type sets.

    Cat 5 covers @type STRING existence. Field-shape consistency for the
    object carrying @type is Cat 10 candidacy.
    """
    fol = canonical_sources.get("fol_types")
    owl = canonical_sources.get("owl_types")
    if not isinstance(fol, str) or not isinstance(owl, str):
        return {"status": "miss",
                "evidence": {"reason": "canonical source 'fol_types' or 'owl_types' missing"}}
    cited = sorted(set(_TYPE_CITATION_RE.findall(artifact)))
    if not cited:
        return {"status": "pass",
                "evidence": {"cited_types": [],
                              "note": "no @type citations in artifact"}}
    canonical = set()
    for source_text in (fol, owl):
        for m in _TS_UNION_RE.finditer(source_text):
            for sm in _TS_STRING_LITERAL_RE.finditer(m.group(1)):
                canonical.add(sm.group(1))
    if not canonical:
        return {"status": "miss",
                "evidence": {"reason": "no `type X = '...' | '...'` union literal "
                                        "found in fol_types or owl_types canonical "
                                        "sources"}}
    unmatched = [c for c in cited if c not in canonical]
    if unmatched:
        return {"status": "veto",
                "evidence": {"cited_types": cited, "unmatched": unmatched,
                              "canonical_type_count": len(canonical)}}
    return {"status": "pass",
            "evidence": {"cited_types": cited, "canonical_type_count": len(canonical)}}


_FIXTURE_FIELD_VALUE_RE = re.compile(
    r'"{field}"\s*:\s*("[^"]*"|true|false|null|-?\d+(?:\.\d+)?)'
)


def cat_06_manifest_mirror_consistency(
    artifact: str, canonical_sources: dict
) -> dict:
    """Cat 6: manifest entries mirror their fixture's expectedOutcome.

    canonical_sources['manifest'] is the manifest text (JSON).
    canonical_sources['fixtures'] is a {path: text} dict of fixture
    contents. For each manifest entry, compare the declared-mirror
    fields against the fixture's values.
    """
    manifest_text = canonical_sources.get("manifest")
    fixtures = canonical_sources.get("fixtures")
    if not isinstance(manifest_text, str) or not isinstance(fixtures, dict):
        return {"status": "miss",
                "evidence": {"reason": "canonical source 'manifest' or 'fixtures' missing"}}
    try:
        manifest = json.loads(manifest_text)
    except (json.JSONDecodeError, ValueError) as e:
        return {"status": "miss",
                "evidence": {"reason": f"manifest is not valid JSON: {e}"}}
    entries = manifest
    if isinstance(manifest, dict):
        entries = manifest.get("entries") or manifest.get("manifest") or []
    if not isinstance(entries, list):
        return {"status": "miss",
                "evidence": {"reason": "manifest is not a list of entries"}}
    mirror_fields = (
        "expectedOutcome",
        "expectedConsistencyResult",
        "canaryRole",
        "expectedRequiredPatternsCount",
    )
    divergences = []
    matched = []
    skipped_no_fixture = []
    for entry in entries:
        if not isinstance(entry, dict):
            continue
        fixture_path = entry.get("fixture") or entry.get("path") or entry.get("file")
        if not fixture_path or fixture_path not in fixtures:
            skipped_no_fixture.append(fixture_path)
            continue
        fixture_text = fixtures[fixture_path]
        if not isinstance(fixture_text, str):
            continue
        for field in mirror_fields:
            if field not in entry:
                continue
            pat = re.compile(_FIXTURE_FIELD_VALUE_RE.pattern.replace(
                "{field}", re.escape(field)))
            m = pat.search(fixture_text)
            if not m:
                divergences.append({"fixture": fixture_path, "field": field,
                                     "reason": "field not found in fixture"})
                continue
            try:
                fixture_val = json.loads(m.group(1))
            except (json.JSONDecodeError, ValueError):
                fixture_val = m.group(1).strip('"')
            entry_val = entry[field]
            if fixture_val != entry_val:
                divergences.append({
                    "fixture": fixture_path, "field": field,
                    "manifest_value": entry_val, "fixture_value": fixture_val,
                })
            else:
                matched.append({"fixture": fixture_path, "field": field})
    if divergences:
        return {"status": "veto",
                "evidence": {"divergences": divergences, "matched": matched,
                              "skipped_no_fixture": skipped_no_fixture}}
    return {"status": "pass",
            "evidence": {"matched": matched,
                          "skipped_no_fixture": skipped_no_fixture}}


_MD_LINK_RE = re.compile(r"\[[^\]]+\]\(([^)]+\.md)\)")
_PATHLIKE_REF_RE = re.compile(r"\b([\w./-]+\.md)\b")
_RECIPROCAL_HINTS = (
    "see also", "referenced from", "captured in", "cross-referenced from",
)


def cat_07_cross_phase_cross_reference(
    artifact: str, canonical_sources: dict
) -> dict:
    """Cat 7: cross-references to prior cycle artifacts exist and (when
    citing context implies reciprocity) are symmetric.

    canonical_sources['cycle_artifacts'] is a {path: text} dict. The
    artifact's own self-path can be passed via canonical_sources
    ['_artifact_self_path'] to enable reciprocity detection.
    """
    cycle_artifacts = canonical_sources.get("cycle_artifacts")
    if not isinstance(cycle_artifacts, dict):
        return {"status": "miss",
                "evidence": {"reason": "canonical source 'cycle_artifacts' missing"}}
    cited = set()
    for m in _MD_LINK_RE.finditer(artifact):
        cited.add(m.group(1))
    for m in _PATHLIKE_REF_RE.finditer(artifact):
        cited.add(m.group(1))
    if not cited:
        return {"status": "pass",
                "evidence": {"cited_paths": [],
                              "note": "no .md path references in artifact"}}
    self_path = canonical_sources.get("_artifact_self_path")
    has_reciprocal_hint = any(h in artifact.lower() for h in _RECIPROCAL_HINTS)
    dangling = []
    asymmetric = []
    matched = []
    for cited_path in sorted(cited):
        if cited_path == self_path:
            continue  # don't flag self-references
        if cited_path not in cycle_artifacts:
            dangling.append(cited_path)
            continue
        target_text = cycle_artifacts.get(cited_path)
        if not isinstance(target_text, str):
            dangling.append(cited_path)
            continue
        if self_path and has_reciprocal_hint:
            self_tail = self_path.rsplit("/", 1)[-1]
            reciprocal = self_path in target_text or self_tail in target_text
            if not reciprocal:
                asymmetric.append({"cited": cited_path,
                                    "reason": "no reciprocal back-reference"})
                continue
        matched.append(cited_path)
    if dangling or asymmetric:
        return {"status": "veto",
                "evidence": {"dangling": dangling, "asymmetric": asymmetric,
                              "matched": matched}}
    return {"status": "pass",
            "evidence": {"matched": matched,
                          "reciprocity_checked": bool(self_path and has_reciprocal_hint)}}


# ---- verification-ritual orchestrator ----------------------------------

def _verification_ritual(task: dict[str, Any],
                          upstream: dict[str, Any]) -> "WorkerResult":
    """Run the verification ritual against an artifact per FNSR Spec 02.

    See `.claude/agents/verification-ritual.md` for the input/output
    contract.

    This system agent runs the deterministic categories (Cat 1-7 in
    Checkpoint 1; Cat 8-pre-routing + Cat 10 in Checkpoint 2). LLM-
    required categories emit `overall_status: needs_llm_judgment` so
    the operator can queue a follow-up `verification-ritual-llm`
    worker agent task (Checkpoint 3).
    """
    inputs = task.get("inputs") or {}
    artifact = inputs.get("artifact_text")
    artifact_path = inputs.get("artifact_path")
    if artifact is None and artifact_path:
        try:
            artifact = Path(artifact_path).read_text(encoding="utf-8")
        except OSError as e:
            return WorkerResult(True, {
                "error": "artifact_unreadable",
                "path": artifact_path,
                "details": str(e),
            }, "", "")
    if not isinstance(artifact, str):
        return WorkerResult(True, {
            "error": "artifact_missing",
            "hint": "provide artifact_text or artifact_path in inputs",
        }, "", "")
    canonical_inputs = inputs.get("canonical_sources") or {}
    canonical_sources = {
        k: _read_canonical_source(v) for k, v in canonical_inputs.items()
    }
    self_path = inputs.get("artifact_self_path") or artifact_path
    if self_path:
        canonical_sources["_artifact_self_path"] = self_path
    cadence = inputs.get("cadence") or "pre-routing"
    surface = inputs.get("surface") or "verification"
    specs = _load_category_specs(surface)
    if not specs:
        return WorkerResult(True, {
            "error": "no_category_specs_found",
            "surface": surface,
            "hint": (f"expected category files under "
                     f"{SURFACES_DIR}/{surface}/categories/"),
        }, "", "")
    per_category_result: list[dict] = []
    veto_count = 0
    miss_count = 0
    pass_count = 0
    deferred_llm_count = 0
    for spec in specs:
        cat_id = spec.get("category_id", "?")
        spec_cadence = spec.get("cadence", "pre-routing")
        if cadence == "pre-routing":
            applicable = spec_cadence in (
                "pre-routing", "single-pre-routing", "two-cadence",
            )
        elif cadence == "activation-time":
            applicable = spec_cadence in ("activation-time", "two-cadence")
        else:
            applicable = False
        if not applicable:
            continue
        # LLM-only categories defer to verification-ritual-llm (CP3)
        if spec.get("implementation_mode") == "llm":
            per_category_result.append({
                "category_id": cat_id,
                "name": spec.get("name", cat_id),
                "status": "deferred_llm",
                "evidence": {"reason": "LLM-only categories run via "
                                        "verification-ritual-llm in CP3+; "
                                        "this run is deterministic-only"},
            })
            deferred_llm_count += 1
            continue
        required_keys = spec.get("canonical_source_keys") or []
        missing_keys = [k for k in required_keys
                        if k not in canonical_sources]
        if missing_keys:
            per_category_result.append({
                "category_id": cat_id,
                "name": spec.get("name", cat_id),
                "status": "miss",
                "evidence": {
                    "reason": "required canonical source(s) missing",
                    "missing_canonical_source_keys": missing_keys,
                },
            })
            miss_count += 1
            continue
        pred_name = spec.get("python_predicate")
        predicate = _resolve_predicate(pred_name) if pred_name else None
        if predicate is None:
            per_category_result.append({
                "category_id": cat_id,
                "name": spec.get("name", cat_id),
                "status": "miss",
                "evidence": {"reason": "predicate not resolvable",
                              "declared": pred_name or "(none)"},
            })
            miss_count += 1
            continue
        try:
            result = predicate(artifact, canonical_sources)
        except Exception as e:
            per_category_result.append({
                "category_id": cat_id,
                "name": spec.get("name", cat_id),
                "status": "miss",
                "evidence": {"reason": "predicate raised exception",
                              "exception_type": type(e).__name__,
                              "exception": str(e)},
            })
            miss_count += 1
            continue
        per_category_result.append({
            "category_id": cat_id,
            "name": spec.get("name", cat_id),
            **result,
        })
        status = result.get("status")
        if status == "veto":
            veto_count += 1
        elif status == "miss":
            miss_count += 1
        elif status == "pass":
            pass_count += 1
    if veto_count > 0:
        overall_status = "veto"
    elif deferred_llm_count > 0:
        overall_status = "needs_llm_judgment"
    else:
        overall_status = "pass"
    summary = (
        f"verification ritual ({cadence}): {pass_count} pass, "
        f"{veto_count} veto, {miss_count} miss"
        + (f", {deferred_llm_count} deferred-llm" if deferred_llm_count else "")
    )
    return WorkerResult(True, {
        "per_category_result": per_category_result,
        "overall_status": overall_status,
        "new_candidacies": [],  # populated in CP3+ when patterns no category covers surface
        "summary": summary,
    }, "", "")


SYSTEM_AGENTS = {
    "applier": _apply_changes,
    "mojibake-repair": _mojibake_repair,
    "question-resolver": _question_resolver,
    "verification-ritual": _verification_ritual,
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
            # v2.6.0: special handling for `awaiting_operator_decision`
            # output shape. Agents emit this when surfacing a real
            # ambiguity that requires operator input. Recognized before
            # the standard CPS path so it isn't vetoed for missing
            # required_outputs keys.
            if (isinstance(result.outputs, dict)
                    and result.outputs.get("status")
                        == "awaiting_operator_decision"):
                veto_reason = _validate_awaiting_decision_shape(result.outputs)
                if veto_reason is None:
                    live["outputs"] = result.outputs
                    live["status"] = "awaiting_operator_decision"
                    options = result.outputs.get("options") or []
                    _record(live, prev_hash, "awaiting_operator_decision", {
                        "options_count": len(options),
                        "recommendation": result.outputs.get("recommendation"),
                    })
                    log.warning(
                        "task %s awaiting operator decision: %d option(s); "
                        "resolve via `state_admin resolve %s --option N`",
                        live["@id"], len(options), live["@id"],
                    )
                    return True
                # Fall through to CPS veto handling with the shape error
                live["outputs"] = result.outputs
                _record(live, prev_hash, "cps_veto", {
                    "reason": veto_reason,
                    "rejected_outputs": result.outputs,
                })
                live["status"] = "blocked"
                log.warning("task %s blocked by CPS: %s",
                            live["@id"], veto_reason)
                return True

            try:
                cps_check(live, result.outputs)
                _check_adr_citations(result.outputs)
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

        # Surface tasks awaiting operator decision so the chain isn't
        # silently stuck waiting for human input.
        with locked_state() as state:
            awaiting = [t["@id"] for t in state.get("tasks", [])
                        if t.get("status") == "awaiting_operator_decision"]
        if awaiting:
            log.warning(
                "%d task(s) AWAITING OPERATOR DECISION; resolve via "
                "`python state_admin.py resolve <task-id> --option N`",
                len(awaiting),
            )
            for tid in awaiting:
                log.warning("  awaiting: %s", tid)

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