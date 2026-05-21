import { defineConfig, devices } from '@playwright/test'

// `PLAYWRIGHT_CHROMIUM_EXECUTABLE` lets sandboxed envs (web sessions
// without bundle download access) point at a preinstalled Chromium binary.
const executablePath = process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE || undefined

export default defineConfig({
  testDir: './e2e',
  // The `.playwright.ts` suffix exists to opt _out_ of `bun test`'s
  // automatic `*.spec.ts` / `*.test.ts` discovery — `bun test
  // packages/adapter-tests` runs in CI alongside this Playwright suite,
  // and the two runners share the default `.spec.ts` extension.
  testMatch: '**/*.playwright.ts',
  timeout: 10_000,
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: 0,
  reporter: 'list',
  use: { trace: 'on-first-retry' },
  projects: [
    {
      name: 'chromium',
      use: {
        ...devices['Desktop Chrome'],
        ...(executablePath ? { launchOptions: { executablePath } } : {}),
      },
    },
  ],
})
