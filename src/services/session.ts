"use client";

import { setSessionToken } from "./api";

interface SessionPayload {
  address: string;
  network: string;
  token: string;
  issuedAt: number;
  expiresAt: number;
}

const SESSION_KEY = "utility-session";
const REFRESH_INTERVAL = 60_000;

let refreshTimer: ReturnType<typeof setInterval> | null = null;
let sessionListeners: Array<(session: SessionPayload | null) => void> = [];

function notify(session: SessionPayload | null) {
  sessionListeners.forEach((fn) => fn(session));
}

export function onSessionChange(fn: (session: SessionPayload | null) => void) {
  sessionListeners.push(fn);
  return () => {
    sessionListeners = sessionListeners.filter((l) => l !== fn);
  };
}

function generateToken(address: string): string {
  return `st-${address.slice(0, 8)}-${Date.now().toString(36)}`;
}

export function createSession(
  address: string,
  network: string,
  ttlMs = 30 * 60 * 1000
): SessionPayload {
  const payload: SessionPayload = {
    address,
    network,
    token: generateToken(address),
    issuedAt: Date.now(),
    expiresAt: Date.now() + ttlMs,
  };
  localStorage.setItem(SESSION_KEY, JSON.stringify(payload));
  setSessionToken(payload.token);
  notify(payload);
  startRefreshTimer();
  return payload;
}

export function getSession(): SessionPayload | null {
  try {
    const raw = localStorage.getItem(SESSION_KEY);
    if (!raw) return null;
    const payload: SessionPayload = JSON.parse(raw);
    if (payload.expiresAt < Date.now()) {
      destroySession();
      return null;
    }
    return payload;
  } catch {
    destroySession();
    return null;
  }
}

export function validateSession(address: string): boolean {
  const session = getSession();
  if (!session) return false;
  return session.address === address;
}

export function destroySession(): void {
  localStorage.removeItem(SESSION_KEY);
  setSessionToken(null);
  notify(null);
  stopRefreshTimer();
}

export function refreshSession(): SessionPayload | null {
  const session = getSession();
  if (!session) return null;
  const refreshed: SessionPayload = {
    ...session,
    token: generateToken(session.address),
    issuedAt: Date.now(),
    expiresAt: Date.now() + 30 * 60 * 1000,
  };
  localStorage.setItem(SESSION_KEY, JSON.stringify(refreshed));
  setSessionToken(refreshed.token);
  notify(refreshed);
  return refreshed;
}

function startRefreshTimer() {
  if (refreshTimer) return;
  refreshTimer = setInterval(() => {
    const session = getSession();
    if (session && session.expiresAt - Date.now() < 5 * 60 * 1000) {
      refreshSession();
    } else if (!session) {
      stopRefreshTimer();
    }
  }, REFRESH_INTERVAL);
}

function stopRefreshTimer() {
  if (refreshTimer) {
    clearInterval(refreshTimer);
    refreshTimer = null;
  }
}

export function monitorWalletLock(
  address: string,
  onLocked: () => void
): () => void {
  const interval = setInterval(() => {
    const session = getSession();
    if (!session || session.address !== address) {
      onLocked();
      clearInterval(interval);
    }
  }, 2000);
  return () => clearInterval(interval);
}
