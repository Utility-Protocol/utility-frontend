'use client';

import React, { useEffect, useState } from 'react';
import { Activity, Wallet, ShieldCheck, Users, Loader2, AlertCircle, PiggyBank } from 'lucide-react';
import { useGridTelemetry } from '@/hooks/useGridTelemetry';
import { useWallet } from '@/hooks/useWallet';

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:4000';

// Mirrors getGridSummary() in utility-backend/src/db/schema.js.
interface GridMetrics {
  total_ticks: number;
  total_units: number;
  total_settled: string;
  total_earned: string;
  active_consumers: number;
  active_operators: number;
  distribution: Record<string, number>;
}

export function GridOverviewCards() {
  const [metrics, setMetrics] = useState<GridMetrics | null>(null);
  const [loading, setLoading] = useState(true);
  const [fetchError, setFetchError] = useState<string | null>(null);

  const { latestTick } = useGridTelemetry({ maxHistory: 1 });
  const { publicKey } = useWallet();

  const [myUnits, setMyUnits] = useState<string>('0');
  const [myEscrow, setMyEscrow] = useState<string>('0');

  useEffect(() => {
    let cancelled = false;

    async function load() {
      setLoading(true);
      try {
        const res = await fetch(`${API_URL}/api/grid/metrics`, { cache: 'no-store' });
        if (!res.ok) throw new Error(`Indexer responded ${res.status}`);
        const data: GridMetrics = await res.json();
        if (cancelled) return;
        setMetrics(data);
        setFetchError(null);
      } catch (err) {
        if (cancelled) return;
        setFetchError(
          err instanceof Error ? err.message : 'Failed to reach the telemetry indexer.'
        );
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    void load();
    const timer = setInterval(load, 10_000);
    return () => {
      cancelled = true;
      clearInterval(timer);
    };
  }, []);

  useEffect(() => {
    if (!publicKey) {
      setMyUnits('0');
      setMyEscrow('0');
      return;
    }

    let cancelled = false;

    async function loadMine() {
      try {
        const res = await fetch(`${API_URL}/api/consumers/${publicKey}`, {
          cache: 'no-store',
        });
        if (!res.ok) throw new Error(`Indexer responded ${res.status}`);
        const data = await res.json();
        if (cancelled) return;
        setMyUnits(String(data.total_units_consumed ?? '0'));
        setMyEscrow(String(data.escrow_balance ?? '0'));
      } catch {
        if (cancelled) return;
        setMyUnits('0');
        setMyEscrow('0');
      }
    }

    void loadMine();
  }, [publicKey, latestTick]);

  const cards = [
    {
      label: 'Total Grid Volume',
      value: metrics?.total_units ?? '0',
      unit: 'Units Traded',
      icon: Activity,
      accent: 'text-emerald-400',
    },
    {
      label: 'Operator Earnings',
      value: metrics?.total_earned ?? '0',
      unit: 'Stroops Accrued',
      icon: ShieldCheck,
      accent: 'text-cyan-400',
    },
    {
      label: 'My Consumption',
      value: myUnits,
      unit: 'Units Drawn',
      icon: Wallet,
      accent: 'text-amber-400',
    },
    {
      label: 'My Escrow Balance',
      value: myEscrow,
      unit: 'Stroops Available',
      icon: PiggyBank,
      accent: 'text-violet-400',
    },
  ];

  return (
    <div className="space-y-3">
      {fetchError && (
        <div className="flex items-center gap-2 rounded-xl border border-amber-900/50 bg-amber-950/30 px-4 py-2.5 text-xs text-amber-300">
          <AlertCircle className="h-3.5 w-3.5 shrink-0" />
          Indexer offline at <span className="font-mono">{API_URL}</span> ({fetchError}).
          Start the backend to populate grid metrics.
        </div>
      )}

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {cards.map((card) => {
          const Icon = card.icon;
          return (
            <div
              key={card.label}
              className="group rounded-xl border border-zinc-800 bg-zinc-950 p-5 transition-colors hover:border-zinc-700"
            >
              <div className="flex items-center justify-between">
                <span className="text-xs font-medium uppercase tracking-wider text-zinc-500">
                  {card.label}
                </span>
                {loading ? (
                  <Loader2 className={`h-4 w-4 animate-spin ${card.accent}`} />
                ) : (
                  <Icon className={`h-4 w-4 ${card.accent}`} />
                )}
              </div>
              <div className="mt-3 flex items-baseline gap-1.5">
                <span className="font-mono text-2xl font-bold tracking-tight text-zinc-100">
                  {loading ? '—' : Number(card.value).toLocaleString()}
                </span>
              </div>
              <p className="mt-1 text-xs text-zinc-500">{card.unit}</p>
            </div>
          );
        })}
      </div>

      <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-zinc-500">
        <span className="flex items-center gap-1.5">
          <Users className="h-3.5 w-3.5" />
          {metrics?.active_operators ?? 0} operators online
        </span>
        <span className="flex items-center gap-1.5">
          <Wallet className="h-3.5 w-3.5" />
          {metrics?.active_consumers ?? 0} consumers indexed
        </span>
        <span className="font-mono text-zinc-600">{metrics?.total_ticks ?? 0} ticks</span>
      </div>
    </div>
  );
}