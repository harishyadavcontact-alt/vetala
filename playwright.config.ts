import { defineConfig } from "@playwright/test";

export default defineConfig({
  testDir: "./tests/e2e",
  timeout: 45_000,
  use: {
    baseURL: "http://127.0.0.1:4173",
    trace: "retain-on-failure",
  },
  webServer: {
    command: "npx tsx src/server.ts",
    url: "http://127.0.0.1:4173/health",
    env: {
      ...process.env,
      PORT: "4173",
    },
    reuseExistingServer: !process.env.CI,
    timeout: 60_000,
  },
});
