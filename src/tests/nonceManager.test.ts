import { describe, it, expect, vi, beforeEach } from "vitest";
import { nonceManager } from "@/services/nonceManager";
import { nonceStore } from "@/store/slices/nonceSlice";
import * as sorobanService from "@/services/soroban";
import type { NonceLease } from "@/types/soroban";

// Mock the Soroban service
vi.mock("@/services/soroban", () => ({
  getRpcUrl: vi.fn(),
  submitWithNonce: vi.fn(),
}));

// Mock the stellar-sdk rpc
let mockSequenceNumber = BigInt(100);
vi.mock("@stellar/stellar-sdk", () => ({
  rpc: {
    Server: vi.fn().mockImplementation(() => ({
      getAccount: vi.fn().mockImplementation(() => ({
        sequenceNumber: () => mockSequenceNumber.toString(),
      })),
    })),
  },
  TransactionBuilder: {
    fromXDR: vi.fn(),
  },
}));

describe("NonceManager", () => {
  const accountId = "GABCDEFGHIJKLMNOPQRSTUVWXYZ";

  beforeEach(() => {
    vi.clearAllMocks();
    nonceManager.flushAccount(accountId);
    mockSequenceNumber = BigInt(100);
  });

  it("should pre-fetch nonces and acquire leases concurrently", async () => {
    // Acquire 5 leases concurrently
    const promises = Array.from({ length: 5 }).map(() =>
      nonceManager.acquireLease(accountId)
    );
    const leases = await Promise.all(promises);

    // Each lease should have a unique nonce starting from baseSequence + 1
    const nonces = leases.map((l) => l.nonce);
    expect(new Set(nonces).size).toBe(5);
    expect(nonces).toContain("101");
    expect(nonces).toContain("102");
    expect(nonces).toContain("103");
    expect(nonces).toContain("104");
    expect(nonces).toContain("105");

    const state = nonceStore.getAccountState(accountId);
    expect(state.pendingCount).toBe(5);
    // 20 pre-fetched initially, 5 popped
    expect(state.poolSize).toBe(15);
  });

  it("should handle tx_bad_seq error, flush pool, re-fetch, and retry", async () => {
    const buildXdr = vi.fn().mockImplementation(async (lease: NonceLease) => {
      return `XDR-WITH-NONCE-${lease.nonce}`;
    });

    const submitMock = sorobanService.submitWithNonce as import("vitest").Mock;
    
    // Fail first time with tx_bad_seq, succeed second time
    submitMock.mockImplementationOnce(() => {
      const err = new Error("tx_bad_seq") as Error & { code?: string };
      err.code = "tx_bad_seq";
      throw err;
    }).mockImplementationOnce(() => {
      return { status: "SUCCESS" };
    });

    const initialLease = await nonceManager.acquireLease(accountId);
    expect(initialLease.nonce).toBe("101");

    // The blockchain sequence moved forward out-of-band!
    mockSequenceNumber = BigInt(200);

    const response = await nonceManager.submitWithNonce({
      xdr: "INITIAL_XDR",
      lease: initialLease,
      accountId,
      buildXdr,
    });

    expect(response).toEqual({ status: "SUCCESS" });
    
    // submitWithNonce should have been called twice
    expect(submitMock).toHaveBeenCalledTimes(2);

    // buildXdr should have been called to reconstruct the XDR after the flush
    expect(buildXdr).toHaveBeenCalledTimes(1);

    // After re-fetch, base sequence is 200, so new lease should be 201
    // And submitMock should have received the rebuilt XDR
    const secondCallArgs = submitMock.mock.calls[1];
    expect(secondCallArgs[0]).toBe("XDR-WITH-NONCE-201");
    expect(secondCallArgs[1].nonce).toBe("201");

    const state = nonceStore.getAccountState(accountId);
    // After retry and success, pendingCount should go down
    // We acquired 1 initially (pending=1). It failed, queue flushed (pending=0).
    // Re-acquired 1 (pending=1). Succeeded, released (pending=0).
    expect(state.pendingCount).toBe(0);
    // Pool size should be 19 because it pre-fetched 20 after flush and popped 1
    expect(state.poolSize).toBe(19);
  });
});
