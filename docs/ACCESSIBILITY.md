# Accessibility Statement

Utility Protocol is committed to making its operator dashboard usable by everyone,
including people who rely on assistive technology.

## Conformance target

**WCAG 2.1 Level AA.** We measure against the `wcag2a`, `wcag2aa`, `wcag21a`, and
`wcag21aa` rule sets.

## Current status

As of the latest audit, the application has **no automated accessibility violations** at
**critical, serious, or moderate** impact on the audited routes:

| Route | axe-core (WCAG 2.1 AA) | Keyboard navigation |
|---|---|---|
| `/` (operator dashboard) | ✅ 0 violations (all severities) | ✅ reachable, no traps |
| `/export` | ✅ 0 violations (all severities) | ✅ reachable |

The dashboard is composed of `GracefulDegradationDashboard`, `SloMonitoringPanel`,
`DisasterRecoveryPanel`, and the spatial grid views, all rendered at `/`.

## How accessibility is tested

Testing is automated and runs on demand via Playwright:

```bash
npm run test:a11y
```

This runs two suites in `tests/a11y/`:

- **`axe-core` audit** (`axe.spec.ts`) — scans each route against WCAG 2.1 A/AA and fails
  the build on any **critical, serious, or moderate** violation.
- **Keyboard navigation** (`keyboard.spec.ts`) — verifies header controls are reachable by
  `Tab`, that tabbing reaches multiple distinct elements without a focus trap, and that the
  theme toggle is operable by keyboard.

These suites are **enforced in CI** by `.github/workflows/a11y.yml`, which runs them via
`playwright.a11y.config.ts` on every change, so an accessibility regression fails the
build. `npm run test:a11y` runs the same suites locally.

## Accessibility measures in the codebase

- `lang="en"` set on the root `<html>` element (`src/app/layout.tsx`).
- Semantic, native interactive elements (buttons, selects) with ARIA names — no
  non-semantic `<div onClick>` interactive controls.
- Visible focus indicators (`:focus-visible` / focus-ring styles).
- Theme system with light/dark modes chosen for adequate contrast.
- Loading skeletons carry visible text rather than being empty regions.

## Known limitations

- **Manual screen-reader verification** (VoiceOver / NVER) is not automated; automated
  tooling cannot fully substitute for it. Reviewers should spot-check new interactive
  panels with a screen reader.
- Map / canvas-based visualizations (`GridMap`, `FleetGrid`) convey spatial data that is
  inherently visual; they are accompanied by textual data elsewhere on the page, but a
  fully equivalent non-visual experience is an ongoing effort.

## Feedback

If you encounter an accessibility barrier, please open an issue on the repository with the
route, the assistive technology used, and a short description. Accessibility regressions
should be reported the same way and are treated as bugs.
