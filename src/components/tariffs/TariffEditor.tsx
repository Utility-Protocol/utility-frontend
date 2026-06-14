"use client";

import { useState, useCallback } from "react";
import BigNumber from "bignumber.js";

interface TariffBand {
  id: string;
  label: string;
  ratePerUnit: string;
  thresholdMin: string;
  thresholdMax: string;
}

const SCALE = 7;

function toContractValue(value: string): string {
  return new BigNumber(value).times(new BigNumber(10).pow(SCALE)).toFixed(0);
}

function fromContractValue(value: string): string {
  return new BigNumber(value).div(new BigNumber(10).pow(SCALE)).toFixed(7);
}

export function TariffEditor() {
  const [bands, setBands] = useState<TariffBand[]>([
    { id: "1", label: "Base", ratePerUnit: "0.05", thresholdMin: "0", thresholdMax: "100" },
    { id: "2", label: "Standard", ratePerUnit: "0.08", thresholdMin: "100", thresholdMax: "500" },
    { id: "3", label: "Peak", ratePerUnit: "0.12", thresholdMin: "500", thresholdMax: "999999" },
  ]);

  const [previewAmount, setPreviewAmount] = useState("250");
  const [publishing, setPublishing] = useState(false);

  const updateBand = useCallback(
    (id: string, field: keyof TariffBand, value: string) => {
      setBands((prev) =>
        prev.map((b) => (b.id === id ? { ...b, [field]: value } : b))
      );
    },
    []
  );

  const addBand = useCallback(() => {
    setBands((prev) => [
      ...prev,
      {
        id: String(Date.now()),
        label: `Band ${prev.length + 1}`,
        ratePerUnit: "0.00",
        thresholdMin: "0",
        thresholdMax: "0",
      },
    ]);
  }, []);

  const removeBand = useCallback((id: string) => {
    setBands((prev) => prev.filter((b) => b.id !== id));
  }, []);

  const previewCost = useCallback(() => {
    const amount = new BigNumber(previewAmount);
    for (const band of bands) {
      const min = new BigNumber(band.thresholdMin);
      const max = new BigNumber(band.thresholdMax);
      if (amount.isGreaterThanOrEqualTo(min) && amount.isLessThanOrEqualTo(max)) {
        return amount.times(band.ratePerUnit).toFixed(7);
      }
    }
    return "N/A";
  }, [previewAmount, bands]);

  const publish = useCallback(async () => {
    setPublishing(true);
    const contractBands = bands.map((b) => ({
      ...b,
      contractRate: toContractValue(b.ratePerUnit),
    }));
    // eslint-disable-next-line no-console
    console.warn("Publishing tariff bands:", contractBands);
    await new Promise((r) => setTimeout(r, 2000));
    setPublishing(false);
  }, [bands]);

  return (
    <div className="rounded-xl border border-border p-6 space-y-6">
      <div className="flex items-center justify-between">
        <h3 className="font-semibold">Tariff Bands</h3>
        <button
          onClick={addBand}
          className="rounded-lg border border-border px-3 py-1.5 text-sm hover:bg-accent transition-colors"
        >
          + Add Band
        </button>
      </div>

      <div className="space-y-3">
        {bands.map((band) => (
          <div
            key={band.id}
            className="flex flex-wrap items-end gap-3 p-3 rounded-lg bg-muted/50"
          >
            <label className="flex flex-col gap-1 text-xs">
              Label
              <input
                type="text"
                value={band.label}
                onChange={(e) => updateBand(band.id, "label", e.target.value)}
                className="rounded border border-border bg-background px-2 py-1 w-20 text-xs"
              />
            </label>
            <label className="flex flex-col gap-1 text-xs">
              Rate (per unit)
              <input
                type="text"
                value={band.ratePerUnit}
                onChange={(e) =>
                  updateBand(band.id, "ratePerUnit", e.target.value)
                }
                className="rounded border border-border bg-background px-2 py-1 w-20 text-xs font-mono"
              />
            </label>
            <label className="flex flex-col gap-1 text-xs">
              Min
              <input
                type="text"
                value={band.thresholdMin}
                onChange={(e) =>
                  updateBand(band.id, "thresholdMin", e.target.value)
                }
                className="rounded border border-border bg-background px-2 py-1 w-20 text-xs font-mono"
              />
            </label>
            <label className="flex flex-col gap-1 text-xs">
              Max
              <input
                type="text"
                value={band.thresholdMax}
                onChange={(e) =>
                  updateBand(band.id, "thresholdMax", e.target.value)
                }
                className="rounded border border-border bg-background px-2 py-1 w-20 text-xs font-mono"
              />
            </label>
            <span className="text-[10px] text-muted-foreground font-mono self-center pb-1">
              → {toContractValue(band.ratePerUnit)}
            </span>
            {bands.length > 1 && (
              <button
                onClick={() => removeBand(band.id)}
                className="text-destructive text-xs pb-1 hover:underline self-center"
              >
                Remove
              </button>
            )}
          </div>
        ))}
      </div>

      <div className="border-t border-border pt-4 space-y-3">
        <h4 className="text-sm font-medium">Preview Pricing</h4>
        <div className="flex items-center gap-3">
          <input
            type="text"
            value={previewAmount}
            onChange={(e) => setPreviewAmount(e.target.value)}
            className="rounded-lg border border-border bg-transparent px-3 py-2 text-sm w-32 font-mono focus:outline-none focus:ring-1 focus:ring-ring"
          />
          <span className="text-sm">units →</span>
          <span className="text-lg font-bold font-mono">{previewCost()}</span>
        </div>
      </div>

      <button
        onClick={publish}
        disabled={publishing}
        className="w-full rounded-lg bg-foreground text-background px-4 py-2.5 text-sm font-medium hover:opacity-90 transition-opacity disabled:opacity-50"
      >
        {publishing ? "Publishing to Soroban..." : "Publish Tariff to Contract"}
      </button>
    </div>
  );
}

export { toContractValue, fromContractValue };
