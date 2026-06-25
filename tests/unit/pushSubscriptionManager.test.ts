import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import {
  urlBase64ToUint8Array,
  subscribe,
  unsubscribe,
  isPushSupported,
} from "@/services/pushSubscriptionManager";

// --- Make isPushSupported() return true in jsdom ---------------------------
beforeEach(() => {
  Object.defineProperty(window, "PushManager", { value: class {}, configurable: true });
  Object.defineProperty(window, "Notification", { value: class {}, configurable: true });
  Object.defineProperty(globalThis, "Notification", {
    value: class {},
    configurable: true,
  });
  Object.defineProperty(navigator, "serviceWorker", {
    value: {},
    configurable: true,
  });
});

afterEach(() => {
  vi.restoreAllMocks();
});

function fakeSubscription(endpoint = "https://push.example/abc") {
  return {
    endpoint,
    toJSON: () => ({ endpoint, keys: { p256dh: "k", auth: "a" } }),
    unsubscribe: vi.fn().mockResolvedValue(true),
  } as unknown as PushSubscription;
}

function fakeRegistration(existing: PushSubscription | null) {
  const subscribeMock = vi.fn().mockResolvedValue(fakeSubscription());
  return {
    registration: {
      pushManager: {
        getSubscription: vi.fn().mockResolvedValue(existing),
        subscribe: subscribeMock,
      },
    } as unknown as ServiceWorkerRegistration,
    subscribeMock,
  };
}

describe("urlBase64ToUint8Array", () => {
  it("decodes a base64url key with padding and url-safe chars", () => {
    // "AAAA" → 3 zero bytes; verifies padding handling and length.
    const out = urlBase64ToUint8Array("AAAA");
    expect(out).toEqual(new Uint8Array([0, 0, 0]));
  });

  it("maps url-safe '-' and '_' to '+' and '/'", () => {
    const std = urlBase64ToUint8Array("a-b_");
    const expected = (() => {
      const raw = atob("a+b/");
      return new Uint8Array([...raw].map((c) => c.charCodeAt(0)));
    })();
    expect(std).toEqual(expected);
  });
});

describe("isPushSupported", () => {
  it("is true once SW/PushManager/Notification are present", () => {
    expect(isPushSupported()).toBe(true);
  });
});

describe("subscribe", () => {
  it("creates a subscription and POSTs it to the backend", async () => {
    const { registration, subscribeMock } = fakeRegistration(null);
    const fetchFn = vi.fn().mockResolvedValue({ ok: true });

    const sub = await subscribe({
      getRegistration: () => Promise.resolve(registration),
      fetchFn: fetchFn as unknown as typeof fetch,
      applicationServerKey: "AAAA",
    });

    expect(subscribeMock).toHaveBeenCalledWith(
      expect.objectContaining({ userVisibleOnly: true })
    );
    expect(fetchFn).toHaveBeenCalledWith(
      "/api/push/subscribe",
      expect.objectContaining({ method: "POST" })
    );
    expect(sub.endpoint).toContain("push.example");
  });

  it("reuses an existing subscription (idempotent)", async () => {
    const existing = fakeSubscription("https://push.example/existing");
    const { registration, subscribeMock } = fakeRegistration(existing);
    const fetchFn = vi.fn().mockResolvedValue({ ok: true });

    const sub = await subscribe({
      getRegistration: () => Promise.resolve(registration),
      fetchFn: fetchFn as unknown as typeof fetch,
      applicationServerKey: "AAAA",
    });

    expect(subscribeMock).not.toHaveBeenCalled();
    expect(sub.endpoint).toBe("https://push.example/existing");
  });

  it("throws when the VAPID key is missing", async () => {
    const { registration } = fakeRegistration(null);
    await expect(
      subscribe({
        getRegistration: () => Promise.resolve(registration),
        fetchFn: vi.fn() as unknown as typeof fetch,
        applicationServerKey: "",
      })
    ).rejects.toThrow(/VAPID/);
  });

  it("throws when the backend rejects the subscription", async () => {
    const { registration } = fakeRegistration(null);
    const fetchFn = vi.fn().mockResolvedValue({ ok: false, status: 500 });
    await expect(
      subscribe({
        getRegistration: () => Promise.resolve(registration),
        fetchFn: fetchFn as unknown as typeof fetch,
        applicationServerKey: "AAAA",
      })
    ).rejects.toThrow(/HTTP 500/);
  });
});

describe("unsubscribe", () => {
  it("DELETEs the subscription and tears it down locally", async () => {
    const existing = fakeSubscription("https://push.example/x");
    const { registration } = fakeRegistration(existing);
    const fetchFn = vi.fn().mockResolvedValue({ ok: true });

    const result = await unsubscribe({
      getRegistration: () => Promise.resolve(registration),
      fetchFn: fetchFn as unknown as typeof fetch,
    });

    expect(fetchFn).toHaveBeenCalledWith(
      "/api/push/subscribe",
      expect.objectContaining({ method: "DELETE" })
    );
    expect(existing.unsubscribe).toHaveBeenCalled();
    expect(result).toBe(true);
  });

  it("returns false when there is no active subscription", async () => {
    const { registration } = fakeRegistration(null);
    const result = await unsubscribe({
      getRegistration: () => Promise.resolve(registration),
      fetchFn: vi.fn() as unknown as typeof fetch,
    });
    expect(result).toBe(false);
  });
});
