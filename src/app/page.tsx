'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';

import DeviceTable from '@/components/DeviceTable';
import DepositModal from '@/components/DepositModal';
import MetricsCards from '@/components/MetricsCards';
import TelemetryChart from '@/components/TelemetryChart';
import { useTelemetryStream } from '@/hooks/useTelemetryStream';
import {
  fetchDeviceReadings,
  fetchDevices,
  fetchSummary,
} from '@/services/api';
import type { Device, MeterReading, MetricsSummary } from '@/types';

const MAX_CACHED_READINGS = 500;

export default function DashboardPage() {
  const [summary, setSummary] = useState<MetricsSummary | null>(null);
  const [devices, setDevices] = useState<Device[]>([]);
  const [readings, setReadings] = useState<MeterReading[]>([]);
  const [depositDeviceId, setDepositDeviceId] = useState<string | null>(null);

  const { isConnected: streamConnected, latestReading } = useTelemetryStream();

  useEffect(() => {
    let cancelled = false;

    async function loadInitialData(): Promise<void> {
      try {
        const [summaryData, deviceList] = await Promise.all([
          fetchSummary(),
          fetchDevices(),
        ]);
        if (!cancelled) {
          setSummary(summaryData);
          setDevices(deviceList);
        }

        if (deviceList.length > 0 && !cancelled) {
          const { readings: historical } = await fetchDeviceReadings(
            deviceList[0].id,
          );
          setReadings(historical);
        }
      } catch (err) {
        console.error('Failed to load dashboard data:', err);
      }
    }

    void loadInitialData();

    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (latestReading) {
      setReadings((prevReadings) =>
        [...prevReadings, latestReading].slice(-MAX_CACHED_READINGS),
      );
    }
  }, [latestReading]);

  const handleDepositRequest = useCallback((deviceId: string) => {
    setDepositDeviceId(deviceId);
  }, []);

  const handleCloseModal = useCallback(() => {
    setDepositDeviceId(null);
  }, []);

  const streamStatus = useMemo(
    () => (streamConnected ? 'live' : 'connecting'),
    [streamConnected],
  );

  return (
    <div className="space-y-8">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-zinc-50">
            IoT Utility Billing
          </h1>
          <p className="mt-1 text-sm text-zinc-400">
            Monitor consumption and manage escrow deposits for connected devices.
          </p>
        </div>
        <span className="inline-flex items-center gap-1.5 rounded-full border border-zinc-800 bg-zinc-900 px-3 py-1 text-xs font-medium text-zinc-300">
          <span
            className={`h-1.5 w-1.5 rounded-full ${
              streamConnected ? 'bg-emerald-400' : 'bg-amber-400'
            }`}
            aria-hidden="true"
          />
          {streamStatus}
        </span>
      </div>

      <MetricsCards summary={summary} />
      <TelemetryChart readings={readings} />
      <DeviceTable devices={devices} onDepositClick={handleDepositRequest} />

      {depositDeviceId ? (
        <DepositModal deviceId={depositDeviceId} onClose={handleCloseModal} />
      ) : null}
    </div>
  );
}