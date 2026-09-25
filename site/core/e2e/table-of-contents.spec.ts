import { test, expect, type Page } from '@playwright/test'

// The On This Page nav follows the reader: the active item is bold and the
// green marker sits on its row, whether it got there by a click or a scroll.

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
  await expect(toc.locator('[data-toc-indicator]')).toHaveAttribute(
    'style',
    new RegExp(`translate\\(0px, ${index * ITEM_HEIGHT}px\\)`),
  )
}

async function scrollToY(page: Page, y: number) {
  await page.evaluate((top) => window.scrollTo({ top, behavior: 'instant' }), y)
}

async function topOf(page: Page, id: string) {
  return page.locator(`[id="${id}"]`).evaluate((el) => el.getBoundingClientRect().top + window.scrollY)
}

test.describe('On This Page', () => {
  test('marks the section being read, even deep inside a long one', async ({ page }) => {
    await page.goto('/docs/quick-start')
    await expectActive(page, 'prerequisites')

    // Step 3 is several screens long: halfway through it no heading is near
    // the top, yet step 3 is what is being read.
    const start = await topOf(page, '3-look-at-what-was-generated')
    const end = await topOf(page, '4-make-a-change')
    await scrollToY(page, (start + end) / 2)
    await expectActive(page, '3-look-at-what-was-generated')
  })

  test('follows the reader back up from the bottom of the page', async ({ page }) => {
    await page.goto('/docs/quick-start')

    await scrollToY(page, 1e6)
    await expectActive(page, 'next-steps')

    await scrollToY(page, (await topOf(page, '2-install-and-run')) - 40)
    await expectActive(page, '2-install-and-run')
  })

  test('a clicked item near the end of the page stays active', async ({ page }) => {
    await page.goto('/docs/quick-start')

    // #5-deploy-optional cannot reach the top: the page ends first.
    await page.locator('nav[aria-label="Table of contents"] a[href="#5-deploy-optional"]').click()
    await expect(page).toHaveURL(/#5-deploy-optional$/)
    await expect(page.locator('[id="5-deploy-optional"]')).toBeInViewport()
    await expectActive(page, '5-deploy-optional')
  })
})
