import { test, expect } from "@playwright/test";
import { readFileSync } from "node:fs";

/**
 * Drives the bulk export dialog end to end against mocked REST endpoints and
 * verifies the downloaded CSV has the expected row count. The browser lacks the
 * File System Access API in headless mode, so the Blob download fallback fires
 * and Playwright captures it as a download event.
 */

const ROW_COUNT = 250;

// The export dialog talks to NEXT_PUBLIC_API_URL (default http://localhost:4000),
// which is cross-origin from the dev server. Mocked responses therefore need
// permissive CORS headers so the browser lets the page read them.
const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "*",
  "Access-Control-Allow-Methods": "GET,OPTIONS",
};

test.describe("Bulk export", () => {
  test.beforeEach(async ({ page }) => {
    // Force the Blob download fallback: headless Chromium may expose
    // showSaveFilePicker, whose native dialog can never appear and would hang
    // the export. Removing it makes the pipeline emit a capturable download.
    await page.addInitScript(() => {
      try {
        Object.defineProperty(window, "showSaveFilePicker", {
          value: undefined,
          configurable: true,
        });
      } catch {
        // ignore if the property is locked
      }
    });

    // Column schema.
    await page.route("**/api/resources/schema", async (route) => {
      await route.fulfill({
        status: 200,
        headers: { "content-type": "application/json", ...CORS_HEADERS },
        body: JSON.stringify([
          { name: "id", type: "number" },
          { name: "kwh", type: "number" },
        ]),
      });
    });

    // Chunked NDJSON export. Returns ROW_COUNT rows for the first chunk and an
    // empty body afterwards (signals end of data).
    await page.route("**/api/resources/export*", async (route) => {
      const url = new URL(route.request().url());
      const offset = Number(url.searchParams.get("offset") ?? "0");
      let body = "";
      if (offset === 0) {
        body =
          Array.from({ length: ROW_COUNT }, (_, i) =>
            JSON.stringify({ id: i, kwh: i * 2 })
          ).join("\n") + "\n";
      }
      await route.fulfill({
        status: 200,
        headers: { "content-type": "application/x-ndjson", ...CORS_HEADERS },
        body,
      });
    });
  });

  test("exports a CSV with the expected row count", async ({ page }) => {
    await page.goto("/export");
    await page.getByTestId("open-export").click();

    // Wait for the schema-driven column checkboxes to render (proves the schema
    // fetch resolved) and the Export button to become enabled.
    await expect(page.getByRole("checkbox").first()).toBeVisible();
    const exportButton = page.getByRole("button", { name: "Export", exact: true });
    await expect(exportButton).toBeEnabled();

    const downloadPromise = page.waitForEvent("download");
    await exportButton.click();
    const download = await downloadPromise;

    expect(download.suggestedFilename()).toBe("resource-export.csv");

    const path = await download.path();
    expect(path).toBeTruthy();
    const content = readFileSync(path!, "utf-8");
    const lines = content.trimEnd().split("\r\n");

    // Header + ROW_COUNT data rows.
    expect(lines.length).toBe(ROW_COUNT + 1);
    expect(lines[0]).toBe("id,kwh");
    expect(lines[1]).toBe("0,0");
    expect(lines[ROW_COUNT]).toBe(`${ROW_COUNT - 1},${(ROW_COUNT - 1) * 2}`);
  });
});
