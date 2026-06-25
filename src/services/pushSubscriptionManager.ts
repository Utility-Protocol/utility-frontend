"use client";

/**
 * Registers and unregisters Web Push subscriptions with the backend.
 *
 * `subscribe()` asks the active service worker's PushManager for a subscription
 * (VAPID `applicationServerKey`, `userVisibleOnly: true`) and POSTs it to the
 * server; `unsubscribe()` tears it down and DELETEs it. Transport and the
 * registration source are injectable so the flow is testable without a real SW.
 */

export interface PushSubscriptionManagerDeps {
  /** Resolve the active service worker registration. */
  getRegistration?: () => Promise<ServiceWorkerRegistration>;
  fetchFn?: typeof fetch;
  /** Base64url VAPID public key. Defaults to NEXT_PUBLIC_VAPID_PUBLIC_KEY. */
  applicationServerKey?: string;
  /** REST base path. @default "/api/push" */
  apiBase?: string;
}

/** Decode a base64url VAPID key into the Uint8Array the PushManager expects. */
export function urlBase64ToUint8Array(base64: string): Uint8Array {
  const padding = "=".repeat((4 - (base64.length % 4)) % 4);
  const normalized = (base64 + padding).replace(/-/g, "+").replace(/_/g, "/");
  const raw = atob(normalized);
  const output = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; i++) {
    output[i] = raw.charCodeAt(i);
  }
  return output;
}

function resolveDeps(deps: PushSubscriptionManagerDeps = {}) {
  return {
    getRegistration:
      deps.getRegistration ?? (() => navigator.serviceWorker.ready),
    fetchFn: deps.fetchFn ?? fetch.bind(globalThis),
    applicationServerKey:
      deps.applicationServerKey ?? process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY,
    apiBase: deps.apiBase ?? "/api/push",
  };
}

export class PushNotSupportedError extends Error {
  constructor() {
    super("Push messaging is not supported in this environment");
    this.name = "PushNotSupportedError";
  }
}

/** True when this environment can register push subscriptions. */
export function isPushSupported(): boolean {
  return (
    typeof navigator !== "undefined" &&
    "serviceWorker" in navigator &&
    typeof window !== "undefined" &&
    "PushManager" in window &&
    "Notification" in window
  );
}

/**
 * Ensure an active push subscription exists and is registered with the backend.
 * Reuses an existing subscription when present (idempotent).
 */
export async function subscribe(
  deps: PushSubscriptionManagerDeps = {}
): Promise<PushSubscription> {
  if (!isPushSupported()) throw new PushNotSupportedError();
  const { getRegistration, fetchFn, applicationServerKey, apiBase } =
    resolveDeps(deps);
  if (!applicationServerKey) {
    throw new Error("Missing VAPID applicationServerKey");
  }

  const registration = await getRegistration();
  const existing = await registration.pushManager.getSubscription();
  const subscription =
    existing ??
    (await registration.pushManager.subscribe({
      userVisibleOnly: true,
      // Cast: the DOM lib types the key as BufferSource; the generic Uint8Array
      // returned here is structurally compatible but not auto-assignable.
      applicationServerKey: urlBase64ToUint8Array(
        applicationServerKey
      ) as unknown as BufferSource,
    }));

  const res = await fetchFn(`${apiBase}/subscribe`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(subscription.toJSON()),
  });
  if (!res.ok) {
    throw new Error(`Failed to register subscription: HTTP ${res.status}`);
  }
  return subscription;
}

/**
 * Remove the active subscription from the backend and the browser. Resolves
 * `true` if a subscription was torn down, `false` if there was none.
 */
export async function unsubscribe(
  deps: PushSubscriptionManagerDeps = {}
): Promise<boolean> {
  if (!isPushSupported()) return false;
  const { getRegistration, fetchFn, apiBase } = resolveDeps(deps);

  const registration = await getRegistration();
  const subscription = await registration.pushManager.getSubscription();
  if (!subscription) return false;

  // Best-effort backend cleanup before dropping the local subscription.
  try {
    await fetchFn(`${apiBase}/subscribe`, {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ endpoint: subscription.endpoint }),
    });
  } catch {
    // proceed with local unsubscribe regardless
  }
  return subscription.unsubscribe();
}

/** Return the current subscription, or null if none / unsupported. */
export async function getActiveSubscription(
  deps: PushSubscriptionManagerDeps = {}
): Promise<PushSubscription | null> {
  if (!isPushSupported()) return null;
  const { getRegistration } = resolveDeps(deps);
  const registration = await getRegistration();
  return registration.pushManager.getSubscription();
}
