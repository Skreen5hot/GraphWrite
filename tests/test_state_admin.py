import json
import os
import shutil
import sys
import tempfile
import unittest
from pathlib import Path

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))
import fnsr_daemon as d
import state_admin


def _seed_state(state_path, tasks):
    state_path.write_text(json.dumps({
        "@context": "https://fnsr.example/context.jsonld",
        "@id": "urn:fnsr:run:test",
        "tasks": tasks,
    }, indent=2), encoding="utf-8")


class TestStateAdmin(unittest.TestCase):
    def setUp(self):
        self.tmpdir = Path(tempfile.mkdtemp(prefix="fnsr-state-admin-"))
        self.state_path = self.tmpdir / "state.jsonld"

    def tearDown(self):
        shutil.rmtree(self.tmpdir, ignore_errors=True)

    def _run(self, argv):
        return state_admin.main(argv)

    def test_reset_existing_task(self):
        _seed_state(self.state_path, [
            {"@id": "urn:fnsr:task:001", "agent": "developer",
             "status": "failed", "attempts": 3,
             "outputs": {"changes": [{"id": "C1"}], "summary": "x",
                          "self_assessment": "confident"},
             "depends_on": [], "history": [
                 {"event": "completed", "payload": {},
                  "prev_hash": "0" * 64, "chain_hash": "a" * 64},
             ]},
        ])
        rc = self._run([
            "--state-path", str(self.state_path),
            "reset", "urn:fnsr:task:001", "--reason", "test reset"
        ])
        self.assertEqual(rc, 0)
        state = json.loads(self.state_path.read_text(encoding="utf-8"))
        t = state["tasks"][0]
        self.assertEqual(t["status"], "ready")
        self.assertEqual(t["attempts"], 0)
        self.assertIsNone(t["outputs"])
        self.assertEqual(len(t["history"]), 2)
        self.assertEqual(t["history"][-1]["event"], "operator_reset")
        self.assertEqual(t["history"][-1]["payload"]["reason"], "test reset")
        # Hash chain integrity
        last_hash = t["history"][-1]["chain_hash"]
        self.assertEqual(t["history"][-1]["prev_hash"], "a" * 64)
        recomputed = d.hiri_sign("a" * 64, {
            "event": "operator_reset",
            "payload": t["history"][-1]["payload"],
        })
        self.assertEqual(last_hash, recomputed)

    def test_reset_missing_task_returns_error(self):
        _seed_state(self.state_path, [])
        rc = self._run([
            "--state-path", str(self.state_path),
            "reset", "urn:fnsr:task:does-not-exist", "--reason", "x"
        ])
        self.assertEqual(rc, 1)

    def test_abandon_with_replaced_by(self):
        _seed_state(self.state_path, [
            {"@id": "urn:fnsr:task:old", "agent": "developer",
             "status": "in_progress", "attempts": 1,
             "outputs": None, "depends_on": [], "history": []},
        ])
        rc = self._run([
            "--state-path", str(self.state_path),
            "abandon", "urn:fnsr:task:old",
            "--reason", "scope too broad",
            "--replaced-by", "urn:fnsr:task:new-a,urn:fnsr:task:new-b",
        ])
        self.assertEqual(rc, 0)
        state = json.loads(self.state_path.read_text(encoding="utf-8"))
        t = state["tasks"][0]
        self.assertEqual(t["status"], "blocked")
        self.assertEqual(t["history"][-1]["payload"]["replaced_by"],
                         ["urn:fnsr:task:new-a", "urn:fnsr:task:new-b"])

    def test_append_tasks_skips_duplicates(self):
        _seed_state(self.state_path, [
            {"@id": "urn:fnsr:task:existing", "agent": "x",
             "status": "ready", "depends_on": [], "history": []},
        ])
        new_tasks_file = self.tmpdir / "new.json"
        new_tasks_file.write_text(json.dumps([
            {"@id": "urn:fnsr:task:existing", "agent": "x",
             "status": "ready", "depends_on": [], "history": []},
            {"@id": "urn:fnsr:task:fresh", "agent": "y",
             "status": "ready", "depends_on": [], "history": []},
        ]), encoding="utf-8")
        rc = self._run([
            "--state-path", str(self.state_path),
            "append-tasks", str(new_tasks_file),
        ])
        self.assertEqual(rc, 0)
        state = json.loads(self.state_path.read_text(encoding="utf-8"))
        ids = [t["@id"] for t in state["tasks"]]
        self.assertEqual(len(ids), 2)
        self.assertIn("urn:fnsr:task:fresh", ids)

    def test_verify_pass_on_clean_chain(self):
        # Build a task with a proper hash chain
        task = {"@id": "urn:fnsr:task:t", "agent": "x", "status": "done",
                "depends_on": [], "history": []}
        prev = "0" * 64
        for evt in ("started", "completed"):
            payload = {"info": evt}
            new_hash = d.hiri_sign(prev, {"event": evt, "payload": payload})
            task["history"].append({
                "event": evt, "payload": payload,
                "prev_hash": prev, "chain_hash": new_hash,
            })
            prev = new_hash
        _seed_state(self.state_path, [task])
        rc = self._run([
            "--state-path", str(self.state_path), "verify", "--quiet",
        ])
        self.assertEqual(rc, 0)

    def test_verify_fail_on_broken_chain(self):
        # Same as above but tamper with the second entry's prev_hash
        task = {"@id": "urn:fnsr:task:t", "agent": "x", "status": "done",
                "depends_on": [], "history": [
                    {"event": "started", "payload": {},
                     "prev_hash": "0" * 64, "chain_hash": "a" * 64},
                    {"event": "completed", "payload": {},
                     "prev_hash": "b" * 64,  # WRONG — should be a*64
                     "chain_hash": "c" * 64},
                ]}
        _seed_state(self.state_path, [task])
        rc = self._run([
            "--state-path", str(self.state_path), "verify", "--quiet",
        ])
        self.assertEqual(rc, 1)

    def test_status_filter(self):
        _seed_state(self.state_path, [
            {"@id": "urn:t:1", "status": "done", "depends_on": []},
            {"@id": "urn:t:2", "status": "ready", "depends_on": []},
            {"@id": "urn:t:3", "status": "blocked", "depends_on": []},
            {"@id": "urn:t:4", "status": "ready", "depends_on": []},
        ])
        # Capture stdout
        from io import StringIO
        old_stdout = sys.stdout
        sys.stdout = StringIO()
        try:
            rc = self._run([
                "--state-path", str(self.state_path),
                "status", "--filter", "ready",
            ])
            output = sys.stdout.getvalue()
        finally:
            sys.stdout = old_stdout
        self.assertEqual(rc, 0)
        self.assertIn("urn:t:2", output)
        self.assertIn("urn:t:4", output)
        self.assertNotIn("urn:t:1", output)
        self.assertNotIn("urn:t:3", output)


class TestResolveCommand(unittest.TestCase):
    """v2.6.0: resolve an `awaiting_operator_decision` task by picking
    one of the agent's surfaced options."""

    def setUp(self):
        self.tmpdir = Path(tempfile.mkdtemp(prefix="fnsr-resolve-test-"))
        self.state_path = self.tmpdir / "state.jsonld"

    def tearDown(self):
        shutil.rmtree(self.tmpdir, ignore_errors=True)

    def _seed_awaiting_task(self, options=None, recommendation="prefer A"):
        if options is None:
            options = ["A", "B", "C"]
        _seed_state(self.state_path, [{
            "@id": "urn:fnsr:task:Q1",
            "agent": "architect",
            "status": "awaiting_operator_decision",
            "outputs": {
                "status": "awaiting_operator_decision",
                "options": options,
                "recommendation": recommendation,
            },
            "depends_on": [],
            "attempts": 1,
            "history": [{
                "event": "awaiting_operator_decision",
                "payload": {"options_count": len(options),
                            "recommendation": recommendation},
                "prev_hash": "0" * 64,
                "chain_hash": "a" * 64,
            }],
        }])

    def test_resolve_picks_option_records_audit(self):
        self._seed_awaiting_task()
        rc = state_admin.main([
            "--state-path", str(self.state_path),
            "resolve", "urn:fnsr:task:Q1", "--option", "2",
            "--notes", "B has the simpler dependency graph",
        ])
        self.assertEqual(rc, 0)
        state = json.loads(self.state_path.read_text(encoding="utf-8"))
        t = state["tasks"][0]
        self.assertEqual(t["status"], "done")
        last = t["history"][-1]
        self.assertEqual(last["event"], "operator_resolution")
        self.assertEqual(last["payload"]["chosen_option_index"], 2)
        self.assertEqual(last["payload"]["chosen_option"], "B")
        self.assertEqual(last["payload"]["notes"],
                         "B has the simpler dependency graph")
        # Outputs also annotated for downstream agents
        self.assertEqual(
            t["outputs"]["operator_resolution"]["chosen_option_index"], 2
        )

    def test_resolve_rejects_task_not_awaiting(self):
        _seed_state(self.state_path, [{
            "@id": "urn:fnsr:task:done", "status": "done",
            "depends_on": [], "history": []}])
        rc = state_admin.main([
            "--state-path", str(self.state_path),
            "resolve", "urn:fnsr:task:done", "--option", "1",
        ])
        self.assertEqual(rc, 1)

    def test_resolve_rejects_out_of_range_option(self):
        self._seed_awaiting_task(options=["A", "B"])
        rc = state_admin.main([
            "--state-path", str(self.state_path),
            "resolve", "urn:fnsr:task:Q1", "--option", "5",
        ])
        self.assertEqual(rc, 1)

    def test_resolve_rejects_zero_option(self):
        self._seed_awaiting_task()
        rc = state_admin.main([
            "--state-path", str(self.state_path),
            "resolve", "urn:fnsr:task:Q1", "--option", "0",
        ])
        self.assertEqual(rc, 1)

    def test_resolve_audit_chains_correctly(self):
        # Seed with a properly-chained initial history entry so verify can
        # walk the chain end-to-end after resolve appends its event.
        initial_payload = {"options_count": 3, "recommendation": "A"}
        initial_hash = d.hiri_sign("0" * 64, {
            "event": "awaiting_operator_decision",
            "payload": initial_payload,
        })
        _seed_state(self.state_path, [{
            "@id": "urn:fnsr:task:Q1",
            "agent": "architect",
            "status": "awaiting_operator_decision",
            "outputs": {"status": "awaiting_operator_decision",
                        "options": ["A", "B", "C"],
                        "recommendation": "A"},
            "depends_on": [],
            "attempts": 1,
            "history": [{
                "event": "awaiting_operator_decision",
                "payload": initial_payload,
                "prev_hash": "0" * 64,
                "chain_hash": initial_hash,
            }],
        }])
        state_admin.main([
            "--state-path", str(self.state_path),
            "resolve", "urn:fnsr:task:Q1", "--option", "1",
        ])
        rc = state_admin.main([
            "--state-path", str(self.state_path),
            "verify", "--quiet",
        ])
        self.assertEqual(rc, 0)


class TestBankCommand(unittest.TestCase):
    """v2.6.0: record a forward-track audit event with candidate_class
    and optional surfacing_cycle. No task state change."""

    def setUp(self):
        self.tmpdir = Path(tempfile.mkdtemp(prefix="fnsr-bank-test-"))
        self.state_path = self.tmpdir / "state.jsonld"
        _seed_state(self.state_path, [{
            "@id": "urn:fnsr:task:anchor", "agent": "x",
            "status": "done", "depends_on": [], "history": [],
        }])

    def tearDown(self):
        shutil.rmtree(self.tmpdir, ignore_errors=True)

    def test_bank_records_audit_event_no_state_change(self):
        rc = state_admin.main([
            "--state-path", str(self.state_path),
            "bank", "urn:fnsr:task:anchor",
            "--candidate-class", "pattern",
            "--content", "observed cascade failure pattern in multi-edit tasks",
            "--cycle", "12",
        ])
        self.assertEqual(rc, 0)
        state = json.loads(self.state_path.read_text(encoding="utf-8"))
        t = state["tasks"][0]
        self.assertEqual(t["status"], "done")  # unchanged
        self.assertEqual(len(t["history"]), 1)
        evt = t["history"][0]
        self.assertEqual(evt["event"], "forward_track")
        self.assertEqual(evt["payload"]["candidate_class"], "pattern")
        self.assertEqual(evt["payload"]["surfacing_cycle"], 12)
        self.assertIn("cascade", evt["payload"]["content"])

    def test_bank_without_cycle_omits_field(self):
        state_admin.main([
            "--state-path", str(self.state_path),
            "bank", "urn:fnsr:task:anchor",
            "--candidate-class", "risk",
            "--content", "watch for the X corner case",
        ])
        state = json.loads(self.state_path.read_text(encoding="utf-8"))
        evt = state["tasks"][0]["history"][-1]
        self.assertNotIn("surfacing_cycle", evt["payload"])

    def test_bank_chain_integrity_preserved(self):
        state_admin.main([
            "--state-path", str(self.state_path),
            "bank", "urn:fnsr:task:anchor",
            "--candidate-class", "methodology",
            "--content", "operator-task-splitting pattern worth documenting",
        ])
        rc = state_admin.main([
            "--state-path", str(self.state_path),
            "verify", "--quiet",
        ])
        self.assertEqual(rc, 0)

    def test_bank_missing_task_returns_error(self):
        rc = state_admin.main([
            "--state-path", str(self.state_path),
            "bank", "urn:fnsr:task:nonexistent",
            "--candidate-class", "pattern", "--content", "x",
        ])
        self.assertEqual(rc, 1)


class TestStatusHighlightsAwaiting(unittest.TestCase):
    """v2.6.0: `state_admin status` surfaces awaiting_operator_decision
    tasks at the top, regardless of filter."""

    def setUp(self):
        self.tmpdir = Path(tempfile.mkdtemp(prefix="fnsr-status-test-"))
        self.state_path = self.tmpdir / "state.jsonld"
        _seed_state(self.state_path, [
            {"@id": "urn:t:1", "status": "done", "depends_on": []},
            {"@id": "urn:t:2", "status": "awaiting_operator_decision",
             "depends_on": []},
            {"@id": "urn:t:3", "status": "ready", "depends_on": []},
        ])

    def tearDown(self):
        shutil.rmtree(self.tmpdir, ignore_errors=True)

    def test_status_surfaces_awaiting_first(self):
        from io import StringIO
        old_stdout = sys.stdout
        sys.stdout = StringIO()
        try:
            state_admin.main([
                "--state-path", str(self.state_path), "status",
            ])
            out = sys.stdout.getvalue()
        finally:
            sys.stdout = old_stdout
        self.assertIn("!! AWAITING OPERATOR DECISION", out)
        # Awaiting should appear above the other status sections
        awaiting_pos = out.index("AWAITING")
        done_pos = out.index("done")
        ready_pos = out.index("ready")
        self.assertLess(awaiting_pos, done_pos)
        self.assertLess(awaiting_pos, ready_pos)


if __name__ == "__main__":
    unittest.main()
