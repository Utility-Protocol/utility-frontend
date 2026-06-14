"use client";

import { useState, useEffect, useCallback } from "react";
import BigNumber from "bignumber.js";

interface TxModalProps {
  open: boolean;
  onClose: () => void;
  onConfirm: () => Promise<void>;
  operation: string;
  resourceFee: string;
  balance: string;
}

export function TxModal({
  open,
  onClose,
  onConfirm,
  operation,
  resourceFee,
  balance,
}: TxModalProps) {
  const [confirming, setConfirming] = useState(false);
  const [insufficient, setInsufficient] = useState(false);

  useEffect(() => {
    if (open) {
      const fee = new BigNumber(resourceFee || "0");
      const bal = new BigNumber(balance || "0");
      setInsufficient(fee.isGreaterThan(bal));
    }
  }, [open, resourceFee, balance]);

  const handleConfirm = useCallback(async () => {
    setConfirming(true);
    try {
      await onConfirm();
      onClose();
    } finally {
      setConfirming(false);
    }
  }, [onConfirm, onClose]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm">
      <div className="w-full max-w-md rounded-xl border border-border bg-background p-6 space-y-4 shadow-2xl">
        <div className="flex items-center justify-between">
          <h2 className="font-semibold text-lg">Confirm Transaction</h2>
          <button
            onClick={onClose}
            className="text-muted-foreground hover:text-foreground transition-colors text-sm"
          >
            ✕
          </button>
        </div>

        <div className="space-y-3 text-sm">
          <div className="flex justify-between">
            <span className="text-muted-foreground">Operation</span>
            <span className="font-mono">{operation}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-muted-foreground">Resource Fee</span>
            <span className="font-mono">{resourceFee || "0"} XLM</span>
          </div>
          <div className="flex justify-between">
            <span className="text-muted-foreground">Balance</span>
            <span className="font-mono">{balance || "0"} XLM</span>
          </div>
          {insufficient && (
            <div className="rounded-lg bg-destructive/10 border border-destructive/30 p-3 text-destructive text-xs">
              Insufficient balance. Please acquire additional XLM before
              proceeding.
            </div>
          )}
        </div>

        <div className="flex gap-3 pt-2">
          <button
            onClick={onClose}
            className="flex-1 rounded-lg border border-border px-4 py-2 text-sm hover:bg-accent transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={handleConfirm}
            disabled={confirming || insufficient}
            className="flex-1 rounded-lg bg-foreground text-background px-4 py-2 text-sm font-medium hover:opacity-90 transition-opacity disabled:opacity-50"
          >
            {confirming ? "Confirming..." : "Sign & Submit"}
          </button>
        </div>
      </div>
    </div>
  );
}
