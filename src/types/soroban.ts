export type SequenceNumber = string;

export interface NonceLease {
  id: string;
  nonce: SequenceNumber;
  acquiredAt: number;
  expiresAt: number;
}

export interface NoncePool {
  nonces: SequenceNumber[];
}

export interface AccountNonceState {
  baseSequence: SequenceNumber;
  poolSize: number;
  pendingCount: number;
  lastError: string | null;
}
