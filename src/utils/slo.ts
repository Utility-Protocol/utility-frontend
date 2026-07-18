export type SloWindow = "5m" | "30m" | "1h" | "6h" | "24h";

export interface SloObjective {
  id: string;
  name: string;
  target: number;
  latencyP99TargetMs: number;
  window: SloWindow;
}

export interface SloMeasurement {
  objectiveId: string;
  goodEvents: number;
  totalEvents: number;
  latencyP99Ms: number;
  window: SloWindow;
}

export interface BurnRateThreshold {
  severity: "page" | "ticket" | "watch";
  shortWindow: SloWindow;
  longWindow: SloWindow;
  multiplier: number;
}

export interface BurnRateAlert {
  objectiveId: string;
  severity: BurnRateThreshold["severity"];
  burnRate: number;
  errorBudgetRemaining: number;
  message: string;
}

export const DEFAULT_SLO_OBJECTIVES: SloObjective[] = [
  {
    id: "critical-path-latency",
    name: "Critical path latency",
    target: 0.9999,
    latencyP99TargetMs: 100,
    window: "30m",
  },
  {
    id: "system-availability",
    name: "System availability",
    target: 0.9999,
    latencyP99TargetMs: 100,
    window: "24h",
  },
];

export const DEFAULT_BURN_RATE_THRESHOLDS: BurnRateThreshold[] = [
  { severity: "page", shortWindow: "5m", longWindow: "1h", multiplier: 14.4 },
  { severity: "ticket", shortWindow: "30m", longWindow: "6h", multiplier: 6 },
  { severity: "watch", shortWindow: "1h", longWindow: "24h", multiplier: 3 },
];

export function calculateCompliance({ goodEvents, totalEvents }: Pick<SloMeasurement, "goodEvents" | "totalEvents">): number {
  if (totalEvents <= 0) return 1;
  return Math.max(0, Math.min(1, goodEvents / totalEvents));
}

export function calculateErrorBudgetRemaining(objective: SloObjective, measurement: SloMeasurement): number {
  const allowedErrorRatio = 1 - objective.target;
  if (allowedErrorRatio <= 0) return 0;
  const actualErrorRatio = 1 - calculateCompliance(measurement);
  return Math.max(0, Math.min(1, 1 - actualErrorRatio / allowedErrorRatio));
}

export function calculateBurnRate(objective: SloObjective, measurement: SloMeasurement): number {
  const allowedErrorRatio = 1 - objective.target;
  if (allowedErrorRatio <= 0) return Number.POSITIVE_INFINITY;
  const actualErrorRatio = 1 - calculateCompliance(measurement);
  return actualErrorRatio / allowedErrorRatio;
}

export function evaluateBurnRateAlerts(
  objectives: SloObjective[],
  measurements: SloMeasurement[],
  thresholds: BurnRateThreshold[] = DEFAULT_BURN_RATE_THRESHOLDS
): BurnRateAlert[] {
  return objectives.flatMap((objective) => {
    const objectiveMeasurements = measurements.filter((m) => m.objectiveId === objective.id);
    return thresholds.flatMap((threshold) => {
      const short = objectiveMeasurements.find((m) => m.window === threshold.shortWindow);
      const long = objectiveMeasurements.find((m) => m.window === threshold.longWindow);
      if (!short || !long) return [];

      const shortBurnRate = calculateBurnRate(objective, short);
      const longBurnRate = calculateBurnRate(objective, long);
      const burnRate = Math.max(shortBurnRate, longBurnRate);
      const latencyBreached = short.latencyP99Ms > objective.latencyP99TargetMs || long.latencyP99Ms > objective.latencyP99TargetMs;

      if (burnRate < threshold.multiplier && !latencyBreached) return [];

      return [
        {
          objectiveId: objective.id,
          severity: threshold.severity,
          burnRate,
          errorBudgetRemaining: Math.min(
            calculateErrorBudgetRemaining(objective, short),
            calculateErrorBudgetRemaining(objective, long)
          ),
          message: `${objective.name} ${threshold.severity} alert: ${burnRate.toFixed(1)}x burn rate`,
        },
      ];
    });
  });
}
