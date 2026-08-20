"use client";

import { useState, useCallback, useEffect, useRef } from "react";
import QRCode from "qrcode";
import { api } from "@/services/api";

interface ProvisionPayload {
  hardwareId: string;
  meterType: string;
  latitude: number;
  longitude: number;
  installDate: string;
}

interface ProvisionResult {
  txHash: string;
}

export function Provisioner() {
  const [step, setStep] = useState(0);
  const [payload, setPayload] = useState<ProvisionPayload>({
    hardwareId: "",
    meterType: "smart-meter-v2",
    latitude: 0,
    longitude: 0,
    installDate: new Date().toISOString().split("T")[0],
  });
  const [qrReady, setQrReady] = useState(false);
  const [qrRetryCount, setQrRetryCount] = useState(0);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [txHash, setTxHash] = useState<string>("");
  const qrCanvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  const update = useCallback(
    (field: keyof ProvisionPayload, value: string | number) => {
      setPayload((prev) => ({ ...prev, [field]: value }));
      setError(null);
    },
    []
  );

  // Generate QR code when stepping to the QR view
  useEffect(() => {
    if (step === 2 && qrCanvasRef.current) {
      const data = JSON.stringify({
        hw: payload.hardwareId,
        type: payload.meterType,
        lat: payload.latitude,
        lng: payload.longitude,
        ts: payload.installDate,
      });
      setQrReady(false);
      setError(null);
      QRCode.toCanvas(qrCanvasRef.current, data, {
        width: 240,
        margin: 2,
        color: { dark: "#000000", light: "#ffffff" },
      })
        .then(() => {
          setQrReady(true);
        })
        .catch((err) => {
          setQrReady(false);
          setError("Failed to generate QR code: " + (err as Error).message);
        });
    }
  }, [step, payload, qrRetryCount]);

  const goToStep = useCallback((next: number) => {
    setError(null);
    setStep(next);
  }, []);

  const submitProvision = useCallback(async () => {
    setSubmitting(true);
    setError(null);
    try {
      const res = await api.post<ProvisionResult>("/api/provision", {
        hw: payload.hardwareId,
        type: payload.meterType,
        lat: payload.latitude,
        lng: payload.longitude,
        ts: payload.installDate,
      });
      if (res.error) {
        setError(res.error);
        setSubmitting(false);
        return;
      }
      setTxHash(res.data?.txHash ?? "");
      setStep(3);
    } catch (err) {
      setError((err as Error).message || "Provisioning failed");
    } finally {
      setSubmitting(false);
    }
  }, [payload]);

  // Keyboard navigation: Enter to advance, Escape to go back
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Enter" && !e.shiftKey && !e.ctrlKey && !e.metaKey) {
        e.preventDefault();
        if (step === 0 && payload.hardwareId) {
          goToStep(1);
        } else if (step === 1) {
          goToStep(2);
        } else if (step === 2 && !submitting) {
          void submitProvision();
        } else if (step === 3) {
          // Start over on success screen
          setStep(0);
          setPayload({
            hardwareId: "",
            meterType: "smart-meter-v2",
            latitude: 0,
            longitude: 0,
            installDate: new Date().toISOString().split("T")[0],
          });
          setQrReady(false);
          setQrRetryCount(0);
          setTxHash("");
        }
      }
      if (e.key === "Escape") {
        e.preventDefault();
        if (step > 0 && step < 3) {
          goToStep(step - 1);
        }
      }
    };

    el.addEventListener("keydown", handleKeyDown);
    return () => el.removeEventListener("keydown", handleKeyDown);
  }, [step, payload.hardwareId, submitting, submitProvision, goToStep]);

  if (step === 0) {
    return (
      <div ref={containerRef} className="rounded-xl border border-border p-6 space-y-4" tabIndex={-1}>
        <h3 className="font-semibold">Provision New Meter</h3>
        <div className="space-y-3">
          <label className="block text-sm">
            <span className="text-muted-foreground">Hardware ID</span>
            <input
              type="text"
              value={payload.hardwareId}
              onChange={(e) => update("hardwareId", e.target.value)}
              placeholder="e.g. HWM-2024-0A1B"
              autoFocus
              className="mt-1 w-full rounded-lg border border-border bg-transparent px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-ring"
            />
          </label>
          <label className="block text-sm">
            <span className="text-muted-foreground">Meter Type</span>
            <select
              value={payload.meterType}
              onChange={(e) => update("meterType", e.target.value)}
              className="mt-1 w-full rounded-lg border border-border bg-transparent px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-ring"
            >
              <option value="smart-meter-v2">Smart Meter v2</option>
              <option value="smart-meter-v3">Smart Meter v3</option>
              <option value="industrial-probe">Industrial Probe</option>
            </select>
          </label>
          <div className="grid grid-cols-2 gap-3">
            <label className="block text-sm">
              <span className="text-muted-foreground">Latitude</span>
              <input
                type="number"
                value={payload.latitude}
                onChange={(e) => update("latitude", parseFloat(e.target.value) || 0)}
                className="mt-1 w-full rounded-lg border border-border bg-transparent px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-ring"
              />
            </label>
            <label className="block text-sm">
              <span className="text-muted-foreground">Longitude</span>
              <input
                type="number"
                value={payload.longitude}
                onChange={(e) => update("longitude", parseFloat(e.target.value) || 0)}
                className="mt-1 w-full rounded-lg border border-border bg-transparent px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-ring"
              />
            </label>
          </div>
          <button
            onClick={() => goToStep(1)}
            disabled={!payload.hardwareId}
            className="w-full rounded-lg bg-foreground text-background px-4 py-2 text-sm font-medium hover:opacity-90 transition-opacity disabled:opacity-50"
          >
            Generate Provisioning Code
          </button>
          {error && (
            <p className="text-sm text-red-500" role="alert">
              {error}
            </p>
          )}
        </div>
      </div>
    );
  }

  if (step === 1) {
    return (
      <div ref={containerRef} className="rounded-xl border border-border p-6 space-y-4" tabIndex={-1}>
        <h3 className="font-semibold">Confirm Details</h3>
        <div className="text-sm space-y-2 text-muted-foreground">
          <p>Hardware: {payload.hardwareId}</p>
          <p>Type: {payload.meterType}</p>
          <p>Location: {payload.latitude}, {payload.longitude}</p>
          <p>Install Date: {payload.installDate}</p>
        </div>
        <div className="flex gap-3">
          <button
            onClick={() => goToStep(0)}
            className="flex-1 rounded-lg border border-border px-4 py-2 text-sm hover:bg-accent transition-colors"
          >
            Back
          </button>
          <button
            onClick={() => goToStep(2)}
            className="flex-1 rounded-lg bg-foreground text-background px-4 py-2 text-sm font-medium hover:opacity-90 transition-opacity"
          >
            Generate QR
          </button>
        </div>
      </div>
    );
  }

  if (step === 2) {
    return (
      <div ref={containerRef} className="rounded-xl border border-border p-6 space-y-4" tabIndex={-1}>
        <h3 className="font-semibold">Scan QR Code on Device</h3>
        <div className="bg-background rounded-lg p-6 flex flex-col items-center justify-center border border-border">
          {error ? (
            <div className="text-red-500 text-sm flex flex-col items-center gap-2">
              <svg
                xmlns="http://www.w3.org/2000/svg"
                className="h-8 w-8"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4.5c-.77-.833-2.694-.833-3.464 0L3.34 16.5c-.77.833.192 2.5 1.732 2.5z"
                />
              </svg>
              <p>{error}</p>
              <button
                onClick={() => setQrRetryCount((c) => c + 1)}
                className="mt-1 text-xs underline hover:no-underline"
              >
                Retry
              </button>
            </div>
          ) : (
            <canvas
              ref={qrCanvasRef}
              className="w-60 h-60"
              aria-label="QR code for device provisioning"
            />
          )}
        </div>
        {qrReady && (
          <p className="text-xs text-muted-foreground text-center">
            Present this code to the field device to pair.
          </p>
        )}
        <div className="flex gap-3">
          <button
            onClick={() => goToStep(1)}
            className="flex-1 rounded-lg border border-border px-4 py-2 text-sm hover:bg-accent transition-colors"
          >
            Regenerate
          </button>
          <button
            onClick={submitProvision}
            disabled={submitting || !!error}
            className="flex-1 rounded-lg bg-foreground text-background px-4 py-2 text-sm font-medium hover:opacity-90 transition-opacity disabled:opacity-50 flex items-center justify-center gap-2"
          >
            {submitting ? (
              <>
                <svg
                  className="animate-spin h-4 w-4"
                  xmlns="http://www.w3.org/2000/svg"
                  fill="none"
                  viewBox="0 0 24 24"
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
                    d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"
                  />
                </svg>
                Submitting...
              </>
            ) : (
              "Confirm On-Chain"
            )}
          </button>
        </div>
      </div>
    );
  }

  return (
    <div ref={containerRef} className="rounded-xl border border-green-500/30 bg-green-500/5 p-6 space-y-2" tabIndex={-1}>
      <h3 className="font-semibold text-green-600 dark:text-green-400">
        Provisioned Successfully
      </h3>
      <p className="text-sm text-muted-foreground">
        Meter {payload.hardwareId} has been registered on-chain.
      </p>
      {txHash && (
        <p className="text-xs text-muted-foreground font-mono break-all">
          TX: {txHash}
        </p>
      )}
      <button
        onClick={() => {
          setStep(0);
          setPayload({
            hardwareId: "",
            meterType: "smart-meter-v2",
            latitude: 0,
            longitude: 0,
            installDate: new Date().toISOString().split("T")[0],
          });
          setQrReady(false);
          setQrRetryCount(0);
          setTxHash("");
          setError(null);
        }}
        className="mt-2 rounded-lg border border-border px-4 py-1.5 text-sm hover:bg-accent transition-colors"
      >
        Provision Another
      </button>
    </div>
  );
}
