export const SOROBAN_ERROR_CODES: Record<string, string> = {
  tx_not_found: "Transaction was not found. Please wait a moment and try again.",
  tx_failed: "The transaction could not be processed. Check your balance and try again.",
  tx_too_late: "The transaction submission window has expired. Please resubmit.",
  tx_bad_seq: "The account sequence number is out of sync. Try reconnecting your wallet.",
  insufficient_balance: "Your account does not have enough funds for this operation.",
  insufficient_fee: "The resource fee provided is too low. Increase the fee and try again.",
  contract_not_found: "The smart contract could not be found on the network.",
  contract_error: "The smart contract returned an error. Contact the development team.",
  contract_not_activated: "This contract has not been activated yet.",
  auth_required: "Wallet authorization is required to perform this action.",
  auth_revoked: "Your session authorization has been revoked. Please re-authenticate.",
  bad_nonce: "The provided nonce is invalid. Try again with a fresh one.",
  network_mismatch: "Your wallet is connected to a different network. Switch to the correct network.",
  timeout: "The request timed out. Check your network connection and try again.",
  rate_limited: "Too many requests. Please wait a moment before trying again.",
  internal_error: "An internal system error occurred. Please try again later.",
  unknown_error: "An unexpected error occurred. Please try again or contact support.",
};

export const NETWORK_ERROR_KEYWORDS: Record<string, string> = {
  timeout: "The request took too long. Check your internet connection.",
  network: "A network error occurred. Verify you are connected to the internet.",
  websocket: "The realtime connection dropped. Please refresh and try again.",
  socket: "The connection was interrupted. Please check your network and try again.",
  abort: "The request was cancelled. Please try again.",
  fetch: "Could not reach the server. The API may be down.",
  dns: "Could not resolve the server address. Check your DNS settings.",
  cors: "Cross-origin request blocked. Contact the server administrator.",
  econnrefused: "The server refused the connection. Please try again shortly.",
  econnreset: "The connection was reset. Please check your network and try again.",
};

export function resolveSorobanError(rawError: string): string {
  const normalized = rawError.toLowerCase().trim();

  if (!normalized) {
    return "An unexpected error occurred. Please try again or contact support.";
  }

  if (normalized.includes("timeout")) {
    return NETWORK_ERROR_KEYWORDS.timeout;
  }

  const networkPriority = [
    "websocket",
    "socket",
    "fetch",
    "network",
    "dns",
    "cors",
    "abort",
    "econnrefused",
    "econnreset",
  ];

  for (const keyword of networkPriority) {
    if (normalized.includes(keyword)) {
      return NETWORK_ERROR_KEYWORDS[keyword] ?? "A network error occurred. Please try again.";
    }
  }

  for (const [keyword, message] of Object.entries(SOROBAN_ERROR_CODES)) {
    if (normalized.includes(keyword)) {
      return message;
    }
  }

  const summary = normalized.replace(/\s+/g, " ").slice(0, 40);
  return `An unexpected error occurred. Please try again or contact support. (${summary})`;
}

export function classifyError(
  error: unknown,
): { message: string; severity: "low" | "medium" | "high"; actionable: boolean } {
  if (error === undefined || error === null || error === "") {
    return { message: "An unknown error occurred.", severity: "low", actionable: false };
  }

  const msg = error instanceof Error ? error.message : String(error);
  const normalized = msg.toLowerCase();
  const resolved = resolveSorobanError(msg);

  if (/auth|unauthorized|revoked|forbidden/.test(normalized)) {
    return { message: resolved, severity: "high", actionable: true };
  }

  if (/balance|fee|insufficient|funds|gas/.test(normalized)) {
    return { message: resolved, severity: "medium", actionable: true };
  }

  if (/timeout|network|fetch|socket|websocket|dns|cors|abort|econn/.test(normalized)) {
    return { message: resolved, severity: "medium", actionable: true };
  }

  return { message: resolved, severity: "low", actionable: false };
}

export function formatErrorForDisplay(error: unknown): string {
  const { message, severity } = classifyError(error);
  return `[${severity.toUpperCase()}] ${message}`;
}
