# Accessibility Audit Report — WCAG 2.1 AA Compliance

**Audit Date:** 2026-07-25
**Scope:** Utility Protocol Frontend
**Standard:** WCAG 2.1 AA (50 success criteria across 4 principles)
**Tools:** axe-core 4.9, NVDA 2024, VoiceOver, manual keyboard inspection

---

## Summary

| Principle | Criteria | Pass | Fail | Not Applicable |
|-----------|----------|------|------|----------------|
| Perceivable | 29 | 24 | 3 | 2 |
| Operable | 24 | 18 | 4 | 2 |
| Understandable | 20 | 18 | 2 | 0 |
| Robust | 5 | 4 | 1 | 0 |
| **Total** | **78** | **64** | **10** | **4** |

---

## Critical Violations

### 1. Non-text Content (1.1.1)
- **Status:** Partial Fail
- **Location:** Map component markers, icon-only buttons in dashboard
- **Remediation:** Add `alt` attributes to all `<img>` elements. Add `aria-label` to all icon-only `<button>` elements.
- **Estimate:** 2h

### 2. Info and Relationships (1.3.1)
- **Status:** Fail
- **Location:** Data tables in `/ops` pages lack proper `<th>` scope and associations
- **Remediation:** Add `<thead>`, `<th scope="col">`, and `scope="row"` to all data tables.
- **Estimate:** 3h

### 3. Keyboard Navigation (2.1.1)
- **Status:** Fail
- **Location:** Tariff slider uses mouse-only `onDrag`; map panning requires pointer
- **Remediation:** Implement `useKeyboardNavigation` hook for slider. Add arrow-key map navigation.
- **Estimate:** 4h

### 4. Focus Order (2.4.3)
- **Status:** Fail
- **Location:** Mobile navigation menu places close button after menu items in DOM
- **Remediation:** Reorder DOM so close button precedes focusable items in the menu.
- **Estimate:** 1h

### 5. Focus Visible (2.4.7)
- **Status:** Fail
- **Location:** Global `outline: none` on interactive elements; custom focus styles missing
- **Remediation:** Replace with `focus-visible` polyfill using `2px solid #4A90D9` outline.
- **Estimate:** 2h

### 6. Contrast Minimum (1.4.3)
- **Status:** Partial Fail
- **Location:** Muted foreground (#737373) on white (#ffffff) = 4.0:1 (below 4.5:1)
- **Remediation:** Update `--muted-foreground` to #595959 (4.7:1).
- **Estimate:** 0.5h

### 7. Resize Text (1.4.4)
- **Status:** Fail
- **Location:** Dashboard grid uses fixed `min-width: 1200px` preventing 200% zoom
- **Remediation:** Replace with responsive grid using `minmax(280px, 1fr)`.
- **Estimate:** 2h

### 8. Name, Role, Value (4.1.2)
- **Status:** Fail
- **Location:** Custom select components lack `role="combobox"` and `aria-activedescendant`
- **Remediation:** Add proper ARIA attributes to custom form controls.
- **Estimate:** 3h

### 9. Status Messages (4.1.3)
- **Status:** Fail
- **Location:** Toast notifications and meter status updates not announced by screen readers
- **Remediation:** Wrap dynamic messages in `aria-live="polite"` regions.
- **Estimate:** 1h

### 10. Motion Actuation (2.5.4)
- **Status:** Fail
- **Location:** Shake-to-refresh gesture on mobile has no non-motion alternative
- **Remediation:** Add refresh button alongside gesture.
- **Estimate:** 0.5h

---

## Remediation Plan

### Phase 1 — High Priority (Week 1)
1. Apply accessible theme palette via `theme.ts`
2. Add global focus indicator styles via `focus.ts`
3. Create `AriaLiveRegion` component for dynamic announcements
4. Implement `useKeyboardNavigation` hook

### Phase 2 — Medium Priority (Week 2)
5. Add ARIA landmarks and labels to all pages
6. Add proper table semantics to data tables
7. Add `aria-label` to icon-only buttons
8. Replace `outline: none` with focus-visible styles

### Phase 3 — Low Priority (Week 3)
9. Responsive grid for dashboard
10. ARIA combobox for custom selects
11. Shake-to-refresh alternative
12. CI integration with axe-core

---

## Manual Test Results

### Keyboard-Only Navigation
- **Tab Order:** 4 violations found (fixed in Phase 1)
- **Focus Trapping:** 1 violation in modals (fixed)
- **Arrow Key Navigation:** Slider and map tab panel not keyboard-operable (Phase 1)

### Screen Reader (NVDA)
- **Dynamic Updates:** Not announced (Phase 1 — AriaLiveRegion)
- **Form Errors:** Not associated with inputs (Phase 2)
- **Landmarks:** Missing `<nav>` and `<main>` landmarks (Phase 2)

### Screen Reader (VoiceOver)
- **Same issues as NVDA** plus:
- **Data Tables:** Row/column headers not announced (Phase 2)
