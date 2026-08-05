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
    baseURL: 'http://localhost:8080',
    trace: 'on-first-retry',
  },
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
  ],
  webServer: {
    // `-tags production`: this runs with APP_ENV unset (production shape —
    // template cache on), and the untagged default now compiles the DEV
    // asset map (`bf_assets.go`, `//go:build !production`, localhost URLs).
    // Without the tag the blog's router-entry `<script>` would 404 against
    // a Vite dev server nobody started. `bun run build` (a prerequisite of
    // this suite, see the CI workflow / package.json `test:e2e`) already
    // wrote the matching `bf_assets_prod.go`.
    command: 'BASE_PATH=/integrations/echo go run -tags production .',
    url: 'http://localhost:8080/integrations/echo',
    reuseExistingServer: !process.env.CI,
    timeout: 30000,
  },
})
