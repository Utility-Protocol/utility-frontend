# Database migration versioning and rollback support

## Architecture

Use `MigrationRunner` for all service-owned schema changes. Each migration has a positive integer `version`, a stable `name`, an `up` function for deploys, and a `down` function for rollback. Runtime state is kept behind a `MigrationStore`, so services can persist the current version and append-only audit history in their own database metadata table, IndexedDB store, or control-plane API.

The runner builds an ordered plan from the current version to the requested target. Forward deployments run `up` migrations in ascending version order. Rollbacks run `down` migrations in descending version order and move the stored version to `version - 1` after each successful step.

## Operational controls

- Critical paths should not run migrations inline with user requests. Execute migrations during deployment or service startup readiness gates so the <100ms P99 target for request handling remains protected.
- Use blue-green deployments by migrating the green environment first, validating health checks, and shifting traffic only after the target version is confirmed.
- Canary analysis should compare migration failure counts, migration duration, request latency, and error rate before expanding traffic.
- Security review should validate every migration for least-privilege database permissions, reversible data handling, and safe treatment of secrets or personally identifiable information.

## Monitoring and alerting

`MigrationRunner` emits `db_migration_duration_ms` on success and `db_migration_failure` on failure when a `recordMetric` callback is supplied. Dashboards should show current schema version, latest migration status, duration by version, and failure counts by service. Alert on any migration failure or on migration duration exceeding the service's deployment SLO.

## Runbook

1. Confirm the currently stored version and the target version.
2. Generate and review the migration plan before execution.
3. Run `migrateTo(targetVersion)` in the green or canary environment.
4. Verify health checks, dashboards, and service logs.
5. If rollback is required, call `rollback(steps)` or `migrateTo(previousVersion)` and keep traffic on the healthy environment until validation passes.
6. Preserve migration history records for audit and incident review.
