import { test, expect } from '@playwright/test'

const navRoutes = [
  { path: '/gallery/saas', key: 'landing', title: null },
  { path: '/gallery/saas/pricing', key: 'pricing', title: null },
  { path: '/gallery/saas/blog', key: 'blog', title: null },
  { path: '/gallery/saas/login', key: 'login', title: null },
] as const

test.describe('Gallery: SaaS Marketing app', () => {
  test.describe('Layout', () => {
    test('each route renders the saas shell with the correct active nav item', async ({ page }) => {
      for (const route of navRoutes) {
        await page.goto(route.path)
        await expect(page.locator('[data-saas-header]')).toBeVisible()

        const active = page.locator(`[data-saas-nav-item="${route.key}"]`)
        await expect(active).toHaveAttribute('data-active', 'true')
        await expect(active).toHaveAttribute('aria-current', 'page')
      }
    })

    test('inactive nav items are marked data-active=false', async ({ page }) => {
      await page.goto('/gallery/saas')

      // Landing is active; pricing, blog should be inactive
      await expect(page.locator('[data-saas-nav-item="pricing"]')).toHaveAttribute('data-active', 'false')
      await expect(page.locator('[data-saas-nav-item="blog"]')).toHaveAttribute('data-active', 'false')
      await expect(page.locator('[data-saas-nav-item="login"]')).toHaveAttribute('data-active', 'false')
    })

    test('gallery meta link is outside the saas shell', async ({ page }) => {
      await page.goto('/gallery/saas')
      const githubLinks = page.locator('a[href*="components/gallery/saas"]')
      await expect(githubLinks).toHaveCount(1)
      const insideShell = await page
        .locator('.saas-shell a[href*="components/gallery/saas"]')
        .count()
      expect(insideShell).toBe(0)
    })
  })

  test.describe('Navigation', () => {
    test('navigates between all routes via the top nav', async ({ page }) => {
      await page.goto('/gallery/saas')

      // To pricing
      await page.locator('[data-saas-nav] [data-saas-nav-item="pricing"]').click()
      await page.waitForURL('**/gallery/saas/pricing')
      await expect(page).toHaveURL(/\/gallery\/saas\/pricing$/)
      await expect(page.locator('[data-saas-nav-item="pricing"]')).toHaveAttribute('data-active', 'true')

      // To blog
      await page.locator('[data-saas-nav] [data-saas-nav-item="blog"]').click()
      await page.waitForURL('**/gallery/saas/blog')
      await expect(page).toHaveURL(/\/gallery\/saas\/blog$/)

      // To login via CTA
      await page.locator('[data-saas-nav-item="login"]').first().click()
      await page.waitForURL('**/gallery/saas/login')
      await expect(page).toHaveURL(/\/gallery\/saas\/login$/)

      // Back to landing via logo (direct child of header, not inside nav)
      await page.locator('[data-saas-header] > a[href="/gallery/saas"]').click()
      await page.waitForURL('**/gallery/saas')
      await expect(page).toHaveURL(/\/gallery\/saas$/)
    })
  })

  test.describe('Landing page', () => {
    test('renders hero with CTA links', async ({ page }) => {
      await page.goto('/gallery/saas')
      await expect(page.locator('.saas-hero')).toBeVisible()
      await expect(page.locator('.saas-hero-title')).toBeVisible()
      await expect(page.locator('.saas-cta-primary')).toBeVisible()
      await expect(page.locator('.saas-features')).toBeVisible()
      await expect(page.locator('.saas-testimonials')).toBeVisible()
    })
  })

  test.describe('Pricing page', () => {
    test('renders three plan cards', async ({ page }) => {
      await page.goto('/gallery/saas/pricing')
      await expect(page.locator('.saas-plan-card')).toHaveCount(3)
    })

    test('billing toggle switches price display', async ({ page }) => {
      await page.goto('/gallery/saas/pricing')

      // Default is monthly — no savings badge
      await expect(page.locator('.savings-badge')).toHaveCount(0)

      // Toggle to annual
      await page.locator('.saas-billing-toggle [role="switch"]').click()
      await expect(page.locator('.savings-badge')).toBeVisible()
      await expect(page.locator('.savings-badge')).toContainText('20%')

      // Pro plan original price strikethrough should appear
      await expect(page.locator('.saas-original-price')).toHaveCount(2) // pro + enterprise
    })

    test('selecting a plan navigates to login', async ({ page }) => {
      await page.goto('/gallery/saas/pricing')

      // Click the Pro plan CTA
      await page.locator('.saas-plan-card [data-plan="pro"]').click()
      await page.waitForURL('**/gallery/saas/login')
      await expect(page).toHaveURL(/\/gallery\/saas\/login$/)
    })
  })

  test.describe('Cross-page state', () => {
    test('billing cycle persists from pricing to login', async ({ page }) => {
      await page.goto('/gallery/saas/pricing')

      // Switch to annual
      await page.locator('.saas-billing-toggle [role="switch"]').click()
      await expect(page.locator('.savings-badge')).toBeVisible()

      // Navigate to login
      await page.locator('[data-saas-nav-item="login"]').first().click()
      await page.waitForURL('**/gallery/saas/login')

      // Monthly/annual state was written to sessionStorage — navigate back and verify it persists
      await page.goto('/gallery/saas/pricing')
      await expect(page.locator('.savings-badge')).toBeVisible()
    })

    test('selected plan is shown as banner on login page', async ({ page }) => {
      await page.goto('/gallery/saas/pricing')

      // Select Pro
      await page.locator('.saas-plan-card [data-plan="pro"]').click()
      await page.waitForURL('**/gallery/saas/login')

      // Banner should show the selected plan
      await expect(page.locator('.saas-plan-banner')).toBeVisible()
      await expect(page.locator('.saas-plan-banner')).toContainText('Pro')
    })
  })

  test.describe('Blog', () => {
    test('blog index lists all posts', async ({ page }) => {
      await page.goto('/gallery/saas/blog')
      await expect(page.locator('.saas-blog-card')).toHaveCount(4)
    })

    test('clicking a post link navigates to the post page', async ({ page }) => {
      await page.goto('/gallery/saas/blog')

      const firstLink = page.locator('.saas-blog-read-more').first()
      const href = await firstLink.getAttribute('href')
      await firstLink.click()
      await page.waitForURL(`**${href}`)

      await expect(page.locator('.saas-blog-post')).toBeVisible()
      await expect(page.locator('.saas-post-title')).toBeVisible()
    })

    test('blog post back link returns to blog index', async ({ page }) => {
      await page.goto('/gallery/saas/blog/edge-deployments-explained')

      await page.locator('.saas-blog-back').click()
      await page.waitForURL('**/gallery/saas/blog')
      await expect(page).toHaveURL(/\/gallery\/saas\/blog$/)
    })

    test('invalid post slug shows 404 state', async ({ page }) => {
      await page.goto('/gallery/saas/blog/does-not-exist')
      await expect(page.locator('.saas-blog-post-notfound')).toBeVisible()
    })

    test('blog post page has active blog nav item', async ({ page }) => {
      await page.goto('/gallery/saas/blog/edge-deployments-explained')
      await expect(page.locator('[data-saas-nav-item="blog"]')).toHaveAttribute('data-active', 'true')
    })
  })

  test.describe('Login page', () => {
    test('submit button is disabled when form is empty', async ({ page }) => {
      await page.goto('/gallery/saas/login')
      await expect(page.locator('.saas-submit')).toBeDisabled()
    })

    test('shows validation errors on blur', async ({ page }) => {
      await page.goto('/gallery/saas/login')

      await page.locator('#saas-email').click()
      await page.locator('#saas-email').blur()
      await expect(page.locator('#saas-email')).toHaveAttribute('aria-invalid', 'true')

      await page.locator('#saas-password').click()
      await page.locator('#saas-password').blur()
      await expect(page.locator('#saas-password')).toHaveAttribute('aria-invalid', 'true')
    })

    test('submit succeeds with valid credentials', async ({ page }) => {
      await page.goto('/gallery/saas/login')

      await page.locator('#saas-email').fill('test@example.com')
      await page.locator('#saas-password').fill('password123')

      await expect(page.locator('.saas-submit')).toBeEnabled()
      await page.locator('.saas-submit').click()

      // Loading state
      await expect(page.locator('.button-text')).toContainText('Creating account')

      // Success toast
      await expect(page.locator('[role="status"]')).toBeVisible({ timeout: 5000 })
    })
  })
})
