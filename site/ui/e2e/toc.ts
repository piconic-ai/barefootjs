import { expect, type Page } from '@playwright/test'

export const tocNav = (page: Page) => page.locator('nav[aria-label="Table of contents"]')

/**
 * The On This Page item for `#id` is the active one: it alone is bold, and
 * the marker has settled on its row. The row is measured rather than derived
 * from an item height, so the marker is checked against where the link
 * actually renders (including a nested item's indent).
 */
export async function expectTocActive(page: Page, id: string) {
  const toc = tocNav(page)
  const link = toc.locator(`a[href="#${id}"]`)
  await expect(link).toHaveClass(/font-semibold/)
  await expect(toc.locator('a.font-semibold')).toHaveCount(1)
  await expect.poll(async () => {
    const [row, marker] = await Promise.all([
      link.boundingBox(),
      toc.locator('[data-toc-indicator]').boundingBox(),
    ])
    return row && marker
      ? { x: Math.round(marker.x - row.x), y: Math.round(marker.y - row.y), height: Math.round(marker.height - row.height) }
      : null
  }).toEqual({ x: 0, y: 0, height: 0 })
}
