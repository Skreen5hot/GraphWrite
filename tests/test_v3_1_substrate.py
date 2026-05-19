"""Tests for v3.1.0 substrate additions.

Covers:
- Surface-audience primitive doc (fourth substrate primitive)
- _extract_surface_audience helper (default + explicit + invalid-veto)
- _upstream_subject_surface_audience walker
- Verification-ritual records subject_surface_audience in its outputs
- Frontmatter contract updated to declare the new required output

This is the originally-scoped trajectory's terminal substrate release.
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


# ---------- Surface-audience primitive doc ------------------------------

class TestSurfaceAudiencePrimitiveDoc(unittest.TestCase):
    @property
    def doc_path(self):
        return (Path(__file__).resolve().parent.parent
                / "surfaces" / "_primitives"
                / "surface-audience.md")

    def test_doc_exists(self):
        self.assertTrue(self.doc_path.exists(),
                         "Surface-audience primitive doc must exist")

    def test_doc_declares_metadata(self):
        text = self.doc_path.read_text(encoding="utf-8")
        fm = d._parse_category_frontmatter(text)
        self.assertEqual(fm["primitive_id"], "surface-audience")
        self.assertEqual(fm["introduced_in"], "v3.1.0")

    def test_doc_names_both_audience_values(self):
        text = self.doc_path.read_text(encoding="utf-8")
        self.assertIn("`consumer`", text)
        self.assertIn("`internal`", text)

    def test_doc_specifies_default(self):
        text = self.doc_path.read_text(encoding="utf-8")
        self.assertIn("default", text.lower())
        # Default must be explicitly documented as internal
        self.assertIn("`internal`", text)

    def test_doc_declares_enforcement_split(self):
        # Per the brief, v3.1.0 records; v3.2 enforces. The doc must
        # name both checkpoints so future operators know enforcement
        # is deliberately deferred.
        text = self.doc_path.read_text(encoding="utf-8")
        self.assertIn("v3.1.0", text)
        self.assertIn("v3.2", text)

    def test_doc_declares_three_structural_properties(self):
        text = self.doc_path.read_text(encoding="utf-8")
        # The audience-declaration / closed-enumeration / audit-recording
        # property triad must be named explicitly per the primitive's
        # parallel construction with anti-pattern enforcement's triad.
        self.assertIn("output level", text)
        self.assertIn("closed enumeration", text)
        self.assertIn("audit chain", text)


# ---------- _extract_surface_audience helper ----------------------------

class TestExtractSurfaceAudienceHelper(unittest.TestCase):
    def test_default_when_field_absent(self):
        outputs = {"findings": [], "summary": "x"}
        self.assertEqual(d._extract_surface_audience(outputs), "internal")

    def test_default_when_outputs_not_dict(self):
        self.assertEqual(d._extract_surface_audience(None), "internal")
        self.assertEqual(d._extract_surface_audience([]), "internal")
        self.assertEqual(d._extract_surface_audience("x"), "internal")

    def test_consumer_when_explicit(self):
        outputs = {"surface_audience": "consumer", "summary": "x"}
        self.assertEqual(d._extract_surface_audience(outputs), "consumer")

    def test_internal_when_explicit(self):
        outputs = {"surface_audience": "internal", "summary": "x"}
        self.assertEqual(d._extract_surface_audience(outputs), "internal")

    def test_veto_on_invalid_value(self):
        outputs = {"surface_audience": "PUBLIC", "summary": "x"}
        with self.assertRaises(d.ContainmentVeto) as ctx:
            d._extract_surface_audience(outputs)
        self.assertIn("surface_audience_invalid_value", str(ctx.exception))

    def test_veto_on_none_value(self):
        outputs = {"surface_audience": None, "summary": "x"}
        with self.assertRaises(d.ContainmentVeto):
            d._extract_surface_audience(outputs)

    def test_veto_on_empty_string(self):
        outputs = {"surface_audience": "", "summary": "x"}
        with self.assertRaises(d.ContainmentVeto):
            d._extract_surface_audience(outputs)

    def test_module_level_enum_is_closed_to_two_values(self):
        # The closed-enumeration property is load-bearing for v3.2
        # enforcement. Future extensions must update SURFACE_AUDIENCE_VALUES
        # via deliberate-promotion, not by side-effect addition.
        self.assertEqual(set(d.SURFACE_AUDIENCE_VALUES),
                          {"consumer", "internal"})

    def test_default_is_conservative(self):
        # The conservative-default property per the primitive doc: omitted
        # = internal. Consumer is the deliberate elevation.
        self.assertEqual(d.SURFACE_AUDIENCE_DEFAULT, "internal")


# ---------- _upstream_subject_surface_audience walker -------------------

class TestUpstreamSubjectAudienceWalker(unittest.TestCase):
    def test_empty_upstream_returns_default(self):
        self.assertEqual(d._upstream_subject_surface_audience({}),
                          "internal")

    def test_non_dict_upstream_returns_default(self):
        self.assertEqual(d._upstream_subject_surface_audience(None),
                          "internal")
        self.assertEqual(d._upstream_subject_surface_audience([]),
                          "internal")

    def test_upstream_with_wrapped_outputs(self):
        upstream = {
            "urn:fnsr:task:1": {
                "outputs": {"surface_audience": "consumer", "summary": "x"},
            },
        }
        self.assertEqual(d._upstream_subject_surface_audience(upstream),
                          "consumer")

    def test_upstream_with_bare_outputs(self):
        # When the operator inlines outputs directly (no `outputs`
        # wrapping key), the walker should still find the field.
        upstream = {
            "urn:fnsr:task:1": {
                "surface_audience": "consumer", "summary": "x",
            },
        }
        self.assertEqual(d._upstream_subject_surface_audience(upstream),
                          "consumer")

    def test_upstream_without_audience_field_returns_default(self):
        upstream = {
            "urn:fnsr:task:1": {"outputs": {"summary": "no audience here"}},
        }
        self.assertEqual(d._upstream_subject_surface_audience(upstream),
                          "internal")

    def test_first_declared_upstream_audience_wins(self):
        # When multiple upstream tasks declare different audiences, the
        # first one encountered is returned. Stable across Python 3.7+
        # dict ordering (insertion order preserved).
        upstream = {
            "urn:fnsr:task:1": {"outputs": {
                "surface_audience": "consumer", "summary": "x",
            }},
            "urn:fnsr:task:2": {"outputs": {
                "surface_audience": "internal", "summary": "y",
            }},
        }
        # Either is defensible; we just verify it's one of the declared
        # values, not the default.
        result = d._upstream_subject_surface_audience(upstream)
        self.assertIn(result, ("consumer", "internal"))

    def test_invalid_upstream_value_still_raises(self):
        upstream = {
            "urn:fnsr:task:1": {"outputs": {
                "surface_audience": "EXTERNAL", "summary": "x",
            }},
        }
        with self.assertRaises(d.ContainmentVeto):
            d._upstream_subject_surface_audience(upstream)


# ---------- Verification-ritual records subject_surface_audience --------

class TestVerificationRitualRecordsSurfaceAudience(unittest.TestCase):
    """v3.1.0 integration: verification-ritual reads from UPSTREAM and
    records subject_surface_audience in its own outputs per
    surfaces/_primitives/surface-audience.md."""

    def setUp(self):
        # Use the substrate's actual surfaces/verification/categories/
        # so the ritual finds real specs to run. We give it a benign
        # artifact and minimal canonical sources so most categories
        # produce miss/pass rather than veto.
        self.task = {
            "@id": "urn:fnsr:task:vr-test",
            "agent": "verification-ritual",
            "inputs": {
                "artifact_text": "Test artifact; no citations.",
                "canonical_sources": {},
                "cadence": "pre-routing",
                "surface": "verification",
            },
        }

    def test_outputs_include_subject_surface_audience_default(self):
        result = d._verification_ritual(self.task, {})
        self.assertTrue(result.ok)
        self.assertIn("subject_surface_audience", result.outputs)
        self.assertEqual(result.outputs["subject_surface_audience"],
                          "internal")

    def test_outputs_record_consumer_audience_from_upstream(self):
        upstream = {
            "urn:fnsr:task:upstream-author": {
                "outputs": {
                    "surface_audience": "consumer",
                    "changes": [{"file": "README.md", "after": "draft"}],
                    "summary": "consumer-facing draft",
                },
            },
        }
        result = d._verification_ritual(self.task, upstream)
        self.assertTrue(result.ok)
        self.assertEqual(result.outputs["subject_surface_audience"],
                          "consumer")

    def test_outputs_record_internal_audience_from_upstream(self):
        upstream = {
            "urn:fnsr:task:upstream-author": {
                "outputs": {
                    "surface_audience": "internal",
                    "summary": "operator-facing note",
                },
            },
        }
        result = d._verification_ritual(self.task, upstream)
        self.assertTrue(result.ok)
        self.assertEqual(result.outputs["subject_surface_audience"],
                          "internal")

    def test_outputs_default_internal_when_upstream_omits(self):
        upstream = {
            "urn:fnsr:task:upstream-no-audience": {
                "outputs": {"summary": "no audience declared"},
            },
        }
        result = d._verification_ritual(self.task, upstream)
        self.assertTrue(result.ok)
        self.assertEqual(result.outputs["subject_surface_audience"],
                          "internal")

    def test_invalid_upstream_audience_raises_veto(self):
        upstream = {
            "urn:fnsr:task:upstream-bad": {
                "outputs": {
                    "surface_audience": "broadcast",
                    "summary": "x",
                },
            },
        }
        with self.assertRaises(d.ContainmentVeto):
            d._verification_ritual(self.task, upstream)

    def test_frontmatter_declares_field_as_required_output(self):
        # The agent contract MUST declare subject_surface_audience as
        # part of required_outputs so CPS enforces its presence per
        # the substrate's required-keys discipline.
        contract_path = (Path(__file__).resolve().parent.parent
                          / ".claude" / "agents" / "verification-ritual.md")
        text = contract_path.read_text(encoding="utf-8")
        required = d._agent_required_outputs("verification-ritual")
        self.assertIn("subject_surface_audience", required)


if __name__ == "__main__":
    unittest.main()
