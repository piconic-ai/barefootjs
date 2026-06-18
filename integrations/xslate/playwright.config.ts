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
    baseURL: 'http://localhost:3007',
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
    command: 'BASE_PATH=/integrations/xslate plackup -s Starman --workers 3 -p 3007 app.psgi',
    url: 'http://localhost:3007/integrations/xslate/',
    reuseExistingServer: !process.env.CI,
    timeout: 30000,
  },
})
