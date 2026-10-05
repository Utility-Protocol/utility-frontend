'use client';

import React from 'react';
import { Zap, Wallet, LogOut, Loader2, AlertCircle, Menu, X } from 'lucide-react';
import { useWallet } from '@/hooks/useWallet';
import { cn } from '@/lib/utils';

export function Navbar() {
  const { isConnected, status, error, shortAddress, connect, disconnect } = useWallet();
  const [mobileOpen, setMobileOpen] = React.useState(false);

  const navLinks = [
    { href: '#telemetry', label: 'Telemetry' },
    { href: '#operators', label: 'Grid Nodes' },
    { href: '#wallet', label: 'My Wallet' },
  ];

  return (
    <nav className="sticky top-0 z-40 border-b border-zinc-800/80 bg-zinc-950/80 backdrop-blur-xl">
      <div className="mx-auto flex h-16 max-w-7xl items-center justify-between px-6">
        <div className="flex items-center gap-2.5">
          <div className="flex h-9 w-9 items-center justify-center rounded-xl border border-emerald-500/20 bg-emerald-500/10 text-emerald-400">
            <Zap className="h-5 w-5" />
          </div>
          <div className="flex flex-col leading-tight">
            <span className="text-sm font-bold tracking-tight text-zinc-100">Utility Protocol</span>
            <span className="text-[10px] uppercase tracking-widest text-zinc-500">
              Micro-Utility Grid
            </span>
          </div>
        </div>

        <div className="hidden items-center gap-8 md:flex">
          {navLinks.map((link) => (
            <a
              key={link.href}
              href={link.href}
              className="text-sm font-medium text-zinc-400 transition-colors hover:text-zinc-100"
            >
              {link.label}
            </a>
          ))}
        </div>

        <div className="flex items-center gap-2">
          {isConnected ? (
            <button
              onClick={disconnect}
              className="flex items-center gap-2 rounded-xl border border-zinc-800 bg-zinc-900/60 px-3 py-2 font-mono text-xs text-zinc-300 transition-colors hover:border-rose-500/40 hover:text-rose-300"
            >
              <span className="h-1.5 w-1.5 rounded-full bg-emerald-400" />
              {shortAddress}
              <LogOut className="h-3.5 w-3.5" />
            </button>
          ) : (
            <button
              onClick={connect}
              disabled={status === 'connecting'}
              className={cn(
                'flex items-center gap-2 rounded-xl bg-emerald-500 px-3.5 py-2 text-xs font-semibold text-black',
                'transition-colors hover:bg-emerald-400 disabled:opacity-50'
              )}
            >
              {status === 'connecting' ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
              ) : (
                <Wallet className="h-3.5 w-3.5" />
              )}
              Connect Wallet
            </button>
          )}

          <button
            onClick={() => setMobileOpen((o) => !o)}
            className="rounded-lg p-2 text-zinc-400 hover:bg-zinc-900 md:hidden"
            aria-label="Toggle navigation"
          >
            {mobileOpen ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
          </button>
        </div>
      </div>

      {mobileOpen && (
        <div className="border-t border-zinc-800 px-6 py-3 md:hidden">
          {navLinks.map((link) => (
            <a
              key={link.href}
              href={link.href}
              onClick={() => setMobileOpen(false)}
              className="block py-2 text-sm text-zinc-400 hover:text-zinc-100"
            >
              {link.label}
            </a>
          ))}
        </div>
      )}

      {error && (
        <div className="flex items-center justify-center gap-2 border-t border-rose-900/50 bg-rose-950/30 px-6 py-2 text-xs text-rose-300">
          <AlertCircle className="h-3.5 w-3.5" />
          {error}
        </div>
      )}
    </nav>
  );
}