/**
 * Custom finite state machine governing the WebSocket reconnection lifecycle.
 *
 * States: idle → connecting → connected, with reconnecting / recovering /
 * failed branches. The machine is pure: it computes the next backoff delay and
 * exposes it via context, but it schedules nothing itself — the owning hook
 * reads {@link ReconnectContext.nextDelayMs}, arms a timer, and feeds a `RETRY`
 * event back in. This keeps the transition logic deterministic and testable.
 */

import {
  MAX_RECONNECT_ATTEMPTS,
  type ConnectionStatus,
  type ReconnectContext,
  type ReconnectEvent,
} from "@/types/connection";
import { fullJitterBackoff } from "@/utils/backoff";

export interface ReconnectMachineOptions {
  /** Injectable RNG for jitter (defaults to Math.random) — used in tests. */
  rng?: () => number;
  /** Override the terminal-failure attempt threshold. */
  maxAttempts?: number;
}

type Listener = (context: ReconnectContext) => void;

const INITIAL_CONTEXT: ReconnectContext = {
  status: "idle",
  attempt: 0,
  missedHeartbeats: 0,
  nextDelayMs: null,
  lastError: null,
};

export class ReconnectMachine {
  private context: ReconnectContext = { ...INITIAL_CONTEXT };
  private readonly listeners = new Set<Listener>();
  private readonly rng: () => number;
  private readonly maxAttempts: number;

  constructor(options: ReconnectMachineOptions = {}) {
    this.rng = options.rng ?? Math.random;
    this.maxAttempts = options.maxAttempts ?? MAX_RECONNECT_ATTEMPTS;
  }

  getContext(): Readonly<ReconnectContext> {
    return this.context;
  }

  get status(): ConnectionStatus {
    return this.context.status;
  }

  get isTerminal(): boolean {
    return this.context.status === "failed";
  }

  subscribe(listener: Listener): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  /** Feed an event into the machine, applying the transition and notifying. */
  send(event: ReconnectEvent): ReconnectContext {
    const next = this.transition(this.context, event);
    if (next !== this.context) {
      this.context = next;
      this.notify();
    }
    return this.context;
  }

  /**
   * Record a missed heartbeat. Returns the running count so the caller can
   * decide whether to escalate to a `HEARTBEAT_TIMEOUT` event.
   */
  recordMissedHeartbeat(): number {
    this.context = {
      ...this.context,
      missedHeartbeats: this.context.missedHeartbeats + 1,
    };
    this.notify();
    return this.context.missedHeartbeats;
  }

  private transition(
    ctx: ReconnectContext,
    event: ReconnectEvent
  ): ReconnectContext {
    // RESET is accepted from any state.
    if (event.type === "RESET") {
      return { ...INITIAL_CONTEXT };
    }

    switch (ctx.status) {
      case "idle":
        if (event.type === "CONNECT") {
          return { ...INITIAL_CONTEXT, status: "connecting" };
        }
        return ctx;

      case "connecting":
        switch (event.type) {
          case "CONNECTED":
            // A successful open after an outage enters recovery; the very first
            // connection has nothing to recover and goes straight to connected.
            return ctx.attempt > 0
              ? { ...ctx, status: "recovering", nextDelayMs: null }
              : {
                  ...ctx,
                  status: "connected",
                  missedHeartbeats: 0,
                  nextDelayMs: null,
                  lastError: null,
                };
          case "DISCONNECTED":
          case "HEARTBEAT_TIMEOUT":
            return this.enterReconnecting(ctx, event);
          default:
            return ctx;
        }

      case "connected":
        if (event.type === "DISCONNECTED" || event.type === "HEARTBEAT_TIMEOUT") {
          return this.enterReconnecting(ctx, event);
        }
        return ctx;

      case "reconnecting":
        if (event.type === "RETRY") {
          return { ...ctx, status: "connecting", nextDelayMs: null };
        }
        // Already reconnecting; ignore duplicate disconnect signals.
        return ctx;

      case "recovering":
        switch (event.type) {
          case "RECOVERY_SUCCESS":
            return {
              ...ctx,
              status: "connected",
              attempt: 0,
              missedHeartbeats: 0,
              nextDelayMs: null,
              lastError: null,
            };
          case "DISCONNECTED":
          case "HEARTBEAT_TIMEOUT":
            return this.enterReconnecting(ctx, event);
          default:
            return ctx;
        }

      case "failed":
        // Manual retry restarts the lifecycle from scratch.
        if (event.type === "CONNECT") {
          return { ...INITIAL_CONTEXT, status: "connecting" };
        }
        return ctx;

      default:
        return ctx;
    }
  }

  /** Increment the attempt counter and either schedule a retry or give up. */
  private enterReconnecting(
    ctx: ReconnectContext,
    event: ReconnectEvent
  ): ReconnectContext {
    const attempt = ctx.attempt + 1;
    const reason =
      event.type === "HEARTBEAT_TIMEOUT"
        ? "Heartbeat timed out"
        : "Connection lost";

    if (attempt > this.maxAttempts) {
      return {
        ...ctx,
        status: "failed",
        nextDelayMs: null,
        lastError: `Reconnection failed after ${this.maxAttempts} attempts`,
      };
    }

    // Zero-based attempt index for the backoff curve (first retry → 2^0).
    const nextDelayMs = fullJitterBackoff(attempt - 1, undefined, undefined, this.rng);
    return {
      ...ctx,
      status: "reconnecting",
      attempt,
      nextDelayMs,
      lastError: reason,
    };
  }

  private notify(): void {
    for (const listener of this.listeners) listener(this.context);
  }
}
