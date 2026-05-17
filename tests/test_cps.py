import os
import sys
import unittest

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))
import fnsr_daemon as d


class TestCpsCheck(unittest.TestCase):
    def test_null_vetoes(self):
        with self.assertRaises(d.ContainmentVeto):
            d.cps_check({"agent": "spec-reviewer"}, None)

    def test_structured_error_vetoes(self):
        with self.assertRaises(d.ContainmentVeto):
            d.cps_check({"agent": "spec-reviewer"},
                        {"error": "insufficient_inputs", "needed": []})

    def test_error_null_value_passes(self):
        # error: None is legitimate uniform-schema; treat as not-error.
        d.cps_check({"agent": "nonexistent"},
                    {"random": "x", "error": None})

    def test_error_empty_string_passes(self):
        d.cps_check({"agent": "nonexistent"},
                    {"random": "x", "error": ""})

    def test_missing_required_key_vetoes(self):
        with self.assertRaises(d.ContainmentVeto):
            # spec-reviewer requires findings, summary, recommendation
            d.cps_check({"agent": "spec-reviewer"},
                        {"findings": [], "summary": "x"})

    def test_valid_full_outputs_pass(self):
        d.cps_check({"agent": "spec-reviewer"},
                    {"findings": [], "summary": "x",
                     "recommendation": "accept"})

    def test_applier_required_keys(self):
        d.cps_check({"agent": "applier"},
                    {"applied": [], "failed": [], "summary": "0 applied"})

    def test_unknown_agent_no_required_check(self):
        # No .md file => no required_outputs => only null/error checks apply.
        d.cps_check({"agent": "nonexistent"}, {"anything": "goes"})


class TestRequiredOutputsParsing(unittest.TestCase):
    def test_spec_reviewer(self):
        self.assertEqual(d._agent_required_outputs("spec-reviewer"),
                         ["findings", "summary", "recommendation"])

    def test_developer(self):
        self.assertEqual(d._agent_required_outputs("developer"),
                         ["changes", "summary", "self_assessment"])

    def test_applier_system_agent(self):
        self.assertEqual(d._agent_required_outputs("applier"),
                         ["applied", "failed", "summary"])

    def test_unknown_agent(self):
        self.assertEqual(d._agent_required_outputs("nonexistent"), [])


if __name__ == "__main__":
    unittest.main()
