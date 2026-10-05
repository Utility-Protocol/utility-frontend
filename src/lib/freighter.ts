/**
 * Normalised wrapper around `@stellar/freighter-api` v6.
 *
 * v6 changed every relevant return shape:
 *   - `isConnected()`     -> `{ isConnected: boolean }`, not a bare boolean.
 *                            Using it directly is always truthy, which would
 *                            report a wallet as connected even when absent.
 *   - `getPublicKey()`    -> removed; replaced by `getAddress()`.
 *   - `signTransaction()` -> `{ signedTxXdr, signerAddress }`, not a string.
 *
 * The wrapper restores the simple surface the components expect and throws a
 * real Error instead of silently returning an object.
 */
import {
  isConnected as rawIsConnected,
  getAddress,
  requestAccess as rawRequestAccess,
  signTransaction as rawSignTransaction,
} from '@stellar/freighter-api';

function raise(message: string): never {
  throw new Error(message);
}

/** True only when Freighter reports an active connection. */
export async function isConnected(): Promise<boolean> {
  try {
    const res = await rawIsConnected();
    if (res?.error) return false;
    return Boolean(res?.isConnected);
  } catch {
    return false;
  }
}

/** Public key for the connected account, or null when unavailable. */
export async function getPublicKey(): Promise<string | null> {
  try {
    const res = await getAddress();
    if (res?.error) return null;
    return res?.address ?? null;
  } catch {
    return null;
  }
}

/** Prompts for wallet access. Returns the address, or null if refused. */
export async function requestAccess(): Promise<string | null> {
  const res = await rawRequestAccess();
  if (res?.error) raise(String(res.error));
  return res?.address ?? null;
}

/** Signs an XDR transaction and returns the signed XDR string. */
export async function signTransaction(
  transactionXdr: string,
  opts?: { networkPassphrase?: string; address?: string }
): Promise<string> {
  const res = await rawSignTransaction(transactionXdr, opts);
  if (res?.error) raise(String(res.error));
  if (!res?.signedTxXdr) raise('Freighter returned no signed transaction.');
  return res.signedTxXdr;
}