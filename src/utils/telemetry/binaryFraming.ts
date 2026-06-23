import type { TelemetryFrame } from "./types";

/**
 * Encode/decode for the custom binary framing protocol.
 *
 * Wire layout (little-endian):
 *   bytes [0..2)   -> u16 sequence number
 *   bytes [2..2+4N)-> N x f32 series values
 *
 * Keeping this in a dedicated module makes the protocol trivially testable and
 * reusable by the streaming hook, unit tests and the reconnect benchmark.
 */

export interface EncodedFrame {
  sequence: number;
  values: number[];
}

/** Serialize a frame to an ArrayBuffer (what the WebSocket sends/receives). */
export function encodeFrame(sequence: number, values: number[]): ArrayBuffer {
  const byteLength = 2 + values.length * 4;
  const buffer = new ArrayBuffer(byteLength);
  const view = new DataView(buffer);
  view.setUint16(0, sequence & 0xffff, true);
  for (let i = 0; i < values.length; i++) {
    view.setFloat32(2 + i * 4, values[i], true);
  }
  return buffer;
}

/**
 * Parse a binary message into a {@link TelemetryFrame}.
 *
 * @param buffer raw WebSocket payload (ArrayBuffer).
 * @param seriesCount when provided, reads exactly this many series values
 *   (clamped to what the buffer actually contains). When omitted, every f32
 *   present in the payload is read.
 */
export function parseFrame(
  buffer: ArrayBuffer,
  seriesCount?: number
): TelemetryFrame {
  if (!buffer || buffer.byteLength < 2) {
    throw new Error(`Invalid telemetry frame: need >=2 bytes, got ${buffer?.byteLength ?? 0}`);
  }
  const view = new DataView(buffer);
  const sequence = view.getUint16(0, true);
  const available = Math.floor((buffer.byteLength - 2) / 4);
  const count =
    seriesCount != null ? Math.max(0, Math.min(seriesCount, available)) : available;
  const values: number[] = new Array(count);
  for (let i = 0; i < count; i++) {
    values[i] = view.getFloat32(2 + i * 4, true);
  }
  return { sequence, values, receivedAt: Date.now() };
}
