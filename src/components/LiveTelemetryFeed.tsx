'use client';

import React from 'react';
import { Activity, Wifi, WifiOff } from 'lucide-react';
import { useGridTelemetry } from '@/hooks/useGridTelemetry';

export function LiveTelemetryFeed() {
  const { isConnected, isConnecting, latestTick, ticks } = useGridTelemetry({
    maxHistory: 10,
  });

  return (
    <div className="rounded-xl border border-zinc-800 bg-zinc-950 p-6 text-zinc-100">
      <div className="flex items-center justify-between border-b border-zinc-800 pb-4">
        <div className="flex items-center gap-2">
          <Activity className="h-5 w-5 text-emerald-400" />
          <h2 className="text-lg font-semibold">Live Grid Telemetry Feed</h2>
        </div>
        <div className="flex items-center gap-2 text-xs">
          {isConnected ? (
            <span className="flex items-center gap-1.5 text-emerald-400">
              <Wifi className="h-4 w-4" /> Connected
            </span>
          ) : isConnecting ? (
            <span className="flex items-center gap-1.5 text-amber-400">
              <Activity className="h-4 w-4 animate-spin" /> Connecting...
            </span>
          ) : (
            <span className="flex items-center gap-1.5 text-rose-400">
              <WifiOff className="h-4 w-4" /> Disconnected
            </span>
          )}
        </div>
      </div>

      {latestTick && (
        <div className="my-4 rounded-lg border border-zinc-800 bg-zinc-900/80 p-4">
          <span className="text-xs uppercase tracking-wider text-zinc-400">Latest Pulse</span>
          <div className="mt-2 grid grid-cols-3 gap-4 text-sm">
            <div>
              <span className="block text-xs text-zinc-500">Resource</span>
              <span className="font-mono font-medium">{latestTick.resource_type}</span>
            </div>
            <div>
              <span className="block text-xs text-zinc-500">Units Drawn</span>
              <span className="font-mono font-medium text-emerald-400">
                +{latestTick.units_drawn} Wh
              </span>
            </div>
            <div>
              <span className="block text-xs text-zinc-500">Settled Cost</span>
              <span className="font-mono font-medium">{latestTick.cost} stroops</span>
            </div>
          </div>
        </div>
      )}

      <div className="mt-4 space-y-2">
        <span className="text-xs uppercase tracking-wider text-zinc-400">Stream History</span>
        <div className="divide-y divide-zinc-900 overflow-hidden rounded-lg border border-zinc-900">
          {ticks.length === 0 ? (
            <p className="p-4 text-center text-sm text-zinc-500">
              Waiting for live meter ticks...
            </p>
          ) : (
            ticks.map((tick) => (
              <div key={tick.event_id} className="flex items-center justify-between p-3 text-xs">
                <span className="font-mono text-zinc-400">
                  {tick.consumer.slice(0, 8)}...
                </span>
                <span className="font-mono text-emerald-400">
                  +{tick.units_drawn} {tick.resource_type}
                </span>
                <span className="text-zinc-500">
                  {new Date(tick.timestamp * 1000).toLocaleTimeString()}
                </span>
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
}