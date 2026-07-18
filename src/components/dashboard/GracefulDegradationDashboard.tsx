"use client";

import { useFeatureFlags } from "@/hooks/useFeatureFlags";
import { useCapacityShedding } from "@/hooks/useCapacityShedding";

export function GracefulDegradationDashboard() {
  const { flags, setFlag, resetFlags } = useFeatureFlags();
  const { state, setMode, setLevel, updateMetrics, resetShedding } =
    useCapacityShedding();

  const handleModeChange = (mode: "auto" | "manual") => {
    setMode(mode);
  };

  const handleLevelChange = (level: "healthy" | "degraded" | "critical") => {
    setLevel(level);
  };

  const handleMetricChange = (
    name: "fps" | "latency" | "pendingTransactions",
    value: number
  ) => {
    updateMetrics({ [name]: value });
  };

  // Dynamically estimate P99 latency based on shedding state.
  // The less load on the main thread, the lower the P99 latency is!
  const getP99Latency = () => {
    let base = 5; // Base overhead of standard loop
    if (state.level === "healthy") {
      // High frequency and heavy calculations can introduce slight latency spikes
      if (flags.highFrequencyTelemetry) base += 12;
      if (flags.heavyWeightTasks) base += 35;
    } else if (state.level === "degraded") {
      if (flags.highFrequencyTelemetry) base += 8;
      if (flags.heavyWeightTasks) base += 20;
    } else if (state.level === "critical") {
      // In critical shedding mode, all heavy work is disabled, bringing P99 latency down!
      if (flags.highFrequencyTelemetry) base += 4;
      if (flags.heavyWeightTasks) base += 10;
    }
    return base + (state.pendingTransactions * 2.5);
  };

  const p99 = getP99Latency();
  const isHealthy = state.level === "healthy";
  const isDegraded = state.level === "degraded";
  const isCritical = state.level === "critical";

  return (
    <div className="rounded-xl border border-border bg-background p-6 space-y-6">
      <div className="flex flex-col gap-1 md:flex-row md:items-center md:justify-between">
        <div>
          <h3 className="text-lg font-bold tracking-tight">
            Capacity Shedding &amp; Feature Flags Console
          </h3>
          <p className="text-xs text-muted-foreground">
            System-wide graceful degradation dashboard &amp; load-shedding controller.
          </p>
        </div>
        <div className="flex gap-2">
          <button
            onClick={() => {
              resetFlags();
              resetShedding();
            }}
            className="rounded-lg border border-border bg-background px-3 py-1.5 text-xs font-semibold hover:bg-accent transition-colors"
          >
            Reset to Defaults
          </button>
        </div>
      </div>

      {/* Grid Controls */}
      <div className="grid gap-6 md:grid-cols-3">
        {/* State and Mode Controller */}
        <div className="rounded-lg border border-border/60 bg-muted/10 p-4 space-y-4">
          <h4 className="text-xs font-bold uppercase tracking-wider text-muted-foreground">
            Shedding Mode &amp; Levels
          </h4>

          {/* Mode toggle */}
          <div className="space-y-1.5">
            <span className="text-xs font-medium">Evaluation Mode</span>
            <div className="flex rounded-md bg-muted p-1">
              <button
                onClick={() => handleModeChange("auto")}
                className={`flex-1 rounded py-1 text-xs font-semibold transition-all ${
                  state.mode === "auto"
                    ? "bg-background text-foreground shadow-sm"
                    : "text-muted-foreground hover:text-foreground"
                }`}
              >
                Auto (Adaptive)
              </button>
              <button
                onClick={() => handleModeChange("manual")}
                className={`flex-1 rounded py-1 text-xs font-semibold transition-all ${
                  state.mode === "manual"
                    ? "bg-background text-foreground shadow-sm"
                    : "text-muted-foreground hover:text-foreground"
                }`}
              >
                Manual Override
              </button>
            </div>
          </div>

          {/* Severity state */}
          <div className="space-y-1.5">
            <span className="text-xs font-medium">Shedding Severity Level</span>
            {state.mode === "auto" ? (
              <div className="flex items-center gap-2.5 p-2 rounded-lg border border-border bg-background">
                <span
                  className={`h-3 w-3 rounded-full ${
                    isHealthy
                      ? "bg-green-500"
                      : isDegraded
                      ? "bg-amber-500 animate-pulse"
                      : "bg-red-500 animate-ping"
                  }`}
                />
                <span className="text-sm font-bold uppercase tracking-wide">
                  {state.level}
                </span>
                <span className="text-[10px] text-muted-foreground ml-auto">
                  (Controlled by Metrics)
                </span>
              </div>
            ) : (
              <div className="flex gap-1.5">
                {(["healthy", "degraded", "critical"] as const).map((lvl) => (
                  <button
                    key={lvl}
                    onClick={() => handleLevelChange(lvl)}
                    className={`flex-1 rounded-md border py-1.5 text-xs font-bold uppercase tracking-wider transition-colors ${
                      state.level === lvl
                        ? lvl === "healthy"
                          ? "border-green-500 bg-green-500/10 text-green-500"
                          : lvl === "degraded"
                          ? "border-amber-500 bg-amber-500/10 text-amber-500"
                          : "border-red-500 bg-red-500/10 text-red-500"
                        : "border-border text-muted-foreground hover:bg-accent"
                    }`}
                  >
                    {lvl}
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Metrics Simulator */}
        <div className="rounded-lg border border-border/60 bg-muted/10 p-4 space-y-4">
          <h4 className="text-xs font-bold uppercase tracking-wider text-muted-foreground">
            System Metrics Simulator
          </h4>

          {/* FPS Slider */}
          <div className="space-y-1">
            <div className="flex items-center justify-between text-xs">
              <span className="font-medium text-muted-foreground">Frame Rate</span>
              <span className={`font-mono font-bold ${state.fps < 40 ? "text-amber-500" : "text-green-500"}`}>
                {state.fps} FPS
              </span>
            </div>
            <input
              type="range"
              min="10"
              max="60"
              step="5"
              value={state.fps}
              onChange={(e) => handleMetricChange("fps", Number(e.target.value))}
              disabled={state.mode === "manual"}
              className="w-full accent-foreground disabled:opacity-45"
            />
          </div>

          {/* Latency Slider */}
          <div className="space-y-1">
            <div className="flex items-center justify-between text-xs">
              <span className="font-medium text-muted-foreground">WS Latency</span>
              <span className={`font-mono font-bold ${state.latency > 150 ? "text-amber-500" : "text-green-500"}`}>
                {state.latency} ms
              </span>
            </div>
            <input
              type="range"
              min="10"
              max="600"
              step="10"
              value={state.latency}
              onChange={(e) => handleMetricChange("latency", Number(e.target.value))}
              disabled={state.mode === "manual"}
              className="w-full accent-foreground disabled:opacity-45"
            />
          </div>

          {/* Pending Tx Queue Slider */}
          <div className="space-y-1">
            <div className="flex items-center justify-between text-xs">
              <span className="font-medium text-muted-foreground">Tx Queue Size</span>
              <span className={`font-mono font-bold ${state.pendingTransactions > 5 ? "text-amber-500" : "text-green-500"}`}>
                {state.pendingTransactions} pending
              </span>
            </div>
            <input
              type="range"
              min="0"
              max="15"
              step="1"
              value={state.pendingTransactions}
              onChange={(e) =>
                handleMetricChange("pendingTransactions", Number(e.target.value))
              }
              disabled={state.mode === "manual"}
              className="w-full accent-foreground disabled:opacity-45"
            />
          </div>
        </div>

        {/* Real-time Health Monitor */}
        <div className="rounded-lg border border-border/60 bg-muted/10 p-4 space-y-4">
          <h4 className="text-xs font-bold uppercase tracking-wider text-muted-foreground">
            System Health Indicators
          </h4>

          {/* P99 Latency indicator */}
          <div className="flex items-center justify-between border-b border-border pb-2.5">
            <span className="text-xs font-medium">P99 critical path latency</span>
            <div className="text-right">
              <span className="text-lg font-mono font-bold text-foreground">
                {p99.toFixed(1)} ms
              </span>
              <div className="text-[10px] text-green-500">Target: &lt; 100ms</div>
            </div>
          </div>

          {/* Availability uptime */}
          <div className="flex items-center justify-between border-b border-border pb-2.5">
            <span className="text-xs font-medium">Uptime target</span>
            <div className="text-right">
              <span className="text-sm font-mono font-bold text-foreground">
                99.993%
              </span>
              <div className="text-[10px] text-muted-foreground">Minimum: 99.99%</div>
            </div>
          </div>

          {/* Shedding action logs */}
          <div className="text-xs">
            <span className="font-semibold text-muted-foreground block mb-1">
              Active Shedding Actions
            </span>
            <div className="bg-background/80 p-2 rounded border border-border font-mono text-[10px] max-h-[50px] overflow-y-auto space-y-1 leading-normal">
              {isHealthy && <div className="text-green-500">● Core grid healthy. No active shedding.</div>}
              {isDegraded && (
                <>
                  <div className="text-amber-500">● WS Telemetry rendering throttled.</div>
                  <div className="text-muted-foreground">● Background processes active.</div>
                </>
              )}
              {isCritical && (
                <>
                  <div className="text-red-500 font-bold">● Telemetry RAF drawing loop HALTED.</div>
                  <div className="text-red-500">● ZK Proof Generation SUSPENDED.</div>
                  <div className="text-red-500">● Bulk Export pipelines LOCKED.</div>
                </>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Feature Flags Override Panel */}
      <div className="rounded-lg border border-border p-4 bg-muted/5 space-y-3">
        <h4 className="text-xs font-bold uppercase tracking-wider text-muted-foreground">
          Feature Flags &amp; Toggles State
        </h4>

        <div className="grid gap-4 sm:grid-cols-3">
          {/* Telemetry Toggle */}
          <div className="flex items-center justify-between p-3 rounded-lg border border-border bg-background">
            <div className="space-y-0.5">
              <span className="text-xs font-semibold block">High-Freq Telemetry</span>
              <span className="text-[10px] text-muted-foreground">
                Controls canvas animations
              </span>
            </div>
            <button
              onClick={() => setFlag("highFrequencyTelemetry", !flags.highFrequencyTelemetry)}
              className={`rounded-full px-3 py-1 text-[11px] font-bold uppercase transition-colors ${
                flags.highFrequencyTelemetry
                  ? "bg-emerald-500 text-background"
                  : "bg-red-500 text-background"
              }`}
            >
              {flags.highFrequencyTelemetry ? "Enabled" : "Shedded"}
            </button>
          </div>

          {/* Heavy Tasks Toggle */}
          <div className="flex items-center justify-between p-3 rounded-lg border border-border bg-background">
            <div className="space-y-0.5">
              <span className="text-xs font-semibold block">Heavy Weight Tasks</span>
              <span className="text-[10px] text-muted-foreground">
                ZK submits &amp; Exports
              </span>
            </div>
            <button
              onClick={() => setFlag("heavyWeightTasks", !flags.heavyWeightTasks)}
              className={`rounded-full px-3 py-1 text-[11px] font-bold uppercase transition-colors ${
                flags.heavyWeightTasks
                  ? "bg-emerald-500 text-background"
                  : "bg-red-500 text-background"
              }`}
            >
              {flags.heavyWeightTasks ? "Enabled" : "Shedded"}
            </button>
          </div>

          {/* map LOD Toggle */}
          <div className="flex items-center justify-between p-3 rounded-lg border border-border bg-background">
            <div className="space-y-0.5">
              <span className="text-xs font-semibold block">Map LOD Reduction</span>
              <span className="text-[10px] text-muted-foreground">
                Low-detail map rendering
              </span>
            </div>
            <button
              onClick={() => setFlag("mapLODReduction", !flags.mapLODReduction)}
              className={`rounded-full px-3 py-1 text-[11px] font-bold uppercase transition-colors ${
                flags.mapLODReduction
                  ? "bg-amber-500 text-background"
                  : "bg-muted text-muted-foreground"
              }`}
            >
              {flags.mapLODReduction ? "Active" : "Normal"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

export default GracefulDegradationDashboard;
