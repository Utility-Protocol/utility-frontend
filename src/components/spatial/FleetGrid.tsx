"use client";

import { useState, useMemo } from "react";

interface FleetAsset {
  id: string;
  name: string;
  gridId: string;
  status: "online" | "offline" | "maintenance";
  uptime: number;
  lastPing: number;
  resource: number;
}

const ASSETS: FleetAsset[] = Array.from({ length: 48 }, (_, i) => ({
  id: `asset-${i}`,
  name: `Meter-${String(i + 1).padStart(3, "0")}`,
  gridId: `grid-${Math.floor(i / 6) + 1}`,
  status: ((["online", "offline", "maintenance"] as const)[
    Math.random() > 0.15 ? 0 : Math.random() > 0.5 ? 1 : 2
  ]),
  uptime: 95 + Math.random() * 5,
  lastPing: Date.now() - Math.floor(Math.random() * 60000),
  resource: 0.3 + Math.random() * 0.7,
}));

const STATUS_COLORS: Record<FleetAsset["status"], string> = {
  online: "bg-green-500",
  offline: "bg-red-500",
  maintenance: "bg-yellow-500",
};

export function FleetGrid() {
  const [filter, setFilter] = useState<FleetAsset["status"] | "all">("all");
  const [search, setSearch] = useState("");

  const filtered = useMemo(() => {
    return ASSETS.filter((a) => {
      if (filter !== "all" && a.status !== filter) return false;
      if (search && !a.name.toLowerCase().includes(search.toLowerCase()))
        return false;
      return true;
    });
  }, [filter, search]);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-3">
        <input
          type="text"
          placeholder="Search assets..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="rounded-lg border border-border bg-transparent px-3 py-1.5 text-sm w-48 focus:outline-none focus:ring-1 focus:ring-ring"
        />
        <div className="flex gap-1">
          {(["all", "online", "offline", "maintenance"] as const).map((s) => (
            <button
              key={s}
              onClick={() => setFilter(s)}
              className={`px-3 py-1.5 text-sm rounded-lg border transition-colors ${
                filter === s
                  ? "bg-foreground text-background border-foreground"
                  : "border-border hover:bg-accent"
              }`}
            >
              {s.charAt(0).toUpperCase() + s.slice(1)}
            </button>
          ))}
        </div>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-3">
        {filtered.map((asset) => (
          <div
            key={asset.id}
            className="rounded-lg border border-border p-3 space-y-2 hover:bg-accent/50 transition-colors"
          >
            <div className="flex items-center justify-between">
              <span className="text-sm font-medium truncate">{asset.name}</span>
              <span
                className={`w-2 h-2 rounded-full shrink-0 ${STATUS_COLORS[asset.status]}`}
              />
            </div>
            <div className="text-xs text-muted-foreground space-y-1">
              <div className="truncate">{asset.gridId}</div>
              <div>Uptime: {asset.uptime.toFixed(1)}%</div>
              <div className="flex items-center gap-2">
                <div className="flex-1 h-1.5 bg-muted rounded-full overflow-hidden">
                  <div
                    className="h-full bg-green-500 rounded-full transition-all"
                    style={{ width: `${asset.resource * 100}%` }}
                  />
                </div>
                <span className="tabular-nums">
                  {(asset.resource * 100).toFixed(0)}%
                </span>
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
