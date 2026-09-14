import { defineConfig, devices } from '@playwright/test'

export default defineConfig({
  testDir: './e2e',
  timeout: 5000,
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  // Single worker to avoid conflicts with shared server state (/api/todos/reset)
  workers: process.env.CI ? 1 : undefined,
  reporter: 'html',
  use: {
    baseURL: 'http://localhost:3017',
    trace: 'on-first-retry',
    launchOptions: { executablePath: process.env.PW_EXECUTABLE_PATH || undefined },
  },
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
  ],
  webServer: {
    // Run the test server in production mode (no APP_ENV=development, so
    // templates are parsed once at startup) — mirrors integrations/axum's
    // rationale for running e2e against a production-shaped server rather
    // than dev mode.
    command: 'BASE_PATH=/integrations/spring PORT=3017 gradle bootRun',
    url: 'http://localhost:3017/integrations/spring',
    reuseExistingServer: !process.env.CI,
    timeout: 120000,
  },
})
