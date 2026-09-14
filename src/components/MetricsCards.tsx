import { Activity, Coins, Router } from 'lucide-react';

import type { MetricsSummary } from '@/types';

interface MetricsCardsProps {
  summary: MetricsSummary | null;
}

interface KpiCard {
  label: string;
  value: string;
  icon: typeof Activity;
  accent: string;
}

export default function MetricsCards({ summary }: MetricsCardsProps) {
  const cards: KpiCard[] = [
    {
      label: 'Total Active Devices',
      value: String(summary?.total_devices ?? 0),
      icon: Router,
      accent: 'text-sky-400',
    },
    {
      label: 'Cumulative Units Metered',
      value: String(summary?.total_units_consumed ?? 0),
      icon: Activity,
      accent: 'text-emerald-400',
    },
    {
      label: 'Total Settled Revenue',
      value: summary?.total_revenue_billed ?? '0',
      icon: Coins,
      accent: 'text-amber-400',
    },
  ];

  return (
    <section className="grid grid-cols-1 gap-4 sm:grid-cols-3">
      {cards.map((card) => (
        <div
          key={card.label}
          className="rounded-xl border border-zinc-800 bg-zinc-900/60 p-5"
        >
          <div className="flex items-center justify-between">
            <span className="text-sm font-medium text-zinc-400">{card.label}</span>
            <card.icon className={`h-5 w-5 ${card.accent}`} aria-hidden="true" />
          </div>
          <p className="mt-3 text-3xl font-semibold tabular-nums text-zinc-100">
            {card.value}
          </p>
        </div>
      ))}
    </section>
  );
}