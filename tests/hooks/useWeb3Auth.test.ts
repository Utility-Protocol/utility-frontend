import { describe, it, expect, beforeEach, vi } from "vitest";
import { renderHook, act } from "@testing-library/react";
import { useWeb3Auth } from "@/hooks/useWeb3Auth";
import type { Keypair } from "@stellar/stellar-sdk";

// The crypto util is unit-tested for real in tests/unit/web3Auth.test.ts (node
// env). Here we mock it so the hook's orchestration (state, storage, expiry,
// re-challenge) can be tested under jsdom without ed25519's realm constraints.
const h = vi.hoisted(() => ({ store: null as Record<string, unknown> | null }));

vi.mock("@/utils/web3Auth", () => ({
  CHALLENGE_DURATION_MS: 1_800_000,
  isSessionValid: (s: { expiresAt: number } | null, now = Date.now()) =>
    !!s && s.expiresAt > now,
  loadSession: () => {
    const s = h.store as { expiresAt: number } | null;
    if (s && s.expiresAt > Date.now()) return s;
    h.store = null;
    return null;
  },
  saveSession: (s: Record<string, unknown>) => {
    h.store = { ...s };
  },
  clearSession: () => {
    h.store = null;
  },
  performHandshake: (kp: { publicKey: () => string }, network: string, now = Date.now()) => ({
    session: {
      address: kp.publicKey(),
      network,
      signature: "sig",
      expiresAt: now + 1_800_000,
    },
    challenge: { challenge: "c", nonce: "n" },
  }),
  signMessage: (_kp: unknown, msg: string) => `signed:${msg}`,
}));

/** A fake keypair good enough for the (mocked) handshake. */
function fakeKeypair(address = "G" + "A".repeat(55)): Keypair {
  return {
    publicKey: () => address,
    secret: () => "S" + "B".repeat(55),
    sign: () => Buffer.from("sig"),
  } as unknown as Keypair;
}

beforeEach(() => {
  h.store = null;
  vi.clearAllMocks();
});

describe("useWeb3Auth", () => {
  it("starts disconnected", () => {
    const { result } = renderHook(() => useWeb3Auth());
    expect(result.current.isConnected).toBe(false);
    expect(result.current.isAuthenticated).toBe(false);
    expect(result.current.account).toBeNull();
  });

  it("establishes a verified session on connect", async () => {
    const kp = fakeKeypair("GABC");
    const { result } = renderHook(() => useWeb3Auth({ keypairFactory: () => kp }));

    await act(async () => {
      await result.current.connect();
    });

    expect(result.current.isConnected).toBe(true);
    expect(result.current.isAuthenticated).toBe(true);
    expect(result.current.account?.address).toBe("GABC");
    expect(result.current.needsReChallenge).toBe(false);
    // Token persisted via the (mocked) util.
    expect(h.store).toMatchObject({ address: "GABC", network: "testnet" });
  });

  it("signChallenge signs with the live keypair", async () => {
    const { result } = renderHook(() =>
      useWeb3Auth({ keypairFactory: () => fakeKeypair() })
    );
    await act(async () => {
      await result.current.connect();
    });
    await expect(result.current.signChallenge("api-nonce")).resolves.toBe(
      "signed:api-nonce"
    );
  });

  it("wipes session and storage on disconnect", async () => {
    const { result } = renderHook(() =>
      useWeb3Auth({ keypairFactory: () => fakeKeypair() })
    );
    await act(async () => {
      await result.current.connect();
    });
    expect(result.current.isConnected).toBe(true);

    await act(async () => {
      await result.current.disconnect();
    });
    expect(result.current.isConnected).toBe(false);
    expect(result.current.account).toBeNull();
    expect(h.store).toBeNull();
  });

  it("restores a valid token on mount but flags re-challenge (no keypair)", () => {
    h.store = {
      address: "GREST",
      network: "testnet",
      signature: "sig",
      expiresAt: Date.now() + 1_800_000,
    };
    const { result } = renderHook(() => useWeb3Auth());
    expect(result.current.isConnected).toBe(true);
    expect(result.current.account?.address).toBe("GREST");
    expect(result.current.needsReChallenge).toBe(true);
  });

  it("rejects signing when there is no live keypair", async () => {
    h.store = {
      address: "GREST",
      network: "testnet",
      signature: "sig",
      expiresAt: Date.now() + 1_800_000,
    };
    const { result } = renderHook(() => useWeb3Auth());
    await expect(result.current.signChallenge("x")).rejects.toThrow(/reconnect/);
  });

  it("does not restore an expired token", () => {
    h.store = {
      address: "GOLD",
      network: "testnet",
      signature: "sig",
      expiresAt: Date.now() - 1000,
    };
    const { result } = renderHook(() => useWeb3Auth());
    expect(result.current.isConnected).toBe(false);
  });
});
