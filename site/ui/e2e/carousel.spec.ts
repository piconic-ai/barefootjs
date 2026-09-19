import { test, expect, type Locator } from '@playwright/test'

/**
 * Click Next until embla answers it.
 *
 * The carousel bakes the Previous button's first-slide `disabled` state into
 * SSR, so `toBeDisabled()` passes before embla's dynamic import has resolved
 * and wired the click handlers; a single click landing in that window is a
 * no-op and Previous stays disabled. Retrying the click until Previous
 * enables proves the navigation without depending on load timing.
 */
async function clickNextUntilEmblaReady(nextBtn: Locator, prevBtn: Locator) {
  await expect(async () => {
    await nextBtn.click()
    await expect(prevBtn).not.toBeDisabled({ timeout: 500 })
  }).toPass({ timeout: 10_000 })
}

test.describe('Carousel Reference Page', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/components/carousel')
  })

  test('renders page header', async ({ page }) => {
    await expect(page.locator('h1')).toContainText('Carousel')
  })

  test.describe('Playground', () => {
    test('renders carousel with region role', async ({ page }) => {
      const carousel = page.locator('[data-slot="carousel"]').first()

      await expect(carousel).toBeVisible()
      await expect(carousel).toHaveAttribute('role', 'region')
      await expect(carousel).toHaveAttribute('aria-roledescription', 'carousel')
    })

    test('renders carousel items with slide role', async ({ page }) => {
      const items = page.locator('[data-slot="carousel"]').first().locator('[data-slot="carousel-item"]')

      await expect(items.first()).toHaveAttribute('role', 'group')
      await expect(items.first()).toHaveAttribute('aria-roledescription', 'slide')
    })

    test('has prev and next buttons', async ({ page }) => {
      const carousel = page.locator('[data-slot="carousel"]').first()
      const prevBtn = carousel.locator('[data-slot="carousel-previous"]')
      const nextBtn = carousel.locator('[data-slot="carousel-next"]')

      await expect(prevBtn).toBeVisible()
      await expect(nextBtn).toBeVisible()
    })

    test('embla initializes without errors', async ({ page }) => {
      const errors: string[] = []
      page.on('pageerror', (err) => errors.push(err.message))
      page.on('console', (msg) => {
        if (msg.type() === 'error') errors.push(msg.text())
      })

      await page.goto('/components/carousel')

      const carousel = page.locator('[data-slot="carousel"]').first()
      const prevBtn = carousel.locator('[data-slot="carousel-previous"]')

      // Embla initialization sets button disabled states.
      // Previous button should become disabled (at first slide) once embla loads.
      await expect(prevBtn).toBeDisabled({ timeout: 5000 })

      // No fetch errors (e.g. 404 for embla-carousel.esm.js)
      const emblaErrors = errors.filter(e => /embla|Failed to fetch/i.test(e))
      expect(emblaErrors).toHaveLength(0)
    })

    test('clicking next navigates to next slide', async ({ page }) => {
      const carousel = page.locator('[data-slot="carousel"]').first()
      const prevBtn = carousel.locator('[data-slot="carousel-previous"]')
      const nextBtn = carousel.locator('[data-slot="carousel-next"]')

      // Previous is disabled at the first slide (baked into SSR, kept by embla)
      await expect(prevBtn).toBeDisabled({ timeout: 5000 })

      // Navigating to the next slide enables Previous
      await clickNextUntilEmblaReady(nextBtn, prevBtn)
    })
  })

  test.describe('Sizes Example', () => {
    test('renders items with basis-1/3 class', async ({ page }) => {
      // Sizes demo carousel has items with basis-1/3
      const sizesSection = page.locator('#sizes').locator('..')
      const carousel = sizesSection.locator('[data-slot="carousel"]')
      const items = carousel.locator('[data-slot="carousel-item"]')

      await expect(items.first()).toHaveClass(/basis-1\/3/)
    })
  })

  test.describe('Orientation Example', () => {
    test('vertical carousel has correct orientation', async ({ page }) => {
      // Scope to CarouselOrientationDemo to avoid the Playground's hidden vertical carousel
      const demo = page.locator('[bf-s^="CarouselOrientationDemo_"][bf-r]')
      const verticalCarousel = demo.locator('[data-slot="carousel"][data-orientation="vertical"]')

      await expect(verticalCarousel).toBeVisible()
    })

    test('vertical carousel content uses flex-col', async ({ page }) => {
      const demo = page.locator('[bf-s^="CarouselOrientationDemo_"][bf-r]')
      const verticalCarousel = demo.locator('[data-slot="carousel"][data-orientation="vertical"]')
      const content = verticalCarousel.locator('[data-slot="carousel-content"]')

      await expect(content).toHaveClass(/flex-col/)
    })

    test('clicking next in vertical carousel navigates', async ({ page }) => {
      const demo = page.locator('[bf-s^="CarouselOrientationDemo_"][bf-r]')
      const verticalCarousel = demo.locator('[data-slot="carousel"][data-orientation="vertical"]')
      const nextBtn = verticalCarousel.locator('[data-slot="carousel-next"]')
      const prevBtn = verticalCarousel.locator('[data-slot="carousel-previous"]')

      // Previous is disabled at the first slide (baked into SSR, kept by embla)
      await expect(prevBtn).toBeDisabled({ timeout: 5000 })

      // Navigating to the next slide enables Previous
      await clickNextUntilEmblaReady(nextBtn, prevBtn)
    })
  })

  test('renders API reference section', async ({ page }) => {
    await expect(page.locator('#api-reference')).toBeVisible()
  })
})
