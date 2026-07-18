import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";

import { planChecks, scanTextFiles } from "../../scripts/pre-commit.mjs";

let tempDirs: string[] = [];

afterEach(() => {
  for (const dir of tempDirs) {
    rmSync(dir, { recursive: true, force: true });
  }
  tempDirs = [];
});

function tempFile(name: string, content: string) {
  const dir = mkdtempSync(join(tmpdir(), "pre-commit-"));
  tempDirs.push(dir);
  const file = join(dir, name);
  writeFileSync(file, content);
  return file;
}

describe("pre-commit hook planning", () => {
  it("runs lint and targeted tests for staged test files", () => {
    const file = "tests/unit/preCommit.test.ts";

    const plan = planChecks([file]);

    expect(plan.commands).toContainEqual(["npx", ["eslint", "--max-warnings=0", file]]);
    expect(plan.commands).toContainEqual(["npm", ["test", "--", file, "--passWithNoTests"]]);
  });

  it("runs lockfile synchronization for package changes", () => {
    const plan = planChecks(["package.json"]);

    expect(plan.commands).toContainEqual(["npm", ["install", "--package-lock-only", "--ignore-scripts"]]);
  });
});

describe("pre-commit text scanning", () => {
  it("blocks unresolved merge conflict markers", () => {
    const file = tempFile("conflict.ts", ["<<<<<<< HEAD", "const a = 1;", "=======", "const a = 2;", ">>>>>>> branch", ""].join("\n"));

    expect(scanTextFiles([file])).toEqual([
      `${file}: contains unresolved merge conflict markers`,
    ]);
  });

  it("blocks common secret-shaped values", () => {
    const file = tempFile("secret.ts", "const token = '" + "12345678901234567890" + "';\n");

    expect(scanTextFiles([file])).toEqual([
      `${file}: contains a value that looks like a secret`,
    ]);
  });
});
