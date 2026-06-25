"use client";

import { useSyncExternalStore } from "react";
import { coalescenceKey } from "@/utils/topicRouter";
import {
  COALESCENCE_WINDOW_MS,
  MAX_NOTIFICATION_ACTIONS,
  type AppNotification,
  type PushPayload,
} from "@/types/notification";

/**
 * In-app notification queue with 60-second coalescence.
 *
 * Identical events (same {@link coalescenceKey}) within the window increment a
 * count on the existing notification and extend its auto-dismiss timer instead
 * of creating duplicates. Implemented as a custom store (matching the codebase
 * pattern) consumed via {@link useNotifications}. Timers are injectable so the
 * coalescence behaviour is testable with fake clocks.
 */

interface Entry {
  notification: AppNotification;
  timer: ReturnType<typeof setTimeout> | null;
}

export interface NotificationStoreDeps {
  setTimeoutFn?: (cb: () => void, ms: number) => ReturnType<typeof setTimeout>;
  clearTimeoutFn?: (id: ReturnType<typeof setTimeout>) => void;
  now?: () => number;
  window?: number;
}

type Listener = (notifications: AppNotification[]) => void;

const EMPTY: AppNotification[] = [];

export class NotificationStore {
  private entries = new Map<string, Entry>();
  private listeners = new Set<Listener>();
  /** Cached, referentially-stable snapshot for useSyncExternalStore. */
  private snapshot: AppNotification[] = EMPTY;

  private readonly setTimeoutFn: NonNullable<NotificationStoreDeps["setTimeoutFn"]>;
  private readonly clearTimeoutFn: NonNullable<NotificationStoreDeps["clearTimeoutFn"]>;
  private readonly now: () => number;
  private readonly window: number;

  constructor(deps: NotificationStoreDeps = {}) {
    this.setTimeoutFn =
      deps.setTimeoutFn ?? ((cb, ms) => setTimeout(cb, ms));
    this.clearTimeoutFn = deps.clearTimeoutFn ?? ((id) => clearTimeout(id));
    this.now = deps.now ?? Date.now;
    this.window = deps.window ?? COALESCENCE_WINDOW_MS;
  }

  getState = (): AppNotification[] => this.snapshot;

  subscribe = (listener: Listener): (() => void) => {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  };

  /**
   * Ingest a push payload. Coalesces into an existing entry when one with the
   * same key is live, otherwise creates a new one. Returns the coalescence key.
   */
  receive(payload: PushPayload): string {
    const key = coalescenceKey(payload.topic, payload.body);
    const t = this.now();
    const existing = this.entries.get(key);

    if (existing) {
      if (existing.timer !== null) this.clearTimeoutFn(existing.timer);
      existing.notification = {
        ...existing.notification,
        // Refresh display fields to the latest occurrence.
        title: payload.title,
        body: payload.body,
        data: payload.data,
        actions: payload.actions?.slice(0, MAX_NOTIFICATION_ACTIONS),
        lastSeenAt: t,
        count: existing.notification.count + 1,
      };
      existing.timer = this.arm(key);
    } else {
      const notification: AppNotification = {
        id: key,
        topic: payload.topic,
        title: payload.title,
        body: payload.body,
        data: payload.data,
        actions: payload.actions?.slice(0, MAX_NOTIFICATION_ACTIONS),
        firstSeenAt: t,
        lastSeenAt: t,
        count: 1,
      };
      this.entries.set(key, { notification, timer: this.arm(key) });
    }

    this.commit();
    return key;
  }

  /** Manually dismiss a notification (e.g. operator acknowledged it). */
  dismiss(key: string): void {
    const entry = this.entries.get(key);
    if (!entry) return;
    if (entry.timer !== null) this.clearTimeoutFn(entry.timer);
    this.entries.delete(key);
    this.commit();
  }

  /** Remove all notifications and cancel their timers. */
  clear(): void {
    for (const entry of this.entries.values()) {
      if (entry.timer !== null) this.clearTimeoutFn(entry.timer);
    }
    this.entries.clear();
    this.commit();
  }

  /** Current coalescence count for a key (0 if absent). */
  countFor(key: string): number {
    return this.entries.get(key)?.notification.count ?? 0;
  }

  private arm(key: string): ReturnType<typeof setTimeout> {
    return this.setTimeoutFn(() => this.dismiss(key), this.window);
  }

  /** Recompute the cached snapshot (newest first) and notify subscribers. */
  private commit(): void {
    const list = Array.from(this.entries.values(), (e) => e.notification);
    list.sort((a, b) => b.lastSeenAt - a.lastSeenAt);
    this.snapshot = list.length === 0 ? EMPTY : list;
    for (const listener of this.listeners) listener(this.snapshot);
  }
}

/** Shared singleton notification store. */
export const notificationStore = new NotificationStore();

/** React binding: subscribe a component to the coalesced notification queue. */
export function useNotifications(): AppNotification[] {
  return useSyncExternalStore(
    notificationStore.subscribe,
    notificationStore.getState,
    notificationStore.getState
  );
}
