import { defineConfig, devices } from "@playwright/test";

export default defineConfig({
  testDir: "tests/smoke",
  use: {
    baseURL: "http://127.0.0.1:4173",
  },
  projects: [
    {
      name: "chromium",
      use: { ...devices["Desktop Chrome"] },
    },
  ],
});
