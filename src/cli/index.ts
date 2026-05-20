/**
 * GraphWrite CLI Entry Point (SPEC section 23; IMPLEMENTATION_PLAN.md section 1.11)
 *
 * Commands: validate, export, migrate, refactor-iri, import-ontology.
 * This file is the 'graphwrite' binary entry point (dist/cli/index.js).
 *
 * Exit codes (SPEC section 23; ADR-003):
 *   0 -- success
 *   1 -- validation errors (hard errors other than unsupported version)
 *   2 -- not yet implemented / path escape / file I/O error
 *   3 -- malformed input / parse failure / missing required argument
 *   4 -- unsupported version (INVALID_SPEC_VERSION in validate findings)
 *
 * Path containment (SPEC section 12.2): CLI file path arguments resolved
 * relative to CWD. Paths that resolve outside CWD are rejected with exit 2
 * unless --allow-outside-cwd is passed.
 *
 * Adapter tier: MAY import from src/kernel/, src/validate/, src/emit/,
 * src/iri/, src/refactor/, src/migrate/.
 * MUST NOT be imported by src/kernel/ (kernel purity preserved).
 */

import { parseArgs } from "node:util";
import { readFile, writeFile } from "node:fs/promises";
import { resolve, relative, isAbsolute } from "node:path";
import { stableStringify } from "../kernel/canonicalize.js";
import { validate } from "../validate/index.js";
import { INVALID_SPEC_VERSION } from "../validate/codes.js";
import { migrate } from "../migrate/index.js";
import { refactorIri } from "../refactor/index.js";
import { emitTurtle } from "../emit/turtle.js";
import { emitNTriples } from "../emit/n-triples.js";
import { emitMarkdown } from "../emit/markdown.js";

// ---------------------------------------------------------------------------
// Path containment (SPEC section 12.2)
// ---------------------------------------------------------------------------

/**
 * Resolves rawPath to an absolute path, enforcing CWD containment.
 * Exits 2 if the path escapes CWD and allowOutside is false.
 *
 * A path escapes CWD when:
 *   - relative(CWD, resolved) starts with ".." (parent traversal), OR
 *   - relative(CWD, resolved) is absolute (cross-drive on Windows).
 */
function safeResolve(rawPath: string, allowOutside: boolean): string {
  const resolved = resolve(rawPath);
  if (!allowOutside) {
    const rel = relative(process.cwd(), resolved);
    if (rel.startsWith("..") || isAbsolute(rel)) {
      process.stderr.write(
        `Path escape rejected: "${rawPath}" resolves outside the working directory.` +
          ` Use --allow-outside-cwd to override.\n`,
      );
      process.exit(2);
    }
  }
  return resolved;
}

// ---------------------------------------------------------------------------
// I/O helpers
// ---------------------------------------------------------------------------

/**
 * Read and parse a JSON file. Exits 2 on I/O error; exits 3 on parse failure
 * or when the top-level value is not a plain object.
 */
async function readJsonFile(
  filePath: string,
): Promise<Record<string, unknown>> {
  let raw: string;
  try {
    raw = await readFile(filePath, "utf-8");
  } catch {
    process.stderr.write(`File I/O error: cannot read "${filePath}"\n`);
    process.exit(2);
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch (e) {
    process.stderr.write(
      `Malformed JSON in "${filePath}": ${
        e instanceof Error ? e.message : String(e)
      }\n`,
    );
    process.exit(3);
  }
  if (parsed === null || typeof parsed !== "object" || Array.isArray(parsed)) {
    process.stderr.write(
      `Malformed input: "${filePath}" does not contain a JSON object.\n`,
    );
    process.exit(3);
  }
  return parsed as Record<string, unknown>;
}

/**
 * Write content to a file path or stdout. Exits 2 on write error.
 * Appends a trailing newline if the content does not already end with one.
 */
async function writeOutput(
  content: string,
  outPath: string | undefined,
): Promise<void> {
  const body = content.endsWith("\n") ? content : content + "\n";
  if (outPath !== undefined) {
    try {
      await writeFile(outPath, body, "utf-8");
    } catch {
      process.stderr.write(`File I/O error: cannot write to "${outPath}"\n`);
      process.exit(2);
    }
  } else {
    process.stdout.write(body);
  }
}

// ---------------------------------------------------------------------------
// Command: validate
// ---------------------------------------------------------------------------

async function cmdValidate(
  filePath: string,
  allowOutside: boolean,
): Promise<void> {
  const resolved = safeResolve(filePath, allowOutside);
  const doc = await readJsonFile(resolved);
  const report = validate(doc);

  process.stdout.write(stableStringify(report, true) + "\n");

  const findings = report["ecm:findings"];
  const hasVersionError = findings.some(
    (f) => f["ecm:code"] === INVALID_SPEC_VERSION,
  );
  const hasErrors = findings.some((f) => f["ecm:severity"] === "ecm:error");

  if (hasVersionError) {
    process.exit(4);
  } else if (hasErrors) {
    process.exit(1);
  } else {
    process.exit(0);
  }
}

// ---------------------------------------------------------------------------
// Command: export
// ---------------------------------------------------------------------------

async function cmdExport(
  filePath: string,
  format: string | undefined,
  outPath: string | undefined,
  allowOutside: boolean,
): Promise<void> {
  // Phase 1 stub: zip packaging implemented in Phase 4 (IMPLEMENTATION_PLAN section 4.4).
  if (format === "zip") {
    process.stderr.write("not yet implemented; available in Phase 4\n");
    process.exit(2);
  }

  if (format === undefined || format === "") {
    process.stderr.write("export: --format is required\n");
    process.exit(3);
  }

  const resolved = safeResolve(filePath, allowOutside);
  const doc = await readJsonFile(resolved);

  let content: string;
  switch (format) {
    case "turtle":
      content = emitTurtle(doc);
      break;
    case "n-triples":
      content = emitNTriples(doc);
      break;
    case "markdown":
      content = emitMarkdown(doc);
      break;
    case "json-ld":
      // Deferred to Chain 2 (IMPLEMENTATION_PLAN section 1.11 scope split).
      process.stderr.write("not yet implemented; available in Phase 2\n");
      process.exit(2);
      break;
    case "mermaid":
      // Deferred to Chain 2 (IMPLEMENTATION_PLAN section 1.11 scope split).
      process.stderr.write(
        "not yet implemented; available in a follow-up chain\n",
      );
      process.exit(2);
      break;
    default:
      process.stderr.write(
        `export: unknown format "${format}".` +
          " Supported in Phase 1: turtle, n-triples, markdown\n",
      );
      process.exit(2);
  }

  const resolvedOut =
    outPath !== undefined ? safeResolve(outPath, allowOutside) : undefined;
  await writeOutput(content, resolvedOut);
  process.exit(0);
}

// ---------------------------------------------------------------------------
// Command: migrate
// ---------------------------------------------------------------------------

async function cmdMigrate(
  filePath: string,
  outPath: string | undefined,
  allowOutside: boolean,
): Promise<void> {
  const resolved = safeResolve(filePath, allowOutside);
  const doc = await readJsonFile(resolved);
  const result = migrate(doc, "0.4");

  if (result.error !== undefined) {
    if (result.error.code === INVALID_SPEC_VERSION) {
      process.stderr.write(`Unsupported version: ${result.error.message}\n`);
      process.exit(4);
    }
    process.stderr.write(`Migration error: ${result.error.message}\n`);
    process.exit(3);
  }

  const content = stableStringify(result.document, true);
  const resolvedOut =
    outPath !== undefined ? safeResolve(outPath, allowOutside) : undefined;
  await writeOutput(content, resolvedOut);
  process.exit(0);
}

// ---------------------------------------------------------------------------
// Command: refactor-iri
// ---------------------------------------------------------------------------

async function cmdRefactorIri(
  filePath: string,
  oldIri: string,
  newIri: string,
  outPath: string | undefined,
  allowOutside: boolean,
): Promise<void> {
  const resolved = safeResolve(filePath, allowOutside);
  const doc = await readJsonFile(resolved);
  const result = refactorIri(doc, oldIri, newIri);

  const content = stableStringify(result.project, true);
  const resolvedOut =
    outPath !== undefined ? safeResolve(outPath, allowOutside) : undefined;
  await writeOutput(content, resolvedOut);
  process.exit(0);
}

// ---------------------------------------------------------------------------
// Main / argument parsing
// ---------------------------------------------------------------------------

async function main(): Promise<void> {
  const { values, positionals } = parseArgs({
    args: process.argv.slice(2),
    options: {
      format:              { type: "string" as const },
      out:                 { type: "string" as const },
      seed:                { type: "string" as const },
      clock:               { type: "string" as const },
      deterministic:       { type: "boolean" as const, default: false },
      old:                 { type: "string" as const },
      "new":               { type: "string" as const },
      "allow-outside-cwd": { type: "boolean" as const, default: false },
    },
    allowPositionals: true,
  });

  const command = positionals[0];
  const allowOutside = values["allow-outside-cwd"];

  switch (command) {
    case "validate": {
      const filePath = positionals[1];
      if (!filePath) {
        process.stderr.write("validate: <file> argument required\n");
        process.exit(3);
      }
      await cmdValidate(filePath, allowOutside);
      break;
    }

    case "export": {
      const filePath = positionals[1];
      if (!filePath) {
        process.stderr.write("export: <file> argument required\n");
        process.exit(3);
      }
      await cmdExport(filePath, values.format, values.out, allowOutside);
      break;
    }

    case "migrate": {
      const filePath = positionals[1];
      if (!filePath) {
        process.stderr.write("migrate: <file> argument required\n");
        process.exit(3);
      }
      await cmdMigrate(filePath, values.out, allowOutside);
      break;
    }

    case "refactor-iri": {
      const filePath = positionals[1];
      if (!filePath) {
        process.stderr.write("refactor-iri: <file> argument required\n");
        process.exit(3);
      }
      const oldIri = values.old;
      const newIri = values["new"];
      if (!oldIri || !newIri) {
        process.stderr.write("refactor-iri: --old and --new are required\n");
        process.exit(3);
      }
      await cmdRefactorIri(filePath, oldIri, newIri, values.out, allowOutside);
      break;
    }

    case "import-ontology": {
      // Phase 1 stub: full implementation in Phase 3 (IMPLEMENTATION_PLAN section 3.5).
      process.stderr.write("not yet implemented; available in Phase 3\n");
      process.exit(2);
      break;
    }

    default: {
      if (command === undefined) {
        process.stderr.write(
          "Usage: graphwrite <command> [options]\n" +
            "Commands: validate, export, migrate, refactor-iri, import-ontology\n",
        );
      } else {
        process.stderr.write(
          `Unknown command: "${command}"\n` +
            "Commands: validate, export, migrate, refactor-iri, import-ontology\n",
        );
      }
      process.exit(3);
    }
  }
}

main();
