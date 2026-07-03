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
    baseURL: 'http://localhost:3011',
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
    // Run the test server in production mode with Puma's threaded pool (the
    // default Max threads is enough — Live/DevReload SSE connections pin a
    // thread, not a whole worker). Production mode drops DevReload entirely
    // (tests don't need hot reload) and exercises the production render path
    // (ERB template cache on). Puma loads config.ru directly.
    command:
      'BASE_PATH=/integrations/rails RAILS_ENV=production bundle exec puma -b tcp://0.0.0.0:3011 -e production config.ru',
    url: 'http://localhost:3011/integrations/rails/',
    reuseExistingServer: !process.env.CI,
    timeout: 30000,
  },
})
