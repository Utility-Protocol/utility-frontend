'use client';

import { Wallet, Zap } from 'lucide-react';

import { useFreighter } from '@/hooks/useFreighter';

function truncateAddress(address: string): string {
  if (address.length <= 10) return address;
  return `${address.slice(0, 6)}...${address.slice(-4)}`;
}

export default function Navbar() {
  const { isConnected, isLoading, publicKey, connectWallet } = useFreighter();

  return (
    <header className="sticky top-0 z-40 border-b border-zinc-800 bg-zinc-950/80 backdrop-blur">
      <div className="mx-auto flex h-16 max-w-7xl items-center justify-between px-4 sm:px-6">
        <div className="flex items-center gap-2.5">
          <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-emerald-500/15">
            <Zap className="h-4 w-4 text-emerald-400" aria-hidden="true" />
          </span>
          <div className="flex items-baseline gap-2">
            <span className="text-base font-semibold tracking-tight text-zinc-100">
              Utility Protocol
            </span>
            <span className="rounded-full border border-emerald-800 bg-emerald-900/40 px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide text-emerald-300">
              Testnet
            </span>
          </div>
        </div>

        <button
          type="button"
          onClick={() => void connectWallet()}
          disabled={isLoading}
          className="inline-flex items-center gap-2 rounded-lg border border-zinc-700 bg-zinc-900 px-4 py-2 text-sm font-medium text-zinc-200 transition-colors hover:bg-zinc-800 focus:outline-none focus:ring-2 focus:ring-emerald-500/50 disabled:cursor-not-allowed disabled:opacity-50"
        >
          <Wallet className="h-4 w-4 text-emerald-400" aria-hidden="true" />
          {isConnected && publicKey
            ? truncateAddress(publicKey)
            : 'Connect Freighter Wallet'}
        </button>
      </div>
    </header>
  );
}