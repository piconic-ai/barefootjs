import { defineConfig, devices } from '@playwright/test'
import { PORT } from './constants.ts'

const BASE_PATH = process.env.BASE_PATH ?? '/integrations/ssg'

export default defineConfig({
  testDir: './e2e',
  timeout: 5000,
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: 0,
  reporter: 'html',
  use: {
    baseURL: `http://localhost:${PORT}${BASE_PATH}`,
    trace: 'on-first-retry',
  },
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
  ],
  webServer: {
    command: 'bun run build && bunx wrangler dev',
    url: `http://localhost:${PORT}${BASE_PATH}/counter`,
    reuseExistingServer: !process.env.CI,
    timeout: 60000,
  },
})
