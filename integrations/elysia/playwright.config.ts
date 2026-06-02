import { defineConfig, devices } from '@playwright/test'

export default defineConfig({
  testDir: './e2e',
  timeout: 5000,
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  // Single worker: the todo demo shares server-side per-session state and
  // resets it via /api/todos/reset before each test.
  workers: process.env.CI ? 1 : undefined,
  reporter: 'html',
  use: {
    baseURL: 'http://localhost:3005/integrations/elysia',
    trace: 'on-first-retry',
  },
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
  ],
  webServer: {
    command: 'bun run build && bun run start',
    url: 'http://localhost:3005/integrations/elysia',
    reuseExistingServer: !process.env.CI,
    timeout: 30000,
  },
})
