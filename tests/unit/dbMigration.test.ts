import { describe, expect, it, vi } from "vitest";
import {
  createMigrationPlan,
  InMemoryMigrationStore,
  MigrationError,
  MigrationRunner,
  type DatabaseMigration,
} from "@/utils/dbMigration";

function migration(version: number, calls: string[]): DatabaseMigration {
  return {
    version,
    name: `migration-${version}`,
    up: () => {
      calls.push(`up:${version}`);
    },
    down: () => {
      calls.push(`down:${version}`);
    },
  };
}

describe("database migration versioning", () => {
  it("plans forward migrations in ascending version order", () => {
    const calls: string[] = [];
    const plan = createMigrationPlan([migration(3, calls), migration(1, calls), migration(2, calls)], 1, 3);

    expect(plan.map((step) => `${step.direction}:${step.migration.version}`)).toEqual(["up:2", "up:3"]);
  });

  it("plans rollback migrations in descending version order", () => {
    const calls: string[] = [];
    const plan = createMigrationPlan([migration(1, calls), migration(2, calls), migration(3, calls)], 3, 1);

    expect(plan.map((step) => `${step.direction}:${step.migration.version}`)).toEqual(["down:3", "down:2"]);
  });

  it("applies migrations, persists version state, and emits metrics", async () => {
    const calls: string[] = [];
    const recordMetric = vi.fn();
    const store = new InMemoryMigrationStore();
    const runner = new MigrationRunner({
      migrations: [migration(1, calls), migration(2, calls)],
      store,
      context: { recordMetric },
    });

    const records = await runner.migrateTo(2);

    expect(calls).toEqual(["up:1", "up:2"]);
    expect(store.getCurrentVersion()).toBe(2);
    expect(records.map((record) => record.status)).toEqual(["applied", "applied"]);
    expect(recordMetric).toHaveBeenCalledWith(
      "db_migration_duration_ms",
      expect.any(Number),
      expect.objectContaining({ direction: "up", version: "1" })
    );
  });

  it("rolls back the requested number of versions", async () => {
    const calls: string[] = [];
    const store = new InMemoryMigrationStore(3);
    const runner = new MigrationRunner({
      migrations: [migration(1, calls), migration(2, calls), migration(3, calls)],
      store,
    });

    const records = await runner.rollback(2);

    expect(calls).toEqual(["down:3", "down:2"]);
    expect(store.getCurrentVersion()).toBe(1);
    expect(records.map((record) => record.status)).toEqual(["rolled_back", "rolled_back"]);
  });

  it("stops and preserves the current version when a migration fails", async () => {
    const store = new InMemoryMigrationStore(1);
    const recordMetric = vi.fn();
    const runner = new MigrationRunner({
      migrations: [
        migration(1, []),
        {
          version: 2,
          name: "broken",
          up: () => {
            throw new Error("boom");
          },
          down: () => undefined,
        },
      ],
      store,
      context: { recordMetric },
    });

    await expect(runner.migrateTo(2)).rejects.toBeInstanceOf(MigrationError);
    expect(store.getCurrentVersion()).toBe(1);
    expect(recordMetric).toHaveBeenCalledWith(
      "db_migration_failure",
      1,
      expect.objectContaining({ direction: "up", version: "2" })
    );
  });
});
