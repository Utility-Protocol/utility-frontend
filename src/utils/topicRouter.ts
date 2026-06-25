/**
 * Topic trie for routing push events to registered handlers.
 *
 * Subscriptions are keyed by a topic pattern: an exact topic
 * (`meter.water.breach`) or a trailing-wildcard ancestor (`meter.water.*`,
 * `meter.*`, `*`). A trailing `*` matches one or more remaining segments, so
 * `meter.*` matches `meter.water.breach`. Matching collects handlers from the
 * exact path and every wildcard ancestor.
 */

import {
  COALESCENCE_BODY_PREFIX,
  MAX_HANDLERS_PER_TOPIC,
  MAX_SUBSCRIPTIONS,
  TOPIC_MAX_DEPTH,
  type PushPayload,
  type PushTopicHandler,
} from "@/types/notification";

const SEGMENT_RE = /^[a-z0-9_-]+$/;

/** Validate a subscription pattern (segments + optional trailing wildcard). */
export function isValidPattern(pattern: string): boolean {
  if (!pattern) return false;
  const segments = pattern.split(".");
  if (segments.length < 1 || segments.length > TOPIC_MAX_DEPTH) return false;
  for (let i = 0; i < segments.length; i++) {
    const seg = segments[i];
    if (seg === "*") {
      // A wildcard is only valid as the final segment.
      if (i !== segments.length - 1) return false;
      continue;
    }
    if (!SEGMENT_RE.test(seg)) return false;
  }
  return true;
}

/** Validate a concrete (non-wildcard) topic. */
export function isValidTopic(topic: string): boolean {
  if (!topic) return false;
  const segments = topic.split(".");
  if (segments.length < 1 || segments.length > TOPIC_MAX_DEPTH) return false;
  return segments.every((s) => SEGMENT_RE.test(s));
}

/**
 * Coalescence key: identical events within the window share `topic` plus the
 * first {@link COALESCENCE_BODY_PREFIX} chars of the body. Mirrored inline in
 * `public/sw.js` (the SW cannot import this module).
 */
export function coalescenceKey(topic: string, body: string): string {
  return `${topic} ${(body ?? "").slice(0, COALESCENCE_BODY_PREFIX)}`;
}

interface TrieNode {
  children: Map<string, TrieNode>;
  handlers: Set<PushTopicHandler>;
}

function createNode(): TrieNode {
  return { children: new Map(), handlers: new Set() };
}

export class TopicRouter {
  private readonly root = createNode();
  /** Number of distinct patterns currently holding at least one handler. */
  private patternCount = 0;

  /** Distinct subscribed patterns. */
  get size(): number {
    return this.patternCount;
  }

  /**
   * Register `handler` for `pattern`. Returns an unsubscribe function. Throws if
   * the subscription or per-topic handler limits would be exceeded.
   */
  insert(pattern: string, handler: PushTopicHandler): () => void {
    if (!isValidPattern(pattern)) {
      throw new Error(`Invalid topic pattern: "${pattern}"`);
    }

    const segments = pattern.split(".");
    let node = this.root;
    for (const seg of segments) {
      let child = node.children.get(seg);
      if (!child) {
        child = createNode();
        node.children.set(seg, child);
      }
      node = child;
    }

    const isNewPattern = node.handlers.size === 0;
    if (isNewPattern && this.patternCount >= MAX_SUBSCRIPTIONS) {
      throw new Error(
        `Subscription limit reached (${MAX_SUBSCRIPTIONS} topics)`
      );
    }
    if (node.handlers.size >= MAX_HANDLERS_PER_TOPIC) {
      throw new Error(
        `Handler limit reached for "${pattern}" (${MAX_HANDLERS_PER_TOPIC})`
      );
    }

    node.handlers.add(handler);
    if (isNewPattern) this.patternCount += 1;

    let active = true;
    return () => {
      if (!active) return;
      active = false;
      if (node.handlers.delete(handler) && node.handlers.size === 0) {
        this.patternCount -= 1;
      }
    };
  }

  /** All handlers matching `topic` (exact path + wildcard ancestors). */
  match(topic: string): PushTopicHandler[] {
    if (!isValidTopic(topic)) return [];
    const segments = topic.split(".");
    const out: PushTopicHandler[] = [];
    this.collect(this.root, segments, 0, out);
    return out;
  }

  private collect(
    node: TrieNode,
    segments: string[],
    index: number,
    out: PushTopicHandler[]
  ): void {
    if (index === segments.length) {
      // Exact match terminates here.
      for (const h of node.handlers) out.push(h);
      return;
    }

    // A trailing wildcard child matches the remaining (≥1) segments.
    const star = node.children.get("*");
    if (star) {
      for (const h of star.handlers) out.push(h);
    }

    // Descend the exact segment path.
    const exact = node.children.get(segments[index]);
    if (exact) {
      this.collect(exact, segments, index + 1, out);
    }
  }

  /**
   * Dispatch `payload` to every matching handler. Handler exceptions are
   * isolated so one bad subscriber cannot break delivery to the others.
   * Returns the number of handlers invoked.
   */
  emit(payload: PushPayload): number {
    const handlers = this.match(payload.topic);
    for (const handler of handlers) {
      try {
        handler(payload);
      } catch {
        // isolate handler failures
      }
    }
    return handlers.length;
  }

  /** Remove all subscriptions. */
  clear(): void {
    this.root.children.clear();
    this.root.handlers.clear();
    this.patternCount = 0;
  }
}

/** Shared singleton router for the app. */
export const topicRouter = new TopicRouter();
