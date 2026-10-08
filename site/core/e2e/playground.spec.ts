/**
 * E2E coverage for the playground.
 *
 * The playground compiles the editor buffer inside a browser Worker that
 * bundles the whole compiler, so a Node-only global reached on the compile
 * path (e.g. `process`) is invisible to the unit suite and only shows up
 * here, as "Build failed" on first load. The preview iframe then mounts the
 * compiled component with the standalone runtime, which this test exercises
 * by clicking the Counter's +1 button.
 */

import { test, expect } from '@playwright/test'

test.describe('playground', () => {
  // Monaco loads from a CDN and the compiler worker is a multi-MB bundle;
  // give first load more headroom than the config default.
  test.setTimeout(60_000)

  test('compiles the default Counter in the browser and the preview is interactive', async ({ page }) => {
    await page.goto('/playground')

    const status = page.locator('#pg-status')
    await expect(status).toHaveText(/Preview up to date/, { timeout: 45_000 })
    await expect(page.locator('#pg-error')).toBeHidden()

    const preview = page.frameLocator('#pg-preview')
    await expect(preview.locator('#playground-error')).toBeHidden()
    await expect(preview.locator('p')).toHaveText('Count: 0')
    await preview.getByRole('button', { name: '+1' }).click()
    await expect(preview.locator('p')).toHaveText('Count: 1')
  })
})
