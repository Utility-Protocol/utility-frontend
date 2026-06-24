import type { AccountNonceState } from "@/types/soroban";

// ---------------------------------------------------------------------------
// Actions & State
// ---------------------------------------------------------------------------

export type NonceState = Record<string, AccountNonceState>;

export type NonceAction =
  | { type: "NONCE_POOL_UPDATED"; payload: { accountId: string; baseSequence: string; poolSize: number } }
  | { type: "NONCE_LEASE_ACQUIRED"; payload: { accountId: string } }
  | { type: "NONCE_LEASE_RELEASED"; payload: { accountId: string } }
  | { type: "NONCE_POOL_EXHAUSTED"; payload: { accountId: string; error: string } }
  | { type: "NONCE_FLUSHED"; payload: { accountId: string } };

type Listener = (state: NonceState) => void;

// ---------------------------------------------------------------------------
// Store
// ---------------------------------------------------------------------------

const initialState: AccountNonceState = {
  baseSequence: "0",
  poolSize: 0,
  pendingCount: 0,
  lastError: null,
};

class NonceStore {
  private state: NonceState = {};
  private listeners = new Set<Listener>();

  getState(): Readonly<NonceState> {
    return this.state;
  }

  getAccountState(accountId: string): Readonly<AccountNonceState> {
    return this.state[accountId] || { ...initialState };
  }

  subscribe(listener: Listener): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  dispatch(action: NonceAction): void {
    this.state = this.reducer(this.state, action);
    this.notify();
  }

  private reducer(state: NonceState, action: NonceAction): NonceState {
    const accountId = "accountId" in action.payload ? action.payload.accountId : undefined;
    if (!accountId) return state;

    const currentAccountState = state[accountId] || { ...initialState };

    switch (action.type) {
      case "NONCE_POOL_UPDATED":
        return {
          ...state,
          [accountId]: {
            ...currentAccountState,
            baseSequence: action.payload.baseSequence,
            poolSize: action.payload.poolSize,
            lastError: null,
          },
        };
      case "NONCE_LEASE_ACQUIRED":
        return {
          ...state,
          [accountId]: {
            ...currentAccountState,
            poolSize: Math.max(0, currentAccountState.poolSize - 1),
            pendingCount: currentAccountState.pendingCount + 1,
          },
        };
      case "NONCE_LEASE_RELEASED":
        return {
          ...state,
          [accountId]: {
            ...currentAccountState,
            poolSize: currentAccountState.poolSize + 1,
            pendingCount: Math.max(0, currentAccountState.pendingCount - 1),
          },
        };
      case "NONCE_POOL_EXHAUSTED":
        return {
          ...state,
          [accountId]: {
            ...currentAccountState,
            lastError: action.payload.error,
          },
        };
      case "NONCE_FLUSHED":
        const newState = { ...state };
        delete newState[accountId];
        return newState;
      default:
        return state;
    }
  }

  private notify(): void {
    for (const listener of this.listeners) {
      listener(this.state);
    }
  }
}

/** Singleton nonce store instance. */
export const nonceStore = new NonceStore();
