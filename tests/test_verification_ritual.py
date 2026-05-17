"""Tests for the v2.8.0 Checkpoint 1 verification-ritual machinery.

Covers:
- Category spec loader (frontmatter parsing, file discovery)
- Predicate resolver
- Cat 1-7 deterministic predicates (happy + veto + miss paths each)
- verification-ritual system agent orchestration (cadence filtering,
  canonical-source resolution, predicate dispatch, aggregate status)
"""
import json
import os
import sys
import unittest

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))
import fnsr_daemon as d


SAMPLE_SPEC = """\
# Example Spec

## 1. Introduction

Content.

## 3.4.1 Connected With (ratified axioms)

Reflexivity, symmetry, parthood-extension.

## §3.4.2 Mereotopology helpers

Definitions.

### 3.4.2.1 Sub-helper

Body.

## 5.0 Closing

Body.
"""

SAMPLE_DECISIONS = """\
# Architecture Decision Records

## ADR-001: First decision

Body.

## ADR-007: Seventh decision

Body.

## ADR-012: Cardinality routing

Body.
"""

SAMPLE_REASON_CODES_TS = """\
// src/kernel/reason-codes.ts

export const REASON_CODES = Object.freeze([
  "open_world_undetermined",
  "closed_world_falsified",
  "ontology_unsatisfiable",
  "domain_violation",
] as const);

export type ReasonCode = typeof REASON_CODES[number];
"""

SAMPLE_FOL_TYPES_TS = """\
// src/kernel/fol-types.ts

export type FolType =
  | "fol:Implication"
  | "fol:Conjunction"
  | "fol:Disjunction"
  | "fol:Negation"
  | "fol:Universal"
  | "fol:Existential"
  | "fol:Atom"
  | "fol:Equality"
  | "fol:False";
"""

SAMPLE_OWL_TYPES_TS = """\
// src/kernel/owl-types.ts

export type OwlType =
  | "owl:Class"
  | "owl:ObjectProperty"
  | "owl:Restriction"
  | "SubObjectPropertyOf"
  | "ObjectPropertyChain";
"""


class TestCategoryFrontmatterParser(unittest.TestCase):
    def test_parses_flat_fields(self):
        text = (
            "---\n"
            "category_id: cat-01\n"
            "name: Foo\n"
            "implementation_mode: deterministic\n"
            "---\n\nbody"
        )
        fm = d._parse_category_frontmatter(text)
        self.assertEqual(fm["category_id"], "cat-01")
        self.assertEqual(fm["name"], "Foo")
        self.assertEqual(fm["implementation_mode"], "deterministic")

    def test_parses_list_field(self):
        text = (
            "---\n"
            "category_id: cat-04\n"
            "canonical_source_keys: [reason_codes, spec]\n"
            "---\n"
        )
        fm = d._parse_category_frontmatter(text)
        self.assertEqual(fm["canonical_source_keys"], ["reason_codes", "spec"])

    def test_no_frontmatter_returns_none(self):
        self.assertIsNone(d._parse_category_frontmatter("plain body"))
        self.assertIsNone(d._parse_category_frontmatter(""))


class TestCategoryLoader(unittest.TestCase):
    def test_loads_seven_cat_specs(self):
        specs = d._load_category_specs()
        self.assertEqual(len(specs), 7)
        ids = [s["category_id"] for s in specs]
        self.assertEqual(ids, ["cat-01", "cat-02", "cat-03", "cat-04",
                                "cat-05", "cat-06", "cat-07"])

    def test_each_spec_has_required_fields(self):
        specs = d._load_category_specs()
        for spec in specs:
            self.assertIn("category_id", spec)
            self.assertIn("name", spec)
            self.assertIn("implementation_mode", spec)
            self.assertIn("cadence", spec)
            self.assertIn("python_predicate", spec)
            self.assertIn("canonical_source_keys", spec)
            self.assertIsInstance(spec["canonical_source_keys"], list)


class TestPredicateResolver(unittest.TestCase):
    def test_resolves_within_module(self):
        pred = d._resolve_predicate("fnsr_daemon.cat_01_spec_section_existence")
        self.assertIsNotNone(pred)
        self.assertTrue(callable(pred))

    def test_rejects_external_modules(self):
        self.assertIsNone(d._resolve_predicate("other_module.predicate"))

    def test_rejects_bare_name(self):
        self.assertIsNone(d._resolve_predicate("predicate_only"))

    def test_unknown_attr_returns_none(self):
        self.assertIsNone(d._resolve_predicate("fnsr_daemon.no_such_predicate"))


# ---- Cat 1 ----

class TestCat01SpecSectionExistence(unittest.TestCase):
    def test_pass_existing_sections(self):
        artifact = "see §3.4.1 and §3.4.2 for context"
        result = d.cat_01_spec_section_existence(
            artifact, {"spec": SAMPLE_SPEC})
        self.assertEqual(result["status"], "pass")
        self.assertEqual(result["evidence"]["cited_sections"],
                         ["3.4.1", "3.4.2"])

    def test_veto_missing_section(self):
        artifact = "see §3.4.4 which does not exist"
        result = d.cat_01_spec_section_existence(
            artifact, {"spec": SAMPLE_SPEC})
        self.assertEqual(result["status"], "veto")
        self.assertIn("3.4.4", result["evidence"]["unmatched"])

    def test_miss_when_spec_absent(self):
        result = d.cat_01_spec_section_existence("§1.1", {})
        self.assertEqual(result["status"], "miss")

    def test_pass_no_citations(self):
        result = d.cat_01_spec_section_existence(
            "no section citations here", {"spec": SAMPLE_SPEC})
        self.assertEqual(result["status"], "pass")
        self.assertEqual(result["evidence"]["cited_sections"], [])

    def test_nested_sections_recognized(self):
        # 3.4.2.1 should be recognized when the spec has the header
        artifact = "see §3.4.2.1"
        result = d.cat_01_spec_section_existence(
            artifact, {"spec": SAMPLE_SPEC})
        self.assertEqual(result["status"], "pass")


# ---- Cat 2 ----

class TestCat02AdrCrossReference(unittest.TestCase):
    def test_pass_registered_adrs(self):
        artifact = "see ADR-001 and ADR-012 for context"
        result = d.cat_02_adr_cross_reference(
            artifact, {"decisions": SAMPLE_DECISIONS})
        self.assertEqual(result["status"], "pass")
        self.assertEqual(result["evidence"]["cited_adrs"], ["001", "012"])

    def test_veto_unregistered_adr(self):
        artifact = "see ADR-099 (does not exist)"
        result = d.cat_02_adr_cross_reference(
            artifact, {"decisions": SAMPLE_DECISIONS})
        self.assertEqual(result["status"], "veto")
        self.assertIn("099", result["evidence"]["unmatched"])

    def test_miss_when_decisions_absent(self):
        result = d.cat_02_adr_cross_reference("ADR-001", {})
        self.assertEqual(result["status"], "miss")

    def test_pass_no_citations(self):
        result = d.cat_02_adr_cross_reference(
            "no ADR citations", {"decisions": SAMPLE_DECISIONS})
        self.assertEqual(result["status"], "pass")


# ---- Cat 3 ----

class TestCat03QRulingCrossReference(unittest.TestCase):
    def setUp(self):
        self.prior = {
            "phase-3/Q-3-A.md": "# Q-3-A: Routing decision\nBody.",
            "phase-4/Q-4-Step5-A.md": (
                "# Q-4-Step5-A: Step 5 ruling\n"
                "## Q-4-Step5-A.1 sub-ruling\nBody."
            ),
        }

    def test_pass_existing_q_rulings(self):
        artifact = "per Q-3-A and Q-4-Step5-A.1, ratify"
        result = d.cat_03_q_ruling_cross_reference(
            artifact, {"prior_cycle_artifacts": self.prior})
        self.assertEqual(result["status"], "pass")

    def test_veto_missing_q_ruling(self):
        artifact = "per Q-9-Z (doesn't exist), ratify"
        result = d.cat_03_q_ruling_cross_reference(
            artifact, {"prior_cycle_artifacts": self.prior})
        self.assertEqual(result["status"], "veto")
        self.assertIn("Q-9-Z", result["evidence"]["unmatched"])

    def test_miss_when_prior_absent(self):
        result = d.cat_03_q_ruling_cross_reference("Q-3-A", {})
        self.assertEqual(result["status"], "miss")


# ---- Cat 4 ----

class TestCat04ReasonCodeFrozenEnum(unittest.TestCase):
    def test_pass_known_reason(self):
        artifact = '"expectedReason": "open_world_undetermined"'
        result = d.cat_04_reason_code_frozen_enum(
            artifact, {"reason_codes": SAMPLE_REASON_CODES_TS})
        self.assertEqual(result["status"], "pass")

    def test_veto_unknown_reason(self):
        artifact = '"expectedReason": "naf_residue"'
        result = d.cat_04_reason_code_frozen_enum(
            artifact, {"reason_codes": SAMPLE_REASON_CODES_TS})
        self.assertEqual(result["status"], "veto")
        self.assertIn("naf_residue", result["evidence"]["unmatched"])

    def test_miss_when_reason_codes_absent(self):
        result = d.cat_04_reason_code_frozen_enum(
            '"expectedReason": "x"', {})
        self.assertEqual(result["status"], "miss")

    def test_pass_no_citations(self):
        result = d.cat_04_reason_code_frozen_enum(
            "no expectedReason in this artifact",
            {"reason_codes": SAMPLE_REASON_CODES_TS})
        self.assertEqual(result["status"], "pass")


# ---- Cat 5 ----

class TestCat05FolOwlTypeDiscriminator(unittest.TestCase):
    def test_pass_known_fol_type(self):
        artifact = '"@type": "fol:Implication"'
        result = d.cat_05_fol_owl_type_discriminator(artifact, {
            "fol_types": SAMPLE_FOL_TYPES_TS,
            "owl_types": SAMPLE_OWL_TYPES_TS,
        })
        self.assertEqual(result["status"], "pass")

    def test_pass_known_owl_type(self):
        artifact = '"@type": "owl:Restriction"'
        result = d.cat_05_fol_owl_type_discriminator(artifact, {
            "fol_types": SAMPLE_FOL_TYPES_TS,
            "owl_types": SAMPLE_OWL_TYPES_TS,
        })
        self.assertEqual(result["status"], "pass")

    def test_veto_unknown_type(self):
        # fol:Biconditional is the Q-4-C amendment Catch 2 case
        artifact = '"@type": "fol:Biconditional"'
        result = d.cat_05_fol_owl_type_discriminator(artifact, {
            "fol_types": SAMPLE_FOL_TYPES_TS,
            "owl_types": SAMPLE_OWL_TYPES_TS,
        })
        self.assertEqual(result["status"], "veto")
        self.assertIn("fol:Biconditional", result["evidence"]["unmatched"])

    def test_miss_when_either_canonical_source_absent(self):
        result = d.cat_05_fol_owl_type_discriminator(
            '"@type": "fol:Atom"', {"fol_types": SAMPLE_FOL_TYPES_TS})
        self.assertEqual(result["status"], "miss")


# ---- Cat 6 ----

class TestCat06ManifestMirrorConsistency(unittest.TestCase):
    def setUp(self):
        self.manifest_text = json.dumps([
            {"fixture": "f1.json", "expectedOutcome": "consistent",
             "canaryRole": "positive"},
            {"fixture": "f2.json", "expectedOutcome": "inconsistent"},
        ])
        self.fixtures_matching = {
            "f1.json": '{"expectedOutcome": "consistent", "canaryRole": "positive"}',
            "f2.json": '{"expectedOutcome": "inconsistent"}',
        }
        self.fixtures_diverging = {
            "f1.json": '{"expectedOutcome": "INCONSISTENT", "canaryRole": "positive"}',
            "f2.json": '{"expectedOutcome": "inconsistent"}',
        }

    def test_pass_when_manifest_mirrors_fixtures(self):
        result = d.cat_06_manifest_mirror_consistency("", {
            "manifest": self.manifest_text,
            "fixtures": self.fixtures_matching,
        })
        self.assertEqual(result["status"], "pass")
        self.assertTrue(len(result["evidence"]["matched"]) > 0)

    def test_veto_on_divergence(self):
        result = d.cat_06_manifest_mirror_consistency("", {
            "manifest": self.manifest_text,
            "fixtures": self.fixtures_diverging,
        })
        self.assertEqual(result["status"], "veto")
        self.assertTrue(len(result["evidence"]["divergences"]) > 0)

    def test_miss_on_invalid_manifest_json(self):
        result = d.cat_06_manifest_mirror_consistency("", {
            "manifest": "not json", "fixtures": {},
        })
        self.assertEqual(result["status"], "miss")

    def test_miss_when_sources_absent(self):
        result = d.cat_06_manifest_mirror_consistency("", {})
        self.assertEqual(result["status"], "miss")


# ---- Cat 7 ----

class TestCat07CrossPhaseCrossReference(unittest.TestCase):
    def setUp(self):
        self.cycle_artifacts = {
            "phase-3/Q-3-A.md": "Body of Q-3-A.",
            "phase-4/Q-4-A.md": "Body of Q-4-A. See also phase-3/Q-3-A.md.",
        }

    def test_pass_existing_paths(self):
        artifact = "this references [Q-3-A](phase-3/Q-3-A.md)"
        result = d.cat_07_cross_phase_cross_reference(
            artifact, {"cycle_artifacts": self.cycle_artifacts})
        self.assertEqual(result["status"], "pass")
        self.assertIn("phase-3/Q-3-A.md", result["evidence"]["matched"])

    def test_veto_on_dangling_reference(self):
        artifact = "see [missing](phase-99/missing.md) please"
        result = d.cat_07_cross_phase_cross_reference(
            artifact, {"cycle_artifacts": self.cycle_artifacts})
        self.assertEqual(result["status"], "veto")
        self.assertIn("phase-99/missing.md", result["evidence"]["dangling"])

    def test_veto_on_asymmetric_when_reciprocity_implied(self):
        # phase-4/Q-4-B.md does NOT exist; phase-3/Q-3-A.md does exist
        # but doesn't reference back to a hypothetical "phase-4/Q-4-B.md"
        cycle = dict(self.cycle_artifacts)
        artifact = ("From phase-4/Q-4-B.md: see also phase-3/Q-3-A.md "
                    "for context.")
        result = d.cat_07_cross_phase_cross_reference(
            artifact, {
                "cycle_artifacts": cycle,
                "_artifact_self_path": "phase-4/Q-4-B.md",
            })
        self.assertEqual(result["status"], "veto")
        self.assertTrue(len(result["evidence"]["asymmetric"]) > 0)

    def test_miss_when_cycle_artifacts_absent(self):
        result = d.cat_07_cross_phase_cross_reference(
            "some text", {})
        self.assertEqual(result["status"], "miss")

    def test_self_reference_not_flagged(self):
        # The artifact's own path shouldn't count as a dangling reference
        artifact = "this is phase-4/Q-4-A.md content"
        result = d.cat_07_cross_phase_cross_reference(
            artifact, {
                "cycle_artifacts": self.cycle_artifacts,
                "_artifact_self_path": "phase-4/Q-4-A.md",
            })
        self.assertEqual(result["status"], "pass")


# ---- verification-ritual system agent ----

class TestVerificationRitualOrchestrator(unittest.TestCase):
    def _run(self, inputs):
        task = {"@id": "urn:test:verification", "agent": "verification-ritual",
                "inputs": inputs}
        return d._verification_ritual(task, {})

    def test_artifact_missing_returns_structured_error(self):
        result = self._run({})
        self.assertEqual(result.outputs.get("error"), "artifact_missing")

    def test_overall_pass_when_no_canonical_sources_provided(self):
        # No canonical sources -> every category misses on missing keys.
        # No vetoes, so overall_status is "pass" (with all-miss
        # per-category results).
        result = self._run({"artifact_text": "empty artifact"})
        self.assertEqual(result.outputs["overall_status"], "pass")
        # Every cat should be a miss
        for cat_result in result.outputs["per_category_result"]:
            self.assertEqual(cat_result["status"], "miss")

    def test_overall_pass_when_all_applicable_categories_pass(self):
        result = self._run({
            "artifact_text": "see §3.4.1 and ADR-001 for context.",
            "canonical_sources": {
                "spec": SAMPLE_SPEC,
                "decisions": SAMPLE_DECISIONS,
            },
        })
        self.assertEqual(result.outputs["overall_status"], "pass")
        cat_results = {r["category_id"]: r
                       for r in result.outputs["per_category_result"]}
        self.assertEqual(cat_results["cat-01"]["status"], "pass")
        self.assertEqual(cat_results["cat-02"]["status"], "pass")

    def test_overall_veto_propagates_from_any_category(self):
        result = self._run({
            "artifact_text": "see §3.4.1 (ok) and ADR-099 (missing)",
            "canonical_sources": {
                "spec": SAMPLE_SPEC,
                "decisions": SAMPLE_DECISIONS,
            },
        })
        self.assertEqual(result.outputs["overall_status"], "veto")
        cat_results = {r["category_id"]: r
                       for r in result.outputs["per_category_result"]}
        self.assertEqual(cat_results["cat-01"]["status"], "pass")
        self.assertEqual(cat_results["cat-02"]["status"], "veto")

    def test_cadence_pre_routing_runs_default_categories(self):
        result = self._run({
            "artifact_text": "x",
            "canonical_sources": {},
            "cadence": "pre-routing",
        })
        # All 7 cats run on pre-routing cadence
        self.assertEqual(len(result.outputs["per_category_result"]), 7)

    def test_summary_string_format(self):
        result = self._run({
            "artifact_text": "see §3.4.1 and ADR-001",
            "canonical_sources": {"spec": SAMPLE_SPEC,
                                   "decisions": SAMPLE_DECISIONS},
        })
        self.assertIn("verification ritual", result.outputs["summary"])
        self.assertIn("pass", result.outputs["summary"])
        self.assertIn("veto", result.outputs["summary"])
        self.assertIn("miss", result.outputs["summary"])

    def test_new_candidacies_empty_in_cp1(self):
        # CP1 ships only deterministic categories; new_candidacies is
        # always empty until CP3+ when LLM categories can surface
        # patterns no current category covers.
        result = self._run({"artifact_text": "x"})
        self.assertEqual(result.outputs["new_candidacies"], [])

    def test_required_outputs_pass_cps_check(self):
        # The system agent's outputs satisfy the .md frontmatter's
        # required_outputs declaration.
        result = self._run({"artifact_text": "x"})
        task = {"agent": "verification-ritual"}
        # MUST NOT raise.
        d.cps_check(task, result.outputs)

    def test_artifact_path_loaded_from_disk(self):
        import tempfile
        with tempfile.NamedTemporaryFile(mode="w", suffix=".md",
                                          delete=False, encoding="utf-8") as f:
            f.write("see §3.4.1 for context")
            path = f.name
        try:
            result = self._run({
                "artifact_path": path,
                "canonical_sources": {"spec": SAMPLE_SPEC},
            })
            cat_results = {r["category_id"]: r
                           for r in result.outputs["per_category_result"]}
            self.assertEqual(cat_results["cat-01"]["status"], "pass")
        finally:
            os.unlink(path)

    def test_dispatch_via_invoke_agent(self):
        # End-to-end through invoke_agent (the daemon dispatcher).
        task = {
            "@id": "urn:test:verification",
            "agent": "verification-ritual",
            "inputs": {
                "artifact_text": "see ADR-001",
                "canonical_sources": {"decisions": SAMPLE_DECISIONS},
            },
        }
        result = d.invoke_agent("verification-ritual", task, {})
        self.assertTrue(result.ok)
        self.assertEqual(result.outputs["overall_status"], "pass")


if __name__ == "__main__":
    unittest.main()
