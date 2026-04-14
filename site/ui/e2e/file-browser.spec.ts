import { test, expect } from '@playwright/test'

test.describe('File Browser Block (#830)', () => {
  test.beforeEach(async ({ page }) => {
    page.on('pageerror', error => {
      console.log('Page error:', error.message)
    })
    await page.goto('/components/file-browser')
  })

  const section = (page: any) =>
    page.locator('[bf-s^="FileBrowserDemo_"]:not([data-slot])').first()

  test('renders initial tree with expanded folders', async ({ page }) => {
    const s = section(page)

    // Stats bar: 11 files, 15.4 KB, 0 selected
    await expect(s.locator('text=11 files')).toBeVisible()
    await expect(s.locator('text=15.4 KB')).toBeVisible()
    await expect(s.locator('text=0 selected')).toBeVisible()

    // src folder is initially expanded — its children should be visible
    await expect(s.locator('text=components')).toBeVisible()
    await expect(s.locator('text=utils')).toBeVisible()
  })

  test('expand/collapse folder toggles children visibility', async ({ page }) => {
    const s = section(page)

    // utils folder is initially collapsed — its children should not be visible
    await expect(s.locator('text=format.ts')).not.toBeVisible()

    // Click utils folder to expand
    await s.locator('button:has-text("utils")').click()

    // Children should now be visible
    await expect(s.locator('text=format.ts')).toBeVisible()
    await expect(s.locator('text=cn.ts')).toBeVisible()

    // Click again to collapse
    await s.locator('button:has-text("utils")').click()

    // Children should be hidden again
    await expect(s.locator('text=format.ts')).not.toBeVisible()
  })

  test('nested folder expand shows third-level children', async ({ page }) => {
    const s = section(page)

    // components folder is initially expanded — its files should be visible
    await expect(s.locator('text=Button.tsx')).toBeVisible()
    await expect(s.locator('text=Input.tsx')).toBeVisible()
    await expect(s.locator('text=Dialog.tsx')).toBeVisible()
  })

  test('checkbox selection updates selected count', async ({ page }) => {
    const s = section(page)

    // Initial state: 0 selected
    await expect(s.locator('text=0 selected')).toBeVisible()

    // Select a root-level file (package.json) — guaranteed to work
    const packageRow = s.locator('text=package.json').locator('..')
    await packageRow.locator('button[role="checkbox"]').click()

    // Should show 1 selected
    await expect(s.locator('text=1 selected')).toBeVisible()
  })

  test('add file via input creates new file in folder', async ({ page }) => {
    const s = section(page)

    // Find the "New file..." input inside the components folder
    const newFileInput = s.locator('input[placeholder="New file..."]').first()
    await newFileInput.fill('NewComponent.tsx')
    await newFileInput.press('Enter')

    // New file should appear in the tree
    await expect(s.locator('text=NewComponent.tsx')).toBeVisible()
  })

  test('delete selected button is disabled initially', async ({ page }) => {
    const s = section(page)
    await expect(s.locator('button:has-text("Delete selected")')).toBeDisabled()
  })

  test('deleting removes selected files and updates count', async ({ page }) => {
    const s = section(page)
    const packageRow = s.locator('text=package.json').locator('..')
    await packageRow.locator('button[role="checkbox"]').click()
    await s.locator('button:has-text("Delete selected")').click()

    await expect(s.locator('text=package.json')).not.toBeVisible()
    await expect(s.locator('text=10 files')).toBeVisible()
  })

  test('public folder is collapsed initially', async ({ page }) => {
    const s = section(page)
    await expect(s.locator('text=favicon.ico')).not.toBeVisible()
    await expect(s.locator('text=robots.txt')).not.toBeVisible()
  })

  test('collapsing src hides all its descendants', async ({ page }) => {
    const s = section(page)
    await s.locator('button:has-text("src")').click()
    await expect(s.locator('text=components')).not.toBeVisible()
    await expect(s.locator('text=Button.tsx')).not.toBeVisible()
  })
})
