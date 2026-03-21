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

  test('editing light color auto-generates dark counterpart', async ({ page }) => {
    await page.goto('/studio')

    // Open the primary color editor
    await page.locator('[data-studio-color-edit="primary"]').click()

    // Use the R slider (RGB sliders are visible by default, OKLCH sliders are hidden)
    const sliderR = page.locator('[data-studio-slider-r="primary"]')
    await expect(sliderR).toBeVisible()
    await sliderR.fill('128')
    await sliderR.dispatchEvent('input')

    // Read the stored customTokens from localStorage
    const stored = await page.evaluate(() => {
      const raw = localStorage.getItem('barefootjs-studio-tokens')
      return raw ? JSON.parse(raw) : null
    })

    expect(stored).toBeTruthy()
    expect(stored.tokens.primary).toBeTruthy()
    expect(stored.tokens.primary.light).toBeTruthy()
    expect(stored.tokens.primary.dark).toBeTruthy()

    // The dark value should be auto-generated with inverted L.
    // Parse both oklch values and verify they have complementary L values.
    const lightMatch = stored.tokens.primary.light.match(/oklch\(([\d.]+)/)
    const darkMatch = stored.tokens.primary.dark.match(/oklch\(([\d.]+)/)
    expect(lightMatch).toBeTruthy()
    expect(darkMatch).toBeTruthy()

    const lightL = parseFloat(lightMatch![1])
    const darkL = parseFloat(darkMatch![1])
    // L values should roughly sum to 1 (auto-generation inverts L)
    expect(lightL + darkL).toBeCloseTo(1, 1)
  })

  test('manually editing dark mode prevents auto-generation from light', async ({ page }) => {
    await page.goto('/studio')

    // Helper: set slider value and dispatch input event via evaluate
    // (avoids visibility issues with editor toggle)
    async function setSlider(selector: string, value: string) {
      await page.evaluate(({ sel, val }) => {
        const slider = document.querySelector(sel) as HTMLInputElement
        if (slider) {
          slider.value = val
          slider.dispatchEvent(new Event('input', { bubbles: true }))
        }
      }, { sel: selector, val: value })
    }

    // Open primary editor and edit in light mode
    await page.locator('[data-studio-color-edit="primary"]').click()
    await setSlider('[data-studio-slider-r="primary"]', '100')

    // Switch to dark mode
    await page.evaluate(() => document.documentElement.classList.add('dark'))

    // Edit primary in dark mode (manual override)
    // Use evaluate to set slider directly (editor may be in toggled state)
    await setSlider('[data-studio-slider-r="primary"]', '200')

    // Read the manual dark value
    const storedBefore = await page.evaluate(() => {
      const raw = localStorage.getItem('barefootjs-studio-tokens')
      return raw ? JSON.parse(raw) : null
    })
    const darkBefore = storedBefore.tokens.primary.dark

    // Switch back to light mode and edit again
    await page.evaluate(() => document.documentElement.classList.remove('dark'))
    await setSlider('[data-studio-slider-r="primary"]', '50')

    // Dark value should NOT have changed (was manually edited)
    const storedAfter = await page.evaluate(() => {
      const raw = localStorage.getItem('barefootjs-studio-tokens')
      return raw ? JSON.parse(raw) : null
    })
    expect(storedAfter.tokens.primary.dark).toBe(darkBefore)
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

  test('reset clears color swatch previews back to defaults', async ({ page }) => {
    await page.goto('/studio')

    // Get the default background color of the primary swatch
    const swatch = page.locator('[data-studio-color-preview="primary"]')
    const defaultColor = await swatch.evaluate(el => el.style.backgroundColor)

    // Open primary editor and change the color
    await page.locator('[data-studio-color-edit="primary"]').click()
    const sliderR = page.locator('[data-studio-slider-r="primary"]')
    await sliderR.fill('50')
    await sliderR.dispatchEvent('input')

    // Swatch should now have a different inline color
    const customColor = await swatch.evaluate(el => el.style.backgroundColor)
    expect(customColor).not.toBe(defaultColor)

    // Accept the confirm dialog
    page.on('dialog', dialog => dialog.accept())

    // Click "Reset all customizations"
    await page.locator('[data-studio-reset]').click()

    // Swatch should be reset back to CSS variable reference
    const resetColor = await swatch.evaluate(el => el.style.backgroundColor)
    expect(resetColor).toContain('var(--primary)')

    // localStorage should be cleared
    const stored = await page.evaluate(() =>
      localStorage.getItem('barefootjs-studio-tokens')
    )
    expect(stored).toBeNull()
  })
})
