'use client';

import {
  Area,
  AreaChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';

import type { MeterReading } from '@/types';

interface TelemetryChartProps {
  readings: MeterReading[];
}

interface ConsumptionPoint {
  label: string;
  units: number;
}

function formatTimestamp(timestamp: number): string {
  return new Date(timestamp * 1000).toLocaleTimeString([], {
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  });
}

function toConsumptionPoints(readings: MeterReading[]): ConsumptionPoint[] {
  return readings
    .slice(-200)
    .map((reading) => ({
      label: formatTimestamp(reading.ledger_timestamp),
      units: reading.delta_units,
    }));
}

export default function TelemetryChart({ readings }: TelemetryChartProps) {
  const chartData = toConsumptionPoints(readings);

  return (
    <section className="rounded-xl border border-zinc-800 bg-zinc-900/60 p-5">
      <div className="mb-5 flex items-center justify-between">
        <h2 className="text-base font-semibold text-zinc-100">
          Real-time Consumption
        </h2>
        <span className="text-xs font-medium uppercase tracking-wide text-zinc-500">
          {readings.length} readings
        </span>
      </div>
      <div className="h-72 w-full">
        <ResponsiveContainer width="100%" height="100%">
          <AreaChart data={chartData} margin={{ top: 8, right: 8, bottom: 0, left: 0 }}>
            <defs>
              <linearGradient id="unitsFill" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor="#34d399" stopOpacity={0.35} />
                <stop offset="95%" stopColor="#34d399" stopOpacity={0} />
              </linearGradient>
            </defs>
            <CartesianGrid strokeDasharray="3 3" stroke="#27272a" />
            <XAxis
              dataKey="label"
              stroke="#71717a"
              tick={{ fontSize: 11 }}
              tickLine={false}
              interval="preserveStartEnd"
              minTickGap={40}
            />
            <YAxis
              stroke="#71717a"
              tick={{ fontSize: 11 }}
              tickLine={false}
              width={48}
            />
            <Tooltip
              contentStyle={{
                backgroundColor: '#18181b',
                border: '1px solid #3f3f46',
                borderRadius: '8px',
                fontSize: 12,
              }}
              labelStyle={{ color: '#a1a1aa' }}
              cursor={{ stroke: '#3f3f46' }}
            />
            <Area
              type="monotone"
              dataKey="units"
              name="Units"
              stroke="#34d399"
              strokeWidth={2}
              fill="url(#unitsFill)"
              isAnimationActive={false}
            />
          </AreaChart>
        </ResponsiveContainer>
      </div>
    </section>
  );
}