'use client';

import { useCallback, useEffect, useState } from 'react';
import { isConnected, getPublicKey, requestAccess } from '@/lib/freighter';

export type WalletStatus = 'idle' | 'connecting' | 'connected' | 'error';

export interface UseWalletReturn {
  publicKey: string | null;
  status: WalletStatus;
  error: string | null;
  isConnected: boolean;
  connect: () => Promise<void>;
  disconnect: () => void;
  shortAddress: string | null;
}

const EXPECTED_NETWORK =
  process.env.NEXT_PUBLIC_NETWORK_PASSPHRASE || 'Test SDF Network ; September 2015';

export function useWallet(): UseWalletReturn {
  const [publicKey, setPublicKey] = useState<string | null>(null);
  const [status, setStatus] = useState<WalletStatus>('idle');
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    const active = await isConnected();
    if (!active) {
      setPublicKey(null);
      setStatus('idle');
      return;
    }
    const key = await getPublicKey();
    setPublicKey(key);
    setStatus(key ? 'connected' : 'idle');
  }, []);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      if (cancelled) return;
      await refresh();
    })();
    return () => {
      cancelled = true;
    };
  }, [refresh]);

  const connect = useCallback(async () => {
    setStatus('connecting');
    setError(null);
    try {
      const address = await requestAccess();
      if (!address) {
        setStatus('error');
        setError('Access request was declined.');
        return;
      }
      setPublicKey(address);
      setStatus('connected');
    } catch (err) {
      setStatus('error');
      setError(err instanceof Error ? err.message : 'Failed to connect wallet.');
    }
  }, []);

  const disconnect = useCallback(() => {
    setPublicKey(null);
    setStatus('idle');
    setError(null);
  }, []);

  return {
    publicKey,
    status,
    error,
    isConnected: status === 'connected',
    connect,
    disconnect,
    shortAddress: publicKey ? `${publicKey.slice(0, 5)}...${publicKey.slice(-4)}` : null,
  };
}

export { EXPECTED_NETWORK };