import type { Device, MetricsSummary, ReadingsResponse } from '@/types';

const BASE_URL =
  process.env.NEXT_PUBLIC_BACKEND_API_URL ?? 'http://localhost:4000';

async function readJson<T>(url: string): Promise<T> {
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`Request failed: ${response.status} ${response.statusText}`);
  }
  return response.json() as Promise<T>;
}

export async function fetchSummary(): Promise<MetricsSummary> {
  const data = await readJson<{
    total_units_consumed: number;
    total_revenue_billed: unknown;
    active_devices: number;
  }>(`${BASE_URL}/api/metrics/summary`);
  return {
    total_devices: data.active_devices,
    total_units_consumed: data.total_units_consumed,
    total_revenue_billed: String(data.total_revenue_billed ?? '0'),
  };
}

export async function fetchDevices(): Promise<Device[]> {
  const data = await readJson<{ devices: Device[] }>(`${BASE_URL}/api/devices`);
  return data.devices;
}

export async function fetchDeviceReadings(
  deviceId: string,
): Promise<ReadingsResponse> {
  return readJson<ReadingsResponse>(
    `${BASE_URL}/api/devices/${encodeURIComponent(deviceId)}/readings`,
  );
}