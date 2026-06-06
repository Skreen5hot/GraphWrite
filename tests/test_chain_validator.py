"""Tests for fnsr_chain_validator predicates + state_admin verify-chain integration.

Each predicate test mirrors a real cascade from the 2026-05 GraphWrite
session that the validator should have prevented:
  PRED-1 -> Round 5 v2 cascade (applier source not in deps)
  PRED-2 -> Round 5 v4 cascade (Windows bare npm)
  PRED-3 -> Round 5 v5 cascade (deps to abandoned tasks)
  PRED-4 -> architect missing inputs.mode (Spec 03 contract)
  PRED-5 -> @id collisions (intra-chain or vs state)
  PRED-6 -> circular dep theoretical
"""
import json
import os
import platform
import shutil
import sys
import tempfile
import unittest
from pathlib import Path

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))
import fnsr_chain_validator as v
import state_admin


class TestChainValidatorPredicates(unittest.TestCase):

    def _state_with(self, tasks):
        return {"tasks": tasks}

    # ---- PRED-1 ----
    def test_pred1_fires_when_applier_missing_source(self):
        chain = [{
            "@id": "urn:t:apply",
            "agent": "applier",
            "depends_on": ["urn:t:rat"],  # missing source dev task
            "inputs": {"source_task": "urn:t:dev"},
        }]
        findings = v.pred_1_applier_source_in_depends(chain, self._state_with([]))
        self.assertEqual(len(findings), 1)
        self.assertEqual(findings[0]["severity"], "error")
        self.assertEqual(findings[0]["predicate_id"], "pred-1-applier-source-in-depends")

    def test_pred1_passes_when_source_in_deps(self):
        chain = [{
            "@id": "urn:t:apply",
            "agent": "applier",
            "depends_on": ["urn:t:rat", "urn:t:dev"],
            "inputs": {"source_task": "urn:t:dev"},
        }]
        findings = v.pred_1_applier_source_in_depends(chain, self._state_with([]))
        self.assertEqual(findings, [])

    def test_pred1_ignores_non_applier(self):
        chain = [{
            "@id": "urn:t:dev",
            "agent": "developer",
            "depends_on": [],
            "inputs": {"source_task": "urn:t:other"},
        }]
        findings = v.pred_1_applier_source_in_depends(chain, self._state_with([]))
        self.assertEqual(findings, [])

    # ---- PRED-2 ----
    @unittest.skipUnless(platform.system() == "Windows", "Windows-only predicate")
    def test_pred2_fires_on_bare_npm_windows(self):
        chain = [{
            "@id": "urn:t:test",
            "agent": "test-runner",
            "inputs": {"cmd": "npm test"},
        }]
        findings = v.pred_2_windows_npm_bare(chain, self._state_with([]))
        self.assertEqual(len(findings), 1)
        self.assertEqual(findings[0]["severity"], "error")

    @unittest.skipUnless(platform.system() == "Windows", "Windows-only predicate")
    def test_pred2_passes_on_absolute_npm_cmd(self):
        chain = [{
            "@id": "urn:t:test",
            "agent": "test-runner",
            "inputs": {"cmd": '"C:/Program Files/nodejs/npm.cmd" test'},
        }]
        findings = v.pred_2_windows_npm_bare(chain, self._state_with([]))
        self.assertEqual(findings, [])

    # ---- PRED-3 ----
    def test_pred3_fires_on_dep_to_blocked_task(self):
        chain = [{
            "@id": "urn:t:new",
            "agent": "developer",
            "depends_on": ["urn:t:old"],
        }]
        state = self._state_with([{"@id": "urn:t:old", "status": "blocked"}])
        findings = v.pred_3_deps_alive(chain, state)
        self.assertEqual(len(findings), 1)
        self.assertEqual(findings[0]["evidence"]["dep_status"], "blocked")

    def test_pred3_fires_on_missing_dep(self):
        chain = [{
            "@id": "urn:t:new",
            "agent": "developer",
            "depends_on": ["urn:t:nonexistent"],
        }]
        findings = v.pred_3_deps_alive(chain, self._state_with([]))
        self.assertEqual(len(findings), 1)
        self.assertIn("missing_dep_id", findings[0]["evidence"])

    def test_pred3_passes_when_dep_in_chain(self):
        chain = [
            {"@id": "urn:t:a", "agent": "dev"},
            {"@id": "urn:t:b", "agent": "dev", "depends_on": ["urn:t:a"]},
        ]
        findings = v.pred_3_deps_alive(chain, self._state_with([]))
        self.assertEqual(findings, [])

    def test_pred3_passes_when_dep_alive_in_state(self):
        chain = [{
            "@id": "urn:t:new",
            "agent": "dev",
            "depends_on": ["urn:t:existing"],
        }]
        state = self._state_with([{"@id": "urn:t:existing", "status": "done"}])
        findings = v.pred_3_deps_alive(chain, state)
        self.assertEqual(findings, [])

    # ---- PRED-4 ----
    def test_pred4_fires_when_architect_missing_mode(self):
        chain = [{
            "@id": "urn:t:arch",
            "agent": "architect",
            "inputs": {},
        }]
        findings = v.pred_4_required_inputs(chain, self._state_with([]))
        self.assertEqual(len(findings), 1)
        self.assertEqual(findings[0]["evidence"]["missing_field"], "inputs.mode")

    def test_pred4_passes_when_architect_has_mode(self):
        chain = [{
            "@id": "urn:t:arch",
            "agent": "architect",
            "inputs": {"mode": "ratification"},
        }]
        findings = v.pred_4_required_inputs(chain, self._state_with([]))
        self.assertEqual(findings, [])

    def test_pred4_fires_when_applier_missing_source_task(self):
        chain = [{
            "@id": "urn:t:apply",
            "agent": "applier",
            "inputs": {},
        }]
        findings = v.pred_4_required_inputs(chain, self._state_with([]))
        self.assertEqual(len(findings), 1)
        self.assertEqual(findings[0]["evidence"]["missing_field"], "inputs.source_task")

    # ---- PRED-5 ----
    def test_pred5_fires_on_intra_chain_collision(self):
        chain = [
            {"@id": "urn:t:a", "agent": "dev"},
            {"@id": "urn:t:a", "agent": "applier"},
        ]
        findings = v.pred_5_no_id_collisions(chain, self._state_with([]))
        self.assertEqual(len(findings), 1)
        self.assertIn("another task in this chain",
                       findings[0]["evidence"]["collides_with"])

    def test_pred5_fires_on_state_collision(self):
        chain = [{"@id": "urn:t:existing", "agent": "dev"}]
        state = self._state_with([{"@id": "urn:t:existing", "status": "done"}])
        findings = v.pred_5_no_id_collisions(chain, state)
        self.assertEqual(len(findings), 1)
        self.assertIn("existing state.jsonld",
                       findings[0]["evidence"]["collides_with"])

    def test_pred5_fires_on_missing_id(self):
        chain = [{"agent": "dev"}]  # missing @id
        findings = v.pred_5_no_id_collisions(chain, self._state_with([]))
        self.assertEqual(len(findings), 1)

    # ---- PRED-6 ----
    def test_pred6_fires_on_two_node_cycle(self):
        chain = [
            {"@id": "urn:t:a", "agent": "dev", "depends_on": ["urn:t:b"]},
            {"@id": "urn:t:b", "agent": "dev", "depends_on": ["urn:t:a"]},
        ]
        findings = v.pred_6_no_circular_deps(chain, self._state_with([]))
        self.assertGreaterEqual(len(findings), 1)
        self.assertEqual(findings[0]["predicate_id"], "pred-6-no-circular-deps")

    def test_pred6_passes_on_dag(self):
        chain = [
            {"@id": "urn:t:a", "agent": "dev"},
            {"@id": "urn:t:b", "agent": "dev", "depends_on": ["urn:t:a"]},
            {"@id": "urn:t:c", "agent": "dev", "depends_on": ["urn:t:b"]},
        ]
        findings = v.pred_6_no_circular_deps(chain, self._state_with([]))
        self.assertEqual(findings, [])

    # ---- PRED-7: operator-authored golden for format-spec targets ----
    def test_pred7_fires_when_emit_target_lacks_golden_path(self):
        """v3.9.0 (ADR-012): developer targeting src/emit/** MUST set
        inputs.operator_golden_path. Closes the prose-spec-drifts gap
        per the Phase 4 Mermaid review cycle."""
        chain = [{
            "@id": "urn:t:dev",
            "agent": "developer",
            "inputs": {
                "target_paths": ["src/emit/mermaid.ts"],
                # operator_golden_path INTENTIONALLY MISSING
            },
        }]
        findings = v.pred_7_operator_golden_for_format_spec(
            chain, self._state_with([]))
        self.assertEqual(len(findings), 1)
        self.assertEqual(findings[0]["predicate_id"],
                          "pred-7-operator-golden-for-format-spec")
        self.assertEqual(findings[0]["severity"], "error")

    def test_pred7_fires_on_purpose_substring_too(self):
        """Fallback detection: purpose text mentioning src/emit triggers."""
        chain = [{
            "@id": "urn:t:dev",
            "agent": "developer",
            "inputs": {
                "purpose": "Update src/emit/turtle.ts emit ordering...",
            },
        }]
        findings = v.pred_7_operator_golden_for_format_spec(
            chain, self._state_with([]))
        self.assertEqual(len(findings), 1)

    def test_pred7_passes_when_golden_path_declared(self):
        chain = [{
            "@id": "urn:t:dev",
            "agent": "developer",
            "inputs": {
                "target_paths": ["src/emit/mermaid.ts"],
                "operator_golden_path": "test/golden/mermaid-aaron-spec.mmd",
            },
        }]
        findings = v.pred_7_operator_golden_for_format_spec(
            chain, self._state_with([]))
        self.assertEqual(findings, [])

    def test_pred7_passes_on_non_format_targets(self):
        """Developer task targeting unrelated paths must not require golden."""
        chain = [{
            "@id": "urn:t:dev",
            "agent": "developer",
            "inputs": {"target_paths": ["src/kernel/transform.ts"]},
        }]
        findings = v.pred_7_operator_golden_for_format_spec(
            chain, self._state_with([]))
        self.assertEqual(findings, [])

    def test_pred7_validate_chain_full_report_carries_error(self):
        """End-to-end: validate_chain includes PRED-7 in PREDICATES;
        a violating chain receives an error finding in the full report."""
        chain = [{
            "@id": "urn:t:dev",
            "agent": "developer",
            "inputs": {"target_paths": ["src/validate/codes.ts"]},
        }]
        report = v.validate_chain(chain, self._state_with([]))
        self.assertEqual(report["verdict"], "FAIL")
        pred_ids = {f["predicate_id"] for f in report["findings"]}
        self.assertIn("pred-7-operator-golden-for-format-spec", pred_ids)

    # ---- Full validator ----
    def test_validate_chain_returns_pass_on_clean(self):
        chain = [
            {"@id": "urn:t:dev", "agent": "developer"},
            {"@id": "urn:t:arch", "agent": "architect",
             "inputs": {"mode": "ratification"},
             "depends_on": ["urn:t:dev"]},
            {"@id": "urn:t:app", "agent": "applier",
             "inputs": {"source_task": "urn:t:dev"},
             "depends_on": ["urn:t:dev", "urn:t:arch"]},
        ]
        report = v.validate_chain(chain, self._state_with([]))
        self.assertEqual(report["verdict"], "PASS")
        self.assertEqual(report["severity_counts"]["error"], 0)

    def test_validate_chain_aggregates_failures(self):
        chain = [
            # Multiple defects in one chain
            {"@id": "urn:t:dup", "agent": "dev"},
            {"@id": "urn:t:dup", "agent": "applier",  # collision
             "inputs": {"source_task": "urn:t:missing"},  # source not in deps
             "depends_on": []},
        ]
        report = v.validate_chain(chain, self._state_with([]))
        self.assertEqual(report["verdict"], "FAIL")
        self.assertGreaterEqual(report["severity_counts"]["error"], 2)


class TestStateAdminVerifyChainIntegration(unittest.TestCase):

    def setUp(self):
        self.tmpdir = Path(tempfile.mkdtemp(prefix="fnsr-vchain-"))
        self.state_path = self.tmpdir / "state.jsonld"
        self.state_path.write_text(json.dumps({
            "@context": "https://fnsr.example/context.jsonld",
            "@id": "urn:fnsr:run:test",
            "tasks": [],
        }), encoding="utf-8")

    def tearDown(self):
        shutil.rmtree(self.tmpdir, ignore_errors=True)

    def test_verify_chain_command_pass(self):
        chain_path = self.tmpdir / "clean.json"
        chain_path.write_text(json.dumps([
            {"@id": "urn:t:dev", "agent": "developer"},
        ]), encoding="utf-8")
        rc = state_admin.main([
            "--state-path", str(self.state_path),
            "verify-chain", str(chain_path),
        ])
        self.assertEqual(rc, 0)

    def test_verify_chain_command_fail(self):
        chain_path = self.tmpdir / "bad.json"
        chain_path.write_text(json.dumps([
            {"@id": "urn:t:apply", "agent": "applier",
             "inputs": {"source_task": "urn:t:dev"},
             "depends_on": []},
        ]), encoding="utf-8")
        rc = state_admin.main([
            "--state-path", str(self.state_path),
            "verify-chain", str(chain_path),
        ])
        self.assertEqual(rc, 1)

    def test_append_tasks_verify_first_refuses_bad_chain(self):
        chain_path = self.tmpdir / "bad.json"
        chain_path.write_text(json.dumps([
            {"@id": "urn:t:apply", "agent": "applier",
             "inputs": {"source_task": "urn:t:dev"},
             "depends_on": []},  # pred-1 violation
        ]), encoding="utf-8")
        rc = state_admin.main([
            "--state-path", str(self.state_path),
            "append-tasks", str(chain_path), "--verify-first",
        ])
        self.assertEqual(rc, 2)
        # State should be unchanged (no append)
        state = json.loads(self.state_path.read_text(encoding="utf-8"))
        self.assertEqual(len(state["tasks"]), 0)

    def test_append_tasks_verify_first_allows_clean_chain(self):
        chain_path = self.tmpdir / "clean.json"
        chain_path.write_text(json.dumps([
            {"@id": "urn:t:dev", "agent": "developer"},
        ]), encoding="utf-8")
        rc = state_admin.main([
            "--state-path", str(self.state_path),
            "append-tasks", str(chain_path), "--verify-first",
        ])
        self.assertEqual(rc, 0)
        state = json.loads(self.state_path.read_text(encoding="utf-8"))
        self.assertEqual(len(state["tasks"]), 1)

    def test_append_tasks_without_verify_first_still_works(self):
        # Backward compat: default flow unchanged
        chain_path = self.tmpdir / "bad.json"
        chain_path.write_text(json.dumps([
            {"@id": "urn:t:apply", "agent": "applier",
             "inputs": {"source_task": "urn:t:dev"},
             "depends_on": []},
        ]), encoding="utf-8")
        rc = state_admin.main([
            "--state-path", str(self.state_path),
            "append-tasks", str(chain_path),
        ])
        # Append succeeds (backward compat); validator only runs on opt-in
        self.assertEqual(rc, 0)


if __name__ == "__main__":
    unittest.main()
