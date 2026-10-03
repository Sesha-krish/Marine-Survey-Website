import { defineConfig } from "vitest/config";
import path from "node:path";

export default defineConfig({
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "src"),
      // "server-only" throws outside the React server runtime; it's a no-op in tests.
      "server-only": path.resolve(__dirname, "tests/empty.ts"),
    },
  },
  test: {
    include: ["tests/**/*.test.ts"],
    environment: "node",
    globalSetup: ["tests/setup-db.ts"],
    env: {
      DATABASE_URL: "file:./test.db",
      SESSION_SECRET: "test-secret-0123456789abcdef0123456789abcdef",
      FILE_SIGNING_SECRET: "test-file-secret-0123456789abcdef",
      STORAGE_DIR: "./storage-test",
    },
    fileParallelism: false,
    testTimeout: 30000,
  },
});
