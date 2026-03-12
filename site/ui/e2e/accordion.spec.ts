import { test, expect } from '@playwright/test'

test.describe('Accordion Documentation Page', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/components/accordion')
  })

  test.describe('Single Open Accordion', () => {
    test('clicking another item closes the first', async ({ page }) => {
      const accordion = page.locator('[bf-s^="AccordionSingleOpenDemo_"]').first()
      const secondTrigger = accordion.locator('button:has-text("Is it styled?")')

      // Click second item
      await secondTrigger.click()

      // Second item should be open
      await expect(accordion.locator('text=Yes. It comes with default styles')).toBeVisible()

      // First item content should be hidden
      await expect(accordion.locator('text=Yes. It adheres to the WAI-ARIA design pattern.')).not.toBeVisible()
    })

    test('clicking open item closes it', async ({ page }) => {
      const accordion = page.locator('[bf-s^="AccordionSingleOpenDemo_"]').first()
      const firstTrigger = accordion.locator('button:has-text("Is it accessible?")')

      // First item is open, click to close
      await firstTrigger.click()

      // Content should be hidden
      await expect(accordion.locator('text=Yes. It adheres to the WAI-ARIA design pattern.')).not.toBeVisible()
    })
  })

  test.describe('Multiple Open Accordion', () => {
    test('can open multiple items simultaneously', async ({ page }) => {
      const accordion = page.locator('[bf-s^="AccordionMultipleOpenDemo_"]').first()
      const secondTrigger = accordion.locator('button:has-text("Second Item")')

      // Click second item to open it
      await secondTrigger.click()

      // Both items should be visible
      await expect(accordion.locator('text=This accordion allows multiple items to be open')).toBeVisible()
      await expect(accordion.locator('text=Each item manages its own open/close state')).toBeVisible()
    })
  })

  test.describe('Expand/Collapse Animations', () => {
    test('content expands with animation and JS state syncs', async ({ page }) => {
      const accordion = page.locator('[bf-s^="AccordionSingleOpenDemo_"]').first()
      const secondTrigger = accordion.locator('button:has-text("Is it styled?")')
      const secondContent = accordion.locator('[data-slot="accordion-content"]').nth(1)

      // Initially closed
      await expect(secondContent).toHaveAttribute('data-state', 'closed')
      await expect(secondContent).toHaveClass(/grid-rows-\[0fr\]/)

      // Click to open
      await secondTrigger.click()

      // JS state should be "open"
      await expect(secondContent).toHaveAttribute('data-state', 'open')
      await expect(secondContent).toHaveClass(/grid-rows-\[1fr\]/)
      await expect(accordion.locator('text=Yes. It comes with default styles')).toBeVisible()
    })

    test('content collapses with animation and JS state syncs', async ({ page }) => {
      const accordion = page.locator('[bf-s^="AccordionSingleOpenDemo_"]').first()
      const firstTrigger = accordion.locator('button:has-text("Is it accessible?")')
      const firstContent = accordion.locator('[data-slot="accordion-content"]').first()

      // Initially open
      await expect(firstContent).toHaveAttribute('data-state', 'open')
      await expect(firstContent).toHaveClass(/grid-rows-\[1fr\]/)

      // Click to close
      await firstTrigger.click()

      // JS state should be "closed"
      await expect(firstContent).toHaveAttribute('data-state', 'closed')
      await expect(firstContent).toHaveClass(/grid-rows-\[0fr\]/)
      await expect(accordion.locator('text=Yes. It adheres to the WAI-ARIA design pattern.')).not.toBeVisible()
    })

    test('rapid clicks result in correct final state', async ({ page }) => {
      const accordion = page.locator('[bf-s^="AccordionSingleOpenDemo_"]').first()
      const firstTrigger = accordion.locator('button:has-text("Is it accessible?")')
      const firstContent = accordion.locator('[data-slot="accordion-content"]').first()

      // Initially open
      await expect(firstContent).toHaveAttribute('data-state', 'open')

      // Rapid clicks (3 clicks = toggle to closed, open, closed)
      await firstTrigger.click()
      await firstTrigger.click()
      await firstTrigger.click()

      // Final state should be closed (odd number of clicks from open)
      await expect(firstContent).toHaveAttribute('data-state', 'closed')
      await expect(accordion.locator('text=Yes. It adheres to the WAI-ARIA design pattern.')).not.toBeVisible()
    })

    test('multiple accordion items animate independently', async ({ page }) => {
      const accordion = page.locator('[bf-s^="AccordionMultipleOpenDemo_"]').first()
      const firstContent = accordion.locator('[data-slot="accordion-content"]').first()
      const secondContent = accordion.locator('[data-slot="accordion-content"]').nth(1)
      const secondTrigger = accordion.locator('button:has-text("Second Item")')

      // First is open, second is closed
      await expect(firstContent).toHaveAttribute('data-state', 'open')
      await expect(secondContent).toHaveAttribute('data-state', 'closed')

      // Open second item
      await secondTrigger.click()

      // Both should be open now (multiple open mode)
      await expect(firstContent).toHaveAttribute('data-state', 'open')
      await expect(secondContent).toHaveAttribute('data-state', 'open')

      // Both contents visible
      await expect(accordion.locator('text=This accordion allows multiple items to be open')).toBeVisible()
      await expect(accordion.locator('text=Each item manages its own open/close state')).toBeVisible()
    })

    test('chevron rotates on expand/collapse', async ({ page }) => {
      const accordion = page.locator('[bf-s^="AccordionSingleOpenDemo_"]').first()
      const secondTrigger = accordion.locator('button:has-text("Is it styled?")')
      const secondChevron = secondTrigger.locator('svg')

      // Initially closed - no rotation
      await expect(secondChevron).not.toHaveClass(/rotate-180/)

      // Click to open
      await secondTrigger.click()

      // Should be rotated
      await expect(secondChevron).toHaveClass(/rotate-180/)

      // Click another to close second
      const firstTrigger = accordion.locator('button:has-text("Is it accessible?")')
      await firstTrigger.click()

      // Second chevron should not be rotated anymore
      await expect(secondChevron).not.toHaveClass(/rotate-180/)
    })
  })
})

test.describe('Accordion asChild', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/components/accordion')
  })

  test('toggles content on click with reactive state', async ({ page }) => {
    const trigger = page.locator('[data-testid="accordion-aschild-trigger"]')
    const stateEl = page.locator('[data-testid="accordion-aschild-state"]')

    // Initially closed
    await expect(stateEl).toContainText('closed')

    // Click to open
    await trigger.click()
    await expect(stateEl).toContainText('open')

    // Content should be visible
    const demo = trigger.locator('xpath=ancestor::*[@data-slot="accordion"]')
    await expect(demo.locator('text=This item uses a custom trigger element via asChild')).toBeVisible()
  })

  test('aria-expanded updates reactively', async ({ page }) => {
    const triggerWrapper = page.locator('[data-testid="accordion-aschild-trigger"]').locator('xpath=ancestor::*[@data-slot="accordion-trigger"]')

    // Initially closed
    await expect(triggerWrapper).toHaveAttribute('aria-expanded', 'false')

    // Click to open
    await page.locator('[data-testid="accordion-aschild-trigger"]').click()

    // aria-expanded should update
    await expect(triggerWrapper).toHaveAttribute('aria-expanded', 'true')
  })

  test('keyboard navigation between asChild and standard triggers', async ({ page }) => {
    const asChildTrigger = page.locator('[data-testid="accordion-aschild-trigger"]')
    const demo = asChildTrigger.locator('xpath=ancestor::*[@data-slot="accordion"]')
    const standardTrigger = demo.locator('button:has-text("Standard Trigger")')

    // Focus on the asChild trigger
    await asChildTrigger.focus()
    await expect(asChildTrigger).toBeFocused()

    // ArrowDown should move to standard trigger
    await page.keyboard.press('ArrowDown')
    await expect(standardTrigger).toBeFocused()

    // ArrowDown should wrap back to asChild trigger
    await page.keyboard.press('ArrowDown')
    await expect(asChildTrigger).toBeFocused()

    // ArrowUp should wrap to standard trigger
    await page.keyboard.press('ArrowUp')
    await expect(standardTrigger).toBeFocused()
  })
})

test.describe('Accordion Keyboard Navigation', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/components/accordion')
  })

  test('ArrowDown navigates to next accordion trigger', async ({ page }) => {
    const accordion = page.locator('[bf-s^="AccordionSingleOpenDemo_"]').first()
    const firstTrigger = accordion.locator('button:has-text("Is it accessible?")')
    const secondTrigger = accordion.locator('button:has-text("Is it styled?")')

    // Focus on first trigger
    await firstTrigger.focus()
    await expect(firstTrigger).toBeFocused()

    // Press ArrowDown to go to next trigger
    await page.keyboard.press('ArrowDown')

    // Second trigger should be focused
    await expect(secondTrigger).toBeFocused()
  })

  test('ArrowUp navigates to previous accordion trigger', async ({ page }) => {
    const accordion = page.locator('[bf-s^="AccordionSingleOpenDemo_"]').first()
    const firstTrigger = accordion.locator('button:has-text("Is it accessible?")')
    const secondTrigger = accordion.locator('button:has-text("Is it styled?")')

    // Focus on second trigger
    await secondTrigger.focus()
    await expect(secondTrigger).toBeFocused()

    // Press ArrowUp to go to previous trigger
    await page.keyboard.press('ArrowUp')

    // First trigger should be focused
    await expect(firstTrigger).toBeFocused()
  })

  test('ArrowDown wraps from last to first trigger', async ({ page }) => {
    const accordion = page.locator('[bf-s^="AccordionSingleOpenDemo_"]').first()
    const firstTrigger = accordion.locator('button:has-text("Is it accessible?")')
    const thirdTrigger = accordion.locator('button:has-text("Is it animated?")')

    // Focus on last trigger
    await thirdTrigger.focus()
    await expect(thirdTrigger).toBeFocused()

    // Press ArrowDown to wrap to first
    await page.keyboard.press('ArrowDown')

    // First trigger should be focused
    await expect(firstTrigger).toBeFocused()
  })

  test('ArrowUp wraps from first to last trigger', async ({ page }) => {
    const accordion = page.locator('[bf-s^="AccordionSingleOpenDemo_"]').first()
    const firstTrigger = accordion.locator('button:has-text("Is it accessible?")')
    const thirdTrigger = accordion.locator('button:has-text("Is it animated?")')

    // Focus on first trigger
    await firstTrigger.focus()
    await expect(firstTrigger).toBeFocused()

    // Press ArrowUp to wrap to last
    await page.keyboard.press('ArrowUp')

    // Last trigger should be focused
    await expect(thirdTrigger).toBeFocused()
  })

  test('Home key navigates to first trigger', async ({ page }) => {
    const accordion = page.locator('[bf-s^="AccordionSingleOpenDemo_"]').first()
    const firstTrigger = accordion.locator('button:has-text("Is it accessible?")')
    const thirdTrigger = accordion.locator('button:has-text("Is it animated?")')

    // Focus on last trigger
    await thirdTrigger.focus()

    // Press Home to go to first
    await page.keyboard.press('Home')

    // First trigger should be focused
    await expect(firstTrigger).toBeFocused()
  })

  test('End key navigates to last trigger', async ({ page }) => {
    const accordion = page.locator('[bf-s^="AccordionSingleOpenDemo_"]').first()
    const firstTrigger = accordion.locator('button:has-text("Is it accessible?")')
    const thirdTrigger = accordion.locator('button:has-text("Is it animated?")')

    // Focus on first trigger
    await firstTrigger.focus()

    // Press End to go to last
    await page.keyboard.press('End')

    // Last trigger should be focused
    await expect(thirdTrigger).toBeFocused()
  })

  test('Enter/Space toggles accordion content', async ({ page }) => {
    const accordion = page.locator('[bf-s^="AccordionSingleOpenDemo_"]').first()
    const secondTrigger = accordion.locator('button:has-text("Is it styled?")')

    // Focus on second trigger and press Enter
    await secondTrigger.focus()
    await page.keyboard.press('Enter')

    // Second content should be visible
    await expect(accordion.locator('text=Yes. It comes with default styles')).toBeVisible()
  })
})
