# CI code coverage gate

The frontend CI pipeline enforces unit-test coverage before end-to-end tests run. The gate is implemented with Vitest's V8 coverage provider and is configured in `vitest.config.ts`.

## Architecture

1. GitHub Actions installs project dependencies with `npm ci`.
2. The coverage job installs the matching Vitest V8 coverage provider for the pinned Vitest version.
3. `npm run test:coverage:ci` runs the Vitest unit suite with coverage enabled.
4. Vitest fails the job when global coverage drops below the configured thresholds.
5. CI uploads `coverage/` as a build artifact so reviewers can inspect the text, JSON summary, and LCOV output.

The coverage job depends on lint/type-checking and the E2E job depends on both the build and coverage jobs. This makes coverage a required quality gate while preserving existing build and browser-test coverage.

## Thresholds

Global coverage thresholds are:

| Metric | Minimum |
| --- | ---: |
| Lines | 80% |
| Statements | 80% |
| Functions | 80% |
| Branches | 70% |

Worker entry points and locale JSON files are excluded from the aggregate because they are either exercised through integration paths or static data. Application TypeScript and TSX files under `src/` are included by default.

## Runbook

Run the same gate locally with:

```bash
npm install --no-save @vitest/coverage-v8@4.1.9
npm run test:coverage:ci
```

If the job fails:

1. Open the `coverage-reports` artifact from the failed workflow run.
2. Review `coverage/coverage-summary.json` for the metric below threshold.
3. Add or update unit tests for the uncovered paths.
4. Re-run `npm run test:coverage:ci` before pushing.

## Monitoring and alerts

GitHub branch protection should mark `Frontend CI / Unit Tests & Coverage` as a required status check. Failed threshold checks surface as pull-request status failures, and the uploaded coverage artifact provides the dashboard for the run-level coverage breakdown.
