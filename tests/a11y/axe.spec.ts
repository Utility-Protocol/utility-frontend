import { test, expect } from "@playwright/test";
import axe from "axe-core";

const SCAN_PATHS = ["/", "/export"];

test.describe("axe-core accessibility audit", () => {
  for (const path of SCAN_PATHS) {
    test(`no critical, serious, or moderate violations on ${path}`, async ({ page }) => {
      await page.goto(path, { waitUntil: "load", timeout: 60_000 });
      await page.waitForTimeout(2_000);
      await page.addScriptTag({ content: axe.source });

      const violations = await page.evaluate(async () => {
        const axeGlobal = window as unknown as { axe: typeof import("axe-core") };
        const results = await axeGlobal.axe.run(document, {
          runOnly: {
            type: "tag",
            values: ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"],
          },
        });
        // Gate on critical, serious, AND moderate impact. The dashboard
        // currently reports zero violations at any level (see
        // docs/ACCESSIBILITY.md); moderate is included so a regression that
        // introduces a moderate WCAG issue also fails the build, not just
        // critical/serious ones.
        const blocking = new Set(["critical", "serious", "moderate"]);
        return results.violations
          .filter((violation) => blocking.has(violation.impact ?? ""))
          .map((violation) => ({
            id: violation.id,
            impact: violation.impact,
            help: violation.help,
            nodes: violation.nodes.length,
          }));
      });

      expect(
        violations,
        violations.length
          ? JSON.stringify(violations, null, 2)
          : undefined
      ).toHaveLength(0);
    });
  }
});
