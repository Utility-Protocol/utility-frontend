"use client";

import { useState, useEffect, useCallback, useRef } from "react";
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
  const dialogRef = useRef<HTMLDivElement | null>(null);
  const previouslyFocused = useRef<Element | null>(null);

  useEffect(() => {
    if (open) {
      const fee = new BigNumber(resourceFee || "0");
      const bal = new BigNumber(balance || "0");
      setInsufficient(fee.isGreaterThan(bal));
    }
  }, [open, resourceFee, balance]);

  useEffect(() => {
    if (!open) return;
    previouslyFocused.current = document.activeElement;

    const dialog = dialogRef.current;
    if (dialog) {
      const focusable = dialog.querySelectorAll<HTMLElement>(
        'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])'
      );
      (focusable[0] || dialog).focus();
    }

    function onKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") {
        e.preventDefault();
        onClose();
        return;
      }

      if (e.key === "Tab" && dialog) {
        const focusable = Array.from(
          dialog.querySelectorAll<HTMLElement>(
            'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])'
          )
        ).filter((el) => !el.hasAttribute("disabled"));
        if (focusable.length === 0) {
          e.preventDefault();
          return;
        }
        const first = focusable[0];
        const last = focusable[focusable.length - 1];
        if (!e.shiftKey && document.activeElement === last) {
          e.preventDefault();
          first.focus();
        }
        if (e.shiftKey && document.activeElement === first) {
          e.preventDefault();
          last.focus();
        }
      }
    }

    window.addEventListener("keydown", onKeyDown);
    return () => {
      window.removeEventListener("keydown", onKeyDown);
      if (previouslyFocused.current && (previouslyFocused.current as HTMLElement).focus) {
        (previouslyFocused.current as HTMLElement).focus();
      }
    };
  }, [open, onClose]);

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

  const formattedFee = (() => {
    try {
      return new BigNumber(resourceFee || "0").toFixed(7);
    } catch {
      return resourceFee || "0";
    }
  })();

  const formattedBalance = (() => {
    try {
      return new BigNumber(balance || "0").toFixed(7);
    } catch {
      return balance || "0";
    }
  })();

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm">
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="tx-modal-title"
        tabIndex={-1}
        className="w-full max-w-md rounded-xl border border-border bg-background p-6 space-y-4 shadow-2xl"
      >
        <div className="flex items-center justify-between">
          <h2 id="tx-modal-title" className="font-semibold text-lg">
            Confirm Transaction
          </h2>
          <button
            onClick={onClose}
            className="text-muted-foreground hover:text-foreground transition-colors text-sm"
            aria-label="Close dialog"
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
            <span className="font-mono">{formattedFee} XLM</span>
          </div>
          <div className="flex justify-between">
            <span className="text-muted-foreground">Balance</span>
            <span className="font-mono">{formattedBalance} XLM</span>
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
            className="flex-1 inline-flex items-center justify-center gap-2 rounded-lg bg-foreground text-background px-4 py-2 text-sm font-medium hover:opacity-90 transition-opacity disabled:opacity-50"
          >
            {confirming ? (
              <>
                <svg
                  className="animate-spin h-4 w-4"
                  xmlns="http://www.w3.org/2000/svg"
                  fill="none"
                  viewBox="0 0 24 24"
                  aria-hidden="true"
                >
                  <circle
                    className="opacity-25"
                    cx="12"
                    cy="12"
                    r="10"
                    stroke="currentColor"
                    strokeWidth="4"
                  />
                  <path
                    className="opacity-75"
                    fill="currentColor"
                    d="M4 12a8 8 0 018-8v4a4 4 0 00-4 4H4z"
                  />
                </svg>
                Confirming...
              </>
            ) : (
              "Sign & Submit"
            )}
          </button>
        </div>
      </div>
    </div>
  );
}
