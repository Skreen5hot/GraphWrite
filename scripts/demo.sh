#!/usr/bin/env bash
# GraphWrite Phase 1 Demo (POSIX bash)
# Walks the CLI surface against the committed fixtures.
# Run from repo root: bash scripts/demo.sh

set +e

# Optional: --no-cleanup to leave emitted artifacts on disk for inspection
NO_CLEANUP=0
for arg in "$@"; do
    [ "$arg" = "--no-cleanup" ] && NO_CLEANUP=1
done

heading() {
    printf "\n\033[36m=== %s ===\033[0m\n" "$1"
}
cmd() {
    printf "\n\033[33m# %s\033[0m\n" "$1"
    printf "\033[32m$ %s\033[0m\n" "$2"
    eval "$2"
    printf "\n\033[90m(exit code: %d)\033[0m\n" "$?"
}

# Setup: ensure node_modules exists (fresh-clone reviewers may not have run npm install)
if [ ! -d node_modules ]; then
    heading "Setup (first-time only)"
    cmd "Install dependencies (node_modules missing)" "npm install"
fi

heading "Build"
cmd "Compile TypeScript" "npm run build"

heading "Validate a clean v0.4 fixture"
# Phase 1 task 1.3 ships 2 of 26 SPEC-declared validation codes (MISSING_REALIST_ANCHOR + INVALID_SPEC_VERSION);
# remaining 24 codes are forward-tracked at ft-097-test-validator-2 (see V3.2-GAP-REGISTRY.md).
cmd "Validate minimal canonical v0.4 (expect 0 hard errors)" \
    "node dist/cli/index.js validate test/fixtures/canonical-v0.4/minimal.jsonld"

heading "Validate malformed fixtures"
cmd "Validate missing-realist-anchor (expect MISSING_REALIST_ANCHOR; exit 1)" \
    "node dist/cli/index.js validate test/fixtures/malformed/missing-realist-anchor.jsonld"
cmd "Validate invalid-spec-version (expect INVALID_SPEC_VERSION; exit 4)" \
    "node dist/cli/index.js validate test/fixtures/malformed/invalid-spec-version.jsonld"

heading "Export to canonical formats"
cmd "Export Turtle (TBox prepended; deterministic)" \
    "node dist/cli/index.js export test/fixtures/canonical-v0.4/minimal.jsonld --format turtle --out demo-output.ttl"
printf "\033[33m# First 40 lines of demo-output.ttl:\033[0m\n"
head -n 40 demo-output.ttl

cmd "Export N-Triples (TBox prepended as N-Triples)" \
    "node dist/cli/index.js export test/fixtures/canonical-v0.4/minimal.jsonld --format n-triples --out demo-output.nt"
printf "\033[33m# First 20 lines of demo-output.nt:\033[0m\n"
head -n 20 demo-output.nt

heading "Phase 3/4 stubs (exit 2 with explicit not-implemented message)"
cmd "import-ontology stub (Phase 3)" \
    "node dist/cli/index.js import-ontology test/fixtures/canonical-v0.4/minimal.jsonld dummy.ttl --out merged.jsonld"
cmd "export --format zip stub (Phase 4)" \
    "node dist/cli/index.js export test/fixtures/canonical-v0.4/minimal.jsonld --format zip --out demo.zip"

heading "Deterministic flag"
# Deterministic mode produces byte-identical output across runs/machines. Load-bearing for:
# - audit chain reproducibility
# - cross-substrate-revision drift detection (byte-comparison against golden files)
# - any future cross-instance verification (FNSR-relevance: reproducibility is the basis of audit-trail honesty at scale)
cmd "Export with --deterministic --seed --clock (UUIDv5 + frozen clock)" \
    "node dist/cli/index.js export test/fixtures/canonical-v0.4/minimal.jsonld --format turtle --out demo-deterministic.ttl --deterministic --seed myseed --clock 2026-01-01T00:00:00Z"

heading "Run the spec test suite"
cmd "npm test (expect 106/106 passing across 14 files)" "npm test"

heading "Cleanup"
if [ "$NO_CLEANUP" = "1" ]; then
    printf "\033[90mCleanup skipped (--no-cleanup); inspect demo-output.ttl, demo-output.nt, demo-deterministic.ttl\033[0m\n"
else
    rm -f demo-output.ttl demo-output.nt demo-deterministic.ttl merged.jsonld demo.zip
    printf "\033[90mdemo artifacts removed (re-run with --no-cleanup to inspect emitted output)\033[0m\n"
fi

printf "\n\033[36m=== Phase 1 CLI demo complete ===\033[0m\n"
printf "\033[90mSee project/IMPLEMENTATION_PLAN.md for the 12 Phase 1 tasks; V3.2-GAP-REGISTRY.md for substrate observations.\033[0m\n"
