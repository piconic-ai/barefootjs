/**
 * Shared Chromium launch options for every benchmark runner/smoke script.
 *
 * - In the managed dev environment, a Chromium build is pre-provisioned at
 *   PLAYWRIGHT_BROWSERS_PATH (`/opt/pw-browsers`) whose revision may not
 *   match what the installed @playwright/test expects — so we point at its
 *   version-agnostic `chromium` symlink directly.
 * - In CI (after `bunx playwright install chromium`) or on a dev machine
 *   with a normal Playwright install, that path doesn't exist and we let
 *   Playwright resolve its own browser.
 * - The three flags unlock frame production so a double-rAF fence measures
 *   actual work rather than vsync pacing: without them the bare fence has a
 *   ~33ms floor (2 × 60Hz frames); with them it is <1ms (verified by
 *   `benchmarks/runner/fence-floor-check.ts`).
 */
import { existsSync } from 'node:fs'
import { join } from 'node:path'

export const CHROMIUM_BENCH_ARGS = [
  '--disable-gpu-vsync',
  '--disable-frame-rate-limit',
  '--run-all-compositor-stages-before-draw',
]

export function chromiumLaunchOptions(): {
  headless: boolean
  executablePath?: string
  args: string[]
} {
  const browsersPath = process.env.PLAYWRIGHT_BROWSERS_PATH ?? '/opt/pw-browsers'
  const preinstalled = join(browsersPath, 'chromium')
  return {
    headless: true,
    ...(existsSync(preinstalled) ? { executablePath: preinstalled } : {}),
    args: CHROMIUM_BENCH_ARGS,
  }
}
