"""Tests for v2.6.0 v2.6.0 additions:
- ADR-citation CPS check (registry parser + canonical-docs scoping)
- `awaiting_operator_decision` output-shape validation
"""
import os
import shutil
import sys
import tempfile
import unittest
from pathlib import Path

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))
import fnsr_daemon as d


SAMPLE_DECISIONS = """\
# Architecture Decision Records

## ADR-001: First decision

**Date:** 2026-05-15
**Decision:** Use the template.
**Context:** Need.
**Consequences:**
- Things follow.

---

## ADR-002: Second decision

**Date:** 2026-05-16
**Decision:** Excise §31 item 14.
**Context:** No second implementation planned.
**Consequences:**
- Phase 6 simpler.

---

## ADR-005: Skipped numbering on purpose

**Date:** 2026-05-17
**Decision:** Demonstrate non-contiguous numbering.
**Context:** Possible to skip.
**Consequences:**
- Registry handles this fine.
"""


class TestAdrRegistry(unittest.TestCase):
    def setUp(self):
        self.tmpdir = Path(tempfile.mkdtemp(prefix="fnsr-adr-test-"))
        self.decisions = self.tmpdir / "DECISIONS.md"
        self.decisions.write_text(SAMPLE_DECISIONS, encoding="utf-8")

    def tearDown(self):
        shutil.rmtree(self.tmpdir, ignore_errors=True)

    def test_registry_parses_adr_headers(self):
        registry = d._load_adr_registry(self.decisions)
        self.assertEqual(registry, {"001", "002", "005"})

    def test_registry_missing_file_returns_empty(self):
        self.assertEqual(
            d._load_adr_registry(self.tmpdir / "nope.md"),
            set(),
        )

    def test_registry_ignores_inline_adr_mentions(self):
        # The CPS check uses HEADERS only — inline mentions like "see ADR-007"
        # in the BODY of an ADR don't count as registry entries.
        self.decisions.write_text(SAMPLE_DECISIONS +
                                   "\nThis paragraph mentions ADR-007 inline.",
                                   encoding="utf-8")
        registry = d._load_adr_registry(self.decisions)
        self.assertNotIn("007", registry)


class TestIsCanonicalDoc(unittest.TestCase):
    def test_default_canonical_paths_match(self):
        self.assertTrue(d._is_canonical_doc("project/DECISIONS.md"))
        self.assertTrue(d._is_canonical_doc("project/SPEC.md"))
        self.assertTrue(d._is_canonical_doc("project/IMPLEMENTATION_PLAN.md"))

    def test_normalizes_windows_separators(self):
        self.assertTrue(d._is_canonical_doc("project\\DECISIONS.md"))

    def test_default_prefix_arc(self):
        self.assertTrue(d._is_canonical_doc("arc/anything.md"))
        self.assertTrue(d._is_canonical_doc("arc/nested/dir/file.md"))

    def test_unrelated_path_is_not_canonical(self):
        self.assertFalse(d._is_canonical_doc("src/kernel/transform.ts"))
        self.assertFalse(d._is_canonical_doc("notes.txt"))
        self.assertFalse(d._is_canonical_doc(""))


class TestAdrCitationCheck(unittest.TestCase):
    def setUp(self):
        self.tmpdir = Path(tempfile.mkdtemp(prefix="fnsr-cps-adr-test-"))
        self.decisions = self.tmpdir / "DECISIONS.md"
        self.decisions.write_text(SAMPLE_DECISIONS, encoding="utf-8")

    def tearDown(self):
        shutil.rmtree(self.tmpdir, ignore_errors=True)

    def test_valid_citation_passes(self):
        outputs = {
            "changes": [{
                "id": "C1",
                "file": "project/SPEC.md",
                "before": "x",
                "after": "see ADR-001 and ADR-002 for context.",
            }],
            "summary": "x",
            "self_assessment": "confident",
        }
        # Should NOT raise
        d._check_adr_citations(outputs, decisions_path=self.decisions)

    def test_missing_adr_in_canonical_doc_vetoes(self):
        outputs = {
            "changes": [{
                "id": "C1",
                "file": "project/SPEC.md",
                "before": "x",
                "after": "see ADR-012 for routing.",  # ADR-012 doesn't exist
            }],
        }
        with self.assertRaises(d.ContainmentVeto) as ctx:
            d._check_adr_citations(outputs, decisions_path=self.decisions)
        self.assertIn("ADR-012", str(ctx.exception))

    def test_missing_adr_outside_canonical_doc_passes(self):
        outputs = {
            "changes": [{
                "id": "C1",
                "file": "src/kernel/transform.ts",
                "before": "x",
                "after": "// see ADR-999 elsewhere.",  # not canonical doc
            }],
        }
        # No raise — not a canonical doc, no check.
        d._check_adr_citations(outputs, decisions_path=self.decisions)

    def test_no_decisions_file_skips_check(self):
        outputs = {
            "changes": [{
                "id": "C1",
                "file": "project/SPEC.md",
                "before": "x",
                "after": "ADR-999 referenced",
            }],
        }
        # No DECISIONS.md to check against — registry empty, check skipped.
        d._check_adr_citations(outputs, decisions_path=self.tmpdir / "nope.md")

    def test_no_changes_field_no_op(self):
        # Output isn't change-shaped (e.g., spec-reviewer findings)
        outputs = {
            "findings": [{"id": "F1", "claim": "see ADR-999"}],
            "summary": "x",
            "recommendation": "revise",
        }
        d._check_adr_citations(outputs, decisions_path=self.decisions)

    def test_multiple_missing_adrs_listed(self):
        outputs = {
            "changes": [{
                "id": "C1",
                "file": "project/DECISIONS.md",
                "after": "ADR-007 cites ADR-010; both new.",
            }],
        }
        with self.assertRaises(d.ContainmentVeto) as ctx:
            d._check_adr_citations(outputs, decisions_path=self.decisions)
        msg = str(ctx.exception)
        self.assertIn("ADR-007", msg)
        self.assertIn("ADR-010", msg)

    def test_canonical_prefix_arc_triggers_check(self):
        outputs = {
            "changes": [{
                "id": "C1",
                "file": "arc/protocol/v1.md",
                "after": "see ADR-099",
            }],
        }
        with self.assertRaises(d.ContainmentVeto):
            d._check_adr_citations(outputs, decisions_path=self.decisions)

    def test_mixed_valid_and_invalid_citations(self):
        # Valid ADR-001 in same after as invalid ADR-099 — should still veto.
        outputs = {
            "changes": [{
                "id": "C1",
                "file": "project/SPEC.md",
                "after": "ADR-001 governs this; supersedes ADR-099.",
            }],
        }
        with self.assertRaises(d.ContainmentVeto) as ctx:
            d._check_adr_citations(outputs, decisions_path=self.decisions)
        self.assertIn("ADR-099", str(ctx.exception))


class TestAwaitingDecisionShape(unittest.TestCase):
    def test_valid_shape_returns_none(self):
        outputs = {
            "status": "awaiting_operator_decision",
            "options": ["option A", "option B", "option C"],
            "recommendation": "Recommend A because ...",
        }
        self.assertIsNone(d._validate_awaiting_decision_shape(outputs))

    def test_options_can_be_dicts(self):
        outputs = {
            "status": "awaiting_operator_decision",
            "options": [
                {"label": "A", "tradeoff": "..."},
                {"label": "B", "tradeoff": "..."},
            ],
            "recommendation": "A — lower risk",
        }
        self.assertIsNone(d._validate_awaiting_decision_shape(outputs))

    def test_empty_options_vetoes(self):
        outputs = {
            "status": "awaiting_operator_decision",
            "options": [],
            "recommendation": "...",
        }
        result = d._validate_awaiting_decision_shape(outputs)
        self.assertIsNotNone(result)
        self.assertIn("options", result)

    def test_missing_options_vetoes(self):
        outputs = {
            "status": "awaiting_operator_decision",
            "recommendation": "x",
        }
        self.assertIsNotNone(d._validate_awaiting_decision_shape(outputs))

    def test_missing_recommendation_vetoes(self):
        outputs = {
            "status": "awaiting_operator_decision",
            "options": ["A", "B"],
        }
        result = d._validate_awaiting_decision_shape(outputs)
        self.assertIsNotNone(result)
        self.assertIn("recommendation", result)

    def test_empty_recommendation_vetoes(self):
        outputs = {
            "status": "awaiting_operator_decision",
            "options": ["A", "B"],
            "recommendation": "   ",
        }
        result = d._validate_awaiting_decision_shape(outputs)
        self.assertIsNotNone(result)

    def test_non_list_options_vetoes(self):
        outputs = {
            "status": "awaiting_operator_decision",
            "options": "not a list",
            "recommendation": "x",
        }
        self.assertIsNotNone(d._validate_awaiting_decision_shape(outputs))


if __name__ == "__main__":
    unittest.main()
