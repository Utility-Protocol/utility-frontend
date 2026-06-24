import { useSyncExternalStore, useCallback } from "react";
import { nonceStore } from "@/store/slices/nonceSlice";
import { nonceManager } from "@/services/nonceManager";
import { useWallet } from "@/components/providers/WalletProvider";

export function useNonceManager() {
  const { account } = useWallet();

  const state = useSyncExternalStore(
    (listener) => nonceStore.subscribe(listener),
    () => nonceStore.getState(),
    () => nonceStore.getState()
  );

  const accountId = account?.address;
  const accountState = accountId ? state[accountId] : null;

  const acquireNonce = useCallback(async () => {
    if (!accountId) throw new Error("Wallet not connected");
    return await nonceManager.acquireLease(accountId, account.network);
  }, [accountId, account?.network]);

  const releaseNonce = useCallback(
    (leaseId: string, nonce: string) => {
      if (!accountId) return;
      nonceManager.releaseLease(accountId, leaseId, nonce);
    },
    [accountId]
  );

  return {
    status: accountState?.lastError ? "error" : "ok",
    pendingCount: accountState?.pendingCount || 0,
    poolSize: accountState?.poolSize || 0,
    baseSequence: accountState?.baseSequence || "0",
    lastError: accountState?.lastError || null,
    acquireNonce,
    releaseNonce,
  };
}
