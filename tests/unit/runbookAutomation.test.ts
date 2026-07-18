import { describe, expect, it, vi } from "vitest";
import {
  buildIncidentKey,
  createPagerDutyEvent,
  createRunbookPlan,
  triggerPagerDutyIncident,
  type IncidentSignal,
} from "@/services/incident/runbookAutomation";

const signal: IncidentSignal = {
  id: "inc-132",
  service: "telemetry-ingest",
  summary: "Telemetry ingest p99 exceeded target",
  severity: "critical",
  metric: "latency.p99",
  value: 142,
  threshold: 100,
  occurredAt: "2026-07-18T00:00:00.000Z",
};

describe("runbook automation", () => {
  it("creates stable incident keys for PagerDuty deduplication", () => {
    expect(buildIncidentKey(signal)).toBe("telemetry-ingest:latency.p99:critical");
    expect(buildIncidentKey({ ...signal, dedupeKey: "custom-key" })).toBe("custom-key");
  });

  it("builds a blue-green runbook plan with critical path targets", () => {
    const plan = createRunbookPlan(signal, "routing-key");

    expect(plan.deployment.strategy).toBe("blue-green");
    expect(plan.deployment.canaryPercentage).toBe(10);
    expect(plan.deployment.rollbackOnSloBreach).toBe(true);
    expect(plan.securityReviewRequired).toBe(true);
    expect(plan.targets.p99LatencyMs).toBe(100);
    expect(plan.targets.availability).toBe("99.99%");
    expect(plan.steps.every((step) => step.timeoutMs <= 45_000)).toBe(true);
    expect(plan.monitors).toContain("telemetry-ingest.pagerduty.events");
  });

  it("maps incidents into PagerDuty Events API payloads", () => {
    const plan = createRunbookPlan(signal, "routing-key");
    const event = createPagerDutyEvent(signal, plan, "https://runbooks.example/incidents");

    expect(event.routing_key).toBe("routing-key");
    expect(event.event_action).toBe("trigger");
    expect(event.dedup_key).toBe(plan.incidentKey);
    expect(event.payload.severity).toBe("critical");
    expect(event.payload.custom_details).toMatchObject({
      planId: plan.planId,
      p99LatencyTargetMs: 100,
      availabilityTarget: "99.99%",
    });
  });

  it("posts PagerDuty events without exposing credentials in the payload", async () => {
    const fetcher = vi.fn().mockResolvedValue({ ok: true, status: 202 });
    const plan = createRunbookPlan(signal, "routing-key");
    const event = createPagerDutyEvent(signal, plan, "https://runbooks.example/incidents");

    const result = await triggerPagerDutyIncident("https://events.pagerduty.test/v2/enqueue", event, fetcher as unknown as typeof fetch);

    expect(result).toEqual({ ok: true, status: 202 });
    expect(fetcher).toHaveBeenCalledWith(
      "https://events.pagerduty.test/v2/enqueue",
      expect.objectContaining({
        method: "POST",
        headers: { "Content-Type": "application/json" },
      })
    );
    expect(JSON.stringify(fetcher.mock.calls[0][1])).not.toContain("secret");
  });
});
