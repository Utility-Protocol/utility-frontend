import {
  BACKUP_VERIFICATION_VERSION,
  DEFAULT_MAX_BACKUP_AGE_MS,
  DEFAULT_RESTORE_RTO_MS,
  type BackupServiceTarget,
  type BackupVerificationFinding,
  type BackupVerificationPolicy,
  type BackupVerificationResult,
  type BackupVerificationStatus,
} from "@/types/backupVerification";

const DEFAULT_POLICY: BackupVerificationPolicy = {
  maxBackupAgeMs: DEFAULT_MAX_BACKUP_AGE_MS,
  restoreRtoMs: DEFAULT_RESTORE_RTO_MS,
  criticalRestoreRtoMs: 5 * 60 * 1000,
};

function worstStatus(findings: BackupVerificationFinding[]): BackupVerificationStatus {
  if (findings.some((finding) => finding.severity === "fail")) return "fail";
  if (findings.some((finding) => finding.severity === "warn")) return "warn";
  return "pass";
}

export function evaluateBackupRestore(
  target: BackupServiceTarget,
  observedAt: number,
  policy: Partial<BackupVerificationPolicy> = {}
): BackupVerificationResult {
  const effectivePolicy = { ...DEFAULT_POLICY, ...policy };
  const restoreDurationMs = Math.max(
    0,
    target.restoreCompletedAt - target.restoreStartedAt
  );
  const backupAgeMs = Math.max(0, observedAt - target.backupCreatedAt);
  const restoreBudgetMs =
    target.criticality === "critical"
      ? effectivePolicy.criticalRestoreRtoMs
      : effectivePolicy.restoreRtoMs;
  const findings: BackupVerificationFinding[] = [];

  if (backupAgeMs > effectivePolicy.maxBackupAgeMs) {
    findings.push({
      code: "STALE_BACKUP",
      severity: "fail",
      message: `${target.service}/${target.database} latest backup is older than policy`,
    });
  }

  if (restoreDurationMs > restoreBudgetMs) {
    findings.push({
      code: "RESTORE_RTO_EXCEEDED",
      severity: target.criticality === "critical" ? "fail" : "warn",
      message: `${target.service}/${target.database} restore exceeded ${restoreBudgetMs}ms RTO`,
    });
  }

  for (const check of target.rowChecks) {
    if (check.expected !== check.actual) {
      findings.push({
        code: "ROW_COUNT_MISMATCH",
        severity: "fail",
        message: `${check.table} expected ${check.expected} rows but restored ${check.actual}`,
      });
    }
  }

  if (!target.checksumMatches) {
    findings.push({
      code: "CHECKSUM_MISMATCH",
      severity: "fail",
      message: "Restored checksum does not match the backup manifest",
    });
  }

  if (!target.migrationsApplied) {
    findings.push({
      code: "MIGRATION_REPLAY_FAILED",
      severity: "fail",
      message: "Migration replay failed in the restore sandbox",
    });
  }

  return {
    service: target.service,
    database: target.database,
    status: worstStatus(findings),
    restoreDurationMs,
    backupAgeMs,
    findings,
    metrics: {
      backup_verification_version: Number(
        BACKUP_VERIFICATION_VERSION.replace(".", "")
      ),
      backup_age_ms: backupAgeMs,
      restore_duration_ms: restoreDurationMs,
      row_checks_total: target.rowChecks.length,
      findings_total: findings.length,
    },
  };
}

export function summarizeBackupFleet(results: BackupVerificationResult[]): {
  status: BackupVerificationStatus;
  total: number;
  passing: number;
  warning: number;
  failing: number;
  availabilityRiskServices: string[];
} {
  const failing = results.filter((result) => result.status === "fail");
  const warning = results.filter((result) => result.status === "warn");
  return {
    status: failing.length > 0 ? "fail" : warning.length > 0 ? "warn" : "pass",
    total: results.length,
    passing: results.filter((result) => result.status === "pass").length,
    warning: warning.length,
    failing: failing.length,
    availabilityRiskServices: failing.map(
      (result) => `${result.service}/${result.database}`
    ),
  };
}
