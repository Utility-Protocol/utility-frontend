#!/usr/bin/env node
import { spawnSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";

const TEXT_FILE_PATTERN = /\.(?:[cm]?[jt]sx?|json|md|css|scss|html|ya?ml|mjs|cjs|sh)$/i;
const LINT_FILE_PATTERN = /\.(?:[cm]?[jt]sx?|[cm]?js)$/i;
const TEST_FILE_PATTERN = /^tests\/.*\.test\.(?:[cm]?[jt]sx?)$/i;
const SECRET_PATTERN = /(AKIA[0-9A-Z]{16}|-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----|(?:api[_-]?key|secret|token|password)\s*[:=]\s*["'][^"']{16,})/i;

export function getStagedFiles(git = runGit) {
  const result = git(["diff", "--cached", "--name-only", "--diff-filter=ACMR"]);
  if (result.status !== 0) {
    throw new Error(result.stderr || "Unable to read staged files");
  }
  return result.stdout.split(/\r?\n/).map((file) => file.trim()).filter(Boolean);
}

export function planChecks(files) {
  const existing = files.filter((file) => existsSync(file));
  const lintFiles = existing.filter((file) => LINT_FILE_PATTERN.test(file));
  const textFiles = existing.filter((file) => TEXT_FILE_PATTERN.test(file));
  const commands = [];

  if (lintFiles.length > 0) {
    commands.push(["npx", ["eslint", "--max-warnings=0", ...lintFiles]]);
  }

  const testFiles = existing.filter((file) => TEST_FILE_PATTERN.test(file));
  if (testFiles.length > 0) {
    commands.push(["npm", ["test", "--", ...testFiles, "--passWithNoTests"]]);
  }

  if (existing.includes("package.json") || existing.includes("package-lock.json")) {
    commands.push(["npm", ["install", "--package-lock-only", "--ignore-scripts"]]);
  }

  return { textFiles, commands };
}

export function scanTextFiles(files) {
  const violations = [];
  for (const file of files) {
    const content = readFileSync(file, "utf8");
    if (/^(<<<<<<< |=======|>>>>>>> )/m.test(content)) {
      violations.push(`${file}: contains unresolved merge conflict markers`);
    }
    if (SECRET_PATTERN.test(content)) {
      violations.push(`${file}: contains a value that looks like a secret`);
    }
  }
  return violations;
}

function runGit(args) {
  return spawnSync("git", args, { encoding: "utf8" });
}

function runCommand(command, args) {
  process.stdout.write(`pre-commit: ${command} ${args.join(" ")}\n`);
  return spawnSync(command, args, { stdio: "inherit", shell: process.platform === "win32" });
}

export function main({ run = runCommand, git = runGit } = {}) {
  let files;
  try {
    files = getStagedFiles(git);
  } catch (error) {
    console.error(`pre-commit: ${error.message}`);
    return 1;
  }

  if (files.length === 0) {
    process.stdout.write("pre-commit: no staged files to check\n");
    return 0;
  }

  const { textFiles, commands } = planChecks(files);
  const violations = scanTextFiles(textFiles);
  if (violations.length > 0) {
    console.error(["pre-commit: blocked commit", ...violations.map((violation) => `- ${violation}`)].join("\n"));
    return 1;
  }

  for (const [command, args] of commands) {
    const result = run(command, args);
    if (result.status !== 0) {
      return result.status ?? 1;
    }
  }

  process.stdout.write("pre-commit: all checks passed\n");
  return 0;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  process.exit(main());
}
