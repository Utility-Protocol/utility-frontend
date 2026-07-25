# Pre-Commit Hook Suite

The repository uses a Git `pre-commit` hook to keep code quality checks close to the point where changes are authored.

## Architecture

- `.githooks/pre-commit` is the Git entry point and delegates to `npm run precommit:check`.
- `scripts/pre-commit.mjs` discovers staged files with `git diff --cached --name-only --diff-filter=ACMR`.
- The hook only runs checks that are relevant to the staged files:
  - text safety scan for unresolved merge markers and common secret patterns;
  - ESLint for staged JavaScript and TypeScript files;
  - Vitest for staged unit/component test files;
  - package lock synchronization when `package.json` or `package-lock.json` changes.
- `npm install` runs the `prepare` script, which sets `core.hooksPath` to `.githooks` for the local checkout.

## Operational Notes

- Run `npm run precommit:check` manually before pushing to reproduce hook behavior.
- Use `git commit --no-verify` only for emergency recovery, and follow up with a normal commit that passes the hook before opening a pull request.
- CI should still run the full build, test, and security review suite; the local hook is a fast feedback layer, not a replacement for CI.

## Monitoring and Rollout

- Treat hook failures as local quality signals; aggregate CI failures by command name (`eslint`, `vitest`, and lockfile sync) for dashboards and alerting.
- Roll out hook policy changes in canary fashion by first documenting the expected commands, then enabling them in `.githooks/pre-commit` after developers have the dependencies installed.
