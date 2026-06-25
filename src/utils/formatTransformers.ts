/**
 * Row-to-format conversion helpers for the bulk export pipeline.
 *
 * - CSV: RFC 4180 compliant escaping and quoting.
 * - GeoJSON: a `Feature` with `Point` geometry; coordinates truncated to
 *   {@link COORD_PRECISION} decimal places.
 * - Shapefile: extraction of `(lon, lat, attributes)` consumed by
 *   {@link ShapefilePointWriter}.
 */

import { COORD_PRECISION, type ResourceRow } from "@/types/export";

const FACTOR = 10 ** COORD_PRECISION;

/** Truncate (not round) a coordinate to {@link COORD_PRECISION} decimals. */
export function truncateCoord(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.trunc(value * FACTOR) / FACTOR;
}

/** RFC 4180 field escaping: quote when the value contains , " CR or LF. */
export function csvEscape(value: unknown): string {
  if (value === null || value === undefined) return "";
  const str = typeof value === "string" ? value : String(value);
  if (/[",\r\n]/.test(str)) {
    return `"${str.replace(/"/g, '""')}"`;
  }
  return str;
}

/** Header line for the given column projection (CRLF terminated). */
export function csvHeader(columns: string[]): string {
  return columns.map(csvEscape).join(",") + "\r\n";
}

/** A single CSV data line for the projected columns (CRLF terminated). */
export function csvTransformer(row: ResourceRow, columns: string[]): string {
  return columns.map((col) => csvEscape(row[col])).join(",") + "\r\n";
}

export interface GeoJsonFeature {
  type: "Feature";
  geometry: { type: "Point"; coordinates: [number, number] };
  properties: Record<string, unknown>;
}

export interface GeometryFieldConfig {
  lonField: string;
  latField: string;
}

function coerceNumber(value: unknown): number {
  return typeof value === "number" ? value : Number(value);
}

/**
 * Convert a row into a GeoJSON `Feature`. The geometry is built from the
 * configured lon/lat fields; `properties` carries the projected columns (the
 * geometry fields are excluded since they are represented by the geometry).
 */
export function geoJsonTransformer(
  row: ResourceRow,
  columns: string[],
  geometry: GeometryFieldConfig
): GeoJsonFeature {
  const lon = truncateCoord(coerceNumber(row[geometry.lonField]));
  const lat = truncateCoord(coerceNumber(row[geometry.latField]));

  const projected = columns.length ? columns : Object.keys(row);
  const properties: Record<string, unknown> = {};
  for (const col of projected) {
    if (col === geometry.lonField || col === geometry.latField) continue;
    properties[col] = row[col];
  }

  return {
    type: "Feature",
    geometry: { type: "Point", coordinates: [lon, lat] },
    properties,
  };
}

/** Serialised GeoJSON feature string (no surrounding whitespace). */
export function geoJsonTransformerString(
  row: ResourceRow,
  columns: string[],
  geometry: GeometryFieldConfig
): string {
  return JSON.stringify(geoJsonTransformer(row, columns, geometry));
}

export interface ShapefileRecordInput {
  lon: number;
  lat: number;
  attributes: Record<string, unknown>;
}

/**
 * Extract the geometry and attribute payload for a shapefile point record.
 * Coordinates are truncated to {@link COORD_PRECISION}; attributes exclude the
 * geometry fields.
 */
export function shapefileTransformer(
  row: ResourceRow,
  columns: string[],
  geometry: GeometryFieldConfig
): ShapefileRecordInput {
  const lon = truncateCoord(coerceNumber(row[geometry.lonField]));
  const lat = truncateCoord(coerceNumber(row[geometry.latField]));

  const projected = columns.length ? columns : Object.keys(row);
  const attributes: Record<string, unknown> = {};
  for (const col of projected) {
    if (col === geometry.lonField || col === geometry.latField) continue;
    attributes[col] = row[col];
  }
  return { lon, lat, attributes };
}
