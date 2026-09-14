'use client';

import { useCallback, useEffect, useState } from 'react';

import freighter from '@stellar/freighter-api';
import {
  Address,
  BASE_FEE,
  Contract,
  Networks,
  SorobanRpc,
  TransactionBuilder,
  nativeToScVal,
} from '@stellar/stellar-sdk';

const RPC_URL = process.env.NEXT_PUBLIC_SOROBAN_RPC_URL ?? '';
const CONTRACT_ID = process.env.NEXT_PUBLIC_CONTRACT_ID ?? '';
const NETWORK_PASSPHRASE =
  process.env.NEXT_PUBLIC_STELLAR_NETWORK_PASSPHRASE ?? Networks.TESTNET;

const { getAddress, isConnected, requestAccess, signTransaction } = freighter;

export interface FreighterState {
  isConnected: boolean;
  isLoading: boolean;
  publicKey: string | null;
  error: string | null;
  connectWallet: () => Promise<void>;
  depositEscrow: (deviceId: string, amount: string) => Promise<string>;
}

function amountToBaseUnits(amount: string): bigint {
  const parsed = Number(amount);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    throw new Error('Amount must be a positive number');
  }
  return BigInt(Math.round(parsed * 1_000_000)) * 10n;
}

function unwrapOrThrow<T extends { error?: unknown }>(result: T, message: string): T {
  if (result.error) {
    throw new Error(message);
  }
  return result;
}

export function useFreighter(): FreighterState {
  const [publicKey, setPublicKey] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    async function restoreSession(): Promise<void> {
      try {
        const session = await isConnected();
        if (!session.error && session.isConnected) {
          const { address } = unwrapOrThrow(await getAddress(), 'Failed to read wallet address');
          if (!cancelled) setPublicKey(address);
        }
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : 'Freighter not available');
        }
      } finally {
        if (!cancelled) setIsLoading(false);
      }
    }

    void restoreSession();

    return () => {
      cancelled = true;
    };
  }, []);

  const connectWallet = useCallback(async (): Promise<void> => {
    setError(null);
    try {
      const { address } = unwrapOrThrow(
        await requestAccess(),
        'Access request rejected by Freighter',
      );
      setPublicKey(address);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to connect wallet');
      throw err;
    }
  }, []);

  const depositEscrow = useCallback(
    async (deviceId: string, amount: string): Promise<string> => {
      if (!publicKey) {
        throw new Error('Wallet not connected. Connect your Freighter wallet first.');
      }
      if (!RPC_URL) {
        throw new Error('Missing NEXT_PUBLIC_SOROBAN_RPC_URL configuration');
      }
      if (!CONTRACT_ID) {
        throw new Error('Missing NEXT_PUBLIC_CONTRACT_ID configuration');
      }

      const server = new SorobanRpc.Server(RPC_URL);
      const source = await server.getAccount(publicKey);
      const contract = new Contract(CONTRACT_ID);
      const amountUnits = amountToBaseUnits(amount);

      const invocation = contract.call(
        'deposit',
        new Address(deviceId).toScVal(),
        nativeToScVal(amountUnits),
      );

      const transaction = new TransactionBuilder(source, {
        fee: BASE_FEE,
        networkPassphrase: NETWORK_PASSPHRASE,
      })
        .addOperation(invocation)
        .setTimeout(60)
        .build();

      const signed = unwrapOrThrow(
        await signTransaction(transaction.toXDR(), {
          networkPassphrase: NETWORK_PASSPHRASE,
          address: publicKey,
        }),
        'Transaction rejected by Freighter',
      );

      const signedTransaction = TransactionBuilder.fromXDR(
        signed.signedTxXdr,
        NETWORK_PASSPHRASE,
      );

      const response = await server.sendTransaction(signedTransaction);
      if (response.status === 'ERROR' || response.status === 'TRY_AGAIN_LATER' || response.status === 'DUPLICATE') {
        throw new Error(`Transaction not accepted (${response.status})`);
      }
      return response.hash;
    },
    [publicKey],
  );

  return {
    isConnected: publicKey !== null,
    isLoading,
    publicKey,
    error,
    connectWallet,
    depositEscrow,
  };
}