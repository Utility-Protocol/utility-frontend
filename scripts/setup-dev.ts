#!/usr/bin/env -S npx tsx

import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import process from "node:process";

export interface SetupOptions {
  cwd?: string;
  env?: NodeJS.ProcessEnv;
  argv?: string[];
  log?: (message: string) => void;
  runCommand?: (command: string, args: string[], cwd: string) => void;
}

export interface SetupResult {
  installedDependencies: boolean;
  wroteEnvFile: boolean;
  ranChecks: string[];
}

const REQUIRED_NODE_MAJOR = 20;
const ENV_EXAMPLE = `# Local development defaults\n# Copy values here only; never commit secrets in .env.local.\nNEXT_PUBLIC_APP_ENV=local\n`;

function major(version: string): number {
  return Number.parseInt(version.replace(/^v/, "").split(".")[0] ?? "0", 10);
}

function hasArg(argv: string[], name: string): boolean {
  return argv.includes(name);
}

function commandExists(command: string, cwd: string): boolean {
  try {
    execFileSync(command, ["--version"], { cwd, stdio: "ignore" });
    return true;
  } catch {
    return false;
  }
}

function ensureEnvExample(cwd: string): boolean {
  const examplePath = path.join(cwd, ".env.example");
  if (fs.existsSync(examplePath)) {
    return false;
  }

  fs.writeFileSync(examplePath, ENV_EXAMPLE);
  return true;
}

function ensureLocalEnv(cwd: string): boolean {
  const localPath = path.join(cwd, ".env.local");
  if (fs.existsSync(localPath)) {
    return false;
  }

  const examplePath = path.join(cwd, ".env.example");
  fs.copyFileSync(examplePath, localPath);
  return true;
}

export function setupDev(options: SetupOptions = {}): SetupResult {
  const cwd = options.cwd ?? process.cwd();
  const argv = options.argv ?? process.argv.slice(2);
  // eslint-disable-next-line no-console
  const log = options.log ?? console.log;
  const runCommand =
    options.runCommand ??
    ((command: string, args: string[], commandCwd: string) => {
      execFileSync(command, args, { cwd: commandCwd, stdio: "inherit" });
    });

  if (major(process.version) < REQUIRED_NODE_MAJOR) {
    throw new Error(
      `Node.js ${REQUIRED_NODE_MAJOR}+ is required. Current version: ${process.version}`
    );
  }

  if (!commandExists("npm", cwd)) {
    throw new Error("npm is required for local setup, but it was not found on PATH.");
  }

  const wroteEnvExample = ensureEnvExample(cwd);
  const wroteEnvFile = ensureLocalEnv(cwd);
  if (wroteEnvExample) {
    log("Created .env.example with local-safe defaults.");
  }
  if (wroteEnvFile) {
    log("Created .env.local from .env.example.");
  } else {
    log("Found existing .env.local; leaving it unchanged.");
  }

  const installedDependencies = !hasArg(argv, "--skip-install");
  if (installedDependencies) {
    log("Installing dependencies with npm ci...");
    runCommand("npm", ["ci"], cwd);
  } else {
    log("Skipping dependency installation (--skip-install). Using existing node_modules.");
  }

  const ranChecks: string[] = [];
  if (!hasArg(argv, "--skip-checks")) {
    for (const check of ["lint", "test"] as const) {
      log(`Running npm run ${check}...`);
      runCommand("npm", ["run", check], cwd);
      ranChecks.push(check);
    }
  } else {
    log("Skipping validation checks (--skip-checks).");
  }

  log("Local development setup complete. Start the app with: npm run dev");

  return { installedDependencies, wroteEnvFile, ranChecks };
}

if (import.meta.url === `file://${process.argv[1]}`) {
  setupDev();
}
