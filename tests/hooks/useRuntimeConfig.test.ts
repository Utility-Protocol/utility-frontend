import { renderHook, act } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { useRuntimeConfig } from "../../src/hooks/useRuntimeConfig";
import { configurationManager } from "../../src/config/ConfigurationManager";

describe("useRuntimeConfig", () => {
  beforeEach(() => {
    vi.spyOn(configurationManager, "startPolling").mockImplementation(() => {});
    vi.spyOn(configurationManager, "getConfig").mockReturnValue({
      NEXT_PUBLIC_CHAIN_NETWORK: "local",
    });
    vi.spyOn(configurationManager, "subscribe");
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("should return the current config state", () => {
    const { result } = renderHook(() => useRuntimeConfig());
    expect(result.current["NEXT_PUBLIC_CHAIN_NETWORK"]).toBe("local");
  });

  it("should call startPolling when mounted", () => {
    renderHook(() => useRuntimeConfig());
    expect(configurationManager.startPolling).toHaveBeenCalledTimes(1);
  });
});
