# GraphWrite Phase 1 Demo (Windows PowerShell)
# Walks the CLI surface against the committed fixtures.
# Run from repo root: pwsh scripts\demo.ps1

$ErrorActionPreference = 'Continue'

# Optional flag: -NoCleanup to leave emitted artifacts on disk for inspection
param([switch]$NoCleanup)

function Heading($text) {
    Write-Host ""
    Write-Host "=== $text ===" -ForegroundColor Cyan
}

function Cmd($description, $command) {
    Write-Host ""
    Write-Host "# $description" -ForegroundColor Yellow
    Write-Host "$ $command" -ForegroundColor Green
    Invoke-Expression $command
    Write-Host ""
    Write-Host "(exit code: $LASTEXITCODE)" -ForegroundColor DarkGray
}

# Setup: ensure node_modules exists (fresh-clone reviewers may not have run npm install)
if (-not (Test-Path "node_modules")) {
    Heading "Setup (first-time only)"
    Cmd "Install dependencies (node_modules missing)" "npm install"
}

Heading "Build"
Cmd "Compile TypeScript" "npm run build"

Heading "Validate a clean v0.4 fixture"
# Phase 1 task 1.3 ships 2 of 26 SPEC-declared validation codes (MISSING_REALIST_ANCHOR + INVALID_SPEC_VERSION);
# remaining 24 codes are forward-tracked at ft-097-test-validator-2 (see V3.2-GAP-REGISTRY.md).
Cmd "Validate minimal canonical v0.4 (expect 0 hard errors)" "node dist/cli/index.js validate test/fixtures/canonical-v0.4/minimal.jsonld"

Heading "Validate malformed fixtures"
Cmd "Validate missing-realist-anchor (expect MISSING_REALIST_ANCHOR; exit 1)" "node dist/cli/index.js validate test/fixtures/malformed/missing-realist-anchor.jsonld"
Cmd "Validate invalid-spec-version (expect INVALID_SPEC_VERSION; exit 4)" "node dist/cli/index.js validate test/fixtures/malformed/invalid-spec-version.jsonld"

Heading "Export to canonical formats"
Cmd "Export Turtle (TBox prepended; deterministic)" "node dist/cli/index.js export test/fixtures/canonical-v0.4/minimal.jsonld --format turtle --out demo-output.ttl"
Write-Host "# First 40 lines of demo-output.ttl:" -ForegroundColor Yellow
Get-Content demo-output.ttl -TotalCount 40

Cmd "Export N-Triples (TBox prepended as N-Triples)" "node dist/cli/index.js export test/fixtures/canonical-v0.4/minimal.jsonld --format n-triples --out demo-output.nt"
Write-Host "# First 20 lines of demo-output.nt:" -ForegroundColor Yellow
Get-Content demo-output.nt -TotalCount 20

Heading "Phase 3/4 stubs (exit 2 with explicit not-implemented message)"
Cmd "import-ontology stub (Phase 3)" "node dist/cli/index.js import-ontology test/fixtures/canonical-v0.4/minimal.jsonld dummy.ttl --out merged.jsonld"
Cmd "export --format zip stub (Phase 4)" "node dist/cli/index.js export test/fixtures/canonical-v0.4/minimal.jsonld --format zip --out demo.zip"

Heading "Deterministic flag"
# Deterministic mode produces byte-identical output across runs/machines. Load-bearing for:
# - audit chain reproducibility
# - cross-substrate-revision drift detection (byte-comparison against golden files)
# - any future cross-instance verification (FNSR-relevance: reproducibility is the basis of audit-trail honesty at scale)
Cmd "Export with --deterministic --seed --clock (UUIDv5 + frozen clock)" "node dist/cli/index.js export test/fixtures/canonical-v0.4/minimal.jsonld --format turtle --out demo-deterministic.ttl --deterministic --seed myseed --clock 2026-01-01T00:00:00Z"

Heading "Run the spec test suite"
Cmd "npm test (expect 106/106 passing across 14 files)" "npm test"

Heading "Cleanup"
if ($NoCleanup) {
    Write-Host "Cleanup skipped (-NoCleanup); inspect demo-output.ttl, demo-output.nt, demo-deterministic.ttl" -ForegroundColor DarkGray
} else {
    Remove-Item -ErrorAction SilentlyContinue demo-output.ttl, demo-output.nt, demo-deterministic.ttl, merged.jsonld, demo.zip
    Write-Host "demo artifacts removed (re-run with -NoCleanup to inspect emitted output)" -ForegroundColor DarkGray
}

Write-Host ""
Write-Host "=== Phase 1 CLI demo complete ===" -ForegroundColor Cyan
Write-Host "See project/IMPLEMENTATION_PLAN.md for the 12 Phase 1 tasks; V3.2-GAP-REGISTRY.md for substrate observations." -ForegroundColor DarkGray
