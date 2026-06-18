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
    // Run the test server in production mode with a larger Starman worker pool.
    // In dev mode every page that emits the DevReload snippet opens a persistent
    // SSE connection that pins one Starman prefork worker for the page's
    // lifetime; a full sequential run starves the pool and the server stops
    // responding (`net::ERR_ABORTED`). Production mode drops DevReload entirely
    // (tests don't need hot reload) and exercises the production render path
    // (template cache on); the wider pool absorbs the SSE/streaming endpoints
    // (DevReload, the AI-chat stream) without starving. Mojolicious is immune to
    // this because its daemon is a single-process event loop.
    command:
      'BASE_PATH=/integrations/xslate PLACK_ENV=production plackup -s Starman --workers 10 -p 3007 app.psgi',
    url: 'http://localhost:3007/integrations/xslate/',
    reuseExistingServer: !process.env.CI,
    timeout: 30000,
  },
})
