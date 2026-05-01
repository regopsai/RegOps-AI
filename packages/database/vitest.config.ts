import { defineConfig } from "vitest/config";
import { config } from "dotenv";

config({ path: "../../.env" });

// Override DATABASE_URL for tests so the database package uses its own isolated test DB.
const testDbUrl = process.env.DATABASE_TEST_DATABASE_URL;
if (testDbUrl) {
  process.env.DATABASE_URL = testDbUrl;
} else {
  const devUrl = process.env.DATABASE_URL;
  if (devUrl && !devUrl.includes("_test")) {
    process.env.DATABASE_URL = devUrl.replace("/regops_ai?", "/regops_ai_test?");
  }
}

export default defineConfig({
  test: {
    globals: true,
    environment: "node",
    include: ["src/**/*.test.ts"],
    setupFiles: [],
  },
});
