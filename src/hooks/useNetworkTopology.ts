"use client";

import { useCallback, useEffect, useState } from "react";
import type {
  FlowDirection,
  LngLat,
  LoadStatus,
  NetworkEdge,
} from "@/types/network";

/**
 * Fetches the utility-network topology as GeoJSON from the REST endpoint and
 * parses LineString features into {@link NetworkEdge}s (flow direction / load
 * status from feature properties).
 */

interface GeoJsonLineFeature {
  type: "Feature";
  geometry: { type: "LineString"; coordinates: LngLat[] };
  properties?: {
    id?: string;
    flowDirection?: FlowDirection;
    loadStatus?: LoadStatus;
  } | null;
}

interface GeoJsonFeatureCollection {
  type: "FeatureCollection";
  features: GeoJsonLineFeature[];
}

const VALID_FLOW: FlowDirection[] = ["forward", "reverse", "bidirectional"];
const VALID_LOAD: LoadStatus[] = ["nominal", "overloaded", "idle"];

/** Parse a GeoJSON FeatureCollection of LineStrings into network edges. */
export function parseGeoJsonNetwork(
  fc: GeoJsonFeatureCollection
): NetworkEdge[] {
  const edges: NetworkEdge[] = [];
  fc.features.forEach((feature, i) => {
    if (feature.geometry?.type !== "LineString") return;
    const coords = feature.geometry.coordinates;
    if (!Array.isArray(coords) || coords.length < 2) return;

    const props = feature.properties ?? {};
    const flowDirection = VALID_FLOW.includes(props.flowDirection as FlowDirection)
      ? (props.flowDirection as FlowDirection)
      : "bidirectional";
    const loadStatus = VALID_LOAD.includes(props.loadStatus as LoadStatus)
      ? (props.loadStatus as LoadStatus)
      : "nominal";

    edges.push({
      id: props.id ?? `edge-${i}`,
      geometry: coords,
      flowDirection,
      loadStatus,
    });
  });
  return edges;
}

export interface UseNetworkTopologyOptions {
  endpoint?: string;
  fetchFn?: typeof fetch;
  enabled?: boolean;
}

export interface UseNetworkTopologyResult {
  edges: NetworkEdge[];
  loading: boolean;
  error: string | null;
  refetch: () => void;
}

export function useNetworkTopology(
  options: UseNetworkTopologyOptions = {}
): UseNetworkTopologyResult {
  const { endpoint = "/api/network/topology", fetchFn = fetch, enabled = true } =
    options;
  const [edges, setEdges] = useState<NetworkEdge[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetchFn(endpoint, {
        headers: { Accept: "application/geo+json, application/json" },
      });
      if (!res.ok) throw new Error(`Topology request failed: HTTP ${res.status}`);
      const fc = (await res.json()) as GeoJsonFeatureCollection;
      setEdges(parseGeoJsonNetwork(fc));
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setLoading(false);
    }
  }, [endpoint, fetchFn]);

  useEffect(() => {
    if (!enabled) return;
    void load();
  }, [enabled, load]);

  return { edges, loading, error, refetch: load };
}
