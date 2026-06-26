/**
 * Challenge-response handshake primitives for Web3 wallet auth.
 *
 * Security model: the keypair's secret never leaves memory and is never
 * serialized. A session is established by signing a random `challenge + nonce`
 * and verifying the signature against the (non-expiring) public key. Only the
 * resulting session token — `{ address, network, signature, expiresAt }` — is
 * persisted, and it expires after {@link CHALLENGE_DURATION_MS}.
 */

import { Keypair } from "@stellar/stellar-sdk";

/** A signed challenge token is valid for 30 minutes. */
export const CHALLENGE_DURATION_MS = 30 * 60 * 1000;

/** localStorage key for the session token (never the secret). */
export const SESSION_STORAGE_KEY = "utility-auth-session";
/** Legacy key that previous versions used to (wrongly) store the secret. */
export const LEGACY_SECRET_KEY = "utility-auth-secret";

export interface AuthSession {
  address: string;
  network: string;
  /** Hex signature over the handshake message. */
  signature: string;
  /** Unix ms after which the session is no longer authenticated. */
  expiresAt: number;
}

export interface Challenge {
  challenge: string;
  nonce: string;
}

function randomHex(bytes: number): string {
  const arr = new Uint8Array(bytes);
  crypto.getRandomValues(arr);
  let out = "";
  for (const b of arr) out += b.toString(16).padStart(2, "0");
  return out;
}

/** Generate a fresh random challenge string and nonce. */
export function generateChallenge(): Challenge {
  return {
    challenge: `Utility-Protocol Authentication Challenge: ${randomHex(16)}`,
    nonce: randomHex(16),
  };
}

/** The exact bytes the wallet signs: `challenge` joined with `nonce`. */
export function handshakeMessage(challenge: string, nonce: string): string {
  return `${challenge}.${nonce}`;
}

/** Verify a hex signature over `message` against a Stellar public key. */
export function verifyHandshake(
  publicKey: string,
  message: string,
  signatureHex: string
): boolean {
  try {
    const kp = Keypair.fromPublicKey(publicKey);
    return kp.verify(Buffer.from(message, "utf-8"), Buffer.from(signatureHex, "hex"));
  } catch {
    return false;
  }
}

/** Sign an arbitrary challenge string, returning a hex signature. */
export function signMessage(keypair: Keypair, message: string): string {
  return keypair.sign(Buffer.from(message, "utf-8")).toString("hex");
}

export interface HandshakeResult {
  session: AuthSession;
  challenge: Challenge;
}

/**
 * Run the full handshake for a keypair: generate a challenge, sign it, verify
 * the signature against the public key, and return the resulting session token.
 * Throws if verification fails. The secret is never read out of the keypair.
 */
export function performHandshake(
  keypair: Keypair,
  network: string,
  now: number = Date.now()
): HandshakeResult {
  const challenge = generateChallenge();
  const message = handshakeMessage(challenge.challenge, challenge.nonce);
  const signature = signMessage(keypair, message);

  if (!verifyHandshake(keypair.publicKey(), message, signature)) {
    throw new Error("Handshake signature verification failed");
  }

  return {
    session: {
      address: keypair.publicKey(),
      network,
      signature,
      expiresAt: now + CHALLENGE_DURATION_MS,
    },
    challenge,
  };
}

/** A session is valid only while it has not expired. */
export function isSessionValid(
  session: AuthSession | null,
  now: number = Date.now()
): session is AuthSession {
  return session !== null && session.expiresAt > now;
}

// --- Persistence (token only; never the secret) ----------------------------

function getStorage(): Pick<Storage, "getItem" | "setItem" | "removeItem"> | null {
  try {
    return typeof localStorage !== "undefined" ? localStorage : null;
  } catch {
    return null;
  }
}

/** Load and validate a stored session; expired/corrupt tokens are purged. */
export function loadSession(now: number = Date.now()): AuthSession | null {
  const storage = getStorage();
  if (!storage) return null;
  const raw = storage.getItem(SESSION_STORAGE_KEY);
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as AuthSession;
    if (!isSessionValid(parsed, now)) {
      clearSession();
      return null;
    }
    return parsed;
  } catch {
    clearSession();
    return null;
  }
}

/** Persist the session token. Strips any field that isn't part of the token. */
export function saveSession(session: AuthSession): void {
  const storage = getStorage();
  if (!storage) return;
  const token: AuthSession = {
    address: session.address,
    network: session.network,
    signature: session.signature,
    expiresAt: session.expiresAt,
  };
  storage.setItem(SESSION_STORAGE_KEY, JSON.stringify(token));
}

/** Remove every session artifact, including the legacy plaintext secret. */
export function clearSession(): void {
  const storage = getStorage();
  if (!storage) return;
  storage.removeItem(SESSION_STORAGE_KEY);
  storage.removeItem(LEGACY_SECRET_KEY);
}
