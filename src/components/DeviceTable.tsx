'use client';

import { ArrowDownCircle, Cpu } from 'lucide-react';

import type { Device } from '@/types';

interface DeviceTableProps {
  devices: Device[];
  onDepositClick: (deviceId: string) => void;
}

function short(address: string): string {
  if (address.length <= 13) return address;
  return `${address.slice(0, 6)}...${address.slice(-4)}`;
}

function rateLabel(device: Device): string {
  const name = `Unit rate: ${device.rate_per_unit}`;
  return device.total_units_consumed > 0
    ? `${name} · used ${device.total_units_consumed}`
    : name;
}

export default function DeviceTable({ devices, onDepositClick }: DeviceTableProps) {
  return (
    <section className="rounded-xl border border-zinc-800 bg-zinc-900/60 p-5">
      <div className="mb-4 flex items-center justify-between">
        <h2 className="text-base font-semibold text-zinc-100">Registered Devices</h2>
        <span className="text-xs font-medium uppercase tracking-wide text-zinc-500">
          {devices.length} devices
        </span>
      </div>

      {devices.length === 0 ? (
        <p className="rounded-lg border border-dashed border-zinc-800 p-8 text-center text-sm text-zinc-500">
          No devices registered yet. Telemetry readings will appear here as they
          stream in.
        </p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead>
              <tr className="border-b border-zinc-800 text-xs uppercase tracking-wide text-zinc-500">
                <th className="pb-3 pr-4 font-medium">Device</th>
                <th className="pb-3 pr-4 font-medium">Owner</th>
                <th className="pb-3 pr-4 font-medium">Deposit Balance</th>
                <th className="pb-3 pr-4 font-medium">Consumption</th>
                <th className="pb-3 font-medium">Action</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-zinc-800/70">
              {devices.map((device) => (
                <tr key={device.id} className="text-zinc-300">
                  <td className="py-3.5 pr-4">
                    <div className="flex items-center gap-2 font-mono text-xs">
                      <Cpu className="h-3.5 w-3.5 text-sky-400" aria-hidden="true" />
                      {device.is_active === false ? (
                        <span className="text-zinc-500">{short(device.id)}</span>
                      ) : (
                        short(device.id)
                      )}
                    </div>
                  </td>
                  <td className="py-3.5 pr-4 font-mono text-xs text-zinc-400">
                    {short(device.owner)}
                  </td>
                  <td className="py-3.5 pr-4 tabular-nums">{device.deposit_balance}</td>
                  <td className="py-3.5 pr-4 text-xs text-zinc-400">
                    {rateLabel(device)}
                  </td>
                  <td className="py-3.5">
                    <button
                      type="button"
                      onClick={() => onDepositClick(device.id)}
                      className="inline-flex items-center gap-1.5 rounded-lg border border-emerald-800 bg-emerald-900/40 px-3 py-1.5 text-xs font-medium text-emerald-300 transition-colors hover:bg-emerald-900"
                    >
                      <ArrowDownCircle className="h-3.5 w-3.5" aria-hidden="true" />
                      Deposit
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}