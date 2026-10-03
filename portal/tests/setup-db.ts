// Global setup for integration tests: a throwaway SQLite file, never the dev database.
import { execSync } from "node:child_process";
import { rmSync } from "node:fs";
import path from "node:path";

export default function setup() {
  const file = path.resolve(__dirname, "../prisma/test.db");
  for (const f of [file, `${file}-journal`]) rmSync(f, { force: true });
  execSync("npx prisma db push --skip-generate", {
    cwd: path.resolve(__dirname, ".."),
    env: { ...process.env, DATABASE_URL: "file:./test.db" },
    stdio: "ignore",
  });
}
