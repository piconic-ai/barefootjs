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
    baseURL: 'http://localhost:3012',
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
    // templates are parsed once at startup) — mirrors integrations/flask's
    // rationale for running e2e against a production-shaped server rather
    // than dev mode.
    command: 'BASE_PATH=/integrations/axum PORT=3012 cargo run',
    // axum 0.8 doesn't redirect a trailing slash to the bare nest prefix by
    // default (verified: only the bare form matches the nested "/" route),
    // so the health-check URL must be the bare form too.
    url: 'http://localhost:3012/integrations/axum',
    reuseExistingServer: !process.env.CI,
    timeout: 60000,
  },
})
