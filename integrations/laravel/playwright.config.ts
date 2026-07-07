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
    baseURL: 'http://localhost:3016',
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
    // Run the test server in production mode (template cache warm, no debug
    // overhead) -- mirrors integrations/blade's rationale for running e2e
    // against a production-shaped server rather than dev mode. `artisan
    // serve` is the same PHP built-in server; PHP_CLI_SERVER_WORKERS gives
    // it a worker pool so the SSE stream doesn't stall other requests.
    command:
      'PHP_CLI_SERVER_WORKERS=8 APP_ENV=production BASE_PATH=/integrations/laravel php artisan serve --host=0.0.0.0 --port=3016',
    url: 'http://localhost:3016/integrations/laravel/',
    reuseExistingServer: !process.env.CI,
    timeout: 30000,
  },
})
