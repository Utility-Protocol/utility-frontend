"use client";

import {
  createContext,
  useContext,
  useEffect,
  useState,
  useCallback,
  useRef,
} from "react";
import type { Keypair } from "@stellar/stellar-sdk";
import { abortAllRequests } from "@/services/api";
import { cacheClearByPrefix } from "@/services/cache";
import { nonceManager } from "@/services/nonceManager";

export interface WalletAccount {
  address: string;
  network: "testnet" | "mainnet" | "futurenet";
  keypair?: Keypair;
}

interface WalletContextValue {
  account: WalletAccount | null;
  isConnected: boolean;
  isConnecting: boolean;
  accounts: WalletAccount[];
  cacheVersion: number;
  connect: () => Promise<void>;
  disconnect: () => Promise<void>;
  switchAccount: (address: string) => Promise<void>;
  purgeCache: (oldAddress?: string) => Promise<void>;
}

const WalletContext = createContext<WalletContextValue>({
  account: null,
  isConnected: false,
  isConnecting: false,
  accounts: [],
  cacheVersion: 0,
  connect: async () => {},
  disconnect: async () => {},
  switchAccount: async () => {},
  purgeCache: async () => {},
});

let switchGuard = Promise.resolve();

export function WalletProvider({ children }: { children: React.ReactNode }) {
  const [account, setAccount] = useState<WalletAccount | null>(null);
  const [accounts, setAccounts] = useState<WalletAccount[]>([]);
  const [isConnecting, setIsConnecting] = useState(false);
  const cacheVersion = useRef(0);

  const purgeCache = useCallback(async (oldAddress?: string) => {
    cacheVersion.current += 1;

    setAccount(null);
    setAccounts([]);

    localStorage.removeItem("utility-wallet-session");
    localStorage.removeItem("utility-wallet-accounts");
    localStorage.removeItem("utility-auth-session");

    abortAllRequests();

    if (oldAddress) {
      await cacheClearByPrefix(`utility:${oldAddress}`);
      nonceManager.flushAccount(oldAddress);
    }
  }, []);

  const connect = useCallback(async () => {
    if (isConnecting) return;
    setIsConnecting(true);
    try {
      const { Keypair: StellarKeypair } = await import("@stellar/stellar-sdk");
      const keypair = StellarKeypair.random();
      const address = keypair.publicKey();
      const newAccount: WalletAccount = {
        address,
        network: "testnet",
        keypair,
      };
      localStorage.setItem("utility-wallet-accounts", JSON.stringify([newAccount]));
      localStorage.setItem(
        "utility-wallet-session",
        JSON.stringify({ address, network: "testnet", cacheVersion: cacheVersion.current })
      );
      setAccounts([newAccount]);
      setAccount(newAccount);
      nonceManager.initialize(newAccount.address, newAccount.network).catch(console.error);
    } finally {
      setIsConnecting(false);
    }
  }, [isConnecting]);

  const disconnect = useCallback(async () => {
    await purgeCache(account?.address);
  }, [purgeCache, account]);

  const switchAccount = useCallback(
    async (address: string) => {
      switchGuard = switchGuard.then(async () => {
        const target = accounts.find((a) => a.address === address);
        if (!target) return;

        const oldAddress = account?.address;
        await purgeCache(oldAddress);

        setAccount(target);
        localStorage.setItem(
          "utility-wallet-session",
          JSON.stringify({ address, network: target.network, cacheVersion: cacheVersion.current })
        );
        nonceManager.initialize(target.address, target.network).catch(console.error);
      });
      await switchGuard;
    },
    [accounts, account, purgeCache]
  );

  useEffect(() => {
    const stored = localStorage.getItem("utility-wallet-session");
    const storedAccounts = localStorage.getItem("utility-wallet-accounts");
    if (stored && storedAccounts) {
      try {
        const parsed: { address: string; network: string } = JSON.parse(stored);
        const parsedAccounts: WalletAccount[] = JSON.parse(storedAccounts);
        setAccounts(parsedAccounts);
        const match = parsedAccounts.find((a) => a.address === parsed.address);
        if (match) setAccount(match);
      } catch {
        localStorage.removeItem("utility-wallet-session");
        localStorage.removeItem("utility-wallet-accounts");
      }
    }
  }, []);

  return (
    <WalletContext.Provider
      value={{
        account,
        isConnected: !!account,
        isConnecting,
        accounts,
        cacheVersion: cacheVersion.current,
        connect,
        disconnect,
        switchAccount,
        purgeCache,
      }}
    >
      {children}
    </WalletContext.Provider>
  );
}

export const useWallet = () => useContext(WalletContext);
