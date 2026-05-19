"""Tests for v3.0 final substrate additions.

Covers:
- Anti-pattern enforcement primitive doc (third substrate primitive)
- _check_no_semantic_memory_mutation (second substrate-wide anti-pattern
  enforcement instance; semantic-memory immutability from retro turns)
- state_admin retro family: init, phase-transition, vote, archive,
  verify, list
- state_admin promote-candidate (deliberate Episodic→Semantic promotion
  audit event; FNSR-load-bearing)
- Retro audit chain integrity (RETRO_STATE.audit chained via hiri_sign)
- Retro phase specs are non-stub at v3.0 final
"""
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


# ---------- Anti-pattern enforcement primitive doc ----------------------

class TestAntiPatternEnforcementPrimitiveDoc(unittest.TestCase):
    @property
    def doc_path(self):
        return (Path(__file__).resolve().parent.parent
                / "surfaces" / "_primitives"
                / "anti-pattern-enforcement.md")

    def test_doc_exists(self):
        self.assertTrue(self.doc_path.exists(),
                         "Anti-pattern enforcement primitive doc must exist")

    def test_doc_declares_metadata(self):
        text = self.doc_path.read_text(encoding="utf-8")
        fm = d._parse_category_frontmatter(text)
        self.assertEqual(fm["primitive_id"], "anti-pattern-enforcement")
        self.assertEqual(fm["introduced_in"], "v3.0 (final)")

    def test_doc_specifies_three_structural_properties(self):
        text = self.doc_path.read_text(encoding="utf-8")
        # The three structural properties MUST be enumerated
        self.assertIn("Forbidden behavior is named at the LLM-output level",
                       text)
        self.assertIn("A deterministic detector exists", text)
        self.assertIn("The detection fires as a structured-error veto", text)

    def test_doc_lists_first_explicit_instance(self):
        text = self.doc_path.read_text(encoding="utf-8")
        self.assertIn("retro-surface anti-pattern framework", text)
        # Must reference the canonical retro anti-patterns by name
        self.assertIn("_check_no_persona_theater", text)
        self.assertIn("_check_no_redundant_affirmation", text)
        self.assertIn("_check_no_freeform_brainstorm", text)
        self.assertIn("_check_no_semantic_memory_mutation", text)


# ---------- Semantic memory immutability check --------------------------

class TestSemanticMemoryImmutabilityCheck(unittest.TestCase):
    """Per surfaces/_primitives/episodic-to-semantic-promotion.md +
    surfaces/_primitives/anti-pattern-enforcement.md (second substrate-wide
    anti-pattern instance). Retro-surface tasks cannot mutate canonical
    semantic-memory paths directly; promotion goes through the
    deliberate ratification chain."""

    def test_helper_recognizes_exact_paths(self):
        for path in ("CLAUDE.md", "PLAYBOOK.md",
                      "project/DECISIONS.md", "project/SPEC.md",
                      "project/ROADMAP.md", "project/IMPLEMENTATION_PLAN.md"):
            self.assertTrue(d._is_semantic_memory_path(path),
                             f"{path} should be semantic-memory")

    def test_helper_recognizes_prefixes(self):
        for path in ("surfaces/retro/surface-spec.md",
                      ".claude/agents/developer.md",
                      "project/Routing/FNSR_Protocol_Spec_03.md",
                      "arc/some-doc.md",
                      "surfaces/_primitives/bounded-authority-orchestrator.md"):
            self.assertTrue(d._is_semantic_memory_path(path),
                             f"{path} should be semantic-memory")

    def test_helper_rejects_non_semantic_paths(self):
        for path in ("src/kernel/transform.ts",
                      "tests/test_routing.py",
                      "examples/event-normalization/input.jsonld",
                      "fnsr_daemon.py"):
            self.assertFalse(d._is_semantic_memory_path(path),
                              f"{path} should NOT be semantic-memory")

    def test_helper_handles_windows_separators(self):
        self.assertTrue(d._is_semantic_memory_path(
            "project\\DECISIONS.md"))
        self.assertTrue(d._is_semantic_memory_path(
            "surfaces\\retro\\surface-spec.md"))

    def test_retro_task_writing_to_semantic_memory_vetoes(self):
        task = {
            "@id": "urn:fnsr:task:retro-bad",
            "agent": "developer",
            "inputs": {"surface": "retro"},
        }
        outputs = {
            "changes": [{
                "file": "PLAYBOOK.md",
                "before": "old text",
                "after": "Retro proposes new failure-mode entry inline.",
            }],
            "summary": "Direct retro write — should be refused.",
            "self_assessment": "test",
        }
        with self.assertRaises(d.ContainmentVeto) as ctx:
            d._check_no_semantic_memory_mutation(task, outputs)
        self.assertIn("semantic_memory_immutable_from_retro",
                       str(ctx.exception))

    def test_non_retro_task_passes(self):
        # Same outputs, but task is NOT retro-surface. The standard
        # ratification chain handles semantic-memory mutations.
        task = {
            "@id": "urn:fnsr:task:normal",
            "agent": "developer",
            "inputs": {},
        }
        outputs = {
            "changes": [{
                "file": "PLAYBOOK.md",
                "before": "x",
                "after": "Normal commit-finalize chain edit.",
            }],
            "summary": "via ratification chain",
            "self_assessment": "ok",
        }
        # MUST NOT raise — non-retro tasks pass through
        d._check_no_semantic_memory_mutation(task, outputs)

    def test_retro_task_with_non_semantic_changes_passes(self):
        task = {
            "@id": "urn:fnsr:task:retro-ok",
            "agent": "developer",
            "inputs": {"surface": "retro"},
        }
        outputs = {
            "changes": [{
                "file": "src/some-impl.ts",
                "before": "x",
                "after": "y",
            }],
            "summary": "non-semantic path; ok",
            "self_assessment": "ok",
        }
        d._check_no_semantic_memory_mutation(task, outputs)

    def test_outputs_without_changes_pass(self):
        # Many retro outputs don't have a `changes` field
        # (proposed_issues, votes, etc.) — they must pass through.
        task = {"inputs": {"surface": "retro"}, "agent": "qa"}
        outputs = {
            "proposed_issues": [{"id": "QA-1", "title": "x"}],
            "summary": "ok", "evidence_paths": [],
        }
        d._check_no_semantic_memory_mutation(task, outputs)

    def test_cps_check_dispatches_for_retro_surface(self):
        """Integration: cps_check fires _check_no_semantic_memory_mutation
        for retro-surface tasks but not for non-retro tasks."""
        retro_task = {
            "@id": "urn:fnsr:task:retro",
            "agent": "developer",
            "inputs": {"surface": "retro"},
        }
        bad_outputs = {
            "changes": [{"file": "PLAYBOOK.md", "before": "x", "after": "y"}],
            "summary": "x", "self_assessment": "x",
        }
        # required_outputs for developer agent declares changes/summary/
        # self_assessment as required — so the structured-error path
        # will fire on semantic_memory_immutable_from_retro since
        # required_outputs are all present.
        with self.assertRaises(d.ContainmentVeto) as ctx:
            d.cps_check(retro_task, bad_outputs)
        self.assertIn("semantic_memory_immutable_from_retro",
                       str(ctx.exception))


# ---------- state_admin retro family ------------------------------------

class TestStateAdminRetroFamily(unittest.TestCase):
    def setUp(self):
        self.tmpdir = Path(tempfile.mkdtemp(prefix="fnsr-retro-"))
        self.retros_dir = self.tmpdir / "retros"
        self.archive_dir = self.tmpdir / "archive" / "retrospectives"
        # Provide a state.jsonld for promote-candidate to anchor against
        self.state_path = self.tmpdir / "state.jsonld"
        self.state_path.write_text(json.dumps({
            "@context": "https://fnsr.example/context.jsonld",
            "@id": "urn:fnsr:run:test",
            "tasks": [{
                "@id": "urn:fnsr:task:anchor",
                "agent": "developer",
                "status": "done",
                "attempts": 1,
                "outputs": {"x": 1},
                "depends_on": [],
                "history": [{
                    "event": "completed", "payload": {},
                    "prev_hash": "0" * 64, "chain_hash": "a" * 64,
                }],
            }],
        }, indent=2), encoding="utf-8")

    def tearDown(self):
        shutil.rmtree(self.tmpdir, ignore_errors=True)

    def _run(self, argv):
        return state_admin.main(argv)

    def _retro_init(self, retro_id="r1"):
        return self._run([
            "--state-path", str(self.state_path),
            "retro", "init", retro_id,
            "--anchor-task", "urn:fnsr:task:anchor",
            "--phase-origin", "phase-1",
            "--retros-dir", str(self.retros_dir),
        ])

    def _load_retro(self, retro_id="r1"):
        p = self.retros_dir / retro_id / "RETRO_STATE.jsonld"
        return json.loads(p.read_text(encoding="utf-8"))

    def test_init_creates_state_file_with_audit_entry(self):
        rc = self._retro_init("r1")
        self.assertEqual(rc, 0)
        state = self._load_retro("r1")
        self.assertEqual(state["retro"]["id"], "r1")
        self.assertEqual(state["retro"]["phase"], "01-gathering")
        self.assertEqual(state["retro"]["status"], "active")
        self.assertEqual(state["retro"]["anchor_task"],
                          "urn:fnsr:task:anchor")
        self.assertEqual(state["retro"]["phase_origin"], "phase-1")
        self.assertEqual(state["retro"]["version"], 1)
        self.assertEqual(len(state["audit"]), 1)
        self.assertEqual(state["audit"][0]["event"], "retro_initialized")
        self.assertEqual(state["audit"][0]["prev_hash"], "0" * 64)

    def test_init_refuses_duplicate(self):
        self._retro_init("r1")
        rc = self._retro_init("r1")
        self.assertEqual(rc, 1)

    def test_phase_transition_commits(self):
        self._retro_init("r1")
        rc = self._run([
            "--state-path", str(self.state_path),
            "retro", "phase-transition", "r1",
            "--to-phase", "02-merge",
            "--rationale", "Phase 1 complete; all roles responded.",
            "--retros-dir", str(self.retros_dir),
        ])
        self.assertEqual(rc, 0)
        state = self._load_retro("r1")
        self.assertEqual(state["retro"]["phase"], "02-merge")
        self.assertEqual(state["retro"]["version"], 2)
        self.assertEqual(state["audit"][-1]["event"],
                          "phase_transition_committed")
        # Chain integrity
        self.assertEqual(state["audit"][1]["prev_hash"],
                          state["audit"][0]["chain_hash"])

    def test_phase_transition_requires_rationale(self):
        self._retro_init("r1")
        # The argparse layer makes --rationale required, but the cmd
        # function itself defends against whitespace-only rationale.
        # We exercise the cmd layer directly with empty rationale.
        import argparse
        ns = argparse.Namespace(
            retro_id="r1", to_phase="02-merge",
            transition_kind="advance", rationale="   ",
            proposing_task=None, notes=None, operator="operator",
            retros_dir=str(self.retros_dir),
        )
        rc = state_admin.cmd_retro_phase_transition(ns)
        self.assertEqual(rc, 1)

    def test_phase_transition_refuses_noop_advance(self):
        self._retro_init("r1")
        rc = self._run([
            "--state-path", str(self.state_path),
            "retro", "phase-transition", "r1",
            "--to-phase", "01-gathering",  # same phase
            "--rationale", "test",
            "--retros-dir", str(self.retros_dir),
        ])
        self.assertEqual(rc, 1)

    def test_vote_records_audit_event_and_section_entry(self):
        self._retro_init("r1")
        rc = self._run([
            "--state-path", str(self.state_path),
            "retro", "vote", "r1",
            "--issue-id", "I1",
            "--voter", "@QA",
            "--vote", "confirm",
            "--rationale", "Test coverage gap observed.",
            "--retros-dir", str(self.retros_dir),
        ])
        self.assertEqual(rc, 0)
        state = self._load_retro("r1")
        self.assertEqual(len(state["votes"]), 1)
        v = state["votes"][0]
        self.assertEqual(v["issue_id"], "I1")
        self.assertEqual(v["voter"], "@QA")
        self.assertEqual(v["vote"], "confirm")
        self.assertEqual(state["audit"][-1]["event"], "vote_recorded")

    def test_vote_contest_requires_rationale(self):
        self._retro_init("r1")
        import argparse
        ns = argparse.Namespace(
            retro_id="r1", issue_id="I1", voter="@QA",
            vote="contest", rationale=None,
            retros_dir=str(self.retros_dir), operator="operator",
        )
        rc = state_admin.cmd_retro_vote(ns)
        self.assertEqual(rc, 1)

    def test_archive_promotes_to_episodic_and_marks_active_archived(self):
        self._retro_init("r1")
        rc = self._run([
            "--state-path", str(self.state_path),
            "retro", "archive", "r1",
            "--retros-dir", str(self.retros_dir),
            "--archive-path", str(self.archive_dir),
        ])
        self.assertEqual(rc, 0)
        # Active state file should be marked archived
        active = self._load_retro("r1")
        self.assertEqual(active["retro"]["status"], "archived")
        self.assertIn("archived_at", active["retro"])
        # Archive copy must exist
        archive_path = self.archive_dir / "r1.jsonld"
        self.assertTrue(archive_path.exists())
        archived = json.loads(archive_path.read_text(encoding="utf-8"))
        self.assertEqual(archived["retro"]["status"], "archived")
        # Last audit entry on active state is retro_archived
        self.assertEqual(active["audit"][-1]["event"], "retro_archived")

    def test_archive_refuses_already_archived(self):
        self._retro_init("r1")
        self._run([
            "--state-path", str(self.state_path),
            "retro", "archive", "r1",
            "--retros-dir", str(self.retros_dir),
            "--archive-path", str(self.archive_dir),
        ])
        rc = self._run([
            "--state-path", str(self.state_path),
            "retro", "archive", "r1",
            "--retros-dir", str(self.retros_dir),
            "--archive-path", str(self.archive_dir),
        ])
        self.assertEqual(rc, 1)

    def test_verify_passes_on_clean_chain(self):
        self._retro_init("r1")
        self._run([
            "--state-path", str(self.state_path),
            "retro", "phase-transition", "r1",
            "--to-phase", "02-merge",
            "--rationale", "test",
            "--retros-dir", str(self.retros_dir),
        ])
        rc = self._run([
            "--state-path", str(self.state_path),
            "retro", "verify", "r1",
            "--retros-dir", str(self.retros_dir),
            "--quiet",
        ])
        self.assertEqual(rc, 0)

    def test_verify_detects_tampered_chain(self):
        self._retro_init("r1")
        # Tamper: rewrite the first audit entry's payload
        retro_path = self.retros_dir / "r1" / "RETRO_STATE.jsonld"
        state = json.loads(retro_path.read_text(encoding="utf-8"))
        state["audit"][0]["payload"]["retro_id"] = "tampered"
        retro_path.write_text(json.dumps(state, indent=2), encoding="utf-8")
        rc = self._run([
            "--state-path", str(self.state_path),
            "retro", "verify", "r1",
            "--retros-dir", str(self.retros_dir),
            "--quiet",
        ])
        self.assertEqual(rc, 1)

    def test_list_finds_active_retros(self):
        self._retro_init("r1")
        self._retro_init("r2")
        # cmd_retro_list prints to stdout; just verify it returns 0
        rc = self._run([
            "--state-path", str(self.state_path),
            "retro", "list",
            "--retros-dir", str(self.retros_dir),
        ])
        self.assertEqual(rc, 0)

    def test_list_includes_archived_when_requested(self):
        self._retro_init("r1")
        self._run([
            "--state-path", str(self.state_path),
            "retro", "archive", "r1",
            "--retros-dir", str(self.retros_dir),
            "--archive-path", str(self.archive_dir),
        ])
        rc = self._run([
            "--state-path", str(self.state_path),
            "retro", "list",
            "--include-archived",
            "--retros-dir", str(self.retros_dir),
            "--archive-path", str(self.archive_dir),
        ])
        self.assertEqual(rc, 0)


# ---------- promote-candidate (E→S deliberate-promotion event) ----------

class TestPromoteCandidateCommand(unittest.TestCase):
    def setUp(self):
        self.tmpdir = Path(tempfile.mkdtemp(prefix="fnsr-promote-"))
        self.retros_dir = self.tmpdir / "retros"
        self.state_path = self.tmpdir / "state.jsonld"
        self.state_path.write_text(json.dumps({
            "@context": "https://fnsr.example/context.jsonld",
            "@id": "urn:fnsr:run:test",
            "tasks": [{
                "@id": "urn:fnsr:task:anchor",
                "agent": "developer",
                "status": "done",
                "attempts": 1,
                "outputs": {"x": 1},
                "depends_on": [],
                "history": [{
                    "event": "completed", "payload": {},
                    "prev_hash": "0" * 64, "chain_hash": "a" * 64,
                }],
            }],
        }, indent=2), encoding="utf-8")
        # Seed a retro so --from-retro resolves to the anchor task
        state_admin.main([
            "--state-path", str(self.state_path),
            "retro", "init", "r1",
            "--anchor-task", "urn:fnsr:task:anchor",
            "--phase-origin", "phase-1",
            "--retros-dir", str(self.retros_dir),
        ])

    def tearDown(self):
        shutil.rmtree(self.tmpdir, ignore_errors=True)

    def _state(self):
        return json.loads(self.state_path.read_text(encoding="utf-8"))

    def test_promote_emits_forward_track_with_deliberate_promotion_flag(self):
        rc = state_admin.main([
            "--state-path", str(self.state_path),
            "promote-candidate",
            "--candidate-id", "PC1",
            "--to-semantic", "PLAYBOOK.md",
            "--promotion-rationale",
            "Pattern observed across multiple retros warrants PLAYBOOK entry.",
            "--from-retro", "r1",
            "--retros-dir", str(self.retros_dir),
        ])
        self.assertEqual(rc, 0)
        state = self._state()
        anchor = state["tasks"][0]
        # The promotion event is the last history entry on the anchor task
        last = anchor["history"][-1]
        self.assertEqual(last["event"], "forward_track")
        p = last["payload"]
        self.assertEqual(p["subject"]["type"], "candidacy")
        self.assertEqual(p["subject"]["id"], "PC1")
        self.assertEqual(p["to_semantic"], "PLAYBOOK.md")
        self.assertEqual(p["from_episodic"], "r1")
        self.assertEqual(p["declaration_kind"],
                          "operator_deliberate_promotion")
        # surfacing_task_id provenance recorded (defaults to anchor)
        self.assertEqual(p["surfacing_task_id"], "urn:fnsr:task:anchor")
        # Spec 07 forward-track fields present (consumed by list/aging)
        self.assertEqual(p["state"], "A")
        self.assertEqual(p["sub_surface"],
                          "internal-methodology-refinement")

    def test_promote_requires_rationale(self):
        # Argparse makes --promotion-rationale required, but the cmd
        # function defends against whitespace-only rationale.
        import argparse
        ns = argparse.Namespace(
            candidate_id="PC1",
            to_semantic="PLAYBOOK.md",
            promotion_rationale="   ",
            from_retro="r1",
            anchor_task=None,
            surfacing_task_id=None,
            description=None,
            deliberation_cycle=None,
            phase_origin=None,
            ft_id=None,
            retros_dir=str(self.retros_dir),
            state_path=str(self.state_path),
            operator="operator",
        )
        rc = state_admin.cmd_promote_candidate(ns)
        self.assertEqual(rc, 1)

    def test_promote_refuses_when_no_anchor_resolvable(self):
        # No --from-retro AND no --anchor-task; substrate cannot pick
        # an anchor task for the audit event.
        import argparse
        ns = argparse.Namespace(
            candidate_id="PC1",
            to_semantic="PLAYBOOK.md",
            promotion_rationale="legitimate rationale",
            from_retro=None,
            anchor_task=None,
            surfacing_task_id=None,
            description=None,
            deliberation_cycle=None,
            phase_origin=None,
            ft_id=None,
            retros_dir=str(self.retros_dir),
            state_path=str(self.state_path),
            operator="operator",
        )
        rc = state_admin.cmd_promote_candidate(ns)
        self.assertEqual(rc, 1)

    def test_promote_with_explicit_anchor_task(self):
        rc = state_admin.main([
            "--state-path", str(self.state_path),
            "promote-candidate",
            "--candidate-id", "PC2",
            "--to-semantic", "project/DECISIONS.md",
            "--promotion-rationale", "ADR-worthy.",
            "--anchor-task", "urn:fnsr:task:anchor",
            "--retros-dir", str(self.retros_dir),
        ])
        self.assertEqual(rc, 0)
        state = self._state()
        anchor = state["tasks"][0]
        last = anchor["history"][-1]
        self.assertEqual(last["payload"]["subject"]["id"], "PC2")
        # No --from-retro provided; from_episodic should be None
        self.assertIsNone(last["payload"]["from_episodic"])


# ---------- Retro phase specs at v3.0 final -----------------------------

class TestRetroPhaseSpecsFinalized(unittest.TestCase):
    """All 6 retro phase specs declare status=v3.0 final (not stubs) and
    enumerate per-role permitted_sections."""

    @property
    def phases_dir(self):
        return (Path(__file__).resolve().parent.parent
                / "surfaces" / "retro" / "phases")

    def test_all_six_phases_present(self):
        files = sorted(self.phases_dir.glob("*.md"))
        names = [f.name for f in files]
        for expected in ("01-gathering.md", "02-merge.md", "03-analysis.md",
                          "04-consensus.md", "05-actions.md",
                          "06-compression.md"):
            self.assertIn(expected, names)

    def test_all_phases_non_stub(self):
        for path in self.phases_dir.glob("*.md"):
            text = path.read_text(encoding="utf-8")
            fm = d._parse_category_frontmatter(text)
            self.assertEqual(
                fm.get("status"), "v3.0 final",
                f"{path.name} must declare status: v3.0 final "
                f"(not stub)"
            )

    def test_all_phases_declare_permitted_sections_table(self):
        # Every v3.0-final phase spec must enumerate per-role permissions.
        for path in self.phases_dir.glob("*.md"):
            text = path.read_text(encoding="utf-8")
            self.assertIn(
                "Per-role permitted_sections", text,
                f"{path.name} must declare per-role permitted_sections"
            )


if __name__ == "__main__":
    unittest.main()
