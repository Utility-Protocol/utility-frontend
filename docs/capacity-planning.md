# Capacity Planning with Historical Usage Trending

## Architecture

The capacity planner is a pure TypeScript module that consumes historical meter readings, aggregates them into fixed-width windows, calculates positive historical growth, and projects future utilization for water, energy, and bandwidth resources. It depends on the existing exact BigInt aggregation pipeline, so planning totals remain deterministic and avoid cumulative floating-point drift.

## Operational targets

- Critical-path planning is O(readings + resources × windows) and performs no network I/O, which keeps it suitable for sub-100 ms dashboard or worker execution on bounded history windows.
- The module is side-effect free except for the `generatedAt` timestamp, making it safe to run during blue-green deploys and canary comparisons.
- Capacity limits are passed in explicitly to keep authorization and secret access outside the planning core.

## Monitoring and alerts

Export these derived values per resource:

- `capacity_projected_utilization_ratio`
- `capacity_trend_per_window_base_units`
- `capacity_exhausted_at_window`
- `capacity_status{status="healthy|watch|critical"}`

Alert when projected utilization is at least 80% (`watch`) and page when it is at least 95% (`critical`) or already exhausted.

## Runbook

1. Compare current and projected utilization across the active and canary environments.
2. Validate that meter-ingestion lag is within its SLO before trusting a capacity deficit.
3. Increase provisioned capacity to at least `recommendedCapacityBase` for the affected resource.
4. Keep the canary below 25% traffic until projected utilization returns below 80% for two consecutive planning windows.
5. Roll back the canary if the planner reports divergent status from the active environment for the same historical window.
