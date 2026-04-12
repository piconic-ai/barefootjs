import { test, expect } from '@playwright/test'

test.describe('Permission Matrix Block', () => {
  test.beforeEach(async ({ page }) => {
    page.on('pageerror', error => {
      console.log('Page error:', error.message)
    })
    await page.goto('/components/permission-matrix')
  })

  const section = (page: any) =>
    page.locator('[bf-s^="PermissionMatrixDemo_"]:not([data-slot])').first()

  test.describe('Initial Render', () => {
    test('renders all four role headers', async ({ page }) => {
      const s = section(page)
      const headers = s.locator('.role-header')
      await expect(headers).toHaveCount(4)
      await expect(headers.nth(0)).toContainText('Viewer')
      await expect(headers.nth(1)).toContainText('Editor')
      await expect(headers.nth(2)).toContainText('Admin')
      await expect(headers.nth(3)).toContainText('Owner')
    })

    test('renders 12 permission rows', async ({ page }) => {
      const s = section(page)
      await expect(s.locator('.perm-row')).toHaveCount(12)
    })

    test('renders permission labels with categories', async ({ page }) => {
      const s = section(page)
      const firstRow = s.locator('.perm-row').first()
      await expect(firstRow.locator('.perm-label')).toContainText('Create')
      await expect(firstRow.locator('.perm-category')).toContainText('Content')
    })

    test('shows role stats badges', async ({ page }) => {
      const s = section(page)
      await expect(s.locator('.perm-count')).toHaveCount(4)
    })

    test('shows direct and inherited counts', async ({ page }) => {
      const s = section(page)
      await expect(s.locator('.direct-count')).toBeVisible()
      await expect(s.locator('.inherited-count')).toBeVisible()
    })

    test('each permission row has 4 checkboxes', async ({ page }) => {
      const s = section(page)
      const firstRow = s.locator('.perm-row').first()
      await expect(firstRow.locator('.perm-cell')).toHaveCount(4)
    })
  })

  test.describe('Inheritance Cascade', () => {
    test('viewer direct grant is inherited by editor, admin, and owner', async ({ page }) => {
      const s = section(page)
      // content:read (row index 1) is directly granted to viewer
      const readRow = s.locator('.perm-row').nth(1)
      const cells = readRow.locator('.perm-cell')

      // Viewer (index 0): checked, direct (not disabled)
      const viewerCheckbox = cells.nth(0).locator('button[role="checkbox"]')
      await expect(viewerCheckbox).toHaveAttribute('data-state', 'checked')
      await expect(viewerCheckbox).not.toBeDisabled()

      // Editor (index 1): checked, inherited (disabled)
      const editorCheckbox = cells.nth(1).locator('button[role="checkbox"]')
      await expect(editorCheckbox).toHaveAttribute('data-state', 'checked')
      await expect(editorCheckbox).toBeDisabled()

      // Admin (index 2): checked, inherited (disabled)
      const adminCheckbox = cells.nth(2).locator('button[role="checkbox"]')
      await expect(adminCheckbox).toHaveAttribute('data-state', 'checked')
      await expect(adminCheckbox).toBeDisabled()

      // Owner (index 3): checked, inherited (disabled)
      const ownerCheckbox = cells.nth(3).locator('button[role="checkbox"]')
      await expect(ownerCheckbox).toHaveAttribute('data-state', 'checked')
      await expect(ownerCheckbox).toBeDisabled()
    })

    test('inherited checkboxes have distinct visual style', async ({ page }) => {
      const s = section(page)
      // content:read row — editor cell should have inherited-badge class
      const readRow = s.locator('.perm-row').nth(1)
      const editorCell = readRow.locator('.perm-cell').nth(1)
      await expect(editorCell.locator('.inherited-badge')).toBeVisible()
    })

    test('toggling a viewer perm cascades up to all higher roles', async ({ page }) => {
      const s = section(page)
      // content:create (row 0) is not assigned to viewer initially
      const createRow = s.locator('.perm-row').nth(0)
      const viewerCheckbox = createRow.locator('.perm-cell').nth(0).locator('button[role="checkbox"]')

      // Grant content:create to viewer
      await viewerCheckbox.click()
      await expect(viewerCheckbox).toHaveAttribute('data-state', 'checked')

      // Editor already had it directly, so it stays checked
      const editorCheckbox = createRow.locator('.perm-cell').nth(1).locator('button[role="checkbox"]')
      await expect(editorCheckbox).toHaveAttribute('data-state', 'checked')
    })
  })

  test.describe('Direct Toggle', () => {
    test('unchecking a direct grant removes it', async ({ page }) => {
      const s = section(page)
      // content:read (row 1) is directly granted to viewer
      const readRow = s.locator('.perm-row').nth(1)
      const viewerCheckbox = readRow.locator('.perm-cell').nth(0).locator('button[role="checkbox"]')

      await expect(viewerCheckbox).toHaveAttribute('data-state', 'checked')
      await viewerCheckbox.click()
      await expect(viewerCheckbox).toHaveAttribute('data-state', 'unchecked')
    })

    test('removing direct grant removes inheritance for higher roles', async ({ page }) => {
      const s = section(page)
      // reports:view (row 10) is directly granted to viewer, inherited by others
      const viewRow = s.locator('.perm-row').nth(10)
      const viewerCheckbox = viewRow.locator('.perm-cell').nth(0).locator('button[role="checkbox"]')

      await viewerCheckbox.click()
      await expect(viewerCheckbox).toHaveAttribute('data-state', 'unchecked')

      // Editor should no longer inherit it
      const editorCheckbox = viewRow.locator('.perm-cell').nth(1).locator('button[role="checkbox"]')
      await expect(editorCheckbox).toHaveAttribute('data-state', 'unchecked')
    })
  })

  test.describe('Bulk Operations', () => {
    test('grant all for a role checks all unchecked permissions', async ({ page }) => {
      const s = section(page)
      await s.locator('.grant-all-viewer').click()

      const viewerCells = s.locator('.perm-row .perm-cell:nth-child(2)')
      const checkboxes = viewerCells.locator('button[role="checkbox"]')
      const count = await checkboxes.count()
      for (let i = 0; i < count; i++) {
        await expect(checkboxes.nth(i)).toHaveAttribute('data-state', 'checked')
      }
    })

    test('revoke all for a role unchecks direct grants', async ({ page }) => {
      const s = section(page)
      await s.locator('.grant-all-viewer').click()
      await s.locator('.revoke-all-viewer').click()

      // content:read was directly granted; after revoke it should be unchecked
      const readRow = s.locator('.perm-row').nth(1)
      const viewerCheckbox = readRow.locator('.perm-cell').nth(0).locator('button[role="checkbox"]')
      await expect(viewerCheckbox).toHaveAttribute('data-state', 'unchecked')
    })

    test('row grant (+) grants permission to all roles', async ({ page }) => {
      const s = section(page)
      // content:delete (row 3)
      const deleteRow = s.locator('.perm-row').nth(3)
      await deleteRow.locator('.grant-all-btn').click()

      const cells = deleteRow.locator('.perm-cell')
      const count = await cells.count()
      for (let i = 0; i < count; i++) {
        const checkbox = cells.nth(i).locator('button[role="checkbox"]')
        await expect(checkbox).toHaveAttribute('data-state', 'checked')
      }
    })

    test('row revoke (-) removes permission from all roles', async ({ page }) => {
      const s = section(page)
      // content:read (row 1) is granted to viewer and inherited up
      const readRow = s.locator('.perm-row').nth(1)
      await readRow.locator('.revoke-all-btn').click()

      const cells = readRow.locator('.perm-cell')
      const count = await cells.count()
      for (let i = 0; i < count; i++) {
        const checkbox = cells.nth(i).locator('button[role="checkbox"]')
        await expect(checkbox).toHaveAttribute('data-state', 'unchecked')
      }
    })
  })

  test.describe('Stats Update', () => {
    test('role stats update after toggle', async ({ page }) => {
      const s = section(page)
      const viewerBadge = s.locator('.perm-count-viewer')
      const initialText = await viewerBadge.textContent()

      const createRow = s.locator('.perm-row').nth(0)
      const viewerCheckbox = createRow.locator('.perm-cell').nth(0).locator('button[role="checkbox"]')
      await viewerCheckbox.click()

      const updatedText = await viewerBadge.textContent()
      expect(updatedText).not.toBe(initialText)
    })

    test('inherited count updates after grant all for viewer', async ({ page }) => {
      const s = section(page)
      const inheritedDisplay = s.locator('.inherited-count')
      const initialText = await inheritedDisplay.textContent()

      // Grant all to viewer — other roles' matching perms become inherited
      await s.locator('.grant-all-viewer').click()

      const updatedText = await inheritedDisplay.textContent()
      expect(updatedText).not.toBe(initialText)
    })
  })

  test.describe('Interaction', () => {
    test('clicking an inherited (disabled) cell does not change state', async ({ page }) => {
      const s = section(page)
      // content:read (row 1) is inherited by editor (disabled)
      const readRow = s.locator('.perm-row').nth(1)
      const editorCheckbox = readRow.locator('.perm-cell').nth(1).locator('button[role="checkbox"]')

      await expect(editorCheckbox).toBeDisabled()
      await expect(editorCheckbox).toHaveAttribute('data-state', 'checked')

      await editorCheckbox.click({ force: true })

      await expect(editorCheckbox).toHaveAttribute('data-state', 'checked')
    })
  })
})
