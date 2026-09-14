'use client';

import { useState } from 'react';

import { CheckCircle2, Loader2, X } from 'lucide-react';

import { useFreighter } from '@/hooks/useFreighter';

interface DepositModalProps {
  deviceId: string;
  onClose: () => void;
}

export default function DepositModal({ deviceId, onClose }: DepositModalProps) {
  const { isConnected, depositEscrow, error: walletError } = useFreighter();
  const [amount, setAmount] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [txHash, setTxHash] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const amountInvalid =
    amount.trim() === '' || !Number.isFinite(Number(amount)) || Number(amount) <= 0;

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    if (amountInvalid) return;

    setIsSubmitting(true);
    setError(null);
    try {
      const hash = await depositEscrow(deviceId, amount);
      setTxHash(hash);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Deposit failed');
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm"
      role="dialog"
      aria-modal="true"
      aria-labelledby="deposit-modal-title"
    >
      <div className="w-full max-w-md rounded-2xl border border-zinc-800 bg-zinc-900 p-6 shadow-2xl">
        <div className="mb-5 flex items-start justify-between">
          <div>
            <h2
              id="deposit-modal-title"
              className="text-base font-semibold text-zinc-100"
            >
              Deposit Escrow
            </h2>
            <p className="mt-1 break-all font-mono text-xs text-zinc-500">
              {deviceId}
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg p-1.5 text-zinc-400 transition-colors hover:bg-zinc-800 hover:text-zinc-200"
            aria-label="Close"
          >
            <X className="h-4 w-4" aria-hidden="true" />
          </button>
        </div>

        {txHash ? (
          <div className="rounded-xl border border-emerald-800 bg-emerald-900/30 p-4">
            <div className="flex items-center gap-2 text-sm font-medium text-emerald-300">
              <CheckCircle2 className="h-4 w-4" aria-hidden="true" />
              Transaction submitted
            </div>
            <p className="mt-2 break-all font-mono text-xs text-emerald-400/80">
              {txHash}
            </p>
          </div>
        ) : (
          <form onSubmit={(e) => void handleSubmit(e)} className="space-y-4">
            <div>
              <label
                htmlFor="deposit-amount"
                className="mb-1.5 block text-sm font-medium text-zinc-400"
              >
                Amount (tokens)
              </label>
              <input
                id="deposit-amount"
                type="number"
                inputMode="decimal"
                min="0"
                step="0.0000001"
                placeholder="0.00"
                value={amount}
                onChange={(event) => setAmount(event.target.value)}
                className="w-full rounded-lg border border-zinc-700 bg-zinc-950 px-4 py-2.5 text-sm text-zinc-100 placeholder-zinc-600 outline-none transition-colors focus:border-emerald-500"
              />
            </div>

            {!isConnected ? (
              <p className="rounded-lg border border-amber-800 bg-amber-900/20 px-3 py-2 text-xs text-amber-300">
                Connect your Freighter wallet to fund escrow.
              </p>
            ) : null}

            {(error ?? walletError) ? (
              <p className="rounded-lg border border-red-800 bg-red-900/20 px-3 py-2 text-xs text-red-300">
                {error ?? walletError}
              </p>
            ) : null}

            <button
              type="submit"
              disabled={isSubmitting || amountInvalid || !isConnected}
              className="inline-flex w-full items-center justify-center gap-2 rounded-lg bg-emerald-600 px-4 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-emerald-500 focus:outline-none focus:ring-2 focus:ring-emerald-500/50 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {isSubmitting ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
                  Sending...
                </>
              ) : (
                'Deposit'
              )}
            </button>
          </form>
        )}
      </div>
    </div>
  );
}