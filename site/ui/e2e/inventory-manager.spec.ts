import { test, expect } from '@playwright/test'

test.describe('Inventory Manager Block', () => {
  test.beforeEach(async ({ page }) => {
    page.on('pageerror', error => {
      console.log('Page error:', error.message)
    })
    await page.goto('/components/inventory-manager')
  })

  const section = (page: any) =>
    page.locator('[bf-s^="InventoryManagerDemo_"]:not([data-slot])').first()

  test.describe('Initial Render', () => {
    test('renders 8 inventory rows', async ({ page }) => {
      const s = section(page)
      await expect(s.locator('.inventory-row')).toHaveCount(8)
    })

    test('renders stats bar', async ({ page }) => {
      const s = section(page)
      await expect(s.locator('.item-count')).toContainText('8 items')
      await expect(s.locator('.total-qty')).toBeVisible()
      await expect(s.locator('.total-value')).toBeVisible()
    })

    test('renders category badges', async ({ page }) => {
      const s = section(page)
      await expect(s.locator('.row-category').first()).toBeVisible()
    })

    test('undo button is initially disabled', async ({ page }) => {
      const s = section(page)
      await expect(s.locator('.undo-btn')).toBeDisabled()
    })
  })

  test.describe('Search', () => {
    test('search filters rows', async ({ page }) => {
      const s = section(page)
      await s.locator('.search-input').fill('laptop')
      await expect(s.locator('.inventory-row')).toHaveCount(1)
      await expect(s.locator('.row-name').first()).toContainText('Laptop')
    })

    test('search updates item count', async ({ page }) => {
      const s = section(page)
      await s.locator('.search-input').fill('head')
      await expect(s.locator('.item-count')).toContainText('1 items')
    })

    test('clearing search restores all rows', async ({ page }) => {
      const s = section(page)
      await s.locator('.search-input').fill('laptop')
      await s.locator('.search-input').fill('')
      await expect(s.locator('.inventory-row')).toHaveCount(8)
    })
  })

  test.describe('Category Filter', () => {
    test('filter by category', async ({ page }) => {
      const s = section(page)
      await s.locator('.cat-btn:has-text("Electronics")').click()
      await expect(s.locator('.inventory-row')).toHaveCount(2)
    })

    test('All filter restores full list', async ({ page }) => {
      const s = section(page)
      await s.locator('.cat-btn:has-text("Electronics")').click()
      await s.locator('.cat-btn:has-text("All")').click()
      await expect(s.locator('.inventory-row')).toHaveCount(8)
    })
  })

  test.describe('Sorting', () => {
    test('clicking price sorts by price', async ({ page }) => {
      const s = section(page)
      await s.locator('.sort-price').click()
      const first = await s.locator('.row-price').first().textContent()
      await s.locator('.sort-price').click()
      const firstDesc = await s.locator('.row-price').first().textContent()
      expect(first).not.toBe(firstDesc)
    })
  })

  test.describe('Add Item', () => {
    test('add creates new row in edit mode', async ({ page }) => {
      const s = section(page)
      await s.locator('.add-btn').click()
      await expect(s.locator('.edit-name')).toBeVisible()
    })

    test('add enables undo', async ({ page }) => {
      const s = section(page)
      await s.locator('.add-btn').click()
      await expect(s.locator('.undo-btn')).toBeEnabled()
    })
  })

  test.describe('Inline Edit', () => {
    test('edit button shows input fields', async ({ page }) => {
      const s = section(page)
      await s.locator('.edit-btn').first().click()
      await expect(s.locator('.edit-name')).toBeVisible()
      await expect(s.locator('.edit-qty')).toBeVisible()
      await expect(s.locator('.edit-price')).toBeVisible()
    })

    test('cancel returns to view mode', async ({ page }) => {
      const s = section(page)
      await s.locator('.edit-btn').first().click()
      await s.locator('.cancel-btn').click()
      await expect(s.locator('.edit-name')).not.toBeVisible()
    })

    test('save updates the row', async ({ page }) => {
      const s = section(page)
      await s.locator('.edit-btn').first().click()
      await s.locator('.edit-name').fill('Updated Item')
      await s.locator('.save-btn').click()
      await expect(s.locator('.edit-name')).not.toBeVisible()
    })
  })

  test.describe('Validation', () => {
    test('invalid quantity disables save', async ({ page }) => {
      const s = section(page)
      await s.locator('.edit-btn').first().click()
      await s.locator('.edit-qty').fill('abc')
      await expect(s.locator('.save-btn')).toBeDisabled()
    })
  })

  test.describe('Delete', () => {
    test('delete removes row', async ({ page }) => {
      const s = section(page)
      await expect(s.locator('.inventory-row')).toHaveCount(8)
      await s.locator('.delete-btn').first().click()
      await expect(s.locator('.inventory-row')).toHaveCount(7)
    })
  })

  test.describe('Undo/Redo', () => {
    test('undo restores deleted item', async ({ page }) => {
      const s = section(page)
      await s.locator('.delete-btn').first().click()
      await expect(s.locator('.inventory-row')).toHaveCount(7)
      await s.locator('.undo-btn').click()
      await expect(s.locator('.inventory-row')).toHaveCount(8)
    })

    test('undo cancels edit mode and restores state', async ({ page }) => {
      const s = section(page)
      const nameBefore = await s.locator('.row-name').first().textContent()
      await s.locator('.edit-btn').first().click()
      await expect(s.locator('.edit-name')).toBeVisible()
      await s.locator('.edit-name').fill('Changed Name')
      // Undo should exit edit mode without saving
      await s.locator('.undo-btn').click()
      await expect(s.locator('.edit-name')).not.toBeVisible()
      // Name should be unchanged
      await expect(s.locator('.row-name').first()).toContainText(nameBefore!)
    })

    test('redo re-applies action', async ({ page }) => {
      const s = section(page)
      await s.locator('.delete-btn').first().click()
      await s.locator('.undo-btn').click()
      await expect(s.locator('.inventory-row')).toHaveCount(8)
      await s.locator('.redo-btn').click()
      await expect(s.locator('.inventory-row')).toHaveCount(7)
    })
  })

  test.describe('Empty State', () => {
    test('shows empty state when no items match', async ({ page }) => {
      const s = section(page)
      await s.locator('.search-input').fill('xyznonexistent')
      await expect(s.locator('.empty-state')).toBeVisible()
    })
  })
})
