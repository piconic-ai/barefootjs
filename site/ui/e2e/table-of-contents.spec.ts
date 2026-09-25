import { test, expect, type Page } from '@playwright/test'
import { expectTocActive } from '../../shared/e2e/helpers'

// The On This Page nav follows the reader: the active item is bold and the
// green marker sits on its row, whether it got there by a click or a scroll.
// On site/ui a TOC target is either a whole <section> or an <h3> inside one.

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
    await expectTocActive(page, 'icon')
  })

  test('scrolling marks the sub-section being read, not its enclosing section', async ({ page }) => {
    await page.goto('/components/button')
    await expectTocActive(page, 'preview')

    const start = await topOf(page, 'icon')
    const end = await topOf(page, 'as-child')
    await scrollToY(page, (start + end) / 2)
    await expectTocActive(page, 'icon')

    await scrollToY(page, 1e6)
    await expectTocActive(page, 'api-reference')

    await scrollToY(page, (await topOf(page, 'usage')) - 20)
    await expectTocActive(page, 'usage')
  })
})
