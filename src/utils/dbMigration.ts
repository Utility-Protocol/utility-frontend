export type MigrationDirection = "up" | "down";

export interface MigrationContext {
  recordMetric?: (name: string, value: number, tags?: Record<string, string>) => void;
  logger?: Pick<Console, "info" | "warn" | "error">;
}

export interface DatabaseMigration {
  version: number;
  name: string;
  up: (context: MigrationContext) => Promise<void> | void;
  down: (context: MigrationContext) => Promise<void> | void;
}

export interface MigrationRecord {
  version: number;
  name: string;
  direction: MigrationDirection;
  status: "applied" | "rolled_back";
  startedAt: number;
  finishedAt: number;
  durationMs: number;
}

export interface MigrationStore {
  getCurrentVersion(): Promise<number> | number;
  setCurrentVersion(version: number): Promise<void> | void;
  appendHistory(record: MigrationRecord): Promise<void> | void;
}

export interface MigrationPlanStep {
  migration: DatabaseMigration;
  direction: MigrationDirection;
}

export class InMemoryMigrationStore implements MigrationStore {
  private version: number;
  readonly history: MigrationRecord[] = [];

  constructor(initialVersion = 0) {
    this.version = initialVersion;
  }

  getCurrentVersion(): number {
    return this.version;
  }

  setCurrentVersion(version: number): void {
    this.version = version;
  }

  appendHistory(record: MigrationRecord): void {
    this.history.push(record);
  }
}

export class MigrationError extends Error {
  constructor(message: string, readonly version: number, readonly direction: MigrationDirection) {
    super(message);
    this.name = "MigrationError";
  }
}

export function createMigrationPlan(
  migrations: readonly DatabaseMigration[],
  currentVersion: number,
  targetVersion: number
): MigrationPlanStep[] {
  const registry = normalizeMigrations(migrations);
  if (currentVersion === targetVersion) return [];

  if (targetVersion > currentVersion) {
    return Array.from(registry.values())
      .filter((migration) => migration.version > currentVersion && migration.version <= targetVersion)
      .map((migration) => ({ migration, direction: "up" as const }));
  }

  return Array.from(registry.values())
    .filter((migration) => migration.version > targetVersion && migration.version <= currentVersion)
    .sort((a, b) => b.version - a.version)
    .map((migration) => ({ migration, direction: "down" as const }));
}

export class MigrationRunner {
  private readonly migrations: readonly DatabaseMigration[];
  private readonly store: MigrationStore;
  private readonly context: MigrationContext;

  constructor(options: {
    migrations: readonly DatabaseMigration[];
    store: MigrationStore;
    context?: MigrationContext;
  }) {
    this.migrations = options.migrations;
    this.store = options.store;
    this.context = options.context ?? {};
    normalizeMigrations(this.migrations);
  }

  async migrateTo(targetVersion: number): Promise<MigrationRecord[]> {
    const currentVersion = await this.store.getCurrentVersion();
    const plan = createMigrationPlan(this.migrations, currentVersion, targetVersion);
    const records: MigrationRecord[] = [];

    for (const step of plan) {
      records.push(await this.runStep(step));
    }

    return records;
  }

  async rollback(steps = 1): Promise<MigrationRecord[]> {
    if (!Number.isInteger(steps) || steps < 1) {
      throw new RangeError("Rollback steps must be a positive integer.");
    }

    const currentVersion = await this.store.getCurrentVersion();
    const targetVersion = Math.max(0, currentVersion - steps);
    return this.migrateTo(targetVersion);
  }

  private async runStep({ migration, direction }: MigrationPlanStep): Promise<MigrationRecord> {
    const startedAt = Date.now();
    this.context.logger?.info?.(`[migration] ${direction} ${migration.version} ${migration.name}`);

    try {
      await migration[direction](this.context);
    } catch (error) {
      this.context.logger?.error?.(error);
      this.context.recordMetric?.("db_migration_failure", 1, {
        direction,
        version: String(migration.version),
      });
      throw new MigrationError(
        `Failed to run ${direction} migration ${migration.version}: ${migration.name}`,
        migration.version,
        direction
      );
    }

    const finishedAt = Date.now();
    const nextVersion = direction === "up" ? migration.version : migration.version - 1;
    await this.store.setCurrentVersion(nextVersion);

    const record: MigrationRecord = {
      version: migration.version,
      name: migration.name,
      direction,
      status: direction === "up" ? "applied" : "rolled_back",
      startedAt,
      finishedAt,
      durationMs: finishedAt - startedAt,
    };
    await this.store.appendHistory(record);
    this.context.recordMetric?.("db_migration_duration_ms", record.durationMs, {
      direction,
      version: String(migration.version),
    });
    return record;
  }
}

function normalizeMigrations(migrations: readonly DatabaseMigration[]): Map<number, DatabaseMigration> {
  const sorted = [...migrations].sort((a, b) => a.version - b.version);
  const registry = new Map<number, DatabaseMigration>();

  for (const migration of sorted) {
    if (!Number.isInteger(migration.version) || migration.version < 1) {
      throw new RangeError("Migration versions must be positive integers.");
    }
    if (registry.has(migration.version)) {
      throw new RangeError(`Duplicate migration version: ${migration.version}.`);
    }
    registry.set(migration.version, migration);
  }

  return registry;
}
