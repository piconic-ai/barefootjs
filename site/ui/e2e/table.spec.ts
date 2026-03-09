import { test, expect } from '@playwright/test'

test.describe('Table Documentation Page', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/docs/components/table')
  })

  test.describe('Table Structure', () => {
    const tableSelector = '[data-slot="table"]'

    test('renders table element', async ({ page }) => {
      const table = page.locator(tableSelector).first()
      await expect(table).toBeVisible()
    })

    test('table is wrapped in scrollable container', async ({ page }) => {
      const container = page.locator('[data-slot="table-container"]').first()
      await expect(container).toBeVisible()
      await expect(container).toHaveClass(/overflow-x-auto/)
    })

    test('renders table header', async ({ page }) => {
      const header = page.locator('[data-slot="table-header"]').first()
      await expect(header).toBeVisible()
    })

    test('renders table body with rows', async ({ page }) => {
      const body = page.locator('[data-slot="table-body"]').first()
      await expect(body).toBeVisible()

      const rows = body.locator('[data-slot="table-row"]')
      await expect(rows.first()).toBeVisible()
    })

    test('renders table head cells', async ({ page }) => {
      const heads = page.locator('[data-slot="table-head"]').first()
      await expect(heads).toBeVisible()

      const tagName = await heads.evaluate((el) => el.tagName.toLowerCase())
      expect(tagName).toBe('th')
    })

    test('renders table data cells', async ({ page }) => {
      const cells = page.locator('[data-slot="table-cell"]').first()
      await expect(cells).toBeVisible()

      const tagName = await cells.evaluate((el) => el.tagName.toLowerCase())
      expect(tagName).toBe('td')
    })
  })

  test.describe('Table with Footer', () => {
    test('renders table footer', async ({ page }) => {
      const footer = page.locator('[data-slot="table-footer"]')
      await expect(footer.first()).toBeVisible()
    })

    test('renders table caption', async ({ page }) => {
      const caption = page.locator('[data-slot="table-caption"]')
      await expect(caption.first()).toBeVisible()
      await expect(caption.first()).toContainText('A list of your recent invoices')
    })
  })
})

test.describe('Table Reference Page', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/components/table')
  })

  test('renders page header', async ({ page }) => {
    await expect(page.locator('h1')).toContainText('Table')
  })

  test('renders table in playground', async ({ page }) => {
    await expect(page.locator('[data-slot="table"]').first()).toBeVisible()
  })

  test('renders API reference section', async ({ page }) => {
    await expect(page.locator('#api-reference')).toBeVisible()
  })
})
