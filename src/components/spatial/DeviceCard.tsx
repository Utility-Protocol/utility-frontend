"use client";

import { useMemo } from "react";
import { sanitize, validateLabel } from "@/utils/sanitize";

interface DeviceCardProps {
  label: string;
  location: string;
  status: "active" | "inactive" | "alarm";
  metrics?: Record<string, string | number>;
}

export function DeviceCard({ label, location, status, metrics }: DeviceCardProps) {
  const safeLabel = useMemo(() => validateLabel(label), [label]);
  const safeLocation = useMemo(() => sanitize(location), [location]);

  const statusColor: Record<string, string> = {
    active: "bg-green-500",
    inactive: "bg-gray-500",
    alarm: "bg-red-500",
  };

  return (
    <div className="rounded-xl border border-border p-4 space-y-3 bg-background">
      <div className="flex items-center justify-between">
        <h3 className="font-semibold text-sm truncate max-w-[200px]">
          {safeLabel}
        </h3>
        <span
          className={`w-2.5 h-2.5 rounded-full shrink-0 ${
            statusColor[status] || "bg-gray-500"
          }`}
        />
      </div>
      {safeLocation && (
        <p className="text-xs text-muted-foreground truncate">{safeLocation}</p>
      )}
      {metrics && (
        <div className="grid grid-cols-2 gap-2 text-xs">
          {Object.entries(metrics).map(([key, value]) => (
            <div key={key} className="flex justify-between">
              <span className="text-muted-foreground">{sanitize(key)}</span>
              <span className="font-mono tabular-nums">{sanitize(String(value))}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
