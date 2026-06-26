"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Keypair } from "@stellar/stellar-sdk";
import {
  CHALLENGE_DURATION_MS,
  clearSession,
  isSessionValid,
  loadSession,
  performHandshake,
  saveSession,
  signMessage,
  type AuthSession,
} from "@/utils/web3Auth";

interface UseWeb3AuthReturn {
  account: { address: string; network: string } | null;
  isConnected: boolean;
  isAuthenticated: boolean;
  /** True once a session token exists but the in-memory keypair is gone
   * (e.g. after a reload) — a re-challenge is needed to sign again. */
  needsReChallenge: boolean;
  connect: () => Promise<void>;
  disconnect: () => Promise<void>;
  /** Sign a challenge for an API auth header. Requires a live keypair. */
  signChallenge: (challenge: string) => Promise<string>;
}

export interface UseWeb3AuthOptions {
  network?: string;
  /** Inject a keypair factory (tests); defaults to a random keypair. */
  keypairFactory?: () => Keypair;
}

export function useWeb3Auth(options: UseWeb3AuthOptions = {}): UseWeb3AuthReturn {
  const { network = "testnet", keypairFactory } = options;

  const [session, setSession] = useState<AuthSession | null>(null);
  // The keypair (with the secret) lives ONLY here and is never serialized.
  const keypairRef = useRef<Keypair | null>(null);
  const expiryTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const clearExpiryTimer = useCallback(() => {
    if (expiryTimerRef.current !== null) {
      clearTimeout(expiryTimerRef.current);
      expiryTimerRef.current = null;
    }
  }, []);

  /** Force the session to expire (re-challenge required) at `expiresAt`. */
  const scheduleExpiry = useCallback(
    (expiresAt: number) => {
      clearExpiryTimer();
      const delay = Math.max(0, expiresAt - Date.now());
      expiryTimerRef.current = setTimeout(() => {
        keypairRef.current = null;
        setSession(null);
        clearSession();
      }, delay);
    },
    [clearExpiryTimer]
  );

  // On mount: restore a still-valid session token (the keypair is NOT restored
  // — the secret was never stored — so signing needs a re-challenge).
  useEffect(() => {
    const restored = loadSession();
    if (restored) {
      setSession(restored);
      scheduleExpiry(restored.expiresAt);
    }
    return () => clearExpiryTimer();
  }, [scheduleExpiry, clearExpiryTimer]);

  const connect = useCallback(async () => {
    const keypair = keypairFactory ? keypairFactory() : Keypair.random();
    // Run the challenge-response handshake; throws if verification fails so a
    // session is never established without a valid signature.
    const { session: established } = performHandshake(keypair, network);

    keypairRef.current = keypair;
    saveSession(established); // token only, never the secret
    setSession(established);
    scheduleExpiry(established.expiresAt);
  }, [keypairFactory, network, scheduleExpiry]);

  const disconnect = useCallback(async () => {
    clearExpiryTimer();
    keypairRef.current = null;
    setSession(null);
    clearSession();
  }, [clearExpiryTimer]);

  const signChallenge = useCallback(async (challenge: string): Promise<string> => {
    const kp = keypairRef.current;
    if (!kp) {
      throw new Error(
        "No live keypair — reconnect to re-establish the handshake before signing"
      );
    }
    return signMessage(kp, challenge);
  }, []);

  const authenticated = isSessionValid(session);

  return {
    account: session
      ? { address: session.address, network: session.network }
      : null,
    isConnected: !!session,
    isAuthenticated: authenticated,
    needsReChallenge: authenticated && keypairRef.current === null,
    connect,
    disconnect,
    signChallenge,
  };
}

export { CHALLENGE_DURATION_MS };
