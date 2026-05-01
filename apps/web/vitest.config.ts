import { defineConfig } from "vitest/config";
import { config } from "dotenv";
import { resolve } from "path";

config({ path: resolve(__dirname, "../../.env") });

// Override DATABASE_URL for tests so the web package uses its own isolated test DB.
const testDbUrl = process.env.WEB_TEST_DATABASE_URL;
if (testDbUrl) {
  process.env.DATABASE_URL = testDbUrl;
} else {
  // Fallback: if no dedicated test DB is configured, append _test to the database name
  // so tests never accidentally use the development database.
  const devUrl = process.env.DATABASE_URL;
  if (devUrl && !devUrl.includes("_test")) {
    process.env.DATABASE_URL = devUrl.replace("/regops_ai?", "/regops_ai_test?");
  }
}

export default defineConfig({
  test: {
    globals: true,
    environment: "node",
    include: ["lib/**/*.test.ts", "app/**/*.test.ts"],
  },
  resolve: {
    alias: {
      "@": resolve(__dirname, "."),
    },
  },
});
