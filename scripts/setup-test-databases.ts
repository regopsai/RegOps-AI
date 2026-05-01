/**
 * Setup script for test databases.
 *
 * Creates test databases if they don't exist and applies Prisma migrations.
 * Refuses to run against production-looking URLs.
 */

import { execSync } from "child_process";
import { config } from "dotenv";
import { resolve } from "path";

config({ path: resolve(process.cwd(), ".env") });

interface ParsedUrl {
  host: string;
  port: string;
  user: string;
  password: string;
  database: string;
}

function parsePostgresUrl(url: string): ParsedUrl {
  const parsed = new URL(url);
  return {
    host: parsed.hostname,
    port: parsed.port || "5432",
    user: parsed.username,
    password: parsed.password,
    database: parsed.pathname.replace(/^\//, "").split("?")[0],
  };
}

function isTestDatabase(url: string): boolean {
  const { database } = parsePostgresUrl(url);
  return database.includes("test") || database.includes("_test");
}

function isProductionLooking(url: string): boolean {
  const lower = url.toLowerCase();
  const db = parsePostgresUrl(url).database;
  if (db === "postgres" || db === "regops_ai") return false; // dev DB is OK
  const productionIndicators = [
    "prod",
    "production",
    "live",
    "staging",
    "eu-west",
    "us-east",
    "amazonaws.com",
    "render.com",
    "supabase.co",
    "neon.tech",
  ];
  return productionIndicators.some((ind) => lower.includes(ind));
}

function guard(url: string, label: string): void {
  if (!isTestDatabase(url)) {
    console.error(`❌ ${label} does not look like a test database: ${parsePostgresUrl(url).database}`);
    console.error("   Database name must contain 'test' or '_test'.");
    process.exit(1);
  }
  if (isProductionLooking(url)) {
    console.error(`❌ ${label} looks like a production database. Refusing to proceed.`);
    process.exit(1);
  }
}

async function databaseExists(adminUrl: string, dbName: string): Promise<boolean> {
  const { Client } = await import("pg");
  const client = new Client({ connectionString: adminUrl });
  try {
    await client.connect();
    const result = await client.query(
      "SELECT 1 FROM pg_database WHERE datname = $1",
      [dbName]
    );
    return result.rowCount !== null && result.rowCount > 0;
  } finally {
    await client.end();
  }
}

async function createDatabase(adminUrl: string, dbName: string): Promise<void> {
  const { Client } = await import("pg");
  const client = new Client({ connectionString: adminUrl });
  try {
    await client.connect();
    await client.query(`CREATE DATABASE "${dbName}"`);
    console.log(`✅ Created database: ${dbName}`);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    if (message.includes("already exists")) {
      console.log(`ℹ️  Database already exists: ${dbName}`);
    } else {
      throw err;
    }
  } finally {
    await client.end();
  }
}

function runMigrateDeploy(databaseUrl: string): void {
  console.log(`🔄 Running prisma migrate deploy...`);
  execSync("pnpm --filter @regops-ai/database db:test:migrate", {
    stdio: "inherit",
    env: { ...process.env, DATABASE_URL: databaseUrl, PRISMA_CLI_QUERY_ENGINE_TYPE: "library" },
  });
}

async function setupTestDb(url: string, label: string, adminUrl: string): Promise<void> {
  guard(url, label);
  const { database } = parsePostgresUrl(url);

  const exists = await databaseExists(adminUrl, database);
  if (!exists) {
    await createDatabase(adminUrl, database);
  } else {
    console.log(`ℹ️  Database already exists: ${database}`);
  }

  runMigrateDeploy(url);
  console.log(`✅ ${label} ready: ${database}`);
}

async function main() {
  const devUrl = process.env.DATABASE_URL;
  const webTestUrl = process.env.WEB_TEST_DATABASE_URL;
  const databaseTestUrl = process.env.DATABASE_TEST_DATABASE_URL;

  if (!devUrl) {
    console.error("❌ DATABASE_URL is not set.");
    process.exit(1);
  }
  if (!webTestUrl) {
    console.error("❌ WEB_TEST_DATABASE_URL is not set.");
    process.exit(1);
  }
  if (!databaseTestUrl) {
    console.error("❌ DATABASE_TEST_DATABASE_URL is not set.");
    process.exit(1);
  }

  // Build admin URL pointing to the 'postgres' maintenance database
  const parsed = parsePostgresUrl(devUrl);
  const adminUrl = `postgresql://${parsed.user}:${parsed.password}@${parsed.host}:${parsed.port}/postgres?schema=public`;

  console.log("🔧 Setting up test databases...\n");

  await setupTestDb(webTestUrl, "WEB_TEST_DATABASE_URL", adminUrl);
  console.log();
  await setupTestDb(databaseTestUrl, "DATABASE_TEST_DATABASE_URL", adminUrl);

  console.log("\n🎉 All test databases are ready.");
}

main().catch((err) => {
  console.error("❌ Setup failed:", err instanceof Error ? err.message : String(err));
  process.exit(1);
});
