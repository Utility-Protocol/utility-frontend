export interface Device {
  id: string;
  owner: string;
  rate_per_unit: string;
  deposit_balance: string;
  total_units_consumed: number;
  last_seen_timestamp: number;
  is_active?: boolean;
}

export interface MeterReading {
  id: number;
  device_id: string;
  delta_units: number;
  delta_cost: string;
  ledger_timestamp: number;
}

export interface MetricsSummary {
  total_devices: number;
  total_units_consumed: number;
  total_revenue_billed: string;
}

export interface ReadingsResponse {
  device_id: string;
  readings: MeterReading[];
  limit: number;
  offset: number;
}

export interface WebSocketPayload {
  type: 'METER_READING';
  data: MeterReading;
}