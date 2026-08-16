import { test, expect } from "@playwright/test";
import axe from "axe-core";

const SCAN_PATHS = ["/", "/export"];

test.describe("axe-core accessibility audit", () => {
  for (const path of SCAN_PATHS) {
    test(`no critical or serious violations on ${path}`, async ({ page }) => {
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
        return results.violations
          .filter(
            (violation) =>
              violation.impact === "critical" || violation.impact === "serious"
          )
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
