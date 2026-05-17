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


if __name__ == "__main__":
    unittest.main()
