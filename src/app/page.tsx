'use client';

import React, { useState } from 'react';
import { Navbar } from '@/components/Navbar';
import { GridOverviewCards } from '@/components/GridOverviewCards';
import { ConsumptionTimelineChart } from '@/components/ConsumptionTimelineChart';
import { LiveTelemetryFeed } from '@/components/LiveTelemetryFeed';
import { OperatorNodeList } from '@/components/OperatorNodeList';
import { DepositEscrowModal } from '@/components/DepositEscrowModal';
import { useWallet } from '@/hooks/useWallet';
import { PiggyBank, TrendingUp, Wallet as WalletIcon } from 'lucide-react';

export default function DashboardPage() {
  const [isDepositOpen, setIsDepositOpen] = useState(false);
  const { publicKey, isConnected, connect, shortAddress, status } = useWallet();

  return (
    <div className="min-h-screen bg-zinc-950 text-zinc-100 selection:bg-emerald-500/30">
      <Navbar />

      <main className="mx-auto max-w-7xl space-y-6 px-6 py-8">
        <section className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <h1 className="text-3xl font-bold tracking-tight text-zinc-50">
              Decentralized Grid Dashboard
            </h1>
            <p className="mt-2 max-w-2xl text-sm text-zinc-400">
              Real-time telemetry for prosumer energy and water micro-utility settlement, indexed
              from on-chain <span className="font-mono text-zinc-300">util_tick</span> events.
            </p>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={() => setIsDepositOpen(true)}
              className="flex items-center gap-2 rounded-xl border border-zinc-800 bg-zinc-900/60 px-3.5 py-2 text-xs font-semibold text-zinc-100 transition-colors hover:border-emerald-500/50 hover:text-emerald-400"
            >
              <PiggyBank className="h-4 w-4 text-emerald-400" />
              Deposit Escrow
            </button>
          </div>
        </section>

        <GridOverviewCards />

        <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
          <div className="space-y-6 lg:col-span-2">
            <div id="telemetry">
              <ConsumptionTimelineChart />
            </div>
            <div id="operators">
              <OperatorNodeList />
            </div>
          </div>

          <div className="space-y-6">
            <LiveTelemetryFeed />

            <div id="wallet" className="rounded-xl border border-zinc-800 bg-zinc-950 p-6">
              <div className="mb-4 flex items-center gap-2">
                <WalletIcon className="h-5 w-5 text-emerald-400" />
                <h2 className="text-lg font-semibold">Consumer Portal</h2>
              </div>

              {isConnected && publicKey ? (
                <div className="space-y-3">
                  <div className="rounded-lg border border-zinc-900 bg-zinc-900/40 p-3">
                    <span className="block text-xs text-zinc-500">Active Account</span>
                    <span className="mt-1 block font-mono text-xs text-zinc-200">
                      {shortAddress}
                    </span>
                  </div>
                  <p className="text-xs text-zinc-500">
                    Connect to your consumer account to track personal consumption, escrow balance,
                    and authorize on-chain pre-payments.
                  </p>
                </div>
              ) : (
                <div className="space-y-3">
                  <p className="text-xs text-zinc-400">
                    Link a Stellar wallet to view your consumption profile and manage escrow deposits.
                  </p>
                  <button
                    onClick={connect}
                    disabled={status === 'connecting'}
                    className="w-full rounded-xl bg-emerald-500 py-2.5 text-xs font-semibold text-black transition-colors hover:bg-emerald-400 disabled:opacity-50"
                  >
                    {status === 'connecting' ? 'Connecting...' : 'Connect Wallet'}
                  </button>
                </div>
              )}
            </div>

            <div className="rounded-xl border border-zinc-800 bg-zinc-950 p-6">
              <div className="mb-4 flex items-center gap-2">
                <TrendingUp className="h-5 w-5 text-emerald-400" />
                <h2 className="text-lg font-semibold">Live Tariffs</h2>
              </div>
              <div className="space-y-2.5 text-sm">
                <div className="flex items-center justify-between">
                  <span className="text-zinc-400">Solar (per Wh)</span>
                  <span className="font-mono text-zinc-100">7.5 stroops</span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-zinc-400">Water (per L)</span>
                  <span className="font-mono text-zinc-100">12.0 stroops</span>
                </div>
              </div>
            </div>
          </div>
        </div>
      </main>

      <DepositEscrowModal
        isOpen={isDepositOpen}
        onClose={() => setIsDepositOpen(false)}
        consumerAddress={publicKey ?? undefined}
      />
    </div>
  );
}