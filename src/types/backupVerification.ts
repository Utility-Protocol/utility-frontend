export const BACKUP_VERIFICATION_VERSION = "2026.07";
export const DEFAULT_RESTORE_RTO_MS = 15 * 60 * 1000;
export const DEFAULT_MAX_BACKUP_AGE_MS = 24 * 60 * 60 * 1000;

export type BackupCriticality = "critical" | "standard";
export type BackupVerificationStatus = "pass" | "warn" | "fail";

export interface BackupServiceTarget {
  service: string;
  database: string;
  criticality: BackupCriticality;
  scheduleCron: string;
  backupCreatedAt: number;
  restoreStartedAt: number;
  restoreCompletedAt: number;
  rowChecks: ReadonlyArray<{ table: string; expected: number; actual: number }>;
  checksumMatches: boolean;
  migrationsApplied: boolean;
}

export interface BackupVerificationPolicy {
  maxBackupAgeMs: number;
  restoreRtoMs: number;
  criticalRestoreRtoMs: number;
}

export interface BackupVerificationFinding {
  code:
    | "STALE_BACKUP"
    | "RESTORE_RTO_EXCEEDED"
    | "ROW_COUNT_MISMATCH"
    | "CHECKSUM_MISMATCH"
    | "MIGRATION_REPLAY_FAILED";
  severity: BackupVerificationStatus;
  message: string;
}

export interface BackupVerificationResult {
  service: string;
  database: string;
  status: BackupVerificationStatus;
  restoreDurationMs: number;
  backupAgeMs: number;
  findings: BackupVerificationFinding[];
  metrics: Record<string, number>;
}
