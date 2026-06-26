"use client";

import { useMemo } from "react";
import {
  useSchedule,
  selectJobs,
  scheduleStore,
} from "@/store/slices/scheduleSlice";
import { getTimerWheel } from "@/services/timerWheel";
import type { JobStatus } from "@/types/scheduler";

/**
 * Admin view of all scheduled Soroban executions: next fire time, interval,
 * status, missed-fire count and a cancel action.
 *
 * (The blueprint names `src/pages/SchedulerDashboard.tsx`, but this project uses
 * the App Router, so it ships as a component to avoid creating a conflicting
 * Pages Router directory.)
 */

const STATUS_STYLE: Record<JobStatus, string> = {
  scheduled: "bg-blue-500/10 text-blue-600",
  firing: "bg-amber-500/10 text-amber-600",
  done: "bg-green-500/10 text-green-600",
  cancelled: "bg-muted text-muted-foreground",
};

function formatTime(ms: number): string {
  return new Date(ms).toLocaleTimeString();
}

function formatInterval(ms: number | null): string {
  if (!ms) return "once";
  if (ms % 86_400_000 === 0) return `${ms / 86_400_000}d`;
  if (ms % 3_600_000 === 0) return `${ms / 3_600_000}h`;
  if (ms % 60_000 === 0) return `${ms / 60_000}m`;
  return `${Math.round(ms / 1000)}s`;
}

export interface SchedulerDashboardProps {
  className?: string;
}

export function SchedulerDashboard({ className }: SchedulerDashboardProps) {
  const state = useSchedule();
  const jobs = useMemo(() => selectJobs(state), [state]);

  const handleCancel = (id: string) => {
    getTimerWheel().cancel(id);
    scheduleStore.dispatch({ type: "JOB_CANCELLED", payload: { id } });
  };

  return (
    <div className={`rounded-xl border border-border bg-background ${className ?? ""}`}>
      <div className="flex items-center justify-between border-b border-border px-4 py-3">
        <h3 className="text-lg font-semibold">Scheduled Executions</h3>
        <span className="text-sm text-muted-foreground">
          {jobs.length} job{jobs.length === 1 ? "" : "s"}
        </span>
      </div>

      {jobs.length === 0 ? (
        <p className="px-4 py-8 text-center text-sm text-muted-foreground">
          No scheduled jobs.
        </p>
      ) : (
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-border text-left text-xs uppercase tracking-wide text-muted-foreground">
              <th className="px-4 py-2 font-medium">Job</th>
              <th className="px-4 py-2 font-medium">Next fire</th>
              <th className="px-4 py-2 font-medium">Interval</th>
              <th className="px-4 py-2 font-medium">Status</th>
              <th className="px-4 py-2 font-medium">Missed</th>
              <th className="px-4 py-2" />
            </tr>
          </thead>
          <tbody>
            {jobs.map((job) => (
              <tr key={job.id} className="border-b border-border/50 last:border-0">
                <td className="px-4 py-2 font-medium">{job.name}</td>
                <td className="px-4 py-2 tabular-nums text-muted-foreground">
                  {formatTime(job.nextFire)}
                </td>
                <td className="px-4 py-2 text-muted-foreground">
                  {formatInterval(job.intervalMs)}
                </td>
                <td className="px-4 py-2">
                  <span
                    className={`rounded-full px-2 py-0.5 text-xs font-medium ${STATUS_STYLE[job.status]}`}
                  >
                    {job.status}
                  </span>
                </td>
                <td className="px-4 py-2 tabular-nums">
                  {job.missedCount > 0 ? (
                    <span className="text-red-500">{job.missedCount}</span>
                  ) : (
                    "0"
                  )}
                </td>
                <td className="px-4 py-2 text-right">
                  {job.status === "scheduled" && (
                    <button
                      onClick={() => handleCancel(job.id)}
                      className="rounded-md border border-border px-2.5 py-1 text-xs font-medium hover:bg-accent transition-colors"
                    >
                      Cancel
                    </button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}

export default SchedulerDashboard;
