import os
import sys
import unittest

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))
import fnsr_daemon as d


def task(tid, status="ready", deps=None, priority=None):
    t = {"@id": tid, "status": status, "depends_on": deps or []}
    if priority is not None:
        t["priority"] = priority
    return t


class TestNextReadyTask(unittest.TestCase):
    def test_no_priority_lex_order(self):
        s = {"tasks": [task("urn:t:c"), task("urn:t:a"), task("urn:t:b")]}
        self.assertEqual(d.next_ready_task(s)["@id"], "urn:t:a")

    def test_priority_overrides_lex(self):
        s = {"tasks": [
            task("urn:t:a", priority=0),
            task("urn:t:z", priority=10),
            task("urn:t:m", priority=5),
        ]}
        self.assertEqual(d.next_ready_task(s)["@id"], "urn:t:z")

    def test_priority_tie_breaks_lex(self):
        s = {"tasks": [
            task("urn:t:c", priority=5),
            task("urn:t:a", priority=5),
            task("urn:t:b", priority=5),
        ]}
        self.assertEqual(d.next_ready_task(s)["@id"], "urn:t:a")

    def test_negative_priority(self):
        s = {"tasks": [
            task("urn:t:a", priority=-10),
            task("urn:t:z", priority=0),
        ]}
        self.assertEqual(d.next_ready_task(s)["@id"], "urn:t:z")

    def test_unsatisfied_dep_filtered_out(self):
        s = {"tasks": [
            task("urn:t:high", deps=["urn:t:dep"], priority=99),
            task("urn:t:dep", priority=0),
        ]}
        self.assertEqual(d.next_ready_task(s)["@id"], "urn:t:dep")

    def test_dep_done_priority_drives(self):
        s = {"tasks": [
            task("urn:t:high", deps=["urn:t:dep"], priority=99),
            task("urn:t:dep", status="done"),
        ]}
        self.assertEqual(d.next_ready_task(s)["@id"], "urn:t:high")

    def test_no_ready_tasks_returns_none(self):
        s = {"tasks": [task("urn:t:done", status="done")]}
        self.assertIsNone(d.next_ready_task(s))


def architect_ratification_task(tid, ruling, mode="ratification"):
    """Architect task in done state with a specified ruling."""
    return {
        "@id": tid,
        "agent": "architect",
        "status": "done",
        "depends_on": [],
        "inputs": {"mode": mode},
        "outputs": {"ruling": ruling},
    }


def applier_task(tid, deps, status="ready"):
    """Applier task gated by architect-ratification dep."""
    return {
        "@id": tid,
        "agent": "applier",
        "status": status,
        "depends_on": deps,
    }


class TestPassRatificationGating(unittest.TestCase):
    """Event 11 regression: applier tasks must be gated by architect ratification ruling.

    Five-plus occurrences in the Round 4 implementation session: every
    denied/deferred ratification was followed by the applier landing changes
    the architect had refused. This class pins the fix in
    `_architect_ratification_block` + `next_ready_task`.
    """

    def test_applier_skipped_when_ratification_denied(self):
        s = {"tasks": [
            architect_ratification_task("urn:t:arch", "denied"),
            applier_task("urn:t:app", deps=["urn:t:arch"]),
        ]}
        self.assertIsNone(d.next_ready_task(s))

    def test_applier_skipped_when_ratification_deferred(self):
        s = {"tasks": [
            architect_ratification_task("urn:t:arch", "deferred"),
            applier_task("urn:t:app", deps=["urn:t:arch"]),
        ]}
        self.assertIsNone(d.next_ready_task(s))

    def test_applier_returned_when_ratified(self):
        s = {"tasks": [
            architect_ratification_task("urn:t:arch", "ratified"),
            applier_task("urn:t:app", deps=["urn:t:arch"]),
        ]}
        self.assertEqual(d.next_ready_task(s)["@id"], "urn:t:app")

    def test_non_applier_not_gated_by_architect_ruling(self):
        # A developer task downstream of a denied ratification is NOT gated —
        # only the applier-class Pass 2b commit-finalize is.
        s = {"tasks": [
            architect_ratification_task("urn:t:arch", "denied"),
            {
                "@id": "urn:t:dev",
                "agent": "developer",
                "status": "ready",
                "depends_on": ["urn:t:arch"],
            },
        ]}
        self.assertEqual(d.next_ready_task(s)["@id"], "urn:t:dev")

    def test_architect_review_mode_does_not_gate(self):
        # Architect tasks in `review` mode (not `ratification`) do not gate
        # downstream applier tasks — gating only fires on ratification mode.
        s = {"tasks": [
            architect_ratification_task("urn:t:arch", "denied", mode="review"),
            applier_task("urn:t:app", deps=["urn:t:arch"]),
        ]}
        self.assertEqual(d.next_ready_task(s)["@id"], "urn:t:app")

    def test_applier_skipped_other_candidate_returned(self):
        # When the gated applier is skipped, another ready candidate must
        # still be picked — gating filters, it does not abort the picker.
        s = {"tasks": [
            architect_ratification_task("urn:t:arch", "denied"),
            applier_task("urn:t:app", deps=["urn:t:arch"]),
            task("urn:t:other"),
        ]}
        self.assertEqual(d.next_ready_task(s)["@id"], "urn:t:other")

    def test_applier_with_multiple_ratifications_one_denied_blocks(self):
        # If an applier depends on multiple architect ratifications and ANY
        # are denied/deferred, the applier is blocked.
        s = {"tasks": [
            architect_ratification_task("urn:t:arch-a", "ratified"),
            architect_ratification_task("urn:t:arch-b", "denied"),
            applier_task("urn:t:app", deps=["urn:t:arch-a", "urn:t:arch-b"]),
        ]}
        self.assertIsNone(d.next_ready_task(s))

    def test_applier_with_no_architect_dep_not_gated(self):
        # An applier with no architect dep is not gated (e.g., direct
        # developer→applier chains for editorial corrections without Pass 2a).
        s = {"tasks": [
            {
                "@id": "urn:t:dev",
                "agent": "developer",
                "status": "done",
                "depends_on": [],
            },
            applier_task("urn:t:app", deps=["urn:t:dev"]),
        ]}
        self.assertEqual(d.next_ready_task(s)["@id"], "urn:t:app")


if __name__ == "__main__":
    unittest.main()
