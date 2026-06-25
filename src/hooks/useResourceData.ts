"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { decimal, type Decimal } from "@/utils/decimal";
import { aggregateReadings } from "@/utils/aggregation";
import { resourceStore, useResourceReadings } from "@/store/slices/resourceSlice";
import {
  RESOURCE_PRECISION,
  type MeterReading,
  type ResourceConsumption,
  type ResourceKind,
} from "@/types/meter";

/**
 * Fetches metered readings for a resource and converts the API's string-encoded
 * decimals into exact {@link Decimal} values at the resource's canonical
 * precision before storing them. Values are never parsed as `number`, so no
 * precision is lost on ingestion.
 */

/** Shape of a reading as delivered by the REST API (decimals are strings). */
export interface RawReading {
  meterId: string;
  timestamp: number;
  /** String-encoded decimal, e.g. "12.345". */
  value: string;
}

export interface UseResourceDataOptions {
  resource: ResourceKind;
  /** Override the endpoint. Defaults to `/api/meter/readings?resource=`. */
  endpoint?: string;
  /** Injectable transport for tests. */
  fetchFn?: typeof fetch;
  /** Fetch on mount. @default true */
  enabled?: boolean;
}

export interface UseResourceDataResult {
  readings: MeterReading[];
  total: Decimal;
  consumption: ResourceConsumption;
  loading: boolean;
  error: string | null;
  refetch: () => void;
}

/** Parse a raw API reading into a precision-tagged {@link MeterReading}. */
export function parseRawReading(
  resource: ResourceKind,
  raw: RawReading
): MeterReading {
  return {
    meterId: raw.meterId,
    resource,
    timestamp: raw.timestamp,
    value: decimal(raw.value, RESOURCE_PRECISION[resource]) as MeterReading["value"],
  };
}

export function useResourceData(
  options: UseResourceDataOptions
): UseResourceDataResult {
  const { resource, endpoint, fetchFn = fetch, enabled = true } = options;
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const readings = useResourceReadings(resource);
  const fetchRef = useRef(fetchFn);
  fetchRef.current = fetchFn;

  const url =
    endpoint ?? `/api/meter/readings?resource=${encodeURIComponent(resource)}`;

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetchRef.current(url, {
        headers: { Accept: "application/json" },
      });
      if (!res.ok) throw new Error(`Readings request failed: HTTP ${res.status}`);
      const raw = (await res.json()) as RawReading[];
      const parsed = raw.map((r) => parseRawReading(resource, r));
      resourceStore.dispatch({ type: "ADD_READINGS", payload: parsed });
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setLoading(false);
    }
  }, [resource, url]);

  useEffect(() => {
    if (!enabled) return;
    void load();
  }, [enabled, load]);

  const consumption = useMemo(
    () => aggregateReadings(resource, readings),
    [resource, readings]
  );

  return {
    readings,
    total: consumption.total,
    consumption,
    loading,
    error,
    refetch: load,
  };
}
