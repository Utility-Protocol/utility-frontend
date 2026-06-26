// @vitest-environment node
//
// Real ed25519 (Stellar Keypair via @noble/curves) only works in the node
// environment — under jsdom the Uint8Array realm mismatch makes Keypair.random
// throw. A tiny localStorage shim covers the persistence helpers here.

import { describe, it, expect, beforeEach } from "vitest";
import { Keypair } from "@stellar/stellar-sdk";
import {
  generateChallenge,
  handshakeMessage,
  verifyHandshake,
  signMessage,
  performHandshake,
  isSessionValid,
  saveSession,
  loadSession,
  clearSession,
  CHALLENGE_DURATION_MS,
  SESSION_STORAGE_KEY,
  LEGACY_SECRET_KEY,
  type AuthSession,
} from "@/utils/web3Auth";

const store = new Map<string, string>();
(globalThis as unknown as { localStorage: Storage }).localStorage = {
  getItem: (k: string) => store.get(k) ?? null,
  setItem: (k: string, v: string) => void store.set(k, String(v)),
  removeItem: (k: string) => void store.delete(k),
  clear: () => store.clear(),
  key: () => null,
  length: 0,
} as Storage;

beforeEach(() => store.clear());

describe("generateChallenge / handshakeMessage", () => {
  it("produces distinct random challenge and nonce", () => {
    const a = generateChallenge();
    const b = generateChallenge();
    expect(a.challenge).not.toBe(b.challenge);
    expect(a.nonce).not.toBe(b.nonce);
    expect(a.nonce).toMatch(/^[0-9a-f]{32}$/);
  });

  it("joins challenge and nonce deterministically", () => {
    expect(handshakeMessage("c", "n")).toBe("c.n");
  });
});

describe("verifyHandshake / signMessage", () => {
  it("verifies a signature produced by the matching keypair", () => {
    const kp = Keypair.random();
    const msg = handshakeMessage("challenge", "nonce");
    expect(verifyHandshake(kp.publicKey(), msg, signMessage(kp, msg))).toBe(true);
  });

  it("rejects a tampered message", () => {
    const kp = Keypair.random();
    const sig = signMessage(kp, "original");
    expect(verifyHandshake(kp.publicKey(), "tampered", sig)).toBe(false);
  });

  it("rejects a signature from a different keypair", () => {
    const kp = Keypair.random();
    const other = Keypair.random();
    expect(verifyHandshake(other.publicKey(), "m", signMessage(kp, "m"))).toBe(false);
  });

  it("rejects malformed inputs without throwing", () => {
    expect(verifyHandshake("not-a-key", "m", "00")).toBe(false);
  });
});

describe("performHandshake", () => {
  it("returns a verified session bound to the public key", () => {
    const kp = Keypair.random();
    const { session, challenge } = performHandshake(kp, "testnet", 1000);
    expect(session.address).toBe(kp.publicKey());
    expect(session.network).toBe("testnet");
    expect(session.expiresAt).toBe(1000 + CHALLENGE_DURATION_MS);
    const msg = handshakeMessage(challenge.challenge, challenge.nonce);
    expect(verifyHandshake(session.address, msg, session.signature)).toBe(true);
  });

  it("never includes the secret in the session token", () => {
    const { session } = performHandshake(Keypair.random(), "testnet");
    expect(Object.keys(session)).toEqual([
      "address",
      "network",
      "signature",
      "expiresAt",
    ]);
  });
});

describe("isSessionValid", () => {
  const base: AuthSession = {
    address: "G".repeat(56),
    network: "testnet",
    signature: "00",
    expiresAt: 0,
  };

  it("is true only before expiry", () => {
    expect(isSessionValid({ ...base, expiresAt: 2000 }, 1000)).toBe(true);
    expect(isSessionValid({ ...base, expiresAt: 1000 }, 1000)).toBe(false);
    expect(isSessionValid(null)).toBe(false);
  });
});

describe("session persistence", () => {
  const session: AuthSession = {
    address: "G".repeat(56),
    network: "testnet",
    signature: "abcd",
    expiresAt: Date.now() + CHALLENGE_DURATION_MS,
  };

  it("round-trips a valid token", () => {
    saveSession(session);
    expect(loadSession()).toEqual(session);
  });

  it("never persists a secret, even if one is passed in", () => {
    const withSecret = { ...session, secret: "S-SECRET" } as unknown as AuthSession;
    saveSession(withSecret);
    const raw = store.get(SESSION_STORAGE_KEY)!;
    expect(raw).not.toContain("secret");
    expect(raw).not.toContain("S-SECRET");
  });

  it("purges an expired token on load", () => {
    saveSession({ ...session, expiresAt: Date.now() - 1 });
    expect(loadSession()).toBeNull();
    expect(store.get(SESSION_STORAGE_KEY)).toBeUndefined();
  });

  it("purges corrupt JSON on load", () => {
    store.set(SESSION_STORAGE_KEY, "not-json{");
    expect(loadSession()).toBeNull();
  });

  it("clearSession removes the token and the legacy secret key", () => {
    saveSession(session);
    store.set(LEGACY_SECRET_KEY, "S-LEGACY");
    clearSession();
    expect(store.get(SESSION_STORAGE_KEY)).toBeUndefined();
    expect(store.get(LEGACY_SECRET_KEY)).toBeUndefined();
  });
});
