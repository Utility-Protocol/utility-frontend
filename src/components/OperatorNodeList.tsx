'use client';

import React, { useEffect, useState } from 'react';
import { Activity, MapPin, Zap, Droplets, Handshake, Cpu, AlertTriangle } from 'lucide-react';
import { useGridTelemetry } from '@/hooks/useGridTelemetry';

interface OperatorSummary {
  address: string;
  resource_type: string;
  status: 'active' | 'offline' | 'degraded';
  // Aggregates computed in the frontend from the live event stream.
  generated_power_kw: number;
  uptime_30d: number;
  escrow_balance: number;
}

interface OperatorNodeListProps {
  filterOperator?: string;
  maxNodes?: number;
}

function deriveOperators(ticks: ReturnType<typeof useGridTelemetry>['ticks']): OperatorSummary[] {
  const byOperator = new Map<string, OperatorSummary>();

  for (const tick of ticks) {
    const key = tick.operator.toLowerCase();

    if (!byOperator.has(key)) {
      byOperator.set(key, {
        address: tick.operator,
        resource_type: tick.resource_type,
        status: 'active',
        generated_power_kw: 0,
        uptime_30d: 99.9,
        escrow_balance: 0,
      });
    }

    const record = byOperator.get(key)!;
    record.generated_power_kw += tick.units_drawn;
    record.escrow_balance += Number(tick.cost) / 1e7;
  }

  return Array.from(byOperator.values());
}

export function OperatorNodeList({ filterOperator, maxNodes = 6 }: OperatorNodeListProps) {
  const [operators, setOperators] = useState<OperatorSummary[]>([]);
  const [hasLiveData, setHasLiveData] = useState(false);

  const { ticks } = useGridTelemetry({ filterOperator, maxHistory: 100 });

  useEffect(() => {
    setOperators(deriveOperators(ticks));
    setHasLiveData(ticks.length > 0);
  }, [ticks]);

  return (
    <div className="rounded-xl border border-zinc-800 bg-zinc-950 p-6 text-zinc-100">
      <div className="mb-5 flex items-center justify-between border-b border-zinc-800 pb-4">
        <div className="flex items-center gap-2">
          <MapPin className="h-5 w-5 text-emerald-400" />
          <h2 className="text-lg font-semibold">Active Operator Nodes</h2>
        </div>
        <span className="rounded-full border border-zinc-800 bg-zinc-900/60 px-2.5 py-1 font-mono text-xs text-zinc-400">
          {operators.length} online
        </span>
      </div>

      {hasLiveData ? (
        <div className="divide-y divide-zinc-900">
          {operators.slice(0, maxNodes).map((operator) => (
            <div key={operator.address} className="flex items-center justify-between py-4">
              <div className="flex items-center gap-3.5">
                <div className="flex h-9 w-9 items-center justify-center rounded-lg border border-zinc-800 bg-zinc-900 text-zinc-300">
                  {operator.resource_type.toUpperCase() === 'SOLAR' ? (
                    <Zap className="h-4 w-4 text-amber-400" />
                  ) : (
                    <Droplets className="h-4 w-4 text-cyan-400" />
                  )}
                </div>
                <div>
                  <div className="flex items-center gap-2">
                    <span className="font-mono text-sm font-medium text-zinc-200">
                      {operator.address.slice(0, 6)}...{operator.address.slice(-6)}
                    </span>
                    {operator.status === 'active' && (
                      <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-emerald-400" />
                    )}
                  </div>
                  <span className="text-xs text-zinc-500">
                    {operator.resource_type.toUpperCase()} provider
                  </span>
                </div>
              </div>

              <div className="flex items-center gap-6 text-right">
                <div className="flex items-center gap-1.5 text-xs text-zinc-400">
                  <Cpu className="h-3.5 w-3.5 text-zinc-500" />
                  {operator.generated_power_kw.toLocaleString()} Wh
                </div>
                <div className="flex items-center gap-1.5 text-xs font-medium text-emerald-400">
                  <Activity className="h-3.5 w-3.5" />
                  {operator.uptime_30d}%
                </div>
              </div>
            </div>
          ))}
        </div>
      ) : (
        <div className="flex flex-col items-center justify-center rounded-lg border border-dashed border-zinc-800/80 py-10 text-center">
          <Handshake className="h-8 w-8 text-zinc-600" />
          <p className="mt-2 text-sm text-zinc-400">No operator nodes detected in stream</p>
          <p className="mt-1 text-xs text-zinc-600">
            Live telemetry is required to discover decentralized grid nodes.
          </p>
        </div>
      )}

      {operators.length > maxNodes && (
        <p className="mt-4 flex items-center justify-center gap-1.5 text-xs text-zinc-500">
          <AlertTriangle className="h-3.5 w-3.5" />
          {operators.length - maxNodes} additional nodes matched the active filter
        </p>
      )}
    </div>
  );
}