'use client';

import React, { useState, useEffect } from 'react';
import { X, Wallet, Zap, ArrowUpRight, Loader2, CheckCircle2, AlertCircle, ShieldCheck } from 'lucide-react';
import { isConnected, requestAccess, signTransaction } from '@/lib/freighter';
import * as StellarSdk from '@stellar/stellar-sdk';

interface DepositEscrowModalProps {
  isOpen: boolean;
  onClose: () => void;
  consumerAddress?: string;
  onSuccess?: (txHash: string, amount: string) => void;
}

type SubmissionState =
  | 'idle'
  | 'connecting'
  | 'building'
  | 'signing'
  | 'submitting'
  | 'success'
  | 'error';

const PRESET_AMOUNTS = ['10', '25', '50', '100'];
const STROOPS_PER_UNIT = 10_000_000;

export function DepositEscrowModal({
  isOpen,
  onClose,
  consumerAddress,
  onSuccess,
}: DepositEscrowModalProps) {
  const [amount, setAmount] = useState<string>('25');
  const [status, setStatus] = useState<SubmissionState>('idle');
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [txHash, setTxHash] = useState<string | null>(null);
  const [connectedAddress, setConnectedAddress] = useState<string | null>(null);

  const contractId = process.env.NEXT_PUBLIC_CONTRACT_ID || 'CAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAD2KM';
  const rpcUrl = process.env.NEXT_PUBLIC_SOROBAN_RPC_URL || 'https://soroban-testnet.stellar.org:443';
  const networkPassphrase =
    process.env.NEXT_PUBLIC_NETWORK_PASSPHRASE || StellarSdk.Networks.TESTNET;

  useEffect(() => {
    if (isOpen) {
      void checkInitialWallet();
      setStatus('idle');
      setErrorMessage(null);
      setTxHash(null);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen]);

  async function checkInitialWallet() {
    try {
      if (await isConnected()) {
        const accessObj = await requestAccess().catch(() => null);
        if (accessObj) setConnectedAddress(accessObj);
      }
    } catch {
      // Wallet not ready or not installed.
    }
  }

  async function handleConnectWallet() {
    setStatus('connecting');
    setErrorMessage(null);
    try {
      const address = await requestAccess();
      if (!address) throw new Error('Freighter access was declined.');
      setConnectedAddress(address);
      setStatus('idle');
    } catch (err) {
      setStatus('error');
      setErrorMessage(err instanceof Error ? err.message : 'Failed to connect Freighter wallet.');
    }
  }

  async function handleSubmitDeposit(e: React.FormEvent) {
    e.preventDefault();
    setErrorMessage(null);

    const parsedAmount = parseFloat(amount);
    if (!Number.isFinite(parsedAmount) || parsedAmount <= 0) {
      setErrorMessage('Please enter a valid amount greater than 0.');
      return;
    }

    try {
      let activeAccount = connectedAddress;
      if (!activeAccount) {
        setStatus('connecting');
        activeAccount = await requestAccess();
        if (!activeAccount) throw new Error('Freighter wallet not connected.');
        setConnectedAddress(activeAccount);
      }

      const targetConsumer = consumerAddress || activeAccount;

      setStatus('building');
      const server = new StellarSdk.rpc.Server(rpcUrl);
      const sourceAccount = await server.getAccount(activeAccount);

      const stroopAmount = BigInt(Math.floor(parsedAmount * STROOPS_PER_UNIT));

      const contract = new StellarSdk.Contract(contractId);
      const operation = contract.call(
        'deposit_escrow',
        StellarSdk.nativeToScVal(new StellarSdk.Address(targetConsumer), { type: 'address' }),
        StellarSdk.nativeToScVal(stroopAmount, { type: 'i128' })
      );

      const tx = new StellarSdk.TransactionBuilder(sourceAccount, {
        fee: StellarSdk.BASE_FEE,
        networkPassphrase,
      })
        .addOperation(operation)
        .setTimeout(60)
        .build();

      const simResponse = await server.simulateTransaction(tx);
      if (StellarSdk.rpc.Api.isSimulationError(simResponse)) {
        throw new Error(`Simulation failed: ${simResponse.error}`);
      }

      const preparedTx = StellarSdk.rpc.assembleTransaction(tx, simResponse).build();

      setStatus('signing');
      const signedXdr = await signTransaction(preparedTx.toXDR(), { networkPassphrase });

      setStatus('submitting');
      const parsedSignedTx = StellarSdk.TransactionBuilder.fromXDR(signedXdr, networkPassphrase);

      const sendResponse = await server.sendTransaction(parsedSignedTx);
      if (sendResponse.status === 'ERROR') {
        throw new Error('Transaction broadcast rejected by RPC node.');
      }

      let pollRetries = 15;
      let confirmed = false;
      while (pollRetries > 0) {
        await new Promise((resolve) => setTimeout(resolve, 1500));
        const statusResponse = await server.getTransaction(sendResponse.hash);
        if (statusResponse.status === 'SUCCESS') {
          confirmed = true;
          break;
        }
        if (statusResponse.status === 'FAILED') {
          throw new Error('On-chain execution failed.');
        }
        pollRetries--;
      }

      if (!confirmed) {
        throw new Error('Transaction polling timed out. Please check the block explorer.');
      }

      setTxHash(sendResponse.hash);
      setStatus('success');
      onSuccess?.(sendResponse.hash, amount);
    } catch (err) {
      console.error('[DepositEscrowModal] Deposit error:', err);
      setStatus('error');
      setErrorMessage(
        err instanceof Error ? err.message : 'An unexpected transaction error occurred.'
      );
    }
  }

  if (!isOpen) return null;

  const busy = status === 'signing' || status === 'submitting' || status === 'building';

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-4 backdrop-blur-sm">
      <div className="relative w-full max-w-md rounded-2xl border border-zinc-800 bg-zinc-950 p-6 text-zinc-100 shadow-2xl">
        <button
          onClick={onClose}
          disabled={busy}
          aria-label="Close"
          className="absolute right-4 top-4 rounded-lg p-1 text-zinc-400 hover:bg-zinc-900 hover:text-zinc-100 disabled:opacity-50"
        >
          <X className="h-5 w-5" />
        </button>

        <div className="flex items-center gap-2.5 border-b border-zinc-800 pb-4">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl border border-emerald-500/20 bg-emerald-500/10 text-emerald-400">
            <Zap className="h-5 w-5" />
          </div>
          <div>
            <h3 className="text-lg font-semibold text-zinc-100">Top Up Escrow Balance</h3>
            <p className="text-xs text-zinc-400">Pre-fund automated micro-utility draw</p>
          </div>
        </div>

        {status === 'success' ? (
          <div className="space-y-4 py-6 text-center">
            <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-full border border-emerald-500/20 bg-emerald-500/10 text-emerald-400">
              <CheckCircle2 className="h-8 w-8" />
            </div>
            <div>
              <h4 className="text-base font-semibold text-zinc-100">Deposit Confirmed</h4>
              <p className="mt-1 text-xs text-zinc-400">
                Credited{' '}
                <span className="font-mono font-semibold text-emerald-400">{amount} Units</span> to
                consumer escrow.
              </p>
            </div>

            {txHash && (
              <a
                href={`https://stellar.expert/explorer/testnet/tx/${txHash}`}
                target="_blank"
                rel="noreferrer"
                className="inline-flex items-center gap-1.5 font-mono text-xs text-emerald-400 underline underline-offset-4 hover:text-emerald-300"
              >
                View on StellarExpert <ArrowUpRight className="h-3.5 w-3.5" />
              </a>
            )}

            <button
              onClick={onClose}
              className="mt-4 w-full rounded-xl bg-zinc-800 py-2.5 text-sm font-medium text-zinc-100 transition-colors hover:bg-zinc-700"
            >
              Close
            </button>
          </div>
        ) : (
          <form onSubmit={handleSubmitDeposit} className="mt-5 space-y-4">
            <div className="space-y-1 rounded-xl border border-zinc-900 bg-zinc-900/40 p-3">
              <div className="flex items-center justify-between text-xs">
                <span className="text-zinc-500">Target Consumer</span>
                <span className="font-mono text-zinc-300">
                  {consumerAddress
                    ? `${consumerAddress.slice(0, 6)}...${consumerAddress.slice(-6)}`
                    : connectedAddress
                      ? `${connectedAddress.slice(0, 6)}...${connectedAddress.slice(-6)}`
                      : 'Not connected'}
                </span>
              </div>
              <div className="flex items-center justify-between text-xs">
                <span className="text-zinc-500">Network</span>
                <span className="flex items-center gap-1 font-medium text-emerald-400">
                  <ShieldCheck className="h-3 w-3" /> Stellar Testnet
                </span>
              </div>
            </div>

            <div>
              <label className="mb-1.5 block text-xs font-medium text-zinc-400">
                Deposit Amount (Units / Stroops Equivalent)
              </label>
              <div className="relative">
                <input
                  type="number"
                  min="1"
                  step="any"
                  value={amount}
                  onChange={(e) => setAmount(e.target.value)}
                  disabled={busy}
                  placeholder="0.0"
                  className="w-full rounded-xl border border-zinc-800 bg-zinc-900 px-4 py-2.5 font-mono text-sm text-zinc-100 placeholder-zinc-600 focus:border-emerald-500 focus:outline-none focus:ring-1 focus:ring-emerald-500"
                />
                <span className="absolute right-4 top-2.5 font-mono text-xs text-zinc-500">
                  UNITS
                </span>
              </div>

              <div className="mt-2 grid grid-cols-4 gap-2">
                {PRESET_AMOUNTS.map((preset) => (
                  <button
                    key={preset}
                    type="button"
                    onClick={() => setAmount(preset)}
                    className={`rounded-lg border py-1.5 font-mono text-xs transition-colors ${
                      amount === preset
                        ? 'border-emerald-500/50 bg-emerald-500/10 font-semibold text-emerald-400'
                        : 'border-zinc-800 bg-zinc-900/60 text-zinc-400 hover:border-zinc-700 hover:text-zinc-200'
                    }`}
                  >
                    +{preset}
                  </button>
                ))}
              </div>
            </div>

            {errorMessage && (
              <div className="flex items-start gap-2 rounded-xl border border-rose-900/50 bg-rose-950/30 p-3 text-xs text-rose-300">
                <AlertCircle className="mt-0.5 h-4 w-4 shrink-0 text-rose-400" />
                <span>{errorMessage}</span>
              </div>
            )}

            {!connectedAddress ? (
              <button
                type="button"
                onClick={handleConnectWallet}
                disabled={status === 'connecting'}
                className="flex w-full items-center justify-center gap-2 rounded-xl bg-emerald-500 py-3 text-sm font-semibold text-black transition-colors hover:bg-emerald-400 disabled:opacity-50"
              >
                {status === 'connecting' ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Wallet className="h-4 w-4" />
                )}
                Connect Freighter Wallet
              </button>
            ) : (
              <button
                type="submit"
                disabled={busy}
                className="flex w-full items-center justify-center gap-2 rounded-xl bg-emerald-500 py-3 text-sm font-semibold text-black shadow-lg shadow-emerald-950/20 transition-colors hover:bg-emerald-400 disabled:opacity-50"
              >
                {busy && <Loader2 className="h-4 w-4 animate-spin" />}
                {status === 'building' && 'Simulating Footprint...'}
                {status === 'signing' && 'Confirm in Freighter...'}
                {status === 'submitting' && 'Broadcasting to Ledger...'}
                {status === 'idle' && 'Confirm & Authorize Deposit'}
                {status === 'error' && 'Retry Deposit'}
              </button>
            )}
          </form>
        )}
      </div>
    </div>
  );
}