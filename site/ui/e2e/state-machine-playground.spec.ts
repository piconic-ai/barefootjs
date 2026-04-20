import { test, expect } from '@playwright/test'

test.describe('State Machine Playground Block', () => {
  test.beforeEach(async ({ page }) => {
    page.on('pageerror', error => {
      console.log('Page error:', error.message)
    })
    await page.goto('/components/state-machine-playground')
  })

  const section = (page: any) =>
    page.locator('[bf-s^="StateMachinePlaygroundDemo_"]:not([data-slot])').first()

  // --- Initial Render ---

  test.describe('Initial Render', () => {
    test('renders with traffic-light machine selected', async ({ page }) => {
      const s = section(page)
      await expect(s.locator('.machine-select')).toHaveValue('traffic-light')
      await expect(s.locator('.machine-description')).toContainText('three-state')
    })

    test('renders four traffic-light states', async ({ page }) => {
      const s = section(page)
      await expect(s.locator('.state-node')).toHaveCount(4)
      await expect(s.locator('[data-state-id="red"]')).toBeVisible()
      await expect(s.locator('[data-state-id="green"]')).toBeVisible()
      await expect(s.locator('[data-state-id="yellow"]')).toBeVisible()
      await expect(s.locator('[data-state-id="flashing"]')).toBeVisible()
    })

    test('initial state (red) is marked current', async ({ page }) => {
      const s = section(page)
      await expect(s.locator('[data-state-id="red"]')).toHaveClass(/state-current/)
      await expect(s.locator('.current-state-name').first()).toHaveText('Red')
    })

    test('reachable states are highlighted from the initial state', async ({ page }) => {
      const s = section(page)
      // From red: GO → green, FAIL → flashing (both reachable).
      await expect(s.locator('[data-state-id="green"]')).toHaveClass(/state-reachable/)
      await expect(s.locator('[data-state-id="flashing"]')).toHaveClass(/state-reachable/)
      // yellow is not reachable directly from red.
      await expect(s.locator('[data-state-id="yellow"]')).not.toHaveClass(/state-reachable/)
    })

    test('renders all 7 traffic-light transitions', async ({ page }) => {
      const s = section(page)
      await expect(s.locator('.transition-item')).toHaveCount(7)
    })

    test('only transitions from the current state are enabled', async ({ page }) => {
      const s = section(page)
      await expect(s.locator('[data-transition-id="tl-go"]')).toBeEnabled()
      await expect(s.locator('[data-transition-id="tl-fail-r"]')).toBeEnabled()
      await expect(s.locator('[data-transition-id="tl-slow"]')).toBeDisabled()
      await expect(s.locator('[data-transition-id="tl-stop"]')).toBeDisabled()
    })

    test('stats strip shows initial values', async ({ page }) => {
      const s = section(page)
      await expect(s.locator('.visited-count')).toHaveText('1 / 4')
      await expect(s.locator('.possible-count')).toHaveText('2')
      await expect(s.locator('.history-count')).toHaveText('0')
    })

    test('history is empty initially', async ({ page }) => {
      const s = section(page)
      await expect(s.locator('.history-empty-msg')).toBeVisible()
      await expect(s.locator('.history-entry')).toHaveCount(0)
    })
  })

  // --- Per-State Multi-Conditional Classes ---
  //
  // Firing one transition flips three independent classes on multiple
  // state nodes at once. These tests verify the compiler wires reactive
  // className bindings for every item in the states loop.

  test.describe('Per-State Multi-Conditional Classes', () => {
    test('firing a transition updates current, visited, and reachable classes together', async ({ page }) => {
      const s = section(page)
      await s.locator('[data-transition-id="tl-go"]').click()

      // red: was current → now visited
      await expect(s.locator('[data-state-id="red"]')).not.toHaveClass(/state-current/)
      await expect(s.locator('[data-state-id="red"]')).toHaveClass(/state-visited/)

      // green: was reachable → now current
      await expect(s.locator('[data-state-id="green"]')).toHaveClass(/state-current/)
      await expect(s.locator('[data-state-id="green"]')).not.toHaveClass(/state-reachable/)

      // yellow: was not reachable → now reachable (SLOW is from green)
      await expect(s.locator('[data-state-id="yellow"]')).toHaveClass(/state-reachable/)

      // flashing: was reachable from red → still reachable from green (FAIL)
      await expect(s.locator('[data-state-id="flashing"]')).toHaveClass(/state-reachable/)
    })

    test('current state name updates in header and stats strip', async ({ page }) => {
      const s = section(page)
      await s.locator('[data-transition-id="tl-go"]').click()
      await expect(s.locator('.current-state-label')).toContainText('Green')
      await expect(s.locator('.current-state-name').first()).toHaveText('Green')
    })

    test('visited count grows as new states are entered', async ({ page }) => {
      const s = section(page)
      await s.locator('[data-transition-id="tl-go"]').click()
      await expect(s.locator('.visited-count')).toHaveText('2 / 4')
      await s.locator('[data-transition-id="tl-slow"]').click()
      await expect(s.locator('.visited-count')).toHaveText('3 / 4')
    })

    test('clicking a state node sets it as current without firing a transition', async ({ page }) => {
      const s = section(page)
      await s.locator('[data-state-id="yellow"]').click()
      await expect(s.locator('[data-state-id="yellow"]')).toHaveClass(/state-current/)
      // History should NOT record anything.
      await expect(s.locator('.history-count')).toHaveText('0')
    })
  })

  // --- Transition Button Behavior ---

  test.describe('Transition Button Behavior', () => {
    test('clicking a disabled transition does not change state', async ({ page }) => {
      const s = section(page)
      const before = await s.locator('.current-state-name').first().textContent()
      // Force a click via JS since the browser would normally block it.
      await s.locator('[data-transition-id="tl-slow"]').dispatchEvent('click')
      const after = await s.locator('.current-state-name').first().textContent()
      expect(after).toBe(before)
    })

    test('transitions update their enabled state when current state changes', async ({ page }) => {
      const s = section(page)
      await s.locator('[data-transition-id="tl-go"]').click()
      await expect(s.locator('[data-transition-id="tl-go"]')).toBeDisabled()
      await expect(s.locator('[data-transition-id="tl-slow"]')).toBeEnabled()
      await expect(s.locator('[data-transition-id="tl-fail-g"]')).toBeEnabled()
      await expect(s.locator('[data-transition-id="tl-fail-r"]')).toBeDisabled()
    })
  })

  // --- Dynamic Transition List (reactive loop source) ---

  test.describe('Dynamic Transition List', () => {
    test('only-possible toggle shrinks the transitions list', async ({ page }) => {
      const s = section(page)
      await expect(s.locator('.transition-item')).toHaveCount(7)
      await s.locator('.only-possible-toggle').check()
      await expect(s.locator('.transition-item')).toHaveCount(2)
    })

    test('only-possible list tracks the current state', async ({ page }) => {
      const s = section(page)
      await s.locator('.only-possible-toggle').check()
      await expect(s.locator('.transition-item')).toHaveCount(2)
      // Fire GO → now at green → SLOW and FAIL are possible.
      await s.locator('[data-transition-id="tl-go"]').click()
      await expect(s.locator('.transition-item')).toHaveCount(2)
      await expect(s.locator('[data-transition-id="tl-slow"]')).toBeVisible()
      await expect(s.locator('[data-transition-id="tl-fail-g"]')).toBeVisible()
    })

    test('unchecking restores the full transitions list', async ({ page }) => {
      const s = section(page)
      await s.locator('.only-possible-toggle').check()
      await expect(s.locator('.transition-item')).toHaveCount(2)
      await s.locator('.only-possible-toggle').uncheck()
      await expect(s.locator('.transition-item')).toHaveCount(7)
    })
  })

  // --- History Memo Chain ---

  test.describe('History Memo Chain', () => {
    test('firing transitions appends history entries', async ({ page }) => {
      const s = section(page)
      await s.locator('[data-transition-id="tl-go"]').click()
      await s.locator('[data-transition-id="tl-slow"]').click()
      await expect(s.locator('.history-count')).toHaveText('2')
      await expect(s.locator('.history-entry')).toHaveCount(2)
    })

    test('search input filters the history', async ({ page }) => {
      const s = section(page)
      await s.locator('[data-transition-id="tl-go"]').click() // GO
      await s.locator('[data-transition-id="tl-slow"]').click() // SLOW
      await s.locator('.history-search').fill('slow')
      await expect(s.locator('.history-entry')).toHaveCount(1)
      await expect(s.locator('.history-entry').first()).toContainText('SLOW')
    })

    test('search clears restore the full history', async ({ page }) => {
      const s = section(page)
      await s.locator('[data-transition-id="tl-go"]').click()
      await s.locator('[data-transition-id="tl-slow"]').click()
      await s.locator('.history-search').fill('slow')
      await expect(s.locator('.history-entry')).toHaveCount(1)
      await s.locator('.history-search').fill('')
      await expect(s.locator('.history-entry')).toHaveCount(2)
    })

    test('group by event splits history into event-named groups', async ({ page }) => {
      const s = section(page)
      await s.locator('[data-transition-id="tl-go"]').click() // GO
      await s.locator('[data-transition-id="tl-fail-g"]').click() // FAIL
      await s.locator('[data-transition-id="tl-repair"]').click() // REPAIR
      await s.locator('[data-transition-id="tl-fail-r"]').click() // FAIL
      await s.locator('.history-group-select').selectOption('event')
      const headers = s.locator('.history-group-key')
      await expect(headers).toHaveCount(3) // GO / FAIL / REPAIR
      await expect(headers.nth(0)).toHaveText('GO')
      await expect(headers.nth(1)).toHaveText('FAIL')
      await expect(headers.nth(2)).toHaveText('REPAIR')
      // 4 transitions fired → 4 entries rendered across 3 groups.
      await expect(s.locator('.history-entry')).toHaveCount(4)
    })

    test('group by target splits history into target-state groups', async ({ page }) => {
      const s = section(page)
      await s.locator('[data-transition-id="tl-go"]').click()
      await s.locator('[data-transition-id="tl-slow"]').click()
      await s.locator('.history-group-select').selectOption('target')
      const headers = s.locator('.history-group-key')
      await expect(headers).toHaveCount(2)
      await expect(headers.nth(0)).toHaveText('green')
      await expect(headers.nth(1)).toHaveText('yellow')
    })

    test('group headers disappear when grouping is none', async ({ page }) => {
      const s = section(page)
      await s.locator('[data-transition-id="tl-go"]').click()
      await s.locator('.history-group-select').selectOption('event')
      await expect(s.locator('.history-group-key')).toHaveCount(1)
      await s.locator('.history-group-select').selectOption('none')
      await expect(s.locator('.history-group-key')).toHaveCount(0)
      await expect(s.locator('.history-entry')).toHaveCount(1)
    })

    test('filter + grouping compose correctly (3-level memo chain)', async ({ page }) => {
      const s = section(page)
      await s.locator('[data-transition-id="tl-go"]').click()
      await s.locator('[data-transition-id="tl-fail-g"]').click()
      await s.locator('[data-transition-id="tl-repair"]').click()
      await s.locator('.history-group-select').selectOption('event')
      await s.locator('.history-search').fill('FAIL')
      const headers = s.locator('.history-group-key')
      await expect(headers).toHaveCount(1)
      await expect(headers.first()).toHaveText('FAIL')
      await expect(s.locator('.history-entry')).toHaveCount(1)
    })
  })

  // --- Machine Switching (reshapes loop structure) ---

  test.describe('Machine Switching', () => {
    test('switching machines replaces states and transitions entirely', async ({ page }) => {
      const s = section(page)
      await s.locator('.machine-select').selectOption('order-workflow')
      await expect(s.locator('.state-node')).toHaveCount(6)
      await expect(s.locator('.transition-item')).toHaveCount(7)
      await expect(s.locator('[data-state-id="pending"]')).toBeVisible()
      await expect(s.locator('[data-state-id="red"]')).toHaveCount(0)
    })

    test('switching sets current to the new initial state', async ({ page }) => {
      const s = section(page)
      await s.locator('.machine-select').selectOption('order-workflow')
      await expect(s.locator('.current-state-name').first()).toHaveText('Pending')
      await expect(s.locator('[data-state-id="pending"]')).toHaveClass(/state-current/)
    })

    test('switching resets history and visited counters', async ({ page }) => {
      const s = section(page)
      await s.locator('[data-transition-id="tl-go"]').click()
      await s.locator('[data-transition-id="tl-slow"]').click()
      await expect(s.locator('.history-count')).toHaveText('2')
      await s.locator('.machine-select').selectOption('document-review')
      await expect(s.locator('.history-count')).toHaveText('0')
      await expect(s.locator('.visited-count')).toHaveText('1 / 6')
    })

    test('document-review workflow fires end-to-end', async ({ page }) => {
      const s = section(page)
      await s.locator('.machine-select').selectOption('document-review')
      await s.locator('[data-transition-id="dr-submit"]').click()
      await expect(s.locator('.current-state-name').first()).toHaveText('In Review')
      await s.locator('[data-transition-id="dr-approve"]').click()
      await expect(s.locator('.current-state-name').first()).toHaveText('Approved')
      await s.locator('[data-transition-id="dr-publish"]').click()
      await expect(s.locator('.current-state-name').first()).toHaveText('Published')
      await expect(s.locator('.history-count')).toHaveText('3')
    })
  })

  // --- Reset ---

  test.describe('Reset', () => {
    test('reset returns to the initial state and clears history', async ({ page }) => {
      const s = section(page)
      await s.locator('[data-transition-id="tl-go"]').click()
      await s.locator('[data-transition-id="tl-slow"]').click()
      await expect(s.locator('.history-count')).toHaveText('2')
      await s.locator('.reset-btn').click()
      await expect(s.locator('.current-state-name').first()).toHaveText('Red')
      await expect(s.locator('.history-count')).toHaveText('0')
      await expect(s.locator('.visited-count')).toHaveText('1 / 4')
    })

    test('reset preserves the selected machine', async ({ page }) => {
      const s = section(page)
      await s.locator('.machine-select').selectOption('order-workflow')
      await s.locator('[data-transition-id="ow-pay"]').click()
      await s.locator('.reset-btn').click()
      await expect(s.locator('.machine-select')).toHaveValue('order-workflow')
      await expect(s.locator('.current-state-name').first()).toHaveText('Pending')
    })
  })
})
