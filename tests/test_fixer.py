"""Tests for the Fixer auto-dispatch path + recovery-dispatcher system agent.

Per .claude/agents/fixer.md + .claude/agents/recovery-dispatcher.md + Aaron
2026-05-26 directive to keep the substrate flowing for substrate-mechanical
failure modes that don't require operator judgment.
"""
import json
import os
import shutil
import sys
import tempfile
import time
import unittest
from pathlib import Path

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))
import fnsr_daemon as d


def _now_iso() -> str:
    return time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime())


def _make_history_entry(event: str, payload: dict | None = None,
                         ts: str | None = None) -> dict:
    return {
        "ts": ts or _now_iso(),
        "event": event,
        "payload": payload or {},
        "prev_hash": "0" * 64,
        "chain_hash": "a" * 64,
    }


class TestStallEligibility(unittest.TestCase):
    """_stalls_eligible_for_fixer + _count_fixer_attempts."""

    def test_blocked_task_with_apply_partial_failure_is_eligible(self):
        state = {"tasks": [{
            "@id": "urn:t:apply",
            "agent": "applier",
            "status": "blocked",
            "outputs": {"error": "apply_partial_failure"},
            "history": [_make_history_entry("cps_veto")],
        }]}
        stalls = d._stalls_eligible_for_fixer(state)
        self.assertEqual(len(stalls), 1)
        self.assertEqual(stalls[0]["stall_kind"], "apply_partial_failure")

    def test_blocked_task_with_test_runner_errors_is_eligible(self):
        state = {"tasks": [{
            "@id": "urn:t:test",
            "agent": "test-runner",
            "status": "blocked",
            "outputs": {"status": "errors", "returncode": None},
            "history": [_make_history_entry("cps_veto")],
        }]}
        stalls = d._stalls_eligible_for_fixer(state)
        self.assertEqual(len(stalls), 1)
        self.assertEqual(stalls[0]["stall_kind"], "test_runner_errors")

    # v3.2.5 Gap C: per-branch test matrix for the stall_kind classifier.
    # Pre-v3.2.5, the classifier referenced `last_evt` which was no
    # longer in scope after the v3.2.4 abandon-detection refactor.
    # NameError on every cycle when execution reached the classifier
    # (i.e., when the abandon check didn't return early). 550 tests
    # passed because all prior tests exercised only the abandon path.
    # The 5 tests below exercise all 5 classifier branches.

    def test_classifier_source_not_in_upstream(self):
        state = {"tasks": [{
            "@id": "urn:t:src",
            "agent": "applier",
            "status": "blocked",
            "outputs": {"error": "source_not_in_upstream"},
            "history": [_make_history_entry("cps_veto")],
        }]}
        stalls = d._stalls_eligible_for_fixer(state)
        self.assertEqual(len(stalls), 1)
        self.assertEqual(stalls[0]["stall_kind"], "source_not_in_upstream")

    def test_classifier_cps_veto_no_outputs_error(self):
        """Recon CPS-vetoes (the actual symptom that caused Chain 1c
        stall): outputs is None or has no error field, but the most-
        recent history event is cps_veto. Pre-v3.2.5 this path raised
        NameError on last_evt."""
        state = {"tasks": [{
            "@id": "urn:t:recon",
            "agent": "reconnaissance",
            "status": "blocked",
            "outputs": None,
            "history": [_make_history_entry("cps_veto")],
        }]}
        stalls = d._stalls_eligible_for_fixer(state)
        self.assertEqual(len(stalls), 1)
        self.assertEqual(stalls[0]["stall_kind"], "cps_veto")

    def test_classifier_unknown_fallback(self):
        """Task in blocked status with no matchable signals; classifier
        falls through to 'unknown'. Tests the elif/else chain reaches
        the final branch without raising."""
        state = {"tasks": [{
            "@id": "urn:t:novel",
            "agent": "developer",
            "status": "blocked",
            "outputs": {"misc": "something the classifier doesn't know"},
            "history": [_make_history_entry("some_unknown_event")],
        }]}
        stalls = d._stalls_eligible_for_fixer(state)
        self.assertEqual(len(stalls), 1)
        self.assertEqual(stalls[0]["stall_kind"], "unknown")

    def test_classifier_empty_history_does_not_crash(self):
        """Defense in depth: empty history shouldn't crash the
        classifier. v3.2.5 NameError fix walks reversed(history) safely."""
        state = {"tasks": [{
            "@id": "urn:t:empty",
            "agent": "developer",
            "status": "blocked",
            "outputs": {"error": "some_error"},
            "history": [],  # explicitly empty (no timestamps -> filtered out)
        }]}
        # Tasks with no history get filtered out earlier (no ts to compute age)
        stalls = d._stalls_eligible_for_fixer(state)
        self.assertEqual(stalls, [])

    def test_classifier_all_5_branches_in_one_state(self):
        """Integration: 5 tasks, one per branch, in one state. Verifies
        the full classifier matrix reaches every branch without
        raising. This test alone would have caught the v3.2.4 NameError."""
        state = {"tasks": [
            {"@id": "urn:t:apf", "agent": "applier", "status": "blocked",
             "outputs": {"error": "apply_partial_failure"},
             "history": [_make_history_entry("cps_veto")]},
            {"@id": "urn:t:snu", "agent": "applier", "status": "blocked",
             "outputs": {"error": "source_not_in_upstream"},
             "history": [_make_history_entry("cps_veto")]},
            {"@id": "urn:t:tre", "agent": "test-runner", "status": "blocked",
             "outputs": {"status": "errors", "returncode": None},
             "history": [_make_history_entry("cps_veto")]},
            {"@id": "urn:t:cps", "agent": "reconnaissance", "status": "blocked",
             "outputs": None,
             "history": [_make_history_entry("cps_veto")]},
            {"@id": "urn:t:unk", "agent": "developer", "status": "blocked",
             "outputs": {"misc": "x"},
             "history": [_make_history_entry("some_evt")]},
        ]}
        stalls = d._stalls_eligible_for_fixer(state)
        kinds = sorted({s["stall_kind"] for s in stalls})
        self.assertEqual(kinds, sorted([
            "apply_partial_failure", "source_not_in_upstream",
            "test_runner_errors", "cps_veto", "unknown",
        ]))

    def test_done_task_not_eligible(self):
        state = {"tasks": [{
            "@id": "urn:t:ok",
            "status": "done",
            "history": [_make_history_entry("completed")],
        }]}
        self.assertEqual(d._stalls_eligible_for_fixer(state), [])

    def test_stale_blocked_task_excluded(self):
        # 25 hours ago — past STALE_HOURS threshold
        old_ts = time.strftime(
            "%Y-%m-%dT%H:%M:%SZ",
            time.gmtime(time.time() - 25 * 3600)
        )
        state = {"tasks": [{
            "@id": "urn:t:stale",
            "status": "blocked",
            "outputs": {"error": "any"},
            "history": [_make_history_entry("cps_veto", ts=old_ts)],
        }]}
        self.assertEqual(d._stalls_eligible_for_fixer(state), [])

    def test_abandoned_excluded(self):
        state = {"tasks": [{
            "@id": "urn:t:abandoned",
            "status": "blocked",
            "history": [_make_history_entry("task_abandoned")],
        }]}
        self.assertEqual(d._stalls_eligible_for_fixer(state), [])

    def test_operator_reset_abandon_excluded(self):
        """v3.2.3: state_admin abandon emits operator_reset with
        reset_fields.status containing 'abandoned'. The filter must
        recognize that payload signal (prior versions only checked
        event=='task_abandoned' which state_admin never emits, so
        abandoned tasks got re-picked for Fixer auto-dispatch)."""
        state = {"tasks": [{
            "@id": "urn:t:abandoned-via-state-admin",
            "status": "blocked",
            "outputs": {"error": "apply_partial_failure"},
            "history": [_make_history_entry("operator_reset", {
                "reason": "operator-decided abandon",
                "reset_fields": {"status": "ready -> blocked (abandoned)"},
                "operator": "operator",
            })],
        }]}
        self.assertEqual(d._stalls_eligible_for_fixer(state), [])

    def test_v3_2_4_full_history_scan_for_abandon_marker(self):
        """v3.2.4: filter scans ALL history for abandon marker, not just
        the most-recent event. Pre-v3.2.4 (v3.2.3) only checked the last
        event — so a post-abandon Fixer auto-dispatch entry (from
        v3.2.0 cruft) would 'hide' the abandon marker and re-eligible
        the task. The substrate has no un-abandon semantic; once
        abandoned, permanently abandoned."""
        state = {"tasks": [{
            "@id": "urn:t:abandoned-then-stale-fixer",
            "status": "blocked",
            "outputs": {"error": "apply_partial_failure"},
            "history": [
                # Step 1: operator abandoned via state_admin
                _make_history_entry("operator_reset", {
                    "reason": "operator abandon",
                    "reset_fields": {"status": "ready -> blocked (abandoned)"},
                }),
                # Step 2: pre-v3.2.3 daemon re-dispatched a Fixer
                # (wasted; the bug)
                _make_history_entry("fixer_auto_dispatched", {
                    "fixer_task": "urn:t:wasted-fixer",
                }),
            ],
        }]}
        # v3.2.3 filter (last-event-only) would WRONGLY mark this eligible.
        # v3.2.4 scans all history → finds the abandon marker → skips.
        self.assertEqual(d._stalls_eligible_for_fixer(state), [])

    def test_operator_reset_non_abandon_still_eligible(self):
        """An operator_reset that doesn't carry the abandoned marker
        (e.g., reset to ready for retry) should NOT exclude the task —
        that's a legitimate operator action that may want a fresh Fixer."""
        state = {"tasks": [{
            "@id": "urn:t:reset-for-retry",
            "status": "blocked",
            "outputs": {"error": "apply_partial_failure"},
            "history": [_make_history_entry("operator_reset", {
                "reason": "retry after env fix",
                "reset_fields": {"status": "failed -> ready"},
            })],
        }]}
        # Note: status is "blocked" but last reset wasn't abandon —
        # eligible.
        stalls = d._stalls_eligible_for_fixer(state)
        self.assertEqual(len(stalls), 1)
        self.assertEqual(stalls[0]["anchor_id"], "urn:t:reset-for-retry")

    def test_fixer_attempt_count_walks_audit(self):
        state = {"tasks": [{
            "@id": "urn:t:anchor",
            "history": [
                _make_history_entry("cps_veto"),
                _make_history_entry("fixer_auto_dispatched", {"fixer_task": "f1"}),
                _make_history_entry("recovered_from_in_progress"),
                _make_history_entry("fixer_auto_dispatched", {"fixer_task": "f2"}),
            ],
        }]}
        self.assertEqual(d._count_fixer_attempts(state, "urn:t:anchor"), 2)
        self.assertEqual(d._count_fixer_attempts(state, "urn:t:other"), 0)


class TestAutoQueueFixerPair(unittest.TestCase):
    """_auto_queue_fixer_pair appends fixer + dispatcher tasks + audit event."""

    def test_appends_two_tasks_with_correct_shape(self):
        state = {"tasks": [{
            "@id": "urn:fnsr:task:100-stalled",
            "status": "blocked",
            "history": [_make_history_entry("cps_veto")],
        }]}
        fixer_id, dispatcher_id = d._auto_queue_fixer_pair(
            state, "urn:fnsr:task:100-stalled",
            "apply_partial_failure", 0.5, 0
        )
        # Two new tasks appended
        self.assertEqual(len(state["tasks"]), 3)
        new_tasks = state["tasks"][1:]
        agents = {t["agent"] for t in new_tasks}
        self.assertEqual(agents, {"fixer", "recovery-dispatcher"})
        # Fixer has empty depends_on (reads anchor via tools, not UPSTREAM)
        fixer = next(t for t in new_tasks if t["agent"] == "fixer")
        self.assertEqual(fixer["depends_on"], [])
        # Dispatcher depends on fixer (for UPSTREAM resolution)
        dispatcher = next(t for t in new_tasks if t["agent"] == "recovery-dispatcher")
        self.assertEqual(dispatcher["depends_on"], [fixer_id])
        self.assertEqual(dispatcher["inputs"]["source_task"], fixer_id)
        # IDs match return values
        self.assertEqual(fixer["@id"], fixer_id)
        self.assertEqual(dispatcher["@id"], dispatcher_id)

    def test_appends_fixer_auto_dispatched_event_on_anchor(self):
        state = {"tasks": [{
            "@id": "urn:fnsr:task:100-stalled",
            "status": "blocked",
            "history": [_make_history_entry("cps_veto")],
        }]}
        d._auto_queue_fixer_pair(state, "urn:fnsr:task:100-stalled",
                                   "apply_partial_failure", 0.5, 0)
        anchor = state["tasks"][0]
        events = [h["event"] for h in anchor["history"]]
        self.assertIn("fixer_auto_dispatched", events)
        # Verify it's the LAST event added
        self.assertEqual(events[-1], "fixer_auto_dispatched")
        last = anchor["history"][-1]
        self.assertIn("fixer_task", last["payload"])
        self.assertIn("dispatcher_task", last["payload"])

    def test_recursion_bound_respected(self):
        # Anchor already has 2 fixer attempts — should NOT auto-queue more
        state = {"tasks": [{
            "@id": "urn:fnsr:task:100-stalled",
            "status": "blocked",
            "outputs": {"error": "apply_partial_failure"},
            "history": [
                _make_history_entry("cps_veto"),
                _make_history_entry("fixer_auto_dispatched", {"x": 1}),
                _make_history_entry("fixer_auto_dispatched", {"x": 2}),
            ],
        }]}
        result = d._try_auto_fixer_dispatch(state)
        self.assertIsNone(result)
        # No new tasks
        self.assertEqual(len(state["tasks"]), 1)

    def test_dispatch_disabled_via_env_var(self):
        state = {"tasks": [{
            "@id": "urn:fnsr:task:100-stalled",
            "status": "blocked",
            "outputs": {"error": "apply_partial_failure"},
            "history": [_make_history_entry("cps_veto")],
        }]}
        old = os.environ.get("FNSR_AUTO_FIXER")
        os.environ["FNSR_AUTO_FIXER"] = "off"
        try:
            result = d._try_auto_fixer_dispatch(state)
            self.assertIsNone(result)
            self.assertEqual(len(state["tasks"]), 1)
        finally:
            if old is None:
                del os.environ["FNSR_AUTO_FIXER"]
            else:
                os.environ["FNSR_AUTO_FIXER"] = old

    def test_pending_fixer_for_anchor_prevents_double_dispatch(self):
        # Pending fixer task already queued for this anchor
        state = {"tasks": [
            {
                "@id": "urn:fnsr:task:100-stalled",
                "status": "blocked",
                "outputs": {"error": "apply_partial_failure"},
                "history": [_make_history_entry("cps_veto")],
            },
            {
                "@id": "urn:fnsr:task:101-fixer-pending",
                "agent": "fixer",
                "status": "ready",
                "depends_on": [],
                "inputs": {"anchor_task": "urn:fnsr:task:100-stalled"},
            },
        ]}
        result = d._try_auto_fixer_dispatch(state)
        self.assertIsNone(result)
        # No new tasks appended
        self.assertEqual(len(state["tasks"]), 2)

    def test_v374_awaiting_dispatcher_prevents_double_dispatch(self):
        """v3.7.4: when a prior Fixer has completed (status=done) but the
        spawned recovery-dispatcher is still awaiting_operator_decision
        for the same anchor, the daemon MUST NOT queue another (fixer,
        dispatcher) pair. Pre-v3.7.4 the check only walked Fixer tasks;
        Fixers complete fast to status=done so the check passed and a
        cascade of redundant decisions accumulated. Closes bank-977-...-1
        second-instance pattern (four substrate-calibration cycles on
        anchor 977 each spawning a redundant dispatcher)."""
        state = {"tasks": [
            {
                "@id": "urn:fnsr:task:100-stalled",
                "status": "blocked",
                "outputs": {"error": "apply_partial_failure"},
                "history": [_make_history_entry("cps_veto")],
            },
            {
                "@id": "urn:fnsr:task:101-fixer-completed",
                "agent": "fixer",
                "status": "done",
                "depends_on": [],
                "inputs": {"anchor_task": "urn:fnsr:task:100-stalled"},
            },
            {
                "@id": "urn:fnsr:task:102-dispatcher-awaiting",
                "agent": "recovery-dispatcher",
                "status": "awaiting_operator_decision",
                "depends_on": ["urn:fnsr:task:101-fixer-completed"],
                "inputs": {
                    "source_task": "urn:fnsr:task:101-fixer-completed",
                    "anchor_task": "urn:fnsr:task:100-stalled",
                },
            },
        ]}
        result = d._try_auto_fixer_dispatch(state)
        self.assertIsNone(result, "must not queue while dispatcher awaits")
        self.assertEqual(len(state["tasks"]), 3, "no new tasks appended")

    def test_v374_completed_dispatcher_does_not_block_dispatch(self):
        """v3.7.4 must not over-block: if the prior dispatcher resolved
        to done, a fresh Fixer dispatch should proceed (the operator
        chose an option and the substrate moved past it). The skip-set
        ('done', 'abandoned') covers this; this test guards against
        accidental skip-set inversion."""
        state = {"tasks": [
            {
                "@id": "urn:fnsr:task:100-stalled",
                "status": "blocked",
                "outputs": {"error": "apply_partial_failure"},
                "history": [_make_history_entry("cps_veto")],
            },
            {
                "@id": "urn:fnsr:task:101-fixer-completed",
                "agent": "fixer",
                "status": "done",
                "depends_on": [],
                "inputs": {"anchor_task": "urn:fnsr:task:100-stalled"},
            },
            {
                "@id": "urn:fnsr:task:102-dispatcher-resolved",
                "agent": "recovery-dispatcher",
                "status": "done",
                "depends_on": ["urn:fnsr:task:101-fixer-completed"],
                "inputs": {
                    "source_task": "urn:fnsr:task:101-fixer-completed",
                    "anchor_task": "urn:fnsr:task:100-stalled",
                },
            },
        ]}
        result = d._try_auto_fixer_dispatch(state)
        self.assertIsNotNone(result, "must queue when prior chain resolved")
        self.assertEqual(len(state["tasks"]), 5,
                         "fresh fixer + dispatcher appended")


class TestRecoveryDispatcher(unittest.TestCase):
    """_recovery_dispatcher system agent: validates + append-tasks."""

    def setUp(self):
        self.tmpdir = Path(tempfile.mkdtemp(prefix="fnsr-fixer-test-"))
        self.state_path = self.tmpdir / "state.jsonld"
        self.state_path.write_text(json.dumps({
            "@id": "urn:fnsr:run:test",
            "tasks": [{
                "@id": "urn:fnsr:task:001-stalled",
                "status": "blocked",
            }],
        }), encoding="utf-8")
        self.old_env = os.environ.get("FNSR_STATE")
        os.environ["FNSR_STATE"] = str(self.state_path)

    def tearDown(self):
        if self.old_env is None:
            os.environ.pop("FNSR_STATE", None)
        else:
            os.environ["FNSR_STATE"] = self.old_env
        shutil.rmtree(self.tmpdir, ignore_errors=True)

    def test_escalate_true_emits_awaiting_operator_decision_shape(self):
        """v3.2.1: escalate=true now emits awaiting_operator_decision shape
        per CLAUDE.md §7.6 — operator-decision surface fires correctly.
        Pre-v3.2.1 this produced a blocked dispatcher with no operator
        visibility (95 silently-blocked Fixers in v3.2.0 operational
        evidence)."""
        task = {
            "@id": "urn:t:dispatcher",
            "agent": "recovery-dispatcher",
            "inputs": {
                "source_task": "urn:t:fixer",
                "anchor_task": "urn:fnsr:task:001-stalled",
            },
        }
        upstream = {"urn:t:fixer": {
            "escalate": True,
            "recovery_chain": [],
            "diagnosis": "operator-territory; canonical-doc edit needed",
            "options": ["Option A", "Option B"],
            "recommendation": "Recommend A because...",
        }}
        result = d._recovery_dispatcher(task, upstream)
        self.assertTrue(result.ok)
        # v3.2.1 shape: awaiting_operator_decision per §7.6
        self.assertEqual(result.outputs["status"], "awaiting_operator_decision")
        self.assertEqual(result.outputs["options"], ["Option A", "Option B"])
        self.assertEqual(result.outputs["recommendation"],
                          "Recommend A because...")
        self.assertTrue(result.outputs["fixer_escalated"])

    def test_escalate_true_fallback_options_when_fixer_omits(self):
        """Defense in depth: if a Fixer escalates without populating
        options + recommendation, the dispatcher synthesizes a fallback
        shape so the awaiting_operator_decision surface still fires
        (rather than CPS-vetoing the dispatcher for shape malformation)."""
        task = {
            "@id": "urn:t:dispatcher",
            "agent": "recovery-dispatcher",
            "inputs": {"source_task": "urn:t:fixer"},
        }
        upstream = {"urn:t:fixer": {
            "escalate": True,
            "recovery_chain": [],
            "diagnosis": "operator-territory",
            # options + recommendation OMITTED
        }}
        result = d._recovery_dispatcher(task, upstream)
        self.assertEqual(result.outputs["status"], "awaiting_operator_decision")
        # Fallback options synthesized
        self.assertIsInstance(result.outputs["options"], list)
        self.assertGreater(len(result.outputs["options"]), 0)
        self.assertIsInstance(result.outputs["recommendation"], str)
        self.assertGreater(len(result.outputs["recommendation"]), 0)

    def test_empty_recovery_chain_no_op(self):
        task = {
            "@id": "urn:t:dispatcher",
            "agent": "recovery-dispatcher",
            "inputs": {"source_task": "urn:t:fixer"},
        }
        upstream = {"urn:t:fixer": {
            "escalate": False,
            "recovery_chain": [],
            "diagnosis": "no recovery needed",
        }}
        result = d._recovery_dispatcher(task, upstream)
        self.assertEqual(result.outputs["dispatched"], 0)
        self.assertFalse(result.outputs["escalated"])

    def test_validator_fail_escalates_no_dispatch(self):
        # Recovery chain has applier missing source_task in deps (PRED-1 fail)
        bad_chain = [{
            "@id": "urn:t:bad-apply",
            "agent": "applier",
            "depends_on": [],
            "inputs": {"source_task": "urn:t:missing"},
        }]
        task = {
            "@id": "urn:t:dispatcher",
            "agent": "recovery-dispatcher",
            "inputs": {"source_task": "urn:t:fixer"},
        }
        upstream = {"urn:t:fixer": {
            "escalate": False,
            "recovery_chain": bad_chain,
        }}
        result = d._recovery_dispatcher(task, upstream)
        self.assertEqual(result.outputs["dispatched"], 0)
        self.assertTrue(result.outputs["escalated"])
        self.assertIsNotNone(result.outputs.get("validator_report"))
        # State file unchanged — bad chain didn't get appended
        state_after = json.loads(self.state_path.read_text(encoding="utf-8"))
        self.assertEqual(len(state_after["tasks"]), 1)

    def test_validator_pass_appends_recovery_chain(self):
        good_chain = [{
            "@id": "urn:t:new-dev",
            "agent": "developer",
            "depends_on": [],
            "inputs": {"purpose": "test"},
        }]
        task = {
            "@id": "urn:t:dispatcher",
            "agent": "recovery-dispatcher",
            "inputs": {"source_task": "urn:t:fixer",
                       "anchor_task": "urn:fnsr:task:001-stalled"},
        }
        upstream = {"urn:t:fixer": {
            "escalate": False,
            "recovery_chain": good_chain,
        }}
        result = d._recovery_dispatcher(task, upstream)
        self.assertEqual(result.outputs["dispatched"], 1)
        self.assertFalse(result.outputs["escalated"])
        # State file now has the new task
        state_after = json.loads(self.state_path.read_text(encoding="utf-8"))
        self.assertEqual(len(state_after["tasks"]), 2)
        self.assertIn("urn:t:new-dev",
                       [t["@id"] for t in state_after["tasks"]])

    def test_missing_source_task_returns_error(self):
        task = {
            "@id": "urn:t:dispatcher",
            "agent": "recovery-dispatcher",
            "inputs": {},  # missing source_task
        }
        result = d._recovery_dispatcher(task, {})
        self.assertEqual(result.outputs["error"], "missing_source_task")

    def test_source_not_in_upstream_returns_error(self):
        task = {
            "@id": "urn:t:dispatcher",
            "agent": "recovery-dispatcher",
            "inputs": {"source_task": "urn:t:fixer"},
        }
        # Empty upstream
        result = d._recovery_dispatcher(task, {})
        self.assertEqual(result.outputs["error"], "source_not_in_upstream")


class TestSystemAgentsRegistration(unittest.TestCase):
    """Recovery-dispatcher is registered in SYSTEM_AGENTS."""

    def test_recovery_dispatcher_in_system_agents(self):
        self.assertIn("recovery-dispatcher", d.SYSTEM_AGENTS)
        self.assertEqual(
            d.SYSTEM_AGENTS["recovery-dispatcher"],
            d._recovery_dispatcher,
        )


class TestGapAExceptionIsolation(unittest.TestCase):
    """v3.2.5 Gap A: run_one_cycle wraps _try_auto_fixer_dispatch in
    try/except so a bug in the Fixer helper doesn't silently kill the
    daemon's main loop.

    Pre-v3.2.5: NameError in _stalls_eligible_for_fixer crashed every
    idle cycle while daemon_alive=True (process existed, main loop
    dead). v3.2.5 catches the exception, logs it, treats the cycle as
    idle, daemon continues polling.
    """

    def setUp(self):
        self.tmpdir = Path(tempfile.mkdtemp(prefix="fnsr-gap-a-"))
        self.state_path = self.tmpdir / "state.jsonld"
        self.state_path.write_text(json.dumps({
            "@context": "https://fnsr.example/context.jsonld",
            "@id": "urn:fnsr:run:test",
            "tasks": [],
        }), encoding="utf-8")
        # Point daemon at tmp state via the STATE_PATH module-global
        self.old_state_path = d.STATE_PATH
        d.STATE_PATH = self.state_path

    def tearDown(self):
        d.STATE_PATH = self.old_state_path
        shutil.rmtree(self.tmpdir, ignore_errors=True)

    def test_run_one_cycle_isolates_exception_from_fixer_dispatch(self):
        """If _try_auto_fixer_dispatch raises, run_one_cycle must NOT
        propagate the exception. Returns False (idle); daemon would
        continue to next cycle."""
        original = d._try_auto_fixer_dispatch
        try:
            d._try_auto_fixer_dispatch = lambda state: (_ for _ in ()).throw(
                RuntimeError("simulated v3.2.4-style bug in fixer helper")
            )
            # Should NOT raise; should return False
            result = d.run_one_cycle()
            self.assertFalse(result)
        finally:
            d._try_auto_fixer_dispatch = original

    def test_run_one_cycle_normal_path_unaffected(self):
        """Sanity: when no exception fires, run_one_cycle returns
        whatever the picker / Fixer logic decided (False on empty state)."""
        # State is empty; picker returns None; Fixer auto-dispatch
        # returns None (no eligible stalls); cycle returns False
        result = d.run_one_cycle()
        self.assertFalse(result)


class TestGapBSilentCrashDetection(unittest.TestCase):
    """v3.2.5 Gap B: watchdog reports silent_crash_suspected=True when
    daemon process exists but state has not changed in > threshold
    despite dispatchable work being queued."""

    def setUp(self):
        self.tmpdir = Path(tempfile.mkdtemp(prefix="fnsr-gap-b-"))
        self.state_path = self.tmpdir / "state.jsonld"

    def tearDown(self):
        shutil.rmtree(self.tmpdir, ignore_errors=True)

    def test_silent_crash_flagged_when_daemon_alive_stable_with_work(self):
        """daemon_alive=True + dispatchable_now>0 + stable>threshold =
        silent_crash_suspected=True. (Note: this test exercises the
        logic by importing fnsr_stall_watch and directly checking the
        threshold-comparison; full end-to-end probe requires file
        system + daemon process simulation which lives in other tests.)"""
        import fnsr_stall_watch as w
        # Simulate the inputs the probe assembles
        daemon_alive = True
        dispatchable_now = 1
        stable_for_seconds = w.SILENT_CRASH_THRESHOLD_SECONDS + 10
        silent_crash_suspected = (
            daemon_alive
            and dispatchable_now > 0
            and stable_for_seconds >= w.SILENT_CRASH_THRESHOLD_SECONDS
        )
        self.assertTrue(silent_crash_suspected)

    def test_silent_crash_not_flagged_when_no_work_dispatchable(self):
        """daemon_alive=True + state stable but no dispatchable work =
        legitimate demo_pause, NOT silent crash."""
        import fnsr_stall_watch as w
        daemon_alive = True
        dispatchable_now = 0  # nothing to dispatch; legitimate idle
        stable_for_seconds = w.SILENT_CRASH_THRESHOLD_SECONDS + 1000
        silent_crash_suspected = (
            daemon_alive
            and dispatchable_now > 0
            and stable_for_seconds >= w.SILENT_CRASH_THRESHOLD_SECONDS
        )
        self.assertFalse(silent_crash_suspected)

    def test_silent_crash_not_flagged_when_daemon_dead(self):
        """daemon_alive=False is a different condition; existing
        recommendation handles it. Silent-crash predicate requires
        daemon_alive=True."""
        import fnsr_stall_watch as w
        daemon_alive = False  # daemon process gone
        dispatchable_now = 1
        stable_for_seconds = w.SILENT_CRASH_THRESHOLD_SECONDS + 10
        silent_crash_suspected = (
            daemon_alive
            and dispatchable_now > 0
            and stable_for_seconds >= w.SILENT_CRASH_THRESHOLD_SECONDS
        )
        self.assertFalse(silent_crash_suspected)


class TestResetFixerAttempts(unittest.TestCase):
    """v3.2.2: state_admin reset-fixer-attempts appends a
    fixer_attempts_reset event; _count_fixer_attempts honors it (counts
    only events AFTER the most recent reset)."""

    def setUp(self):
        import state_admin
        self.state_admin = state_admin
        self.tmpdir = Path(tempfile.mkdtemp(prefix="fnsr-reset-fixer-"))
        self.state_path = self.tmpdir / "state.jsonld"

    def tearDown(self):
        shutil.rmtree(self.tmpdir, ignore_errors=True)

    def _seed(self, tasks):
        self.state_path.write_text(json.dumps({
            "@context": "https://fnsr.example/context.jsonld",
            "@id": "urn:fnsr:run:test",
            "tasks": tasks,
        }, indent=2), encoding="utf-8")

    def test_reset_appends_event_to_anchor_history(self):
        self._seed([{
            "@id": "urn:t:anchor",
            "history": [
                _make_history_entry("fixer_auto_dispatched", {"x": 1}),
                _make_history_entry("fixer_auto_dispatched", {"x": 2}),
            ],
        }])
        rc = self.state_admin.main([
            "--state-path", str(self.state_path),
            "reset-fixer-attempts", "urn:t:anchor",
            "--reason", "v3.2.1 patch landed; prior attempts stale",
        ])
        self.assertEqual(rc, 0)
        state = json.loads(self.state_path.read_text(encoding="utf-8"))
        anchor = state["tasks"][0]
        last = anchor["history"][-1]
        self.assertEqual(last["event"], "fixer_attempts_reset")
        self.assertEqual(last["payload"]["prior_attempt_count_cleared"], 2)
        self.assertEqual(
            last["payload"]["reason"],
            "v3.2.1 patch landed; prior attempts stale",
        )

    def test_count_fixer_attempts_zeros_at_reset(self):
        # Two attempts; then reset; then one more attempt -> count = 1
        state = {"tasks": [{
            "@id": "urn:t:anchor",
            "history": [
                _make_history_entry("fixer_auto_dispatched", {"x": 1}),
                _make_history_entry("fixer_auto_dispatched", {"x": 2}),
                _make_history_entry("fixer_attempts_reset",
                                      {"reason": "test"}),
                _make_history_entry("fixer_auto_dispatched", {"x": 3}),
            ],
        }]}
        self.assertEqual(d._count_fixer_attempts(state, "urn:t:anchor"), 1)

    def test_count_fixer_attempts_zero_at_reset_with_no_subsequent(self):
        # Reset alone, no subsequent attempts
        state = {"tasks": [{
            "@id": "urn:t:anchor",
            "history": [
                _make_history_entry("fixer_auto_dispatched", {"x": 1}),
                _make_history_entry("fixer_auto_dispatched", {"x": 2}),
                _make_history_entry("fixer_attempts_reset", {}),
            ],
        }]}
        self.assertEqual(d._count_fixer_attempts(state, "urn:t:anchor"), 0)

    def test_multiple_resets_only_last_matters(self):
        state = {"tasks": [{
            "@id": "urn:t:anchor",
            "history": [
                _make_history_entry("fixer_auto_dispatched", {"x": 1}),
                _make_history_entry("fixer_attempts_reset", {}),
                _make_history_entry("fixer_auto_dispatched", {"x": 2}),
                _make_history_entry("fixer_attempts_reset", {}),
                _make_history_entry("fixer_auto_dispatched", {"x": 3}),
            ],
        }]}
        self.assertEqual(d._count_fixer_attempts(state, "urn:t:anchor"), 1)

    def test_reset_unknown_anchor_returns_error(self):
        self._seed([])
        rc = self.state_admin.main([
            "--state-path", str(self.state_path),
            "reset-fixer-attempts", "urn:t:nonexistent",
            "--reason", "test",
        ])
        self.assertEqual(rc, 1)

    def test_reset_unblocks_subsequent_auto_dispatch(self):
        """The whole point: after reset, a stuck anchor at bound 2
        becomes eligible for a 3rd attempt under the new contract."""
        state = {"tasks": [{
            "@id": "urn:t:anchor",
            "status": "blocked",
            "outputs": {"error": "apply_partial_failure"},
            "history": [
                _make_history_entry("cps_veto"),
                _make_history_entry("fixer_auto_dispatched", {"x": 1}),
                _make_history_entry("fixer_auto_dispatched", {"x": 2}),
            ],
        }]}
        # Pre-reset: bound exhausted; no auto-dispatch
        self.assertEqual(d._count_fixer_attempts(state, "urn:t:anchor"), 2)
        result = d._try_auto_fixer_dispatch(state)
        self.assertIsNone(result)
        # Append reset event
        state["tasks"][0]["history"].append(
            _make_history_entry("fixer_attempts_reset", {"reason": "test"})
        )
        # Post-reset: count = 0; auto-dispatch should fire
        self.assertEqual(d._count_fixer_attempts(state, "urn:t:anchor"), 0)
        result = d._try_auto_fixer_dispatch(state)
        self.assertIsNotNone(result)


class TestAbandonStaleFixers(unittest.TestCase):
    """v3.2.1 bulk-abandon helper for the deprecated judgment-refusal
    Fixer outputs.error envelope."""

    def setUp(self):
        import state_admin
        self.state_admin = state_admin
        self.tmpdir = Path(tempfile.mkdtemp(prefix="fnsr-abandon-stale-"))
        self.state_path = self.tmpdir / "state.jsonld"

    def tearDown(self):
        shutil.rmtree(self.tmpdir, ignore_errors=True)

    def _seed(self, tasks):
        self.state_path.write_text(json.dumps({
            "@context": "https://fnsr.example/context.jsonld",
            "@id": "urn:fnsr:run:test",
            "tasks": tasks,
        }, indent=2), encoding="utf-8")

    def test_abandons_blocked_fixer_with_deprecated_refusal_code(self):
        self._seed([
            {"@id": "urn:t:fixer-bad", "agent": "fixer", "status": "blocked",
             "outputs": {"error": "stall_not_recoverable", "details": "x"},
             "history": [{"event": "cps_veto", "payload": {}, "ts": "2026-05-26T00:00:00Z",
                          "prev_hash": "0"*64, "chain_hash": "a"*64}],
             "depends_on": []},
        ])
        rc = self.state_admin.main([
            "--state-path", str(self.state_path),
            "abandon-stale-fixers",
        ])
        self.assertEqual(rc, 0)
        state = json.loads(self.state_path.read_text(encoding="utf-8"))
        self.assertEqual(state["tasks"][0]["status"], "abandoned")

    def test_does_not_abandon_fixer_with_valid_recovery_chain(self):
        # A done Fixer with valid outputs should NOT be touched
        self._seed([
            {"@id": "urn:t:fixer-good", "agent": "fixer", "status": "done",
             "outputs": {"escalate": False, "recovery_chain": [{"@id": "x"}]},
             "history": [], "depends_on": []},
        ])
        rc = self.state_admin.main([
            "--state-path", str(self.state_path),
            "abandon-stale-fixers",
        ])
        self.assertEqual(rc, 0)
        state = json.loads(self.state_path.read_text(encoding="utf-8"))
        self.assertEqual(state["tasks"][0]["status"], "done")  # untouched

    def test_abandons_paired_dispatcher_too(self):
        self._seed([
            {"@id": "urn:t:fixer-bad", "agent": "fixer", "status": "blocked",
             "outputs": {"error": "stall_not_recoverable", "details": "x"},
             "history": [{"event": "cps_veto", "payload": {}, "ts": "2026-05-26T00:00:00Z",
                          "prev_hash": "0"*64, "chain_hash": "a"*64}],
             "depends_on": []},
            {"@id": "urn:t:dispatcher-paired", "agent": "recovery-dispatcher",
             "status": "ready",
             "depends_on": ["urn:t:fixer-bad"],
             "history": []},
        ])
        rc = self.state_admin.main([
            "--state-path", str(self.state_path),
            "abandon-stale-fixers",
        ])
        self.assertEqual(rc, 0)
        state = json.loads(self.state_path.read_text(encoding="utf-8"))
        statuses = {t["@id"]: t["status"] for t in state["tasks"]}
        self.assertEqual(statuses["urn:t:fixer-bad"], "abandoned")
        self.assertEqual(statuses["urn:t:dispatcher-paired"], "abandoned")

    def test_dry_run_does_not_mutate(self):
        self._seed([
            {"@id": "urn:t:fixer-bad", "agent": "fixer", "status": "blocked",
             "outputs": {"error": "stall_not_recoverable", "details": "x"},
             "history": [], "depends_on": []},
        ])
        rc = self.state_admin.main([
            "--state-path", str(self.state_path),
            "abandon-stale-fixers", "--dry-run",
        ])
        self.assertEqual(rc, 0)
        state = json.loads(self.state_path.read_text(encoding="utf-8"))
        self.assertEqual(state["tasks"][0]["status"], "blocked")  # untouched


class TestRecoveryAnchorAutoSupersession(unittest.TestCase):
    """v3.6.0: phantom-stall-after-recovery auto-resolution.

    The recovery-dispatcher tags each appended recovery-chain task's
    inputs with `recovery_anchor: <original-blocked-anchor-id>`. When
    the daemon commits a test-runner with `outputs.status=all_pass` AND
    `inputs.recovery_anchor` set, the anchor is auto-superseded
    (status: blocked → done with `anchor_superseded_by` provenance
    annotation + chain-hashed audit event).

    Closes the pattern hit 3x in the 2026-06-02 → 2026-06-04 session:
    Chain 1c (755), Chain 4.1 (835), Chain 5 sub-task A (851). Pre-
    v3.6.0 each required manual Option-A state-surgery.
    """

    def test_recovery_dispatcher_tags_appended_tasks_with_recovery_anchor(self):
        """v3.6.0a: dispatched recovery-chain tasks carry
        inputs.recovery_anchor pointing back to the original anchor.

        Uses the validator-friendly single-task chain pattern from
        test_validator_pass_appends_recovery_chain (matches the existing
        TestRecoveryDispatcher seed)."""
        tmpdir = Path(tempfile.mkdtemp(prefix="fnsr-rec-anchor-"))
        try:
            state_path = tmpdir / "state.jsonld"
            state_path.write_text(json.dumps({
                "@id": "urn:fnsr:run:test",
                "tasks": [{
                    "@id": "urn:fnsr:task:001-stalled",
                    "status": "blocked",
                }],
            }), encoding="utf-8")
            old_env = os.environ.get("FNSR_STATE")
            os.environ["FNSR_STATE"] = str(state_path)
            try:
                task = {
                    "@id": "urn:t:dispatcher",
                    "agent": "recovery-dispatcher",
                    "inputs": {
                        "source_task": "urn:t:fixer",
                        "anchor_task": "urn:fnsr:task:001-stalled",
                    },
                }
                upstream = {"urn:t:fixer": {
                    "escalate": False,
                    "recovery_chain": [{
                        "@id": "urn:t:recovery-dev",
                        "agent": "developer",
                        "depends_on": [],
                        "inputs": {"purpose": "retry with corrected bytes"},
                    }],
                }}
                result = d._recovery_dispatcher(task, upstream)
                self.assertTrue(result.ok)
                self.assertEqual(result.outputs["dispatched"], 1)
                # v3.6.0a assertion: the appended task has
                # inputs.recovery_anchor set to the original anchor id
                final = json.loads(state_path.read_text(encoding="utf-8"))
                by_id = {t["@id"]: t for t in final["tasks"]}
                self.assertIn("urn:t:recovery-dev", by_id)
                self.assertEqual(
                    by_id["urn:t:recovery-dev"]["inputs"]["recovery_anchor"],
                    "urn:fnsr:task:001-stalled",
                )
            finally:
                if old_env is None:
                    os.environ.pop("FNSR_STATE", None)
                else:
                    os.environ["FNSR_STATE"] = old_env
        finally:
            shutil.rmtree(tmpdir, ignore_errors=True)

    def test_maybe_supersede_flips_blocked_anchor_to_done(self):
        """v3.6.0b: when a recovery test-runner completes with all_pass,
        the helper flips the anchor from blocked to done and records the
        anchor_superseded_by_recovery audit event."""
        state = {"tasks": [
            {"@id": "urn:t:anchor", "agent": "applier",
             "status": "blocked", "outputs": {"error": "apply_partial_failure"},
             "history": [{"event": "cps_veto", "payload": {},
                           "prev_hash": "0" * 64, "chain_hash": "a" * 64}]},
            {"@id": "urn:t:apply-recovery", "agent": "applier",
             "status": "done", "depends_on": [],
             "inputs": {"recovery_anchor": "urn:t:anchor"},
             "history": []},
        ]}
        completed = {
            "@id": "urn:t:test-recovery",
            "agent": "test-runner",
            "status": "done",
            "inputs": {"recovery_anchor": "urn:t:anchor"},
            "outputs": {"status": "all_pass", "exit_code": 0},
            "history": [],
        }
        d._maybe_supersede_recovery_anchor(state, completed)
        anchor = next(t for t in state["tasks"] if t["@id"] == "urn:t:anchor")
        self.assertEqual(anchor["status"], "done")
        self.assertIn("anchor_superseded_by", anchor["outputs"])
        sup = anchor["outputs"]["anchor_superseded_by"]
        self.assertEqual(sup["test_runner_task"], "urn:t:test-recovery")
        self.assertEqual(sup["applier_task"], "urn:t:apply-recovery")
        # Audit event chain-hashed
        events = [h["event"] for h in anchor["history"]]
        self.assertIn("anchor_superseded_by_recovery", events)
        last = anchor["history"][-1]
        self.assertEqual(last["event"], "anchor_superseded_by_recovery")
        self.assertEqual(last["prev_hash"], "a" * 64)

    def test_maybe_supersede_is_idempotent_on_already_done_anchor(self):
        """If the anchor is already done, the helper is a no-op."""
        state = {"tasks": [
            {"@id": "urn:t:anchor", "agent": "applier",
             "status": "done", "outputs": {},
             "history": []},
        ]}
        completed = {
            "@id": "urn:t:test-recovery", "agent": "test-runner",
            "status": "done",
            "inputs": {"recovery_anchor": "urn:t:anchor"},
            "outputs": {"status": "all_pass"},
            "history": [],
        }
        d._maybe_supersede_recovery_anchor(state, completed)
        anchor = state["tasks"][0]
        self.assertEqual(anchor["status"], "done")
        self.assertNotIn("anchor_superseded_by",
                          anchor.get("outputs") or {})

    def test_maybe_supersede_only_fires_on_test_runner_all_pass(self):
        """Other agents / non-all_pass outputs don't trigger supersession."""
        anchor_t = {
            "@id": "urn:t:anchor", "agent": "applier",
            "status": "blocked", "outputs": {},
            "history": [{"event": "cps_veto",
                          "prev_hash": "0" * 64, "chain_hash": "a" * 64}],
        }
        state = {"tasks": [anchor_t]}
        # Wrong agent
        d._maybe_supersede_recovery_anchor(state, {
            "@id": "urn:t:x", "agent": "developer", "status": "done",
            "inputs": {"recovery_anchor": "urn:t:anchor"},
            "outputs": {"status": "all_pass"},
        })
        self.assertEqual(anchor_t["status"], "blocked")
        # Right agent but not all_pass
        d._maybe_supersede_recovery_anchor(state, {
            "@id": "urn:t:y", "agent": "test-runner", "status": "done",
            "inputs": {"recovery_anchor": "urn:t:anchor"},
            "outputs": {"status": "some_failures"},
        })
        self.assertEqual(anchor_t["status"], "blocked")
        # Right agent, all_pass, but no recovery_anchor tag
        d._maybe_supersede_recovery_anchor(state, {
            "@id": "urn:t:z", "agent": "test-runner", "status": "done",
            "inputs": {},
            "outputs": {"status": "all_pass"},
        })
        self.assertEqual(anchor_t["status"], "blocked")

    def test_supersession_unwedges_stall_detector(self):
        """After auto-supersession, the stall-detector no longer treats
        the anchor as a candidate (closes the loop)."""
        import datetime as _dt
        # v3.7 fix: use a dynamic recent timestamp so the test doesn't
        # break when wall-clock rolls past the FIXER_STALE_HOURS window
        # past the originally-hardcoded fixture date.
        recent_ts = (_dt.datetime.now(_dt.timezone.utc)
                     - _dt.timedelta(hours=1)).strftime(
            "%Y-%m-%dT%H:%M:%SZ")
        state = {"tasks": [
            {"@id": "urn:t:anchor", "agent": "applier",
             "status": "blocked", "outputs": {"error": "apply_partial_failure"},
             "history": [{"event": "cps_veto",
                           "ts": recent_ts,
                           "prev_hash": "0" * 64, "chain_hash": "a" * 64}]},
            {"@id": "urn:t:apply-recovery", "agent": "applier",
             "status": "done", "depends_on": [],
             "inputs": {"recovery_anchor": "urn:t:anchor"}, "history": []},
        ]}
        # Pre-supersession: stall-detector sees the anchor as candidate
        candidates_before = d._stalls_eligible_for_fixer(state)
        anchor_ids_before = [c["anchor_id"] for c in candidates_before]
        self.assertIn("urn:t:anchor", anchor_ids_before)
        # Run supersession
        d._maybe_supersede_recovery_anchor(state, {
            "@id": "urn:t:test-recovery", "agent": "test-runner",
            "status": "done",
            "inputs": {"recovery_anchor": "urn:t:anchor"},
            "outputs": {"status": "all_pass"},
        })
        # Post-supersession: anchor no longer eligible (status=done)
        candidates_after = d._stalls_eligible_for_fixer(state)
        anchor_ids_after = [c["anchor_id"] for c in candidates_after]
        self.assertNotIn("urn:t:anchor", anchor_ids_after)


if __name__ == "__main__":
    unittest.main()
