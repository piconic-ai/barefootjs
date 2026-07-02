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
    baseURL: 'http://localhost:3008',
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
    // Run the test server in production mode with Puma's threaded pool
    // (the default `Max threads: 5` is enough — unlike the Xslate/Starman
    // example, Puma's dev-reload SSE connections don't pin a whole worker
    // process, only a thread, and production mode drops DevReload entirely
    // (tests don't need hot reload) and exercises the production render path
    // (ERB template cache on).
    command:
      'BASE_PATH=/integrations/sinatra RACK_ENV=production bundle exec rackup -s puma -p 3008 -o 0.0.0.0 config.ru',
    url: 'http://localhost:3008/integrations/sinatra/',
    reuseExistingServer: !process.env.CI,
    timeout: 30000,
  },
})
