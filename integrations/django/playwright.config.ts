import { defineConfig, devices } from '@playwright/test'

export default defineConfig({
  testDir: './e2e',
  timeout: 5000,
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  // Use single worker to avoid conflicts with shared server state (/api/todos/reset)
  workers: process.env.CI ? 1 : undefined,
  reporter: 'html',
  use: {
    baseURL: 'http://localhost:3014',
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
    // Run the test server in production mode (template cache on, no
    // debug/reload overhead) — mirrors integrations/xslate's rationale for
    // running e2e against a production-shaped server rather than dev mode.
    command:
      'PYTHONPATH=./lib BASE_PATH=/integrations/django DJANGO_ENV=production PORT=3014 python3 app.py',
    url: 'http://localhost:3014/integrations/django/',
    reuseExistingServer: !process.env.CI,
    timeout: 30000,
  },
})
