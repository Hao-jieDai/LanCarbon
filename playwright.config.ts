import { defineConfig } from "@playwright/test";

export default defineConfig({
  testDir: "./tests/e2e",
  timeout: 180_000,
  workers: 1,
  use: { trace: "retain-on-failure" }
});
