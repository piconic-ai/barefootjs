import { test, expect } from '@playwright/test'

/**
 * E2E coverage for the landing-page Hero diagram's adapter Tooltips.
 * Verifies the click-only / single-open / outside-click behaviour wired
 * up in `landing/components/hero.tsx` + the local click-variant Tooltip
 * at `components/ui/tooltip.tsx`.
 */
test.describe('Hero adapter tooltips', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/')
  })

  test('hover does not open the tooltip (click-only affordance)', async ({ page }) => {
    const honoCard = page.locator('.flow-adapter-tab[data-adapter="hono"]')
    const honoTooltip = honoCard.locator('xpath=ancestor::*[@data-slot="tooltip"][1]')
      .locator('[data-slot="tooltip-content"]')

    await expect(honoTooltip).toHaveAttribute('data-state', 'closed')
    await honoCard.hover()
    // Give any latent listener time to fire.
    await page.waitForTimeout(150)
    await expect(honoTooltip).toHaveAttribute('data-state', 'closed')
  })

  test('clicking an adapter opens its tooltip with the compiled template', async ({ page }) => {
    const honoCard = page.locator('.flow-adapter-tab[data-adapter="hono"]')
    const honoWrapper = honoCard.locator('xpath=ancestor::*[@data-slot="tooltip"][1]')
    const honoTooltip = honoWrapper.locator('[data-slot="tooltip-content"]')

    await honoCard.click()
    await expect(honoTooltip).toHaveAttribute('data-state', 'open')
    // Hono adapter's compiled output marker.
    await expect(honoTooltip).toContainText('// Hono JSX Template')
  })

  test('opening one tooltip closes any other (single-open invariant)', async ({ page }) => {
    const honoCard = page.locator('.flow-adapter-tab[data-adapter="hono"]')
    const echoCard = page.locator('.flow-adapter-tab[data-adapter="echo"]')
    const honoTooltip = honoCard.locator('xpath=ancestor::*[@data-slot="tooltip"][1]')
      .locator('[data-slot="tooltip-content"]')
    const echoTooltip = echoCard.locator('xpath=ancestor::*[@data-slot="tooltip"][1]')
      .locator('[data-slot="tooltip-content"]')

    await honoCard.click()
    await expect(honoTooltip).toHaveAttribute('data-state', 'open')

    await echoCard.click()
    await expect(echoTooltip).toHaveAttribute('data-state', 'open')
    await expect(honoTooltip).toHaveAttribute('data-state', 'closed')
  })

  test('clicking outside any tooltip closes the open one', async ({ page }) => {
    const honoCard = page.locator('.flow-adapter-tab[data-adapter="hono"]')
    const honoTooltip = honoCard.locator('xpath=ancestor::*[@data-slot="tooltip"][1]')
      .locator('[data-slot="tooltip-content"]')

    await honoCard.click()
    await expect(honoTooltip).toHaveAttribute('data-state', 'open')

    // Click the page heading (clearly outside any tooltip wrapper).
    await page.locator('.hero-b-heading').click()
    await expect(honoTooltip).toHaveAttribute('data-state', 'closed')
  })

  test('clicking the same adapter twice toggles the tooltip closed', async ({ page }) => {
    const honoCard = page.locator('.flow-adapter-tab[data-adapter="hono"]')
    const honoTooltip = honoCard.locator('xpath=ancestor::*[@data-slot="tooltip"][1]')
      .locator('[data-slot="tooltip-content"]')

    await honoCard.click()
    await expect(honoTooltip).toHaveAttribute('data-state', 'open')

    await honoCard.click()
    await expect(honoTooltip).toHaveAttribute('data-state', 'closed')
  })
})
