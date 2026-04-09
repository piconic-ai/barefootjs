import { test, expect } from '@playwright/test'

test.describe('Pricing Block', () => {
  test.beforeEach(async ({ page }) => {
    page.on('pageerror', error => {
      console.log('Page error:', error.message)
    })
    await page.goto('/components/pricing')
  })

  const section = (page: any) =>
    page.locator('[bf-s^="PricingDemo_"]:not([data-slot])').first()

  test.describe('Rendering', () => {
    test('renders billing toggle', async ({ page }) => {
      const s = section(page)
      await expect(s.locator('.billing-toggle')).toBeVisible()
      await expect(s.locator('.billing-label').first()).toContainText('Monthly')
    })

    test('renders all 3 pricing cards', async ({ page }) => {
      const s = section(page)
      await expect(s.locator('.pricing-card')).toHaveCount(3)
    })

    test('renders Most Popular badge on Pro card', async ({ page }) => {
      const s = section(page)
      await expect(s.locator('.popular-badge')).toBeVisible()
    })

    test('renders feature comparison table', async ({ page }) => {
      const s = section(page)
      await expect(s.locator('.feature-row')).toHaveCount(12)
    })
  })

  test.describe('Billing Toggle', () => {
    test('defaults to monthly', async ({ page }) => {
      const s = section(page)
      // Save badge should not be visible
      await expect(s.locator('.savings-badge')).not.toBeVisible()
    })

    test('switching to annual shows Save badge', async ({ page }) => {
      const s = section(page)
      await s.locator('[data-slot="switch"]').click()
      await expect(s.locator('.savings-badge')).toBeVisible()
      await expect(s.locator('.savings-badge')).toContainText('Save 20%')
    })

    test('switching back to monthly hides Save badge', async ({ page }) => {
      const s = section(page)
      await s.locator('[data-slot="switch"]').click()
      await expect(s.locator('.savings-badge')).toBeVisible()
      await s.locator('[data-slot="switch"]').click()
      await expect(s.locator('.savings-badge')).not.toBeVisible()
    })
  })

  test.describe('Price Display', () => {
    test('Free plan shows $0 regardless of toggle', async ({ page }) => {
      const s = section(page)
      const freeCard = s.locator('.pricing-card').first()
      await expect(freeCard.locator('.price-amount')).toContainText('$0')

      await s.locator('[data-slot="switch"]').click()
      await expect(freeCard.locator('.price-amount')).toContainText('$0')
    })

    test('Pro card shows monthly price initially', async ({ page }) => {
      const s = section(page)
      const proCard = s.locator('.pricing-card').nth(1)
      await expect(proCard.locator('.price-amount')).toContainText('20')
      await expect(proCard.locator('.price-period')).toContainText('/month')
    })

    test('Pro card shows annual price after toggle', async ({ page }) => {
      const s = section(page)
      await s.locator('[data-slot="switch"]').click()
      const proCard = s.locator('.pricing-card').nth(1)
      await expect(proCard.locator('.price-amount')).toContainText('16')
      await expect(proCard.locator('.price-period')).toContainText('billed annually')
    })

    // TODO: signal-dependent conditional in component loop children not reactive
    test('annual mode shows original price strikethrough', async ({ page }) => {
      const s = section(page)
      await s.locator('[data-slot="switch"]').click()
      const proCard = s.locator('.pricing-card').nth(1)
      await expect(proCard.locator('.original-price')).toBeVisible()
      await expect(proCard.locator('.original-price')).toContainText('20/mo')
    })
  })

  test.describe('Signal-driven Classes', () => {
    test('Monthly label highlighted when monthly selected', async ({ page }) => {
      const s = section(page)
      const monthlyLabel = s.locator('.billing-label').first()
      await expect(monthlyLabel).toHaveClass(/text-foreground/)
    })

    test('Annual label highlighted when annual selected', async ({ page }) => {
      const s = section(page)
      await s.locator('[data-slot="switch"]').click()
      const annualLabel = s.locator('.billing-label').nth(1)
      await expect(annualLabel).toHaveClass(/text-foreground/)
    })
  })

  test.describe('Feature List', () => {
    test('each card shows feature highlights', async ({ page }) => {
      const s = section(page)
      const proCard = s.locator('.pricing-card').nth(1)
      const features = proCard.locator('.feature-list li')
      await expect(features).toHaveCount(6)
    })
  })

  test.describe('Feature Comparison', () => {
    test('boolean features show check or dash', async ({ page }) => {
      const s = section(page)
      // Custom domains: free=false, pro=true
      const customDomainsRow = s.locator('.feature-row:has-text("Custom domains")')
      const cells = customDomainsRow.locator('td')
      await expect(cells.nth(1)).toContainText('—') // free
      await expect(cells.nth(2)).toContainText('✓') // pro
    })

    test('string features show value text', async ({ page }) => {
      const s = section(page)
      const storageRow = s.locator('.feature-row:has-text("Storage")')
      const cells = storageRow.locator('td')
      await expect(cells.nth(1)).toContainText('1GB')
      await expect(cells.nth(2)).toContainText('100GB')
    })
  })

  test.describe('CTA Interaction', () => {
    test('clicking CTA shows selected feedback', async ({ page }) => {
      const s = section(page)
      await s.locator('.cta-button').nth(1).click() // Pro
      await expect(s.locator('.selected-feedback')).toBeVisible()
      await expect(s.locator('.selected-plan-name')).toContainText('pro')
    })

    test('selected feedback reflects billing mode', async ({ page }) => {
      const s = section(page)
      await s.locator('.cta-button').nth(1).click()
      await expect(s.locator('.selected-feedback')).toContainText('billed monthly')

      await s.locator('[data-slot="switch"]').click()
      await expect(s.locator('.selected-feedback')).toContainText('billed annually')
    })
  })
})
