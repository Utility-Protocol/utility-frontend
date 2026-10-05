'use client';

import React, { useMemo, useState, useEffect } from 'react';
import {
  ResponsiveContainer,
  AreaChart,
  Area,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid,
  TooltipProps,
} from 'recharts';
import { Activity, Zap, Droplets, Filter, Radio } from 'lucide-react';
import { useGridTelemetry, UtilTickData } from '@/hooks/useGridTelemetry';

interface ConsumptionTimelineChartProps {
  filterConsumer?: string;
  filterOperator?: string;
  maxPoints?: number;
}

interface ChartDataPoint {
  eventId: string;
  timestamp: number;
  timeStr: string;
  units: number;
  cost: number;
  resource: string;
  consumerShort: string;
}

function CustomTooltip({ active, payload }: TooltipProps<number, string>) {
  if (!active || !payload || !payload.length) return null;

  const data = payload[0].payload as ChartDataPoint;

  return (
    <div className="rounded-lg border border-zinc-700 bg-zinc-900/95 p-3 shadow-xl backdrop-blur-md">
      <div className="flex items-center justify-between gap-4 border-b border-zinc-800 pb-1.5 text-xs text-zinc-400">
        <span>{data.timeStr}</span>
        <span className="font-mono text-[10px] text-zinc-500">{data.consumerShort}</span>
      </div>
      <div className="mt-2 space-y-1 text-xs">
        <div className="flex items-center justify-between gap-6">
          <span className="flex items-center gap-1.5 text-zinc-300">
            {data.resource === 'SOLAR' ? (
              <Zap className="h-3.5 w-3.5 text-amber-400" />
            ) : (
              <Droplets className="h-3.5 w-3.5 text-cyan-400" />
            )}
            Resource Draw:
          </span>
          <span className="font-mono font-semibold text-emerald-400">
            +{data.units} {data.resource === 'SOLAR' ? 'Wh' : 'L'}
          </span>
        </div>
        <div className="flex items-center justify-between gap-6">
          <span className="text-zinc-400">Settled Fee:</span>
          <span className="font-mono text-zinc-200">{data.cost.toLocaleString()} stroops</span>
        </div>
      </div>
    </div>
  );
}

export function ConsumptionTimelineChart({
  filterConsumer,
  filterOperator,
  maxPoints = 30,
}: ConsumptionTimelineChartProps) {
  const [mounted, setMounted] = useState(false);
  const [selectedResource, setSelectedResource] = useState<'ALL' | 'SOLAR' | 'WATER'>('ALL');

  const { isConnected, ticks } = useGridTelemetry({
    filterConsumer,
    filterOperator,
    maxHistory: maxPoints * 2,
  });

  useEffect(() => {
    setMounted(true);
  }, []);

  const chartData: ChartDataPoint[] = useMemo(() => {
    return ticks
      .filter((tick: UtilTickData) => {
        if (selectedResource === 'ALL') return true;
        return tick.resource_type.toUpperCase() === selectedResource;
      })
      .slice(0, maxPoints)
      .reverse()
      .map((tick: UtilTickData) => {
        const date = new Date(tick.timestamp * 1000);
        return {
          eventId: tick.event_id,
          timestamp: tick.timestamp,
          timeStr: date.toLocaleTimeString([], {
            hour: '2-digit',
            minute: '2-digit',
            second: '2-digit',
          }),
          units: tick.units_drawn,
          cost: parseInt(tick.cost, 10) || 0,
          resource: tick.resource_type,
          consumerShort: `${tick.consumer.slice(0, 4)}...${tick.consumer.slice(-4)}`,
        };
      });
  }, [ticks, selectedResource, maxPoints]);

  const metrics = useMemo(() => {
    if (!chartData.length) return { totalUnits: 0, peakUnits: 0, totalCost: 0 };
    const totalUnits = chartData.reduce((acc, curr) => acc + curr.units, 0);
    const peakUnits = Math.max(...chartData.map((d) => d.units));
    const totalCost = chartData.reduce((acc, curr) => acc + curr.cost, 0);
    return { totalUnits, peakUnits, totalCost };
  }, [chartData]);

  if (!mounted) {
    return <div className="h-96 w-full animate-pulse rounded-xl border border-zinc-800 bg-zinc-950 p-6" />;
  }

  return (
    <div className="w-full rounded-xl border border-zinc-800 bg-zinc-950 p-6 text-zinc-100 shadow-sm">
      <div className="flex flex-col gap-4 border-b border-zinc-800/80 pb-5 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <div className="flex items-center gap-2">
            <Activity className="h-5 w-5 text-emerald-400" />
            <h2 className="text-lg font-semibold tracking-tight">Real-Time Grid Consumption</h2>
          </div>
          <p className="mt-1 text-xs text-zinc-400">
            Rolling real-time telemetry stream indexed from on-chain micro-utility billing events.
          </p>
        </div>

        <div className="flex items-center gap-3">
          <div className="flex items-center rounded-lg border border-zinc-800 bg-zinc-900/90 p-1 text-xs">
            <Filter className="mx-1.5 h-3.5 w-3.5 text-zinc-500" />
            {(['ALL', 'SOLAR', 'WATER'] as const).map((type) => (
              <button
                key={type}
                onClick={() => setSelectedResource(type)}
                className={`rounded-md px-2.5 py-1 font-medium transition-colors ${
                  selectedResource === type
                    ? 'bg-zinc-800 text-zinc-100 shadow-sm'
                    : 'text-zinc-400 hover:text-zinc-200'
                }`}
              >
                {type}
              </button>
            ))}
          </div>

          <div className="flex items-center gap-1.5 rounded-full border border-zinc-800 bg-zinc-900/50 px-2.5 py-1 text-xs">
            <Radio
              className={`h-3 w-3 ${
                isConnected ? 'animate-pulse text-emerald-400' : 'text-rose-400'
              }`}
            />
            <span className={isConnected ? 'text-zinc-300' : 'text-rose-400'}>
              {isConnected ? 'Live Telemetry' : 'Offline'}
            </span>
          </div>
        </div>
      </div>

      <div className="my-5 grid grid-cols-3 gap-4">
        <div className="rounded-lg border border-zinc-900 bg-zinc-900/40 p-3.5">
          <span className="text-[11px] font-medium uppercase tracking-wider text-zinc-500">
            Window Volume
          </span>
          <div className="mt-1 flex items-baseline gap-1.5">
            <span className="font-mono text-xl font-bold text-zinc-100">
              {metrics.totalUnits.toLocaleString()}
            </span>
            <span className="text-xs text-zinc-400">units</span>
          </div>
        </div>

        <div className="rounded-lg border border-zinc-900 bg-zinc-900/40 p-3.5">
          <span className="text-[11px] font-medium uppercase tracking-wider text-zinc-500">
            Peak Instantaneous Draw
          </span>
          <div className="mt-1 flex items-baseline gap-1.5">
            <span className="font-mono text-xl font-bold text-emerald-400">
              {metrics.peakUnits.toLocaleString()}
            </span>
            <span className="text-xs text-zinc-400">units/tick</span>
          </div>
        </div>

        <div className="rounded-lg border border-zinc-900 bg-zinc-900/40 p-3.5">
          <span className="text-[11px] font-medium uppercase tracking-wider text-zinc-500">
            Settled Volume
          </span>
          <div className="mt-1 flex items-baseline gap-1.5">
            <span className="font-mono text-xl font-bold text-zinc-100">
              {metrics.totalCost.toLocaleString()}
            </span>
            <span className="text-xs text-zinc-400">stroops</span>
          </div>
        </div>
      </div>

      <div className="h-72 w-full pt-2">
        {chartData.length === 0 ? (
          <div className="flex h-full flex-col items-center justify-center rounded-lg border border-dashed border-zinc-800/80 bg-zinc-900/20 text-center">
            <Activity className="h-8 w-8 animate-pulse text-zinc-600" />
            <p className="mt-2 text-sm text-zinc-400">Awaiting real-time telemetry pulses...</p>
            <p className="text-xs text-zinc-600">
              Trigger a test tick or run the client emulator to populate the stream.
            </p>
          </div>
        ) : (
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={chartData} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
              <defs>
                <linearGradient id="resourceGradient" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="#10b981" stopOpacity={0.4} />
                  <stop offset="95%" stopColor="#10b981" stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke="#27272a" vertical={false} />
              <XAxis
                dataKey="timeStr"
                stroke="#71717a"
                fontSize={11}
                tickLine={false}
                axisLine={false}
                minTickGap={25}
              />
              <YAxis
                stroke="#71717a"
                fontSize={11}
                tickLine={false}
                axisLine={false}
                tickFormatter={(val: number) => `${val}`}
              />
              <Tooltip content={<CustomTooltip />} />
              <Area
                type="monotone"
                dataKey="units"
                stroke="#10b981"
                strokeWidth={2}
                fillOpacity={1}
                fill="url(#resourceGradient)"
                isAnimationActive={false}
              />
            </AreaChart>
          </ResponsiveContainer>
        )}
      </div>
    </div>
  );
}