import { describe, expect, it } from "vitest";
import { evaluateBackupRestore, summarizeBackupFleet } from "@/services/backupVerification";
import type { BackupServiceTarget } from "@/types/backupVerification";

const now = Date.UTC(2026, 6, 18, 12, 0, 0);

function target(overrides: Partial<BackupServiceTarget> = {}): BackupServiceTarget {
  return {
    service: "billing",
    database: "ledger",
    criticality: "critical",
    scheduleCron: "0 * * * *",
    backupCreatedAt: now - 60_000,
    restoreStartedAt: now - 30_000,
    restoreCompletedAt: now - 5_000,
    rowChecks: [{ table: "invoices", expected: 1200, actual: 1200 }],
    checksumMatches: true,
    migrationsApplied: true,
    ...overrides,
  };
}

describe("backup restore verification", () => {
  it("passes a fresh backup with a complete restore rehearsal", () => {
    const result = evaluateBackupRestore(target(), now);
    expect(result.status).toBe("pass");
    expect(result.findings).toEqual([]);
    expect(result.metrics.restore_duration_ms).toBe(25_000);
  });

  it("fails stale backups and data integrity mismatches", () => {
    const result = evaluateBackupRestore(
      target({
        backupCreatedAt: now - 48 * 60 * 60 * 1000,
        rowChecks: [{ table: "payments", expected: 9, actual: 8 }],
        checksumMatches: false,
      }),
      now
    );
    expect(result.status).toBe("fail");
    expect(result.findings.map((finding) => finding.code)).toEqual([
      "STALE_BACKUP",
      "ROW_COUNT_MISMATCH",
      "CHECKSUM_MISMATCH",
    ]);
  });

  it("warns when a standard service restore exceeds RTO without integrity loss", () => {
    const result = evaluateBackupRestore(
      target({ criticality: "standard", restoreStartedAt: now - 20 * 60 * 1000 }),
      now
    );
    expect(result.status).toBe("warn");
    expect(result.findings[0]).toMatchObject({ code: "RESTORE_RTO_EXCEEDED", severity: "warn" });
  });

  it("summarizes fleet health for dashboards and alert routing", () => {
    const passing = evaluateBackupRestore(target({ service: "gis" }), now);
    const failing = evaluateBackupRestore(target({ service: "billing", checksumMatches: false }), now);
    expect(summarizeBackupFleet([passing, failing])).toEqual({
      status: "fail",
      total: 2,
      passing: 1,
      warning: 0,
      failing: 1,
      availabilityRiskServices: ["billing/ledger"],
    });
  });
});
