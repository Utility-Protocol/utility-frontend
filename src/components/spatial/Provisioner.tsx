"use client";

import { useState, useCallback } from "react";

interface ProvisionPayload {
  hardwareId: string;
  meterType: string;
  latitude: number;
  longitude: number;
  installDate: string;
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
  const [qrData, setQrData] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const update = useCallback(
    (field: keyof ProvisionPayload, value: string | number) => {
      setPayload((prev) => ({ ...prev, [field]: value }));
    },
    []
  );

  const generateQR = useCallback(() => {
    const data = JSON.stringify({
      hw: payload.hardwareId,
      type: payload.meterType,
      lat: payload.latitude,
      lng: payload.longitude,
      ts: payload.installDate,
    });
    setQrData(data);
    setStep(2);
  }, [payload]);

  const submitProvision = useCallback(async () => {
    setSubmitting(true);
    await new Promise((r) => setTimeout(r, 1500));
    setStep(3);
    setSubmitting(false);
  }, []);

  if (step === 0) {
    return (
      <div className="rounded-xl border border-border p-6 space-y-4">
        <h3 className="font-semibold">Provision New Meter</h3>
        <div className="space-y-3">
          <label className="block text-sm">
            <span className="text-muted-foreground">Hardware ID</span>
            <input
              type="text"
              value={payload.hardwareId}
              onChange={(e) => update("hardwareId", e.target.value)}
              placeholder="e.g. HWM-2024-0A1B"
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
            onClick={() => setStep(1)}
            disabled={!payload.hardwareId}
            className="w-full rounded-lg bg-foreground text-background px-4 py-2 text-sm font-medium hover:opacity-90 transition-opacity disabled:opacity-50"
          >
            Generate Provisioning Code
          </button>
        </div>
      </div>
    );
  }

  if (step === 1) {
    return (
      <div className="rounded-xl border border-border p-6 space-y-4">
        <h3 className="font-semibold">Confirm Details</h3>
        <div className="text-sm space-y-2 text-muted-foreground">
          <p>Hardware: {payload.hardwareId}</p>
          <p>Type: {payload.meterType}</p>
          <p>Location: {payload.latitude}, {payload.longitude}</p>
        </div>
        <div className="flex gap-3">
          <button
            onClick={() => setStep(0)}
            className="flex-1 rounded-lg border border-border px-4 py-2 text-sm hover:bg-accent transition-colors"
          >
            Back
          </button>
          <button
            onClick={generateQR}
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
      <div className="rounded-xl border border-border p-6 space-y-4">
        <h3 className="font-semibold">Scan QR Code on Device</h3>
        <div className="bg-white dark:bg-black rounded-lg p-6 flex items-center justify-center border border-border">
          <div className="w-48 h-48 bg-muted flex items-center justify-center text-muted-foreground text-sm">
            [QR: {qrData.slice(0, 32)}...]
          </div>
        </div>
        <p className="text-xs text-muted-foreground text-center">
          Present this code to the field device to pair.
        </p>
        <div className="flex gap-3">
          <button
            onClick={() => setStep(1)}
            className="flex-1 rounded-lg border border-border px-4 py-2 text-sm hover:bg-accent transition-colors"
          >
            Regenerate
          </button>
          <button
            onClick={submitProvision}
            disabled={submitting}
            className="flex-1 rounded-lg bg-foreground text-background px-4 py-2 text-sm font-medium hover:opacity-90 transition-opacity disabled:opacity-50"
          >
            {submitting ? "Submitting..." : "Confirm On-Chain"}
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="rounded-xl border border-green-500/30 bg-green-500/5 p-6 space-y-2">
      <h3 className="font-semibold text-green-600 dark:text-green-400">
        Provisioned Successfully
      </h3>
      <p className="text-sm text-muted-foreground">
        Meter {payload.hardwareId} has been registered on-chain.
      </p>
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
        }}
        className="mt-2 rounded-lg border border-border px-4 py-1.5 text-sm hover:bg-accent transition-colors"
      >
        Provision Another
      </button>
    </div>
  );
}
