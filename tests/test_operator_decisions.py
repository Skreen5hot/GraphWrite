"""Tests for v3.3.0 operator-decisions emission primitive.

Per Aaron 2026-06-01: closes the architectural emission gap where
awaiting_operator_decision tasks were stored in state.jsonld but had no
operator-discoverability surface. fnsr_operator_decisions.py renders
pending decisions to Markdown; state_admin pending wraps it; watchdog
auto-emits on every probe.
"""
import json
import os
import shutil
import sys
import tempfile
import unittest
from pathlib import Path

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))
import fnsr_operator_decisions as od


class TestOperatorDecisionRenderer(unittest.TestCase):
    """Pure-function renderer for awaiting_operator_decision tasks."""

    def test_empty_state_renders_no_decisions_message(self):
        state = {"tasks": []}
        md = od.render_markdown(state)
        self.assertIn("Total: 0 task(s)", md)
        self.assertIn("No pending decisions", md)

    def test_ignores_non_awaiting_tasks(self):
        state = {"tasks": [
            {"@id": "urn:t:done", "status": "done"},
            {"@id": "urn:t:blocked", "status": "blocked"},
            {"@id": "urn:t:ready", "status": "ready"},
        ]}
        md = od.render_markdown(state)
        self.assertIn("Total: 0", md)

    def test_single_decision_full_render(self):
        state = {"tasks": [{
            "@id": "urn:fnsr:task:100-disp",
            "agent": "recovery-dispatcher",
            "status": "awaiting_operator_decision",
            "outputs": {
                "status": "awaiting_operator_decision",
                "anchor_task": "urn:fnsr:task:99-stalled",
                "source_fixer_task": "urn:fnsr:task:98-fixer",
                "diagnosis": "anchor wedged on length-budget overrun",
                "options": [
                    "Option A: abandon the anchor and accept the loss",
                    "Option B: patch the length-budget contract",
                ],
                "recommendation": "Recommend A; budget calibration is v3.2 candidacy.",
                "fixer_escalated": True,
            },
            "history": [{"ts": "2026-06-01T10:00:00Z", "event": "completed"}],
        }]}
        md = od.render_markdown(state)
        self.assertIn("Total: 1 task(s)", md)
        self.assertIn("urn:fnsr:task:99-stalled", md)
        self.assertIn("urn:fnsr:task:98-fixer", md)
        self.assertIn("anchor wedged on length-budget overrun", md)
        self.assertIn("Option A: abandon the anchor", md)
        self.assertIn("Option B: patch the length-budget contract", md)
        self.assertIn("Recommend A", md)
        # The resolve-via section
        self.assertIn("state_admin.py resolve urn:fnsr:task:100-disp", md)
        self.assertIn("--option <1-2>", md)

    def test_duplicate_anchor_surfaces_grouped(self):
        """Two dispatchers escalating same anchor (consecutive Fixer
        attempts independently reaching same diagnosis) — should be
        rendered under one Anchor section with duplicate notation."""
        state = {"tasks": [
            {"@id": "urn:fnsr:task:100-disp-a", "status": "awaiting_operator_decision",
             "outputs": {"anchor_task": "urn:fnsr:task:99-stalled",
                          "options": ["A"], "recommendation": "rec A",
                          "diagnosis": "d1"},
             "history": [{"ts": "2026-06-01T10:00:00Z"}]},
            {"@id": "urn:fnsr:task:101-disp-b", "status": "awaiting_operator_decision",
             "outputs": {"anchor_task": "urn:fnsr:task:99-stalled",
                          "options": ["A"], "recommendation": "rec B (duplicate)",
                          "diagnosis": "d2"},
             "history": [{"ts": "2026-06-01T10:05:00Z"}]},
        ]}
        md = od.render_markdown(state)
        self.assertIn("Total: 2 task(s)", md)
        self.assertIn("2 duplicate surfaces", md)
        self.assertIn("duplicate; resolved via 100-disp-a", md)

    def test_emit_writes_file(self):
        """End-to-end emit() writes the Markdown to the configured path."""
        tmpdir = Path(tempfile.mkdtemp(prefix="fnsr-od-emit-"))
        try:
            state_path = tmpdir / "state.jsonld"
            state_path.write_text(json.dumps({
                "tasks": [{"@id": "urn:t:x", "status": "awaiting_operator_decision",
                            "outputs": {"anchor_task": "urn:t:anchor",
                                        "options": ["A"], "recommendation": "do A",
                                        "diagnosis": "x"},
                            "history": []}]
            }), encoding="utf-8")
            out_path = tmpdir / "decisions.md"
            summary = od.emit(state_path, out_path)
            self.assertEqual(summary["pending_count"], 1)
            self.assertEqual(summary["anchors_count"], 1)
            self.assertTrue(summary["wrote_file"])
            self.assertTrue(out_path.exists())
            content = out_path.read_text(encoding="utf-8")
            self.assertIn("urn:t:anchor", content)
        finally:
            shutil.rmtree(tmpdir, ignore_errors=True)

    def test_emit_handles_unreadable_state(self):
        tmpdir = Path(tempfile.mkdtemp(prefix="fnsr-od-bad-"))
        try:
            state_path = tmpdir / "state.jsonld"
            state_path.write_text("not valid json{", encoding="utf-8")
            summary = od.emit(state_path)
            self.assertEqual(summary["pending_count"], 0)
            self.assertIn("error", summary)
        finally:
            shutil.rmtree(tmpdir, ignore_errors=True)


class TestStateAdminPendingCommand(unittest.TestCase):
    """state_admin pending invokes the renderer + writes the file."""

    def setUp(self):
        import state_admin
        self.state_admin = state_admin
        self.tmpdir = Path(tempfile.mkdtemp(prefix="fnsr-pending-cli-"))
        self.state_path = self.tmpdir / "state.jsonld"
        self.state_path.write_text(json.dumps({
            "tasks": [{
                "@id": "urn:t:dispatcher",
                "status": "awaiting_operator_decision",
                "outputs": {
                    "anchor_task": "urn:t:anchor",
                    "options": ["A", "B"],
                    "recommendation": "Pick A",
                    "diagnosis": "x",
                },
                "history": [],
            }]
        }), encoding="utf-8")

    def tearDown(self):
        shutil.rmtree(self.tmpdir, ignore_errors=True)

    def test_pending_command_writes_markdown_file(self):
        rc = self.state_admin.main([
            "--state-path", str(self.state_path),
            "pending",
        ])
        self.assertEqual(rc, 0)
        md_path = self.tmpdir / "fnsr.operator_decisions.md"
        self.assertTrue(md_path.exists())
        content = md_path.read_text(encoding="utf-8")
        self.assertIn("urn:t:anchor", content)


if __name__ == "__main__":
    unittest.main()
