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
  // The E2E suite runs against what is deployed: the static site in dist/
  // (`bun run build` first), served by Workers Assets' own local
  // implementation — html_handling, _redirects and _headers included — not
  // by the dynamic dev server (server.tsx).
  webServer: {
    command: `bunx wrangler dev --port ${port} --show-interactive-dev-session=false`,
    url: baseURL,
    reuseExistingServer: !process.env.CI,
    timeout: 60000,
    env: { WRANGLER_SEND_METRICS: 'false' },
  },
})
