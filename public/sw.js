/* ============================================================
 * Utility Protocol — Service Worker
 * Cache name: utility-v1
 * Strategies:
 *   - Static assets: cache-first (versioned by build hash)
 *   - API requests:  network-first, fallback to cache
 *   - HTML/navigation: network-first, fallback to cache
 * ============================================================ */

const CACHE_NAME = "utility-v1";
const STATIC_CACHE = `${CACHE_NAME}-static`;
const API_CACHE = `${CACHE_NAME}-api`;
const HTML_CACHE = `${CACHE_NAME}-html`;

// Assets to pre-cache on install (app shell)
const PRE_CACHE_ASSETS = ["/", "/manifest.json", "/icon-192.png", "/icon-512.png"];

/* ---------- Install: pre-cache app-shell assets ---------- */
self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(STATIC_CACHE).then((cache) => {
      return cache.addAll(PRE_CACHE_ASSETS).catch((err) => {
        console.warn("[SW] Pre-cache partial failure:", err.message);
      });
    })
  );
  // Activate immediately — don't wait for old tabs to close
  self.skipWaiting();
});

/* ---------- Activate: purge stale caches ---------- */
self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((keys) => {
      const valid = [STATIC_CACHE, API_CACHE, HTML_CACHE];
      return Promise.all(
        keys.filter((k) => !valid.includes(k)).map((k) => caches.delete(k))
      );
    })
  );
  // Claim all clients so the new SW controls pages immediately
  self.clients.claim();
});

/* ---------- Helper: is the request for an API endpoint? ---------- */
function isApiRequest(url) {
  try {
    const { pathname } = new URL(url);
    return (
      pathname.startsWith("/api/") ||
      pathname.includes("/rpc") ||
      pathname.includes("/graphql")
    );
  } catch {
    return false;
  }
}

/* ---------- Helper: is the request for a static asset? ---------- */
function isStaticAsset(url) {
  try {
    const { pathname } = new URL(url);
    return (
      /\.(js|css|png|jpg|jpeg|gif|svg|ico|woff2?|ttf|eot|webp|avif)$/i.test(
        pathname
      ) ||
      pathname.startsWith("/_next/static/") ||
      pathname.startsWith("/_next/image/") ||
      pathname.startsWith("/icon-") ||
      pathname === "/manifest.json"
    );
  } catch {
    return false;
  }
}

/* ---------- Helper: is the request a navigation (HTML) request? ---------- */
function isNavigationRequest(request) {
  return request.mode === "navigate";
}

/* ---------- Strategy: Network-first (for API calls) ---------- */
async function networkFirst(request) {
  const cache = await caches.open(API_CACHE);
  try {
    const response = await fetch(request);
    // Only cache successful responses
    if (response.ok) {
      cache.put(request, response.clone());
    }
    return response;
  } catch (err) {
    const cached = await cache.match(request);
    if (cached) {
      return cached;
    }
    throw err;
  }
}

/* ---------- Strategy: Cache-first (for static assets) ---------- */
async function cacheFirst(request) {
  const cache = await caches.open(STATIC_CACHE);
  const cached = await cache.match(request);
  if (cached) {
    // Update cache in background (stale-while-revalidate)
    fetch(request)
      .then((response) => {
        if (response.ok) {
          cache.put(request, response);
        }
      })
      .catch(() => {
        /* ignore background update failures */
      });
    return cached;
  }
  try {
    const response = await fetch(request);
    if (response.ok) {
      cache.put(request, response.clone());
    }
    return response;
  } catch (err) {
    throw err;
  }
}

/* ---------- Strategy: Network-first with HTML cache fallback ---------- */
async function htmlNetworkFirst(request) {
  const cache = await caches.open(HTML_CACHE);
  try {
    const response = await fetch(request);
    if (response.ok) {
      cache.put(request, response.clone());
    }
    return response;
  } catch (err) {
    const cached = await cache.match(request);
    if (cached) {
      return cached;
    }
    // Final fallback: return the cached root page
    const fallback = await cache.match("/");
    if (fallback) {
      return fallback;
    }
    throw err;
  }
}

/* ---------- Fetch event: route to appropriate strategy ---------- */
self.addEventListener("fetch", (event) => {
  const { request } = event;

  // Skip non-GET requests
  if (request.method !== "GET") {
    return;
  }

  // Skip chrome-extension and other non-http(s) URLs
  const url = request.url;
  if (!url.startsWith("http")) {
    return;
  }

  // Route based on request type
  if (isNavigationRequest(request)) {
    event.respondWith(htmlNetworkFirst(request));
  } else if (isApiRequest(url)) {
    event.respondWith(networkFirst(request));
  } else if (isStaticAsset(url)) {
    event.respondWith(cacheFirst(request));
  }
  // Everything else: let the browser handle it normally
});

/* ============================================================
 * Push notification router
 *   - Foreground client present  → postMessage (in-app toast)
 *   - Background                  → system Notification, coalesced
 *     within a 60s window via a shared tag (the coalescence key).
 * ============================================================ */

const COALESCENCE_BODY_PREFIX = 80;
const MAX_NOTIFICATION_ACTIONS = 2;

/* Mirror of src/utils/topicRouter.ts coalescenceKey (the SW cannot import it). */
function coalescenceKey(topic, body) {
  return `${topic} ${(body || "").slice(0, COALESCENCE_BODY_PREFIX)}`;
}

async function handlePush(event) {
  let payload = null;
  try {
    payload = event.data ? event.data.json() : null;
  } catch {
    payload = null;
  }
  if (!payload || typeof payload.topic !== "string") return;

  const { topic, title = "Notification", body = "", data = {}, actions = [] } =
    payload;
  const key = coalescenceKey(topic, body);

  const clientList = await self.clients.matchAll({
    type: "window",
    includeUncontrolled: true,
  });

  // Foreground detection: route to the in-app toast queue instead of the OS.
  const hasVisibleClient = clientList.some(
    (c) => c.visibilityState === "visible" || c.focused
  );
  if (hasVisibleClient) {
    for (const client of clientList) {
      client.postMessage({ type: "push-notification", coalescenceKey: key, payload });
    }
    return;
  }

  // Background: coalesce identical events sharing the tag into one notification.
  const existing = await self.registration.getNotifications({ tag: key });
  const prevCount =
    existing.length && existing[0].data ? existing[0].data.count || 1 : 0;
  const count = prevCount + 1;

  await self.registration.showNotification(
    count > 1 ? `${title} (${count})` : title,
    {
      body,
      tag: key, // identical tag replaces the prior notification (coalescence)
      renotify: count > 1,
      icon: "/icon-192.png",
      badge: "/icon-192.png",
      data: { ...data, topic, count, actions, coalescenceKey: key },
      actions: (actions || [])
        .slice(0, MAX_NOTIFICATION_ACTIONS)
        .map((a) => ({ action: a.action, title: a.title, icon: a.icon })),
    }
  );
}

self.addEventListener("push", (event) => {
  event.waitUntil(handlePush(event));
});

/* ---------- Notification click: route to URL or app route ---------- */
function resolveTarget(notificationData, actionId) {
  const actions = (notificationData && notificationData.actions) || [];
  if (actionId) {
    const matched = actions.find((a) => a.action === actionId);
    if (matched) return matched.url || matched.route || "/";
  }
  const first = actions[0];
  return (first && (first.url || first.route)) || "/";
}

async function openOrFocus(target, payload) {
  const clientList = await self.clients.matchAll({
    type: "window",
    includeUncontrolled: true,
  });
  for (const client of clientList) {
    if ("focus" in client) {
      await client.focus();
      client.postMessage({ type: "notification-action", target, payload });
      return;
    }
  }
  if (self.clients.openWindow) {
    await self.clients.openWindow(target);
  }
}

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const data = event.notification.data || {};
  const target = resolveTarget(data, event.action);
  event.waitUntil(openOrFocus(target, data));
});

/* ---------- Control messages from clients ---------- */
self.addEventListener("message", (event) => {
  const msg = event.data;
  if (msg && msg.type === "skip-waiting") {
    self.skipWaiting();
  }
});
