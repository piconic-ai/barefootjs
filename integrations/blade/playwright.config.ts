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
    baseURL: 'http://localhost:3015',
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
    // dev-reload overhead) -- mirrors integrations/flask's rationale for
    // running e2e against a production-shaped server rather than dev mode.
    command:
      'PHP_CLI_SERVER_WORKERS=8 APP_ENV=production BASE_PATH=/integrations/blade PORT=3015 php -S 0.0.0.0:3015 index.php',
    url: 'http://localhost:3015/integrations/blade/',
    reuseExistingServer: !process.env.CI,
    timeout: 30000,
  },
})
