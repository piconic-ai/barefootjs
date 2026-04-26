import { defineConfig, devices } from '@playwright/test'

const port = Number(process.env.PORT) || 4101
const baseURL = `http://localhost:${port}`

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
      use: { ...devices['Desktop Chrome'] },
    },
  ],
  webServer: {
    command: `PORT=${port} bun run server.tsx`,
    url: baseURL,
    reuseExistingServer: !process.env.CI,
    timeout: 30000,
  },
})
