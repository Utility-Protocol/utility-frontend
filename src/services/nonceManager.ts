import { rpc } from "@stellar/stellar-sdk";
import { nonceStore } from "@/store/slices/nonceSlice";
import { getRpcUrl, submitWithNonce as sorobanSubmit } from "@/services/soroban";
import type { NonceLease, SequenceNumber } from "@/types/soroban";

// BigInt max
const MAX_PENDING = 50;

class NonceManager {
  private pools: Map<string, SequenceNumber[]> = new Map();
  private leases: Map<string, NodeJS.Timeout> = new Map();

  /**
   * Fetches current sequence and pre-fetches 20 nonces into the pool.
   */
  async initialize(accountId: string, network: string = "testnet"): Promise<void> {
    const server = new rpc.Server(getRpcUrl(network));
    let baseSequence: string;

    try {
      const account = await server.getAccount(accountId);
      baseSequence = account.sequenceNumber();
    } catch {
      // If account doesn't exist or other error, fallback to 0
      baseSequence = "0";
    }

    const newPool: SequenceNumber[] = [];
    let currentSeq = BigInt(baseSequence);

    for (let i = 0; i < 20; i++) {
      currentSeq += 1n;
      newPool.push(currentSeq.toString());
    }

    this.pools.set(accountId, newPool);

    nonceStore.dispatch({
      type: "NONCE_POOL_UPDATED",
      payload: { accountId, baseSequence, poolSize: newPool.length },
    });
  }

  /**
   * Pops the next available nonce from the pool and creates a lease.
   */
  async acquireLease(accountId: string, network: string = "testnet"): Promise<NonceLease> {
    let pool = this.pools.get(accountId);

    if (!pool || pool.length === 0) {
      await this.initialize(accountId, network);
      pool = this.pools.get(accountId);
    }

    if (!pool || pool.length === 0) {
      throw new Error("Failed to initialize nonce pool");
    }

    const state = nonceStore.getAccountState(accountId);
    if (state.pendingCount >= MAX_PENDING) {
      throw new Error("Maximum pending transactions reached for account");
    }

    const nonce = pool.shift()!;
    const leaseId = `${accountId}-${nonce}-${Date.now()}`;
    const lease: NonceLease = {
      id: leaseId,
      nonce,
      acquiredAt: Date.now(),
      expiresAt: Date.now() + 120000, // 120 seconds
    };

    // Set timeout to return nonce to pool
    const timeout = setTimeout(() => {
      this.releaseLease(accountId, leaseId, nonce);
    }, 120000);

    this.leases.set(leaseId, timeout);

    nonceStore.dispatch({
      type: "NONCE_LEASE_ACQUIRED",
      payload: { accountId },
    });

    return lease;
  }

  /**
   * Returns the nonce to the pool if unused.
   */
  releaseLease(accountId: string, leaseId: string, nonce: SequenceNumber) {
    const timeout = this.leases.get(leaseId);
    if (timeout) {
      clearTimeout(timeout);
      this.leases.delete(leaseId);
    }

    const pool = this.pools.get(accountId) || [];
    // Insert back in sorted order
    pool.push(nonce);
    pool.sort((a, b) => (BigInt(a) < BigInt(b) ? -1 : 1));
    this.pools.set(accountId, pool);

    nonceStore.dispatch({
      type: "NONCE_LEASE_RELEASED",
      payload: { accountId },
    });
  }

  /**
   * Wraps soroban.submitTransaction, catches tx_bad_seq errors, and triggers re-fetch + retry cycle.
   */
  async submitWithNonce(
    args: {
      xdr: string;
      lease: NonceLease;
      accountId: string;
      network?: string;
      buildXdr?: (lease: NonceLease) => Promise<string> | string; // callback for rebuild if retrying
    }
  ) {
    const { lease, accountId, network = "testnet", buildXdr } = args;
    let currentXdr = args.xdr;
    let currentLease = lease;
    let attempts = 0;
    const maxAttempts = 3;

    while (attempts < maxAttempts) {
      try {
        attempts++;
        const response = await sorobanSubmit(currentXdr, currentLease, network);

        // Success: clear lease timeout so it doesn't return to pool
        const timeout = this.leases.get(currentLease.id);
        if (timeout) {
          clearTimeout(timeout);
          this.leases.delete(currentLease.id);
        }

        // We do not release back to pool because it's consumed!
        // But we dispatch released to decrement pending count, as it's no longer pending.
        nonceStore.dispatch({
          type: "NONCE_LEASE_RELEASED",
          payload: { accountId },
        });

        // If pool is running low, eagerly fetch more (pre-fetching in background)
        const pool = this.pools.get(accountId);
        if (pool && pool.length < 5) {
          this.initialize(accountId, network).catch(console.error);
        }

        return response;
      } catch (err: unknown) {
        const errorObj = err as { code?: string };
        if (errorObj?.code === "tx_bad_seq") {
          nonceStore.dispatch({
            type: "NONCE_POOL_EXHAUSTED",
            payload: { accountId, error: "tx_bad_seq" },
          });

          if (attempts >= maxAttempts) {
            throw new Error("Max retries reached for tx_bad_seq");
          }

          // Release all pre-fetched nonces (flush queue)
          this.flushAccount(accountId);

          // Re-fetch sequence
          await this.initialize(accountId, network);

          if (buildXdr) {
            // Get new lease and rebuild
            currentLease = await this.acquireLease(accountId, network);
            currentXdr = await buildXdr(currentLease);
          } else {
            // If no buildXdr provided, we can't legitimately retry with a new seq.
            // We just wait a second and retry the exact same XDR in case the node was lagging.
            await new Promise((resolve) => setTimeout(resolve, 2000));
          }
        } else {
          throw err;
        }
      }
    }
  }

  /**
   * On account change or error, cancel all leases and flush.
   */
  flushAccount(accountId: string) {
    // Cancel all leases for this account (inefficient loop but safe for small sizes)
    for (const [leaseId, timeout] of this.leases.entries()) {
      if (leaseId.startsWith(`${accountId}-`)) {
        clearTimeout(timeout);
        this.leases.delete(leaseId);
      }
    }

    this.pools.delete(accountId);

    nonceStore.dispatch({
      type: "NONCE_FLUSHED",
      payload: { accountId },
    });
  }
}

export const nonceManager = new NonceManager();
