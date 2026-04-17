import { test, expect } from '@playwright/test'

test.describe('Dashboard Builder Block', () => {
  test.beforeEach(async ({ page }) => {
    page.on('pageerror', error => {
      console.log('Page error:', error.message)
    })
    await page.goto('/components/dashboard-builder')
  })

  const section = (page: any) =>
    page.locator('[bf-s^="DashboardBuilderDemo_"]:not([data-slot])').first()

  // --- Initial Render ---

  test.describe('Initial Render', () => {
    test('shows widget count badge', async ({ page }) => {
      const s = section(page)
      await expect(s.locator('.widget-count')).toContainText('4 widgets')
    })

    test('renders four initial widget cells', async ({ page }) => {
      const s = section(page)
      await expect(s.locator('.widget-cell')).toHaveCount(4)
    })

    test('renders one of each widget type initially', async ({ page }) => {
      const s = section(page)
      await expect(s.locator('.stat-widget')).toHaveCount(1)
      await expect(s.locator('.progress-widget')).toHaveCount(1)
      await expect(s.locator('.todo-widget')).toHaveCount(1)
      await expect(s.locator('.chart-widget')).toHaveCount(1)
    })

    test('shows count badge per widget type', async ({ page }) => {
      const s = section(page)
      await expect(s.locator('.stat-count-badge')).toContainText('1')
      await expect(s.locator('.progress-count-badge')).toContainText('1')
      await expect(s.locator('.todo-count-badge')).toContainText('1')
      await expect(s.locator('.chart-count-badge')).toContainText('1')
    })

    test('renders toolbar with add buttons', async ({ page }) => {
      const s = section(page)
      await expect(s.locator('.add-stat-btn')).toBeVisible()
      await expect(s.locator('.add-progress-btn')).toBeVisible()
      await expect(s.locator('.add-todo-btn')).toBeVisible()
      await expect(s.locator('.add-chart-btn')).toBeVisible()
    })
  })

  // --- Per-Widget Signal Isolation ---

  test.describe('Per-Widget Signal Isolation', () => {
    test('incrementing one StatWidget does not affect a second StatWidget', async ({ page }) => {
      const s = section(page)

      // Add a second stat widget
      await s.locator('.add-stat-btn').click()
      await expect(s.locator('.stat-widget')).toHaveCount(2)

      const firstStat = s.locator('.stat-widget').nth(0)
      const secondStat = s.locator('.stat-widget').nth(1)

      const firstBefore = await firstStat.locator('.stat-value').textContent()
      const secondBefore = await secondStat.locator('.stat-value').textContent()

      // Increment only the first
      await firstStat.locator('.stat-increment').click()
      await firstStat.locator('.stat-increment').click()

      const firstAfter = await firstStat.locator('.stat-value').textContent()
      const secondAfter = await secondStat.locator('.stat-value').textContent()

      expect(firstAfter).not.toBe(firstBefore)
      expect(secondAfter).toBe(secondBefore)
    })

    test('StatWidget trend reflects only its own deltas', async ({ page }) => {
      const s = section(page)
      await s.locator('.add-stat-btn').click()

      const firstStat = s.locator('.stat-widget').nth(0)
      const secondStat = s.locator('.stat-widget').nth(1)

      await firstStat.locator('.stat-increment').click()

      const firstTrend = await firstStat.locator('.stat-trend').textContent()
      const secondTrend = await secondStat.locator('.stat-trend').textContent()

      expect(firstTrend?.trim()).not.toBe('±0')
      expect(secondTrend?.trim()).toBe('±0')
    })

    test('TodoWidget maintains independent todo list per instance', async ({ page }) => {
      const s = section(page)
      await s.locator('.add-todo-btn').click()
      await expect(s.locator('.todo-widget')).toHaveCount(2)

      const firstTodo = s.locator('.todo-widget').nth(0)
      const secondTodo = s.locator('.todo-widget').nth(1)

      // Toggle the first item in the first TodoWidget
      await firstTodo.locator('.todo-toggle').first().click()

      // First should have a done item
      await expect(firstTodo.locator('.todo-item-done')).toHaveCount(2)
      // Second should still have its default done count (1 from initial)
      await expect(secondTodo.locator('.todo-item-done')).toHaveCount(1)
    })

    test('ProgressWidget increments are scoped to the widget', async ({ page }) => {
      const s = section(page)
      await s.locator('.add-progress-btn').click()

      const firstProg = s.locator('.progress-widget').nth(0)
      const secondProg = s.locator('.progress-widget').nth(1)

      const firstBefore = await firstProg.locator('.progress-label').textContent()
      const secondBefore = await secondProg.locator('.progress-label').textContent()

      await firstProg.locator('.progress-increment').click()
      await firstProg.locator('.progress-increment').click()

      const firstAfter = await firstProg.locator('.progress-label').textContent()
      const secondAfter = await secondProg.locator('.progress-label').textContent()

      expect(firstAfter).not.toBe(firstBefore)
      expect(secondAfter).toBe(secondBefore)
    })
  })

  // --- Dynamic Component Switching ---

  test.describe('Dynamic Component Switching', () => {
    test('adding a stat widget mounts a StatWidget instance', async ({ page }) => {
      const s = section(page)
      const before = await s.locator('.stat-widget').count()
      await s.locator('.add-stat-btn').click()
      await expect(s.locator('.stat-widget')).toHaveCount(before + 1)
    })

    test('adding a progress widget mounts a ProgressWidget instance', async ({ page }) => {
      const s = section(page)
      const before = await s.locator('.progress-widget').count()
      await s.locator('.add-progress-btn').click()
      await expect(s.locator('.progress-widget')).toHaveCount(before + 1)
    })

    test('adding a chart widget mounts a ChartWidget instance', async ({ page }) => {
      const s = section(page)
      const before = await s.locator('.chart-widget').count()
      await s.locator('.add-chart-btn').click()
      await expect(s.locator('.chart-widget')).toHaveCount(before + 1)
    })

    test('newly mounted widget is interactive with its own state', async ({ page }) => {
      const s = section(page)
      await s.locator('.add-stat-btn').click()

      const newStat = s.locator('.stat-widget').last()
      const before = await newStat.locator('.stat-value').textContent()

      await newStat.locator('.stat-increment').click()

      const after = await newStat.locator('.stat-value').textContent()
      expect(after).not.toBe(before)
    })

    test('new chart widget responds to its own bar selection', async ({ page }) => {
      const s = section(page)
      await s.locator('.add-chart-btn').click()

      const newChart = s.locator('.chart-widget').last()
      const before = await newChart.locator('.chart-selected-label').textContent()

      // Clicking a bar selects it and updates the label
      await newChart.locator('.chart-bar').first().click()

      const after = await newChart.locator('.chart-selected-label').textContent()
      expect(after).not.toBe(before)
    })
  })

  // --- Widget Count Badges ---

  test.describe('Widget Count Reactivity', () => {
    test('widget count updates when adding', async ({ page }) => {
      const s = section(page)
      await expect(s.locator('.widget-count')).toContainText('4')

      await s.locator('.add-stat-btn').click()
      await expect(s.locator('.widget-count')).toContainText('5')
    })

    test('widget count updates when removing', async ({ page }) => {
      const s = section(page)
      await expect(s.locator('.widget-count')).toContainText('4')

      await s.locator('.widget-cell').first().locator('.widget-remove').click()
      await expect(s.locator('.widget-count')).toContainText('3')
    })

    test('per-type count badge updates when adding that type', async ({ page }) => {
      const s = section(page)
      await expect(s.locator('.stat-count-badge')).toContainText('1')

      await s.locator('.add-stat-btn').click()
      await expect(s.locator('.stat-count-badge')).toContainText('2')

      await s.locator('.add-stat-btn').click()
      await expect(s.locator('.stat-count-badge')).toContainText('3')
    })

    test('other-type badges stay unchanged when one type is added', async ({ page }) => {
      const s = section(page)

      await s.locator('.add-stat-btn').click()

      await expect(s.locator('.progress-count-badge')).toContainText('1')
      await expect(s.locator('.todo-count-badge')).toContainText('1')
      await expect(s.locator('.chart-count-badge')).toContainText('1')
    })
  })

  // --- Layout / Widget Management ---

  test.describe('Widget Management', () => {
    test('remove widget deletes the cell', async ({ page }) => {
      const s = section(page)
      await s.locator('.widget-cell').first().locator('.widget-remove').click()
      await expect(s.locator('.widget-cell')).toHaveCount(3)
    })

    test('removing all widgets shows empty state', async ({ page }) => {
      const s = section(page)
      // Remove all 4
      for (let i = 0; i < 4; i++) {
        await s.locator('.widget-cell').first().locator('.widget-remove').click()
      }
      await expect(s.locator('.dashboard-empty')).toBeVisible()
      await expect(s.locator('.widget-count')).toContainText('0')
    })

    test('move widget down swaps its position', async ({ page }) => {
      const s = section(page)
      const firstTypeBefore = await s.locator('.widget-cell').first().getAttribute('data-widget-type')
      const secondTypeBefore = await s.locator('.widget-cell').nth(1).getAttribute('data-widget-type')

      await s.locator('.widget-cell').first().locator('.widget-move-down').click()

      const firstTypeAfter = await s.locator('.widget-cell').first().getAttribute('data-widget-type')
      const secondTypeAfter = await s.locator('.widget-cell').nth(1).getAttribute('data-widget-type')

      expect(firstTypeAfter).toBe(secondTypeBefore)
      expect(secondTypeAfter).toBe(firstTypeBefore)
    })

    test('cycle size changes data-widget-size attribute', async ({ page }) => {
      const s = section(page)
      const cell = s.locator('.widget-cell').first()
      const before = await cell.getAttribute('data-widget-size')
      expect(before).toBe('sm')

      await cell.locator('.widget-size-toggle').click()
      const after = await cell.getAttribute('data-widget-size')
      expect(after).not.toBe(before)
    })

    test('editing a widget title keeps the same cell count', async ({ page }) => {
      const s = section(page)

      const countBefore = await s.locator('.widget-cell').count()
      const statCell = s.locator('[data-widget-type="stat"]').first()
      await statCell.locator('.widget-title-input').fill('Revenue (updated)')

      // Editing the title must not spawn or drop any widget cell
      await expect(s.locator('.widget-cell')).toHaveCount(countBefore)
      await expect(statCell.locator('.widget-title-input')).toHaveValue('Revenue (updated)')
    })
  })
})
