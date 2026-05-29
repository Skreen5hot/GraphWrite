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


if __name__ == "__main__":
    unittest.main()
