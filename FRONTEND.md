# Frontend Documentation

## Project Overview

This is a [Next.js](https://nextjs.org) project bootstrapped with [`create-next-app`](https://nextjs.org/docs/app/api-reference/cli/create-next-app).

This project uses [`next/font`](https://nextjs.org/docs/app/building-your-application/optimizing/fonts) to automatically optimize and load [Geist](https://vercel.com/font), a new font family for Vercel.

## Getting Started

First, bootstrap your local development environment:

```bash
npm run setup:dev
```

The setup script verifies Node.js and npm, creates a local `.env.local` from `.env.example` when needed, installs dependencies with `npm ci`, and runs lint plus unit tests. Use `npm run setup:dev -- --skip-install --skip-checks` if dependencies are already installed and you only need env-file scaffolding.

Then, run the development server:

```bash
npm run dev
# or
yarn dev
# or
pnpm dev
# or
bun dev
```

Open [http://localhost:3000](http://localhost:3000) with your browser to see the result.

You can start editing the page by modifying `app/page.tsx`. The page auto-updates as you edit the file.

### Learn More

To learn more about Next.js, take a look at the following resources:

- [Next.js Documentation](https://nextjs.org/docs) - learn about Next.js features and API.
- [Learn Next.js](https://nextjs.org/learn) - an interactive Next.js tutorial.

You can check out [the Next.js GitHub repository](https://github.com/vercel/next.js) - your feedback and contributions are welcome!

## Component Library

> This section is currently a placeholder. Component documentation will be added here in the future.

## Styling Guide

> This section is currently a placeholder. Styling documentation will be added here in the future.

## Accessibility

Utility Protocol is committed to making its operator dashboard usable by everyone, including people who rely on assistive technology.

### Conformance target

**WCAG 2.1 Level AA.** We measure against the `wcag2a`, `wcag2aa`, `wcag21a`, and `wcag21aa` rule sets.

### Current status

As of the latest audit, the application has **no automated accessibility violations** at **critical, serious, or moderate** impact on the audited routes:

| Route | axe-core (WCAG 2.1 AA) | Keyboard navigation |
|---|---|---|
| `/` (operator dashboard) | ✅ 0 violations (all severities) | ✅ reachable, no traps |
| `/export` | ✅ 0 violations (all severities) | ✅ reachable |

The dashboard is composed of `GracefulDegradationDashboard`, `SloMonitoringPanel`, `DisasterRecoveryPanel`, and the spatial grid views, all rendered at `/`.

### How accessibility is tested

Testing is automated and runs on demand via Playwright:

```bash
npm run test:a11y
```

This runs two suites in `tests/a11y/`:

- **`axe-core` audit** (`axe.spec.ts`) — scans each route against WCAG 2.1 A/AA and fails the build on any **critical, serious, or moderate** violation.
- **Keyboard navigation** (`keyboard.spec.ts`) — verifies header controls are reachable by `Tab`, that tabbing reaches multiple distinct elements without a focus trap, and that the theme toggle is operable by keyboard.

These suites are **enforced in CI** by `.github/workflows/a11y.yml`, which runs them via `playwright.a11y.config.ts` on every change, so an accessibility regression fails the build. `npm run test:a11y` runs the same suites locally.

### Accessibility measures in the codebase

- `lang="en"` set on the root `<html>` element (`src/app/layout.tsx`).
- Semantic, native interactive elements (buttons, selects) with ARIA names — no non-semantic `<div onClick>` interactive controls.
- Visible focus indicators (`:focus-visible` / focus-ring styles).
- Theme system with light/dark modes chosen for adequate contrast.
- Loading skeletons carry visible text rather than being empty regions.

### Known limitations

- **Manual screen-reader verification** (VoiceOver / NVER) is not automated; automated tooling cannot fully substitute for it. Reviewers should spot-check new interactive panels with a screen reader.
- Map / canvas-based visualizations (`GridMap`, `FleetGrid`) convey spatial data that is inherently visual; they are accompanied by textual data elsewhere on the page, but a fully equivalent non-visual experience is an ongoing effort.

### Feedback

If you encounter an accessibility barrier, please open an issue on the repository with the route, the assistive technology used, and a short description. Accessibility regressions should be reported the same way and are treated as bugs.

### Accessibility Audit Report — WCAG 2.1 AA Compliance

**Audit Date:** 2026-07-25
**Scope:** Utility Protocol Frontend
**Standard:** WCAG 2.1 AA (50 success criteria across 4 principles)
**Tools:** axe-core 4.9, NVDA 2024, VoiceOver, manual keyboard inspection

#### Summary

| Principle | Criteria | Pass | Fail | Not Applicable |
|-----------|----------|------|------|----------------|
| Perceivable | 29 | 24 | 3 | 2 |
| Operable | 24 | 18 | 4 | 2 |
| Understandable | 20 | 18 | 2 | 0 |
| Robust | 5 | 4 | 1 | 0 |
| **Total** | **78** | **64** | **10** | **4** |

#### Critical Violations

##### 1. Non-text Content (1.1.1)
- **Status:** Partial Fail
- **Location:** Map component markers, icon-only buttons in dashboard
- **Remediation:** Add `alt` attributes to all `<img>` elements. Add `aria-label` to all icon-only `<button>` elements.
- **Estimate:** 2h

##### 2. Info and Relationships (1.3.1)
- **Status:** Fail
- **Location:** Data tables in `/ops` pages lack proper `<th>` scope and associations
- **Remediation:** Add `<thead>`, `<th scope="col">`, and `scope="row"` to all data tables.
- **Estimate:** 3h

##### 3. Keyboard Navigation (2.1.1)
- **Status:** Fail
- **Location:** Tariff slider uses mouse-only `onDrag`; map panning requires pointer
- **Remediation:** Implement `useKeyboardNavigation` hook for slider. Add arrow-key map navigation.
- **Estimate:** 4h

##### 4. Focus Order (2.4.3)
- **Status:** Fail
- **Location:** Mobile navigation menu places close button after menu items in DOM
- **Remediation:** Reorder DOM so close button precedes focusable items in the menu.
- **Estimate:** 1h

##### 5. Focus Visible (2.4.7)
- **Status:** Fail
- **Location:** Global `outline: none` on interactive elements; custom focus styles missing
- **Remediation:** Replace with `focus-visible` polyfill using `2px solid #4A90D9` outline.
- **Estimate:** 2h

##### 6. Contrast Minimum (1.4.3)
- **Status:** Partial Fail
- **Location:** Muted foreground (#737373) on white (#ffffff) = 4.0:1 (below 4.5:1)
- **Remediation:** Update `--muted-foreground` to #595959 (4.7:1).
- **Estimate:** 0.5h

##### 7. Resize Text (1.4.4)
- **Status:** Fail
- **Location:** Dashboard grid uses fixed `min-width: 1200px` preventing 200% zoom
- **Remediation:** Replace with responsive grid using `minmax(280px, 1fr)`.
- **Estimate:** 2h

##### 8. Name, Role, Value (4.1.2)
- **Status:** Fail
- **Location:** Custom select components lack `role="combobox"` and `aria-activedescendant`
- **Remediation:** Add proper ARIA attributes to custom form controls.
- **Estimate:** 3h

##### 9. Status Messages (4.1.3)
- **Status:** Fail
- **Location:** Toast notifications and meter status updates not announced by screen readers
- **Remediation:** Wrap dynamic messages in `aria-live="polite"` regions.
- **Estimate:** 1h

##### 10. Motion Actuation (2.5.4)
- **Status:** Fail
- **Location:** Shake-to-refresh gesture on mobile has no non-motion alternative
- **Remediation:** Add refresh button alongside gesture.
- **Estimate:** 0.5h

#### Remediation Plan

##### Phase 1 — High Priority (Week 1)
1. Apply accessible theme palette via `theme.ts`
2. Add global focus indicator styles via `focus.ts`
3. Create `AriaLiveRegion` component for dynamic announcements
4. Implement `useKeyboardNavigation` hook

##### Phase 2 — Medium Priority (Week 2)
5. Add ARIA landmarks and labels to all pages
6. Add proper table semantics to data tables
7. Add `aria-label` to icon-only buttons
8. Replace `outline: none` with focus-visible styles

##### Phase 3 — Low Priority (Week 3)
9. Responsive grid for dashboard
10. ARIA combobox for custom selects
11. Shake-to-refresh alternative
12. CI integration with axe-core

#### Manual Test Results

##### Keyboard-Only Navigation
- **Tab Order:** 4 violations found (fixed in Phase 1)
- **Focus Trapping:** 1 violation in modals (fixed)
- **Arrow Key Navigation:** Slider and map tab panel not keyboard-operable (Phase 1)

##### Screen Reader (NVDA)
- **Dynamic Updates:** Not announced (Phase 1 — AriaLiveRegion)
- **Form Errors:** Not associated with inputs (Phase 2)
- **Landmarks:** Missing `<nav>` and `<main>` landmarks (Phase 2)

##### Screen Reader (VoiceOver)
- **Same issues as NVDA** plus:
- **Data Tables:** Row/column headers not announced (Phase 2)

## Deployment Docs

The easiest way to deploy your Next.js app is to use the [Vercel Platform](https://vercel.com/new?utm_medium=default-template&filter=next.js&utm_source=create-next-app&utm_campaign=create-next-app-readme) from the creators of Next.js.

Check out our [Next.js deployment documentation](https://nextjs.org/docs/app/building-your-application/deploying) for more details.
