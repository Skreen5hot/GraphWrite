"""Tests for v3.4.0 substrate status communication primitive.

Per Aaron 2026-06-02: anytime the system stops, an operator-facing
communication file (fnsr.status.md) classifies current state into one
of five states (decision-necessary / working / ready-for-review /
ready-for-release / idle) and tells the operator what to do.
"""
import json
import os
import shutil
import sys
import tempfile
import unittest
from pathlib import Path

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))
import fnsr_status as fs


class TestClassifier(unittest.TestCase):
    """Pure-function classify() over a state dict."""

    def test_empty_state_is_idle(self):
        cls = fs.classify({"tasks": []})
        self.assertEqual(cls["state"], fs.STATE_IDLE)

    def test_awaiting_decision_wins(self):
        """Decision-necessary has the highest precedence."""
        state = {"tasks": [
            {"@id": "urn:t:a", "status": "awaiting_operator_decision",
             "outputs": {"options": ["A"], "recommendation": "A"},
             "depends_on": [], "history": []},
            # ALSO has in-progress and demo-released — should still be
            # classified as decision-necessary
            {"@id": "urn:t:b", "status": "in_progress",
             "depends_on": [], "history": []},
            {"@id": "urn:t:c", "status": "done", "depends_on": [],
             "history": [{"event": "phase_state_changed",
                          "ts": "2026-06-02T05:00:00Z",
                          "payload": {"phase_id": "phase-3",
                                       "to_state": "demo-released"}}]},
        ]}
        cls = fs.classify(state)
        self.assertEqual(cls["state"], fs.STATE_DECISION_NECESSARY)
        self.assertEqual(cls["pending_count"], 1)
        self.assertEqual(cls["pending_task_ids"], ["urn:t:a"])

    def test_in_progress_is_working(self):
        state = {"tasks": [
            {"@id": "urn:t:a", "status": "in_progress",
             "depends_on": [], "history": []},
        ]}
        cls = fs.classify(state)
        self.assertEqual(cls["state"], fs.STATE_WORKING)
        self.assertEqual(cls["in_progress_count"], 1)
        self.assertEqual(cls["dispatchable_count"], 0)

    def test_dispatchable_ready_is_working(self):
        """A ready task with all deps done is working."""
        state = {"tasks": [
            {"@id": "urn:t:dep", "status": "done", "depends_on": [],
             "history": []},
            {"@id": "urn:t:rdy", "status": "ready",
             "depends_on": ["urn:t:dep"], "history": []},
        ]}
        cls = fs.classify(state)
        self.assertEqual(cls["state"], fs.STATE_WORKING)
        self.assertEqual(cls["dispatchable_count"], 1)

    def test_ready_with_blocked_deps_is_NOT_working(self):
        """A ready task with a blocked dep should NOT count as
        dispatchable (this is the Phase 2 leftover case)."""
        state = {"tasks": [
            {"@id": "urn:t:dep", "status": "blocked", "depends_on": [],
             "history": []},
            {"@id": "urn:t:rdy", "status": "ready",
             "depends_on": ["urn:t:dep"], "history": []},
        ]}
        cls = fs.classify(state)
        self.assertEqual(cls["state"], fs.STATE_IDLE)

    def test_demo_released_phase_is_ready_for_review(self):
        state = {"tasks": [
            {"@id": "urn:t:anchor", "status": "done", "depends_on": [],
             "history": [{
                 "event": "phase_state_changed",
                 "ts": "2026-06-02T05:00:00Z",
                 "payload": {
                     "phase_id": "phase-3",
                     "to_state": "demo-released",
                     "deploy_url": "https://example.com/demo",
                     "build_ref": "abc1234",
                     "notes": "Chain 2 complete"}}]},
        ]}
        cls = fs.classify(state)
        self.assertEqual(cls["state"], fs.STATE_READY_FOR_REVIEW)
        self.assertEqual(cls["phase_id"], "phase-3")
        self.assertEqual(cls["deploy_url"], "https://example.com/demo")
        self.assertEqual(cls["build_ref"], "abc1234")
        self.assertEqual(cls["notes"], "Chain 2 complete")

    def test_latest_phase_state_wins(self):
        """If a phase transitioned demo-released -> implementing later,
        the latest event wins (state -> implementing -> idle)."""
        state = {"tasks": [
            {"@id": "urn:t:anchor", "status": "done", "depends_on": [],
             "history": [
                {"event": "phase_state_changed",
                 "ts": "2026-06-02T05:00:00Z",
                 "payload": {"phase_id": "phase-3",
                              "to_state": "demo-released"}},
                {"event": "phase_state_changed",
                 "ts": "2026-06-02T06:00:00Z",
                 "payload": {"phase_id": "phase-3",
                              "to_state": "implementing"}},
            ]},
        ]}
        cls = fs.classify(state)
        # phase-3 latest is implementing → not in PLO_REVIEW_STATES
        self.assertEqual(cls["state"], fs.STATE_IDLE)

    def test_po_satisfied_is_ready_for_release(self):
        state = {"tasks": [
            {"@id": "urn:t:anchor", "status": "done", "depends_on": [],
             "history": [{
                 "event": "phase_state_changed",
                 "ts": "2026-06-02T07:00:00Z",
                 "payload": {"phase_id": "phase-2",
                              "to_state": "po-satisfied",
                              "notes": "PO accepted Phase 2 work"}}]},
        ]}
        cls = fs.classify(state)
        self.assertEqual(cls["state"], fs.STATE_READY_FOR_RELEASE)
        self.assertEqual(cls["phase_state"], "po-satisfied")

    def test_drift_reconciled_is_ready_for_release(self):
        state = {"tasks": [
            {"@id": "urn:t:anchor", "status": "done", "depends_on": [],
             "history": [{
                 "event": "phase_state_changed",
                 "ts": "2026-06-02T08:00:00Z",
                 "payload": {"phase_id": "phase-1",
                              "to_state": "drift-reconciled"}}]},
        ]}
        cls = fs.classify(state)
        self.assertEqual(cls["state"], fs.STATE_READY_FOR_RELEASE)


class TestRender(unittest.TestCase):
    def test_render_decision_necessary(self):
        md = fs.render_markdown({
            "state": fs.STATE_DECISION_NECESSARY,
            "pending_count": 2,
            "pending_task_ids": ["urn:t:a", "urn:t:b"],
        })
        self.assertIn("Decision Necessary", md)
        self.assertIn("2 operator decision(s) pending", md)
        self.assertIn("fnsr.operator_decisions.md", md)
        self.assertIn("urn:t:a", md)
        self.assertIn("urn:t:b", md)

    def test_render_ready_for_review_with_url(self):
        md = fs.render_markdown({
            "state": fs.STATE_READY_FOR_REVIEW,
            "phase_id": "phase-3",
            "phase_state": "demo-released",
            "deploy_url": "https://skreen5hot.github.io/GraphWrite/",
            "build_ref": "8707ef0",
            "transition_ts": "2026-06-02T05:30:00Z",
            "notes": "Chain 1 substantively complete",
        })
        self.assertIn("Ready for PO Review / UAT", md)
        self.assertIn("https://skreen5hot.github.io/GraphWrite/", md)
        self.assertIn("Awaiting your review", md)
        self.assertIn("8707ef0", md)
        self.assertIn("Chain 1 substantively complete", md)

    def test_render_ready_for_release(self):
        md = fs.render_markdown({
            "state": fs.STATE_READY_FOR_RELEASE,
            "phase_id": "phase-2",
            "phase_state": "po-satisfied",
            "notes": "PO accepted",
        })
        self.assertIn("Done / Ready for Release", md)
        self.assertIn("production deployment", md)
        self.assertIn("Awaiting your release", md)
        self.assertIn("PO accepted", md)

    def test_render_working(self):
        md = fs.render_markdown({
            "state": fs.STATE_WORKING,
            "in_progress_count": 1,
            "dispatchable_count": 3,
            "dispatchable_task_ids": [],
        })
        self.assertIn("Working", md)
        self.assertIn("1 in-progress", md)
        self.assertIn("3 dispatchable", md)

    def test_render_idle_includes_recovery_hint(self):
        md = fs.render_markdown({"state": fs.STATE_IDLE})
        self.assertIn("Idle", md)
        self.assertIn("state_admin phase demo-released", md)


class TestEmit(unittest.TestCase):
    def setUp(self):
        self.tmpdir = Path(tempfile.mkdtemp(prefix="fnsr-status-emit-"))

    def tearDown(self):
        shutil.rmtree(self.tmpdir, ignore_errors=True)

    def test_emit_writes_status_file(self):
        state_path = self.tmpdir / "state.jsonld"
        state_path.write_text(json.dumps({"tasks": []}), encoding="utf-8")
        out_path = self.tmpdir / "status.md"
        summary = fs.emit(state_path, out_path)
        self.assertEqual(summary["state_classification"], fs.STATE_IDLE)
        self.assertTrue(summary["wrote_file"])
        self.assertTrue(out_path.exists())
        content = out_path.read_text(encoding="utf-8")
        self.assertIn("System Status", content)
        self.assertIn("Idle", content)

    def test_emit_handles_unreadable_state(self):
        state_path = self.tmpdir / "state.jsonld"
        state_path.write_text("not valid json{", encoding="utf-8")
        out_path = self.tmpdir / "status.md"
        summary = fs.emit(state_path, out_path)
        self.assertEqual(summary["state_classification"], "error")
        # Still writes a minimal error file so the operator sees it
        self.assertTrue(out_path.exists())
        content = out_path.read_text(encoding="utf-8")
        self.assertIn("State: Error", content)

    def test_emit_demo_doc_discovery(self):
        """When phase has a demo/PHASE-N-*.md, renderer links it."""
        state_path = self.tmpdir / "state.jsonld"
        state_path.write_text(json.dumps({"tasks": [{
            "@id": "urn:t:anchor", "status": "done", "depends_on": [],
            "history": [{"event": "phase_state_changed",
                          "ts": "2026-06-02T05:00:00Z",
                          "payload": {"phase_id": "phase-3",
                                       "to_state": "demo-released",
                                       "deploy_url": "https://example.com"}}],
        }]}), encoding="utf-8")
        demo_dir = self.tmpdir / "demo"
        demo_dir.mkdir()
        demo_doc = demo_dir / "PHASE-3-CHAIN-1-TURTLE-IMPORT.md"
        demo_doc.write_text("# demo\n", encoding="utf-8")
        out_path = self.tmpdir / "status.md"
        summary = fs.emit(state_path, out_path, repo_root=self.tmpdir)
        self.assertEqual(
            summary["state_classification"], fs.STATE_READY_FOR_REVIEW
        )
        content = out_path.read_text(encoding="utf-8")
        self.assertIn("demo/PHASE-3-CHAIN-1-TURTLE-IMPORT.md", content)


class TestStateAdminStatusMessage(unittest.TestCase):
    """state_admin status-message invokes the renderer + writes the file."""

    def setUp(self):
        import state_admin
        self.state_admin = state_admin
        self.tmpdir = Path(tempfile.mkdtemp(prefix="fnsr-status-cli-"))
        self.state_path = self.tmpdir / "state.jsonld"
        self.state_path.write_text(json.dumps({
            "tasks": [{
                "@id": "urn:t:dispatcher",
                "status": "awaiting_operator_decision",
                "outputs": {"options": ["A"], "recommendation": "A"},
                "depends_on": [], "history": [],
            }]
        }), encoding="utf-8")

    def tearDown(self):
        shutil.rmtree(self.tmpdir, ignore_errors=True)

    def test_status_message_command(self):
        rc = self.state_admin.main([
            "--state-path", str(self.state_path),
            "status-message",
        ])
        self.assertEqual(rc, 0)
        # Status file is written next to the state file by default
        status_path = self.tmpdir / "fnsr.status.md"
        self.assertTrue(status_path.exists())
        content = status_path.read_text(encoding="utf-8")
        self.assertIn("Decision Necessary", content)


if __name__ == "__main__":
    unittest.main()
