import { test, expect } from '@playwright/test'

test.describe('File Browser Block', () => {
  test.beforeEach(async ({ page }) => {
    page.on('pageerror', error => {
      console.log('Page error:', error.message)
    })
    await page.goto('/components/file-browser')
  })

  const section = (page: any) =>
    page.locator('[bf-s^="FileBrowserDemo_"]:not([data-slot])').first()

  test.describe('Initial Render', () => {
    test('renders toolbar with file count and total size', async ({ page }) => {
      const s = section(page)
      await expect(s.locator('text=11 files')).toBeVisible()
      await expect(s.locator('text=15.4 KB')).toBeVisible()
      await expect(s.locator('text=0 selected')).toBeVisible()
    })

    test('delete selected button is disabled initially', async ({ page }) => {
      const s = section(page)
      await expect(s.locator('button:has-text("Delete selected")')).toBeDisabled()
    })

    test('renders root-level nodes', async ({ page }) => {
      const s = section(page)
      await expect(s.locator('text=src')).toBeVisible()
      await expect(s.locator('text=public')).toBeVisible()
      await expect(s.locator('text=package.json')).toBeVisible()
      await expect(s.locator('text=tsconfig.json')).toBeVisible()
      await expect(s.locator('text=README.md')).toBeVisible()
    })

    test('src folder is expanded by default, showing children', async ({ page }) => {
      const s = section(page)
      await expect(s.locator('text=components')).toBeVisible()
      await expect(s.locator('text=utils')).toBeVisible()
    })

    test('components subfolder is expanded, showing its files', async ({ page }) => {
      const s = section(page)
      await expect(s.locator('text=Button.tsx')).toBeVisible()
      await expect(s.locator('text=Input.tsx')).toBeVisible()
      await expect(s.locator('text=Dialog.tsx')).toBeVisible()
    })

    test('utils subfolder is collapsed (children not visible)', async ({ page }) => {
      const s = section(page)
      await expect(s.locator('text=format.ts')).not.toBeVisible()
      await expect(s.locator('text=cn.ts')).not.toBeVisible()
    })

    test('public folder is collapsed (children not visible)', async ({ page }) => {
      const s = section(page)
      await expect(s.locator('text=favicon.ico')).not.toBeVisible()
      await expect(s.locator('text=robots.txt')).not.toBeVisible()
    })

    test('folder badges show child counts', async ({ page }) => {
      const s = section(page)
      const srcBadge = s.locator('button:has-text("src")').locator('span').last()
      await expect(srcBadge).toContainText('3')
    })
  })

  test.describe('Expand/Collapse', () => {
    test('clicking utils folder expands it', async ({ page }) => {
      const s = section(page)
      await expect(s.locator('text=format.ts')).not.toBeVisible()
      await s.locator('button:has-text("utils")').click()
      await expect(s.locator('text=format.ts')).toBeVisible()
      await expect(s.locator('text=cn.ts')).toBeVisible()
    })

    test('clicking expanded utils folder collapses it', async ({ page }) => {
      const s = section(page)
      await s.locator('button:has-text("utils")').click()
      await expect(s.locator('text=format.ts')).toBeVisible()
      await s.locator('button:has-text("utils")').click()
      await expect(s.locator('text=format.ts')).not.toBeVisible()
    })

    test('collapsing src hides all its descendants', async ({ page }) => {
      const s = section(page)
      await s.locator('button:has-text("src")').click()
      await expect(s.locator('text=components')).not.toBeVisible()
      await expect(s.locator('text=Button.tsx')).not.toBeVisible()
    })
  })

  test.describe('Selection', () => {
    test('selecting a root-level file updates selected count', async ({ page }) => {
      const s = section(page)
      const packageRow = s.locator('text=package.json').locator('..')
      await packageRow.locator('button[role="checkbox"]').click()
      await expect(s.locator('text=1 selected')).toBeVisible()
    })

    test('selecting a file enables delete button', async ({ page }) => {
      const s = section(page)
      const readmeRow = s.locator('text=README.md').locator('..')
      await readmeRow.locator('button[role="checkbox"]').click()
      await expect(s.locator('button:has-text("Delete selected")')).toBeEnabled()
    })

    test('selecting multiple files updates count', async ({ page }) => {
      const s = section(page)
      const packageRow = s.locator('text=package.json').locator('..')
      const readmeRow = s.locator('text=README.md').locator('..')
      await packageRow.locator('button[role="checkbox"]').click()
      await readmeRow.locator('button[role="checkbox"]').click()
      await expect(s.locator('text=2 selected')).toBeVisible()
    })

    test('deselecting a file decrements selected count', async ({ page }) => {
      const s = section(page)
      const packageRow = s.locator('text=package.json').locator('..')
      await packageRow.locator('button[role="checkbox"]').click()
      await expect(s.locator('text=1 selected')).toBeVisible()
      await packageRow.locator('button[role="checkbox"]').click()
      await expect(s.locator('text=0 selected')).toBeVisible()
    })

    test('selected checkbox shows checked state', async ({ page }) => {
      const s = section(page)
      const packageRow = s.locator('text=package.json').locator('..')
      const checkbox = packageRow.locator('button[role="checkbox"]')
      await checkbox.click()
      await expect(checkbox).toHaveAttribute('data-state', 'checked')
    })
  })

  test.describe('Delete Selected', () => {
    test('deleting removes selected files from tree', async ({ page }) => {
      const s = section(page)
      const packageRow = s.locator('text=package.json').locator('..')
      await packageRow.locator('button[role="checkbox"]').click()
      await s.locator('button:has-text("Delete selected")').click()
      await expect(s.locator('text=package.json')).not.toBeVisible()
    })

    test('deleting updates file count', async ({ page }) => {
      const s = section(page)
      const packageRow = s.locator('text=package.json').locator('..')
      await packageRow.locator('button[role="checkbox"]').click()
      await s.locator('button:has-text("Delete selected")').click()
      await expect(s.locator('text=10 files')).toBeVisible()
    })

    test('after deleting, selected count resets to 0', async ({ page }) => {
      const s = section(page)
      const readmeRow = s.locator('text=README.md').locator('..')
      await readmeRow.locator('button[role="checkbox"]').click()
      await s.locator('button:has-text("Delete selected")').click()
      await expect(s.locator('text=0 selected')).toBeVisible()
    })

    test('after deleting, delete button becomes disabled again', async ({ page }) => {
      const s = section(page)
      const readmeRow = s.locator('text=README.md').locator('..')
      await readmeRow.locator('button[role="checkbox"]').click()
      await s.locator('button:has-text("Delete selected")').click()
      await expect(s.locator('button:has-text("Delete selected")')).toBeDisabled()
    })

    test('deleting multiple selected files updates count correctly', async ({ page }) => {
      const s = section(page)
      const packageRow = s.locator('text=package.json').locator('..')
      const readmeRow = s.locator('text=README.md').locator('..')
      await packageRow.locator('button[role="checkbox"]').click()
      await readmeRow.locator('button[role="checkbox"]').click()
      await expect(s.locator('text=2 selected')).toBeVisible()
      await s.locator('button:has-text("Delete selected")').click()
      await expect(s.locator('text=9 files')).toBeVisible()
    })
  })

  test.describe('Add File', () => {
    test('typing a filename and pressing Enter adds file to folder', async ({ page }) => {
      const s = section(page)
      const addInput = s.locator('input[placeholder="New file..."]').first()
      await addInput.fill('NewComponent.tsx')
      await addInput.press('Enter')
      await expect(s.locator('text=NewComponent.tsx')).toBeVisible()
    })

    test('added file increments file count', async ({ page }) => {
      const s = section(page)
      const addInput = s.locator('input[placeholder="New file..."]').first()
      await addInput.fill('extra.ts')
      await addInput.press('Enter')
      await expect(s.locator('text=12 files')).toBeVisible()
    })
  })
})
