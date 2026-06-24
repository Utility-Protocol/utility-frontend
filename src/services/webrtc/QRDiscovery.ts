/**
 * QRDiscovery — QR-code based fallback for offline WebRTC signaling.
 *
 * When no signaling server is available (offline / field conditions),
 * peers exchange SDP offers/answers by displaying and scanning QR codes.
 *
 * Uses the `qrcode` library (already a dependency) for generation and
 * a basic canvas-based scan flow (jsQR integration point).
 */

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface QRPayload {
  version: 1;
  type: "sdp-offer" | "sdp-answer";
  peerId: string;
  sdp: string;
  checksum: string;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Simple FNV-1a 32-bit hash for checksum validation. */
function fnv1a(input: string): number {
  let hash = 0x811c9dc5;
  for (let i = 0; i < input.length; i++) {
    hash ^= input.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193);
  }
  return hash >>> 0;
}

function computeChecksum(sdp: string): string {
  return fnv1a(sdp + "|v1").toString(16).padStart(8, "0");
}

// ---------------------------------------------------------------------------
// QRDiscovery
// ---------------------------------------------------------------------------

export class QRDiscovery {
  /**
   * Generate a QR code data URL for a given SDP payload.
   *
   * @param peerId  This peer's identifier.
   * @param type    Whether this is an offer or answer.
   * @param sdp     The SDP string to encode.
   * @returns       A data:image/png URL of the QR code.
   */
  static async generateQRCode(
    peerId: string,
    type: "sdp-offer" | "sdp-answer",
    sdp: string
  ): Promise<string> {
    const payload: QRPayload = {
      version: 1,
      type,
      peerId,
      sdp,
      checksum: computeChecksum(sdp),
    };

    const json = JSON.stringify(payload);

    // Dynamically import qrcode (already in package.json, CJS module)
    const { default: QRCode } = await import("qrcode");
    return QRCode.toDataURL(json, {
      width: 512,
      margin: 2,
      errorCorrectionLevel: "H",
      color: { dark: "#000000", light: "#ffffff" },
    });
  }

  /**
   * Decode a QR payload from a raw JSON string (extracted from a
   * scanned QR code).
   *
   * @returns The decoded payload, or null if validation fails.
   */
  static decodeQRPayload(json: string): QRPayload | null {
    try {
      const payload: QRPayload = JSON.parse(json);
      if (payload.version !== 1) return null;

      const expectedChecksum = computeChecksum(payload.sdp);
      if (payload.checksum !== expectedChecksum) return null;

      return payload;
    } catch {
      return null;
    }
  }

  /**
   * Validate that an SDP string is within the 4 KB limit for QR
   * encoding (QR codes are practically limited to ~4 KB at H-level
   * error correction).
   */
  static validateSdpSize(sdp: string): boolean {
    const payload: QRPayload = {
      version: 1,
      type: "sdp-offer",
      peerId: "check",
      sdp,
      checksum: computeChecksum(sdp),
    };
    const json = JSON.stringify(payload);
    return json.length <= 4000; // 4 KB limit
  }
}
