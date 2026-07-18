import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { setupDev } from "../../scripts/setup-dev";

const tempDirs: string[] = [];

function makeTempProject(): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "utility-setup-dev-"));
  tempDirs.push(dir);
  return dir;
}

afterEach(() => {
  vi.restoreAllMocks();
  for (const dir of tempDirs.splice(0)) {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

describe("setupDev", () => {
  it("creates local env files and runs install plus validation by default", () => {
    const cwd = makeTempProject();
    const commands: string[] = [];

    const result = setupDev({
      cwd,
      argv: [],
      log: vi.fn(),
      runCommand: (command, args) => commands.push([command, ...args].join(" ")),
    });

    expect(result).toEqual({
      installedDependencies: true,
      wroteEnvFile: true,
      ranChecks: ["lint", "test"],
    });
    expect(fs.existsSync(path.join(cwd, ".env.example"))).toBe(true);
    expect(fs.readFileSync(path.join(cwd, ".env.local"), "utf8")).toContain(
      "NEXT_PUBLIC_APP_ENV=local"
    );
    expect(commands).toEqual(["npm ci", "npm run lint", "npm run test"]);
  });

  it("honors skip flags and preserves an existing .env.local", () => {
    const cwd = makeTempProject();
    fs.writeFileSync(path.join(cwd, ".env.example"), "EXAMPLE=true\n");
    fs.writeFileSync(path.join(cwd, ".env.local"), "CUSTOM=true\n");

    const result = setupDev({
      cwd,
      argv: ["--skip-install", "--skip-checks"],
      log: vi.fn(),
      runCommand: vi.fn(),
    });

    expect(result).toEqual({
      installedDependencies: false,
      wroteEnvFile: false,
      ranChecks: [],
    });
    expect(fs.readFileSync(path.join(cwd, ".env.local"), "utf8")).toBe("CUSTOM=true\n");
  });
});
