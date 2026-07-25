import { fullJitterBackoff } from "@/utils/backoff";

export type WebhookEvent = {
  id: string;
  type: string;
  createdAt: string;
  payload: unknown;
};

export type WebhookEndpoint = {
  id: string;
  url: string;
  secret: string;
  maxAttempts?: number;
};

export type WebhookDeliveryStatus = "pending" | "delivered" | "retrying" | "failed";

export type WebhookDeliveryAttempt = {
  attempt: number;
  status: WebhookDeliveryStatus;
  statusCode?: number;
  error?: string;
  nextAttemptAt?: string;
};

export type WebhookDeliveryResult = {
  eventId: string;
  endpointId: string;
  status: WebhookDeliveryStatus;
  attempts: WebhookDeliveryAttempt[];
};

export type WebhookDeliveryOptions = {
  fetcher?: typeof fetch;
  now?: () => Date;
  sleep?: (ms: number) => Promise<void>;
  rng?: () => number;
  baseDelayMs?: number;
  maxDelayMs?: number;
  defaultMaxAttempts?: number;
};

const SIGNATURE_VERSION = "v1";
const DEFAULT_MAX_ATTEMPTS = 5;
const DEFAULT_BASE_DELAY_MS = 1_000;
const DEFAULT_MAX_DELAY_MS = 60_000;

const encoder = new TextEncoder();

function toHex(buffer: ArrayBuffer): string {
  return [...new Uint8Array(buffer)]
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
}

function stableSerialize(value: unknown): string {
  if (value === null || typeof value !== "object") {
    return JSON.stringify(value);
  }

  if (Array.isArray(value)) {
    return `[${value.map(stableSerialize).join(",")}]`;
  }

  return `{${Object.entries(value as Record<string, unknown>)
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([key, nested]) => `${JSON.stringify(key)}:${stableSerialize(nested)}`)
    .join(",")}}`;
}

async function hmacSha256(secret: string, message: string): Promise<string> {
  const key = await crypto.subtle.importKey(
    "raw",
    encoder.encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"]
  );
  const signature = await crypto.subtle.sign("HMAC", key, encoder.encode(message));
  return toHex(signature);
}

export function serializeWebhookEvent(event: WebhookEvent): string {
  return stableSerialize(event);
}

export async function signWebhookPayload(
  secret: string,
  timestamp: string,
  body: string
): Promise<string> {
  const digest = await hmacSha256(secret, `${timestamp}.${body}`);
  return `${SIGNATURE_VERSION}=${digest}`;
}

export async function verifyWebhookSignature(
  secret: string,
  timestamp: string,
  body: string,
  signatureHeader: string
): Promise<boolean> {
  const expected = await signWebhookPayload(secret, timestamp, body);
  const expectedBytes = encoder.encode(expected);
  const actualBytes = encoder.encode(signatureHeader);

  if (expectedBytes.length !== actualBytes.length) return false;

  let diff = 0;
  for (let index = 0; index < expectedBytes.length; index += 1) {
    diff |= expectedBytes[index] ^ actualBytes[index];
  }
  return diff === 0;
}

export class WebhookDeliveryService {
  private readonly fetcher: typeof fetch;
  private readonly now: () => Date;
  private readonly sleep: (ms: number) => Promise<void>;
  private readonly rng: () => number;
  private readonly baseDelayMs: number;
  private readonly maxDelayMs: number;
  private readonly defaultMaxAttempts: number;

  constructor(options: WebhookDeliveryOptions = {}) {
    this.fetcher = options.fetcher ?? fetch;
    this.now = options.now ?? (() => new Date());
    this.sleep = options.sleep ?? ((ms) => new Promise((resolve) => setTimeout(resolve, ms)));
    this.rng = options.rng ?? Math.random;
    this.baseDelayMs = options.baseDelayMs ?? DEFAULT_BASE_DELAY_MS;
    this.maxDelayMs = options.maxDelayMs ?? DEFAULT_MAX_DELAY_MS;
    this.defaultMaxAttempts = options.defaultMaxAttempts ?? DEFAULT_MAX_ATTEMPTS;
  }

  async deliver(event: WebhookEvent, endpoint: WebhookEndpoint): Promise<WebhookDeliveryResult> {
    const body = serializeWebhookEvent(event);
    const attempts: WebhookDeliveryAttempt[] = [];
    const maxAttempts = endpoint.maxAttempts ?? this.defaultMaxAttempts;

    for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
      const timestamp = this.now().toISOString();
      const signature = await signWebhookPayload(endpoint.secret, timestamp, body);

      try {
        const response = await this.fetcher(endpoint.url, {
          method: "POST",
          headers: {
            "content-type": "application/json",
            "user-agent": "utility-frontend-webhook-delivery/1.0",
            "x-webhook-event-id": event.id,
            "x-webhook-event-type": event.type,
            "x-webhook-signature": signature,
            "x-webhook-timestamp": timestamp,
          },
          body,
        });

        if (response.ok) {
          attempts.push({ attempt, status: "delivered", statusCode: response.status });
          return { eventId: event.id, endpointId: endpoint.id, status: "delivered", attempts };
        }

        const delay = attempt === maxAttempts ? undefined : this.retryDelay(attempt);
        attempts.push({
          attempt,
          status: attempt === maxAttempts ? "failed" : "retrying",
          statusCode: response.status,
          nextAttemptAt: delay === undefined ? undefined : this.nextAttemptAt(delay),
        });
      } catch (error) {
        const delay = attempt === maxAttempts ? undefined : this.retryDelay(attempt);
        attempts.push({
          attempt,
          status: attempt === maxAttempts ? "failed" : "retrying",
          error: error instanceof Error ? error.message : "Unknown webhook delivery error",
          nextAttemptAt: delay === undefined ? undefined : this.nextAttemptAt(delay),
        });
      }

      const lastAttempt = attempts.at(-1);
      if (attempt < maxAttempts && lastAttempt?.nextAttemptAt) {
        await this.sleep(new Date(lastAttempt.nextAttemptAt).getTime() - this.now().getTime());
      }
    }

    return { eventId: event.id, endpointId: endpoint.id, status: "failed", attempts };
  }

  private retryDelay(attempt: number): number {
    return fullJitterBackoff(attempt - 1, this.baseDelayMs, this.maxDelayMs, this.rng);
  }

  private nextAttemptAt(delayMs: number): string {
    return new Date(this.now().getTime() + delayMs).toISOString();
  }
}
