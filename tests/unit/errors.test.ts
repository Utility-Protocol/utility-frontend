import { describe, expect, it } from "vitest";
import {
  SOROBAN_ERROR_CODES,
  classifyError,
  formatErrorForDisplay,
  resolveSorobanError,
} from "@/utils/errors";

describe("resolveSorobanError()", () => {
  it("maps known Soroban error substrings to readable messages", () => {
    expect(resolveSorobanError("tx_bad_seq")).toContain("sequence");
    expect(resolveSorobanError("AUTH_REVOKED")).toContain("re-authenticate");
    expect(resolveSorobanError("insufficient_balance")).toContain("funds");
  });

  it("falls back to network error keywords", () => {
    expect(resolveSorobanError("Failed to fetch")).toContain("server");
    expect(resolveSorobanError("WebSocket connection timeout")).toContain("internet");
  });

  it("wraps unknown errors in a generic message", () => {
    const unknown = "some obscure internal issue with no mapping";
    expect(resolveSorobanError(unknown)).toContain("unexpected error");
  });

  it("exposes a sizable dictionary of known codes", () => {
    expect(Object.keys(SOROBAN_ERROR_CODES).length).toBeGreaterThanOrEqual(15);
  });
});

describe("classifyError()", () => {
  it("marks authorization problems as high severity and actionable", () => {
    const result = classifyError(new Error("AUTH_REVOKED"));
    expect(result.severity).toBe("high");
    expect(result.actionable).toBe(true);
    expect(result.message).toContain("re-authenticate");
  });

  it("marks balance and fee issues as medium severity and actionable", () => {
    const result = classifyError("insufficient_balance");
    expect(result.severity).toBe("medium");
    expect(result.actionable).toBe(true);
  });

  it("marks timeouts as medium severity and actionable", () => {
    const result = classifyError("request timeout");
    expect(result.severity).toBe("medium");
    expect(result.actionable).toBe(true);
  });

  it("marks unknown failures as low severity and non-actionable", () => {
    const result = classifyError("something unexpected");
    expect(result.severity).toBe("low");
    expect(result.actionable).toBe(false);
  });
});

describe("formatErrorForDisplay()", () => {
  it("prefixes the severity tag", () => {
    expect(formatErrorForDisplay("request timeout")).toContain("[MEDIUM]");
    expect(formatErrorForDisplay(new Error("AUTH_REVOKED"))).toContain("[HIGH]");
  });
});
