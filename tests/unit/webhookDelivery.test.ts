import { describe, expect, it, vi } from "vitest";
import {
  WebhookDeliveryService,
  serializeWebhookEvent,
  signWebhookPayload,
  verifyWebhookSignature,
  type WebhookEvent,
} from "@/services/webhookDelivery";

const event: WebhookEvent = {
  id: "evt_123",
  type: "meter.reading.created",
  createdAt: "2026-07-18T00:00:00.000Z",
  payload: { z: 2, a: { c: true, b: "stable" } },
};

describe("webhook delivery signatures", () => {
  it("serializes payloads deterministically", () => {
    expect(serializeWebhookEvent(event)).toBe(
      '{"createdAt":"2026-07-18T00:00:00.000Z","id":"evt_123","payload":{"a":{"b":"stable","c":true},"z":2},"type":"meter.reading.created"}'
    );
  });

  it("signs and verifies HMAC-SHA256 payloads", async () => {
    const body = serializeWebhookEvent(event);
    const signature = await signWebhookPayload("secret", "2026-07-18T00:00:00.000Z", body);

    expect(signature).toMatch(/^v1=[a-f0-9]{64}$/);
    await expect(
      verifyWebhookSignature("secret", "2026-07-18T00:00:00.000Z", body, signature)
    ).resolves.toBe(true);
    await expect(
      verifyWebhookSignature("wrong", "2026-07-18T00:00:00.000Z", body, signature)
    ).resolves.toBe(false);
  });
});

describe("WebhookDeliveryService", () => {
  it("delivers a signed POST request", async () => {
    const fetcher = vi.fn(async () => new Response(null, { status: 204 }));
    const service = new WebhookDeliveryService({
      fetcher,
      now: () => new Date("2026-07-18T00:00:00.000Z"),
    });

    const result = await service.deliver(event, {
      id: "endpoint_1",
      url: "https://example.com/webhook",
      secret: "secret",
    });

    expect(result.status).toBe("delivered");
    expect(fetcher).toHaveBeenCalledTimes(1);
    const [, init] = fetcher.mock.calls[0];
    expect(init?.method).toBe("POST");
    expect(init?.headers).toMatchObject({
      "content-type": "application/json",
      "x-webhook-event-id": "evt_123",
      "x-webhook-event-type": "meter.reading.created",
      "x-webhook-timestamp": "2026-07-18T00:00:00.000Z",
    });
    expect(String((init?.headers as Record<string, string>)["x-webhook-signature"])).toMatch(
      /^v1=[a-f0-9]{64}$/
    );
  });

  it("retries transient failures with jittered backoff and stops after max attempts", async () => {
    const fetcher = vi
      .fn()
      .mockResolvedValueOnce(new Response(null, { status: 503 }))
      .mockResolvedValueOnce(new Response(null, { status: 429 }))
      .mockResolvedValueOnce(new Response(null, { status: 202 }));
    const sleep = vi.fn(async () => undefined);
    const service = new WebhookDeliveryService({
      fetcher,
      sleep,
      rng: () => 0.5,
      baseDelayMs: 1_000,
      maxDelayMs: 10_000,
      now: () => new Date("2026-07-18T00:00:00.000Z"),
    });

    const result = await service.deliver(event, {
      id: "endpoint_1",
      url: "https://example.com/webhook",
      secret: "secret",
      maxAttempts: 3,
    });

    expect(result.status).toBe("delivered");
    expect(result.attempts.map((attempt) => attempt.status)).toEqual([
      "retrying",
      "retrying",
      "delivered",
    ]);
    expect(sleep).toHaveBeenNthCalledWith(1, 500);
    expect(sleep).toHaveBeenNthCalledWith(2, 1_000);
  });

  it("marks delivery failed after exhausting attempts", async () => {
    const fetcher = vi.fn(async () => new Response(null, { status: 500 }));
    const service = new WebhookDeliveryService({ fetcher, sleep: vi.fn(async () => undefined) });

    const result = await service.deliver(event, {
      id: "endpoint_1",
      url: "https://example.com/webhook",
      secret: "secret",
      maxAttempts: 2,
    });

    expect(result.status).toBe("failed");
    expect(result.attempts.at(-1)).toMatchObject({ attempt: 2, status: "failed", statusCode: 500 });
  });
});
