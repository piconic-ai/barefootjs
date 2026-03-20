import { test, expect } from '@playwright/test'

test.describe('Studio Export & URL', () => {
  test.beforeEach(async ({ page }) => {
    // Clear localStorage to start fresh
    await page.addInitScript(() => {
      localStorage.removeItem('barefootjs-studio-tokens')
    })
  })

  test('export bar shows a valid barefoot init --from command', async ({ page }) => {
    await page.goto('/studio')
    const codeEl = page.locator('[data-studio-export-code]')
    await expect(codeEl).toBeVisible()
    const text = await codeEl.textContent()
    expect(text).toContain('barefoot init --from')
    expect(text).toContain('/studio')
  })

  test('changing preset updates the export URL', async ({ page }) => {
    await page.goto('/studio')
    const codeEl = page.locator('[data-studio-export-code]')

    // Get initial command text
    const initialText = await codeEl.textContent()

    // Open style dropdown and select Sharp
    await page.locator('[data-studio-style-trigger]').click()
    await page.locator('[data-studio-preset="Sharp"]').click()

    // Export command should update and contain ?c= with encoded config
    const updatedText = await codeEl.textContent()
    expect(updatedText).not.toBe(initialText)
    expect(updatedText).toContain('?c=')
  })

  test('visiting /studio?c=<encoded> applies tokens from URL', async ({ page }) => {
    // Encode a Sharp preset config
    const config = { style: 'Sharp', radius: '0' }
    const encoded = encodeURIComponent(btoa(JSON.stringify(config)))

    await page.goto(`/studio?c=${encoded}`)

    // The style label should show "Sharp"
    const styleLabel = page.locator('[data-studio-style-label]')
    await expect(styleLabel).toHaveText('Sharp')

    // The radius label should show "0"
    const radiusLabel = page.locator('[data-studio-radius-label]')
    await expect(radiusLabel).toHaveText('0')
  })

  test('copy button shows "Copied!" feedback', async ({ page, context }) => {
    // Grant clipboard permissions
    await context.grantPermissions(['clipboard-read', 'clipboard-write'])
    await page.goto('/studio')

    const copyLabel = page.locator('[data-studio-copy-label]')
    await expect(copyLabel).toHaveText('Copy')

    // Click copy button
    await page.locator('[data-studio-copy]').click()

    // Should show "Copied!" feedback
    await expect(copyLabel).toHaveText('Copied!')

    // Should revert back to "Copy" after a delay
    await expect(copyLabel).toHaveText('Copy', { timeout: 5000 })
  })

  test('exported command contains decodable ?c= payload after customization', async ({ page }) => {
    await page.goto('/studio')

    // Select a preset to create a non-empty config
    await page.locator('[data-studio-style-trigger]').click()
    await page.locator('[data-studio-preset="Soft"]').click()

    const codeEl = page.locator('[data-studio-export-code]')
    const text = await codeEl.textContent()

    // Extract the ?c= value from the command
    const match = text?.match(/\?c=([^"]+)/)
    expect(match).toBeTruthy()

    // Decode and verify it's valid JSON
    const decoded = JSON.parse(atob(decodeURIComponent(match![1])))
    expect(decoded.style).toBe('Soft')
  })

  test('round-trip: encode config → visit URL → values match', async ({ page }) => {
    const config = {
      style: 'Compact',
      spacing: '0.2rem',
      font: 'inter',
    }
    const encoded = encodeURIComponent(btoa(JSON.stringify(config)))

    await page.goto(`/studio?c=${encoded}`)

    // Verify style is applied
    const styleLabel = page.locator('[data-studio-style-label]')
    await expect(styleLabel).toHaveText('Compact')

    // Verify the export command re-encodes the same config
    const codeEl = page.locator('[data-studio-export-code]')
    const text = await codeEl.textContent()
    const cMatch = text?.match(/\?c=([^"]+)/)
    expect(cMatch).toBeTruthy()

    const decoded = JSON.parse(atob(decodeURIComponent(cMatch![1])))
    expect(decoded.style).toBe('Compact')
  })
})
