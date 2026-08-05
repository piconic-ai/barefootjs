import { defineConfig, devices } from '@playwright/test'

export default defineConfig({
  testDir: './e2e',
  timeout: 5000,
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: 0,
  // Use single worker to avoid conflicts with shared server state (/api/todos/reset)
  workers: process.env.CI ? 1 : undefined,
  reporter: 'html',
  use: {
    baseURL: 'http://localhost:3002',
    trace: 'on-first-retry',
  },
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
  ],
  webServer: {
    // `bun run build`, not `bun run build.ts` — there has never been a
    // `build.ts` in this directory, so this command could only ever have
    // worked when a server was already listening on 3002 and
    // `reuseExistingServer` skipped it. Nothing caught that: unlike the
    // other integrations, csr has no e2e job in `.github/workflows`.
    command: 'bun run build && bun run server.ts',
    url: 'http://localhost:3002',
    reuseExistingServer: !process.env.CI,
    // 30s, matching every other integration whose command builds first. The
    // old 15s only ever had to cover `server.ts` starting, because the build
    // half of the command failed instantly on a missing file. A cold
    // `vite build` here measures ~17s.
    timeout: 30000,
  },
})
