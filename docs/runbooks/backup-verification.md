# Scheduled Database Backup Verification with Restore Testing

## Architecture

Every service publishes its database backup metadata to the verification runner after each scheduled backup. The runner restores the artifact into an isolated sandbox, replays migrations, validates row-count sentinels, and compares the restored checksum to the backup manifest before any backup is marked usable.

## Monitoring and alerting

Emit the metrics produced by `evaluateBackupRestore` for every service/database pair:

- `backup_age_ms`
- `restore_duration_ms`
- `row_checks_total`
- `findings_total`

Page the owning service when a critical database returns `fail`, when `backup_age_ms` breaches the 24 hour policy, or when restore testing has not reported for two consecutive schedules. Route `warn` states to the platform operations channel for triage during business hours.

## Deployment

Deploy verification changes with blue-green infrastructure. Send 10% of service backup manifests to the green runner for the first canary window, compare pass/fail ratios and restore duration P99 against blue, then promote when no regression is observed.

## Restore drill runbook

1. Select the latest successful backup manifest for the service/database pair.
2. Restore into the isolated verification sandbox with production network egress disabled.
3. Replay migrations and seed required secrets from the recovery vault.
4. Run row-count sentinels and checksum comparison.
5. Record the result in the dashboard and attach findings to the incident if any check fails.
