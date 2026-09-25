import { test, expect, type Page } from '@playwright/test'

// The On This Page nav follows the reader: the active item is bold and the
// green marker sits on its row, whether it got there by a click or a scroll.
// On site/ui a TOC target is either a whole <section> or an <h3> inside one.

const ITEM_HEIGHT = 28

async function expectActive(page: Page, id: string) {
  const toc = page.locator('nav[aria-label="Table of contents"]')
  const index = await toc.locator('a').evaluateAll(
    (links, href) => links.findIndex((a) => a.getAttribute('href') === href),
    `#${id}`,
  )
  expect(index).toBeGreaterThanOrEqual(0)
  await expect(toc.locator(`a[href="#${id}"]`)).toHaveClass(/font-semibold/)
  await expect(toc.locator('a.font-semibold')).toHaveCount(1)
  // Nested items shift the marker 8px right
  await expect(toc.locator('[data-toc-indicator]')).toHaveAttribute(
    'style',
    new RegExp(`translate\\((0|8)px, ${index * ITEM_HEIGHT}px\\)`),
  )
}

async function scrollToY(page: Page, y: number) {
  await page.evaluate((top) => window.scrollTo({ top, behavior: 'instant' }), y)
}

async function topOf(page: Page, id: string) {
  return page.locator(`[id="${id}"]`).evaluate((el) => el.getBoundingClientRect().top + window.scrollY)
}

test.describe('On This Page', () => {
  test('clicking a sub-item inside a section marks that sub-item', async ({ page }) => {
    await page.goto('/components/button')

    await page.locator('nav[aria-label="Table of contents"] a[href="#icon"]').click()
    await expect(page).toHaveURL(/\/components\/button#icon$/)
    await expect(page.locator('#icon')).toBeInViewport()
    await expectActive(page, 'icon')
  })

  test('scrolling marks the sub-section being read, not its enclosing section', async ({ page }) => {
    await page.goto('/components/button')
    await expectActive(page, 'preview')

    const start = await topOf(page, 'icon')
    const end = await topOf(page, 'as-child')
    await scrollToY(page, (start + end) / 2)
    await expectActive(page, 'icon')

    await scrollToY(page, 1e6)
    await expectActive(page, 'api-reference')

    await scrollToY(page, (await topOf(page, 'usage')) - 20)
    await expectActive(page, 'usage')
  })
})
