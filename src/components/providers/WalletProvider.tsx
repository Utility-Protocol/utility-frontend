"use client";

import {
  createContext,
  useContext,
  useEffect,
  useState,
  useCallback,
  useRef,
} from "react";
import { Keypair } from "@stellar/stellar-sdk";

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
  connect: () => Promise<void>;
  disconnect: () => Promise<void>;
  switchAccount: (address: string) => Promise<void>;
  purgeCache: () => void;
}

const WalletContext = createContext<WalletContextValue>({
  account: null,
  isConnected: false,
  isConnecting: false,
  accounts: [],
  connect: async () => {},
  disconnect: async () => {},
  switchAccount: async () => {},
  purgeCache: () => {},
});

let switchGuard = Promise.resolve();

export function WalletProvider({ children }: { children: React.ReactNode }) {
  const [account, setAccount] = useState<WalletAccount | null>(null);
  const [accounts, setAccounts] = useState<WalletAccount[]>([]);
  const [isConnecting, setIsConnecting] = useState(false);
  const cacheVersion = useRef(0);

  const purgeCache = useCallback(() => {
    cacheVersion.current += 1;
    localStorage.removeItem("utility-wallet-session");
    localStorage.removeItem("utility-wallet-accounts");
  }, []);

  const connect = useCallback(async () => {
    if (isConnecting) return;
    setIsConnecting(true);
    try {
      const keypair = Keypair.random();
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
    } finally {
      setIsConnecting(false);
    }
  }, [isConnecting]);

  const disconnect = useCallback(async () => {
    purgeCache();
    setAccount(null);
    setAccounts([]);
  }, [purgeCache]);

  const switchAccount = useCallback(
    async (address: string) => {
      switchGuard = switchGuard.then(async () => {
        const target = accounts.find((a) => a.address === address);
        if (!target) return;
        setAccount(null);
        await new Promise((r) => setTimeout(r, 0));
        setAccount(target);
        localStorage.setItem(
          "utility-wallet-session",
          JSON.stringify({ address, network: target.network, cacheVersion: cacheVersion.current })
        );
      });
      await switchGuard;
    },
    [accounts]
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
