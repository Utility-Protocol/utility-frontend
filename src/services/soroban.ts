import { rpc, TransactionBuilder } from "@stellar/stellar-sdk";
import type { NonceLease } from "@/types/soroban";

export const getRpcUrl = (network: string) => {
  switch (network) {
    case "mainnet":
      return "https://mainnet.sorobanrpc.com";
    case "futurenet":
      return "https://rpc-futurenet.stellar.org";
    default:
      return "https://soroban-testnet.stellar.org";
  }
};

const getNetworkPassphrase = (network: string) => {
  switch (network) {
    case "mainnet":
      return "Public Global Stellar Network ; September 2015";
    case "futurenet":
      return "Test SDF Future Network ; October 2022";
    default:
      return "Test SDF Network ; September 2015";
  }
};

export const submitTransaction = async (
  xdr: string,
  network: string = "testnet"
) => {
  const server = new rpc.Server(getRpcUrl(network));
  const tx = TransactionBuilder.fromXDR(xdr, getNetworkPassphrase(network));

  try {
    const response = await server.sendTransaction(tx as unknown as import("@stellar/stellar-sdk").Transaction);
    
    if (response.status === "ERROR") {
      const errorStr = JSON.stringify(response);
      if (
        errorStr.includes("tx_bad_seq") ||
        errorStr.includes("txBadSeq") ||
        errorStr.includes("bad_seq")
      ) {
        const err = new Error("tx_bad_seq") as Error & { code?: string };
        err.code = "tx_bad_seq";
        throw err;
      }
      throw new Error(`Transaction failed: ${errorStr}`);
    }
    
    return response;
  } catch (err: unknown) {
    const errorObj = err as { message?: string };
    const msg = errorObj?.message || "";
    if (msg.includes("tx_bad_seq") || msg.includes("bad_seq")) {
      const formattedErr = new Error("tx_bad_seq") as Error & { code?: string };
      formattedErr.code = "tx_bad_seq";
      throw formattedErr;
    }
    throw err;
  }
};

export const submitWithNonce = async (
  xdr: string,
  lease: NonceLease,
  network: string = "testnet"
) => {
  // In a full implementation, if the transaction succeeds, the lease is consumed.
  // It relies on the manager popping it out. If an exception is thrown, the manager handles retries.
  const response = await submitTransaction(xdr, network);
  // Successfully consumed. We return the response.
  return response;
};
