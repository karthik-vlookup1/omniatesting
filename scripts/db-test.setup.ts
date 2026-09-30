/**
 * Vitest globalSetup for the "int" project: one fresh, fully migrated test database per run.
 * Must agree with the DATABASE_URL vitest.config.ts gives the int project.
 */
import { resetDatabase, runMigrations } from '../server/src/db/migrate.js';

export default async function setup(): Promise<void> {
  const databaseUrl =
    process.env.TEST_DATABASE_URL ?? 'postgres://omnia:omnia_local_dev@localhost:5432/omnia_test';
  await resetDatabase(databaseUrl);
  await runMigrations(databaseUrl);
}
