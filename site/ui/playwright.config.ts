import { defineConfig, devices } from '@playwright/test'

const port = Number(process.env.PORT) || 3002
const baseURL = `http://localhost:${port}`
const executablePath = process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE || undefined

export default defineConfig({
  testDir: './e2e',
  timeout: 15000,
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: 0,
  workers: process.env.CI ? '100%' : undefined,
  reporter: 'html',
  use: {
    baseURL,
    trace: 'on-first-retry',
  },
  projects: [
    {
      name: 'chromium',
      use: {
        ...devices['Desktop Chrome'],
        ...(executablePath ? { launchOptions: { executablePath } } : {}),
      },
    },
  ],
  webServer: {
    command: `bun run server.tsx`,
    url: baseURL,
    reuseExistingServer: !process.env.CI,
    timeout: 10000,
  },
})
