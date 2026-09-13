import { createHash } from "node:crypto";
import { readFile, readdir } from "node:fs/promises";
import { resolve } from "node:path";
import { DatabaseSync } from "node:sqlite";
import { pathToFileURL } from "node:url";

export const MIGRATION_TABLE_SQL = `
  CREATE TABLE IF NOT EXISTS schema_migrations (
    migration_id TEXT PRIMARY KEY NOT NULL,
    checksum TEXT NOT NULL,
    applied_at INTEGER NOT NULL,
    runner_version INTEGER NOT NULL CHECK (runner_version >= 1)
  )
`;

export function splitMigrationStatements(sql) {
  return sql
    .split("--> statement-breakpoint")
    .map((statement) => statement.trim())
    .filter(Boolean);
}

export async function loadMigrationPlan(root = process.cwd()) {
  const migrationDirectory = resolve(root, "drizzle");
  const checksumPath = resolve(migrationDirectory, "migration-checksums.json");
  const expectedChecksums = JSON.parse(await readFile(checksumPath, "utf8"));
  const names = (await readdir(migrationDirectory))
    .filter((name) => /^\d{4}_[a-z0-9_]+\.sql$/.test(name))
    .sort();
  if (names.length === 0) throw new Error("No ordered data migrations were found.");
  names.forEach((name, index) => {
    if (Number(name.slice(0, 4)) !== index) throw new Error(`Migration order is not contiguous at ${name}.`);
  });
  const plan = [];
  for (const name of names) {
    const sql = await readFile(resolve(migrationDirectory, name), "utf8");
    const checksum = createHash("sha256").update(sql).digest("hex");
    if (expectedChecksums[name] !== checksum) throw new Error(`Migration checksum mismatch for ${name}.`);
    plan.push({ id: name.slice(0, -4), name, checksum, statements: splitMigrationStatements(sql) });
  }
  const unreferenced = Object.keys(expectedChecksums).filter((name) => !names.includes(name));
  if (unreferenced.length > 0) throw new Error(`Checksum manifest references missing migrations: ${unreferenced.join(", ")}`);
  return Object.freeze(plan);
}

export function applyMigrationPlan(database, plan, options = {}) {
  database.exec("PRAGMA foreign_keys = ON");
  database.exec(MIGRATION_TABLE_SQL);
  const appliedRows = database.prepare("SELECT migration_id, checksum FROM schema_migrations ORDER BY migration_id").all();
  const applied = new Map(appliedRows.map((row) => [row.migration_id, row.checksum]));
  const pending = [];
  for (const migration of plan) {
    const existing = applied.get(migration.id);
    if (existing && existing !== migration.checksum) throw new Error(`Applied migration checksum differs for ${migration.id}.`);
    if (!existing) pending.push(migration);
  }
  if (options.dryRun) return Object.freeze({ applied: [], pending: pending.map((migration) => migration.id), dryRun: true });
  const appliedNow = [];
  for (const migration of pending) {
    database.exec("BEGIN IMMEDIATE");
    try {
      for (const statement of migration.statements) database.exec(statement);
      database.prepare("INSERT INTO schema_migrations (migration_id, checksum, applied_at, runner_version) VALUES (?, ?, ?, 1)")
        .run(migration.id, migration.checksum, options.now ?? Date.now());
      database.exec("COMMIT");
      appliedNow.push(migration.id);
    } catch (error) {
      database.exec("ROLLBACK");
      throw error;
    }
  }
  database.exec("PRAGMA optimize");
  return Object.freeze({ applied: appliedNow, pending: [], dryRun: false });
}

export function createIsolatedDatabase() {
  return new DatabaseSync(":memory:", { enableForeignKeyConstraints: true });
}

async function main() {
  const dryRun = process.argv.includes("--dry-run");
  if (!dryRun && !process.argv.includes("--isolated")) {
    throw new Error("Refusing to run without --isolated or --dry-run. This runner never targets a remote or production database.");
  }
  const database = createIsolatedDatabase();
  try {
    const plan = await loadMigrationPlan();
    const result = applyMigrationPlan(database, plan, { dryRun });
    process.stdout.write(`${JSON.stringify({ storage: "isolated-memory-sqlite", ...result })}\n`);
  } finally {
    database.close();
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  main().catch((error) => {
    process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
    process.exitCode = 1;
  });
}
