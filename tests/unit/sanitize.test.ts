import { describe, it, expect } from "vitest";
import { sanitize, validateLabel } from "@/utils/sanitize";

describe("sanitize()", () => {
  it("strips < and > characters", () => {
    expect(sanitize("<script>alert(1)</script>")).toBe("scriptalert(1)/script");
  });

  it("removes javascript: URI scheme (case-insensitive)", () => {
    expect(sanitize("javascript:alert(1)")).toBe("alert(1)");
    expect(sanitize("JAVASCRIPT:alert(1)")).toBe("alert(1)");
    expect(sanitize("JavaScript:void(0)")).toBe("void(0)");
  });

  it("strips onerror= and other on* event handlers", () => {
    expect(sanitize("img src=x onerror=alert(1)")).toBe("img src=x alert(1)");
    expect(sanitize("onclick=doSomething()")).toBe("doSomething()");
    expect(sanitize("onmouseover=steal()")).toBe("steal()");
  });

  it("leaves safe strings unchanged", () => {
    expect(sanitize("Sensor A")).toBe("Sensor A");
    expect(sanitize("Floor 3 - Room 12")).toBe("Floor 3 - Room 12");
    expect(sanitize("  trim me  ")).toBe("trim me");
  });

  it("handles empty string", () => {
    expect(sanitize("")).toBe("");
  });

  it("handles combined payloads", () => {
    const payload = '<img src=x onerror=alert(1) />';
    const result = sanitize(payload);
    expect(result).not.toContain("<");
    expect(result).not.toContain(">");
    expect(result).not.toContain("onerror=");
  });

  it("removes javascript: even when embedded in larger string", () => {
    const payload = "click here: javascript:void(0)";
    expect(sanitize(payload)).not.toContain("javascript:");
  });
});

describe("validateLabel()", () => {
  it("truncates to 64 characters", () => {
    const long = "a".repeat(100);
    expect(validateLabel(long).length).toBe(64);
  });

  it("leaves short labels unchanged", () => {
    expect(validateLabel("My Device")).toBe("My Device");
  });

  it("sanitizes before truncating", () => {
    const payload = "<script>" + "x".repeat(100);
    const result = validateLabel(payload);
    expect(result).not.toContain("<");
    expect(result).not.toContain(">");
    expect(result.length).toBeLessThanOrEqual(64);
  });

  it("returns empty string for pure XSS label", () => {
    expect(validateLabel("<><><>")).toBe("");
  });
});
