/**
 * Types and invariants for the push-notification router with a topic-based
 * subscription registry.
 *
 * Push events carry a three-level topic (`domain.subdomain.action`, e.g.
 * `meter.water.breach`). UI modules register handlers against exact topics or
 * trailing-wildcard ancestors (`meter.water.*`, `meter.*`, `*`). Identical
 * events are coalesced within a 60-second window. In the foreground the service
 * worker routes to an in-app toast queue instead of the system Notification API.
 */

/** Topic taxonomy depth (domain.subdomain.action). */
export const TOPIC_MAX_DEPTH = 3;
/** Maximum distinct registered topics/patterns. */
export const MAX_SUBSCRIPTIONS = 200;
/** Maximum handler callbacks per topic/pattern. */
export const MAX_HANDLERS_PER_TOPIC = 5;
/** Coalescence window: identical events within this window are merged (ms). */
export const COALESCENCE_WINDOW_MS = 60_000;
/** Chrome desktop caps notification action buttons at 2. */
export const MAX_NOTIFICATION_ACTIONS = 2;
/** Browser push payload size limit (bytes). */
export const PUSH_PAYLOAD_LIMIT_BYTES = 4096;
/** Number of body characters folded into the coalescence key. */
export const COALESCENCE_BODY_PREFIX = 80;

/** An actionable notification button. Maps to a URL or an internal app route. */
export interface NotificationAction {
  /** Stable action id echoed back on click (e.g. "acknowledge", "view-map"). */
  action: string;
  /** Button label, e.g. "Acknowledge". */
  title: string;
  /** External URL to open on click. */
  url?: string;
  /** Internal app route to navigate to on click. */
  route?: string;
  /** Optional icon URL. */
  icon?: string;
}

/** The push payload delivered over the wire (≤ 4 KB). */
export interface PushPayload {
  /** Three-level topic, e.g. "contract.execution.reverted". */
  topic: string;
  title: string;
  body: string;
  /** Optional structured data (reserved within the 4 KB budget). */
  data?: Record<string, unknown>;
  /** Up to {@link MAX_NOTIFICATION_ACTIONS} action buttons. */
  actions?: NotificationAction[];
}

/** Handler registered against a topic/pattern in the router. */
export type PushTopicHandler = (payload: PushPayload) => void;

/** A coalesced, in-app notification rendered by the toast container. */
export interface AppNotification {
  /** Stable id (the coalescence key). */
  id: string;
  topic: string;
  title: string;
  body: string;
  data?: Record<string, unknown>;
  actions?: NotificationAction[];
  /** First time this coalescence key was seen (ms). */
  firstSeenAt: number;
  /** Most recent occurrence (ms). */
  lastSeenAt: number;
  /** Number of coalesced occurrences (≥ 1). */
  count: number;
}

/** Message the service worker posts to a foreground client. */
export interface SwPushMessage {
  type: "push-notification";
  coalescenceKey: string;
  payload: PushPayload;
}

/** Message a client posts to the SW (e.g. to acknowledge). */
export type ClientSwMessage =
  | { type: "ack"; coalescenceKey: string }
  | { type: "skip-waiting" };
