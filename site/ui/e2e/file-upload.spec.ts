import { test, expect } from '@playwright/test'

test.describe('File Upload Block', () => {
  test.beforeEach(async ({ page }) => {
    page.on('pageerror', error => {
      console.log('Page error:', error.message)
    })
    await page.goto('/components/file-upload')
  })

  const section = (page: any) =>
    page.locator('[bf-s^="FileUploadDemo_"]:not([data-slot])').first()

  test.describe('Drop Zone', () => {
    test('renders drop zone with add button', async ({ page }) => {
      const s = section(page)
      await expect(s.locator('.drop-zone')).toBeVisible()
      await expect(s.locator('.add-files-btn')).toBeVisible()
    })

    test('shows empty state initially', async ({ page }) => {
      const s = section(page)
      await expect(s.locator('.empty-state')).toBeVisible()
    })
  })

  test.describe('Adding Files', () => {
    test('add sample files shows file list', async ({ page }) => {
      const s = section(page)
      await s.locator('.add-files-btn').click()
      await expect(s.locator('.file-item')).toHaveCount(5)
    })

    test('file items show name and size', async ({ page }) => {
      const s = section(page)
      await s.locator('.add-files-btn').click()
      await expect(s.locator('.file-name').first()).toBeVisible()
      await expect(s.locator('.file-size').first()).toBeVisible()
    })

    test('file items show type badge', async ({ page }) => {
      const s = section(page)
      await s.locator('.add-files-btn').click()
      await expect(s.locator('.type-badge').first()).toBeVisible()
    })

    test('file items show pending status', async ({ page }) => {
      const s = section(page)
      await s.locator('.add-files-btn').click()
      await expect(s.locator('.status-badge').first()).toContainText('Pending')
    })

    test('empty state disappears after adding files', async ({ page }) => {
      const s = section(page)
      await s.locator('.add-files-btn').click()
      await expect(s.locator('.empty-state')).not.toBeVisible()
    })
  })

  test.describe('Stats Bar', () => {
    test('shows file count and total size', async ({ page }) => {
      const s = section(page)
      await s.locator('.add-files-btn').click()
      await expect(s.locator('.file-count')).toContainText('5 files')
      await expect(s.locator('.total-size')).toBeVisible()
    })
  })

  test.describe('Upload Controls', () => {
    test('start all button changes file status', async ({ page }) => {
      const s = section(page)
      await s.locator('.add-files-btn').click()
      await s.locator('.start-all-btn').click()
      // Start buttons should disappear (files are no longer pending)
      await expect(s.locator('.start-btn')).toHaveCount(0, { timeout: 5000 })
    })

    test('individual start button changes file status', async ({ page }) => {
      const s = section(page)
      await s.locator('.add-files-btn').click()
      await s.locator('.start-btn').first().click()
      // One fewer start button
      await expect(s.locator('.start-btn')).toHaveCount(4, { timeout: 5000 })
    })

    test('clear all removes all files', async ({ page }) => {
      const s = section(page)
      await s.locator('.add-files-btn').click()
      await expect(s.locator('.file-item')).toHaveCount(5)
      await s.locator('.clear-all-btn').click()
      await expect(s.locator('.file-item')).toHaveCount(0)
    })
  })

  test.describe('Upload Progress', () => {
    test('upload completes and shows done status', async ({ page }) => {
      const s = section(page)
      await s.locator('.add-files-btn').click()
      await s.locator('.start-btn').first().click()
      // Wait for upload to complete (simulated)
      await expect(s.locator('.status-badge:has-text("Done")').first()).toBeVisible({ timeout: 10000 })
    })

    test('completed count updates as files finish', async ({ page }) => {
      const s = section(page)
      await s.locator('.add-files-btn').click()
      await s.locator('.start-all-btn').click()
      // Wait for uploads to complete
      await expect(s.locator('.completed-count')).not.toContainText('0 completed', { timeout: 10000 })
    })
  })

  test.describe('File Removal', () => {
    test('remove button removes individual file', async ({ page }) => {
      const s = section(page)
      await s.locator('.add-files-btn').click()
      await expect(s.locator('.file-item')).toHaveCount(5)
      await s.locator('.remove-btn').first().click()
      await expect(s.locator('.file-item')).toHaveCount(4)
    })

    test('clear completed removes only done files', async ({ page }) => {
      const s = section(page)
      await s.locator('.add-files-btn').click()
      await s.locator('.start-all-btn').click()
      // Wait for some to complete
      await expect(s.locator('.completed-count')).not.toContainText('0 completed', { timeout: 10000 })
      await s.locator('.clear-completed-btn').click()
      // Should have fewer files
      const remaining = await s.locator('.file-item').count()
      expect(remaining).toBeLessThan(5)
    })
  })
})
