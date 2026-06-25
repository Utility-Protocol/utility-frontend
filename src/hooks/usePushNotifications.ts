"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  getActiveSubscription,
  isPushSupported,
  subscribe as subscribePush,
  unsubscribe as unsubscribePush,
  type PushSubscriptionManagerDeps,
} from "@/services/pushSubscriptionManager";
import { topicRouter } from "@/utils/topicRouter";
import { notificationStore, useNotifications } from "@/store/slices/notificationSlice";
import type {
  AppNotification,
  PushTopicHandler,
  SwPushMessage,
} from "@/types/notification";

export type PushPermission = NotificationPermission | "unsupported";

export interface UsePushNotificationsOptions {
  /** Inject subscription-manager dependencies (tests / custom transport). */
  deps?: PushSubscriptionManagerDeps;
  /** Subscribe automatically once permission is granted. @default false */
  autoSubscribe?: boolean;
}

export interface UsePushNotificationsResult {
  permission: PushPermission;
  isSubscribed: boolean;
  supported: boolean;
  notifications: AppNotification[];
  requestPermission: () => Promise<PushPermission>;
  subscribe: () => Promise<boolean>;
  unsubscribe: () => Promise<boolean>;
  /** Register a handler for a topic/pattern. Returns an unsubscribe function. */
  registerTopic: (pattern: string, handler: PushTopicHandler) => () => void;
  dismiss: (key: string) => void;
}

function readPermission(): PushPermission {
  if (typeof Notification === "undefined") return "unsupported";
  return Notification.permission;
}

function isSwPushMessage(data: unknown): data is SwPushMessage {
  return (
    typeof data === "object" &&
    data !== null &&
    (data as { type?: unknown }).type === "push-notification"
  );
}

/**
 * Orchestrates push notifications: requests permission, registers the push
 * subscription, and wires foreground delivery. When the SW detects a visible
 * client it posts the event here instead of showing a system notification; the
 * hook fans it out to topic handlers and the in-app toast queue.
 */
export function usePushNotifications(
  options: UsePushNotificationsOptions = {}
): UsePushNotificationsResult {
  const { deps, autoSubscribe = false } = options;
  const supported = typeof window !== "undefined" && isPushSupported();

  const [permission, setPermission] = useState<PushPermission>(() =>
    typeof window === "undefined" ? "unsupported" : readPermission()
  );
  const [isSubscribed, setIsSubscribed] = useState(false);
  const notifications = useNotifications();

  const depsRef = useRef(deps);
  depsRef.current = deps;

  // Foreground delivery: the SW posts coalesced push events to this client.
  useEffect(() => {
    if (typeof navigator === "undefined" || !navigator.serviceWorker) return;
    const onMessage = (event: MessageEvent) => {
      if (!isSwPushMessage(event.data)) return;
      const { payload } = event.data;
      topicRouter.emit(payload);
      notificationStore.receive(payload);
    };
    navigator.serviceWorker.addEventListener("message", onMessage);
    return () =>
      navigator.serviceWorker.removeEventListener("message", onMessage);
  }, []);

  // Reflect any pre-existing subscription on mount.
  useEffect(() => {
    let cancelled = false;
    if (!supported) return;
    getActiveSubscription(depsRef.current)
      .then((sub) => {
        if (!cancelled) setIsSubscribed(sub !== null);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [supported]);

  const requestPermission = useCallback(async (): Promise<PushPermission> => {
    if (typeof Notification === "undefined") return "unsupported";
    const result = await Notification.requestPermission();
    setPermission(result);
    return result;
  }, []);

  const subscribe = useCallback(async (): Promise<boolean> => {
    if (!supported) return false;
    let perm = readPermission();
    if (perm === "default") perm = await requestPermission();
    if (perm !== "granted") {
      setPermission(perm);
      return false;
    }
    try {
      await subscribePush(depsRef.current);
      setIsSubscribed(true);
      return true;
    } catch {
      setIsSubscribed(false);
      return false;
    }
  }, [supported, requestPermission]);

  const unsubscribe = useCallback(async (): Promise<boolean> => {
    const result = await unsubscribePush(depsRef.current);
    if (result) setIsSubscribed(false);
    return result;
  }, []);

  const registerTopic = useCallback(
    (pattern: string, handler: PushTopicHandler) =>
      topicRouter.insert(pattern, handler),
    []
  );

  const dismiss = useCallback((key: string) => {
    notificationStore.dismiss(key);
  }, []);

  // Optional auto-subscribe once permission is already granted.
  useEffect(() => {
    if (autoSubscribe && supported && permission === "granted" && !isSubscribed) {
      void subscribe();
    }
  }, [autoSubscribe, supported, permission, isSubscribed, subscribe]);

  return {
    permission,
    isSubscribed,
    supported,
    notifications,
    requestPermission,
    subscribe,
    unsubscribe,
    registerTopic,
    dismiss,
  };
}
