import { test, expect, type Page } from '@playwright/test'

/**
 * Regression tests for playground code-block population.
 *
 * Root cause: highlight helpers (hlPlain, hlTag, etc.) imported from
 * `playground-highlight.ts` were compiled outside the `__bf_inline_0` IIFE
 * scope in the client JS bundle when used inside component-local functions.
 * The createEffect that populates [data-playground-code] threw a
 * ReferenceError, leaving the code block empty.
 *
 * Fix: all highlight logic now lives in the shared module itself, so the
 * compiler inlines it inside the IIFE where signal-driven effects can reach it.
 */

const codeBlock = (page: Page) => page.locator('[data-playground-code]')

async function selectOption(page: Page, value: string) {
  const trigger = page.locator('#preview [data-slot="select-trigger"]').first()
  await trigger.click()
  await page.locator(`[data-slot="select-item"][data-value="${value}"]`).click()
}

async function clickCheckbox(page: Page) {
  await page.locator('#preview [data-slot="checkbox"]').first().click()
}

test.describe('Button Group Playground', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/components/button-group')
  })

  test('populates code block on load', async ({ page }) => {
    await expect(codeBlock(page)).not.toBeEmpty()
    await expect(codeBlock(page)).toContainText('ButtonGroup')
  })

  test('changing orientation to vertical updates code block', async ({ page }) => {
    await selectOption(page, 'vertical')
    await expect(codeBlock(page)).toContainText('vertical')
  })
})

test.describe('Input OTP Playground', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/components/input-otp')
  })

  test('populates code block on load', async ({ page }) => {
    await expect(codeBlock(page)).not.toBeEmpty()
    await expect(codeBlock(page)).toContainText('InputOTP')
  })

  test('toggling disabled adds disabled prop to code block', async ({ page }) => {
    await clickCheckbox(page)
    await expect(codeBlock(page)).toContainText('disabled')
  })
})

test.describe('Slider Playground', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/components/slider')
  })

  test('populates code block on load', async ({ page }) => {
    await expect(codeBlock(page)).not.toBeEmpty()
    await expect(codeBlock(page)).toContainText('Slider')
  })

  test('toggling disabled adds disabled prop to code block', async ({ page }) => {
    await clickCheckbox(page)
    await expect(codeBlock(page)).toContainText('disabled')
  })
})

test.describe('Toggle Group Playground', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/components/toggle-group')
  })

  test('populates code block on load', async ({ page }) => {
    await expect(codeBlock(page)).not.toBeEmpty()
    await expect(codeBlock(page)).toContainText('ToggleGroup')
  })

  test('toggling disabled adds disabled prop to code block', async ({ page }) => {
    await clickCheckbox(page)
    await expect(codeBlock(page)).toContainText('disabled')
  })
})

test.describe('Progress Playground', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/components/progress')
  })

  test('populates code block on load', async ({ page }) => {
    await expect(codeBlock(page)).not.toBeEmpty()
    await expect(codeBlock(page)).toContainText('Progress')
  })
})

test.describe('Command Playground', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/components/command')
  })

  test('populates code block on load', async ({ page }) => {
    await expect(codeBlock(page)).not.toBeEmpty()
    await expect(codeBlock(page)).toContainText('Command')
  })

  test('unchecking shortcuts removes CommandShortcut from code block', async ({ page }) => {
    await expect(codeBlock(page)).toContainText('CommandShortcut')
    await clickCheckbox(page)
    await expect(codeBlock(page)).not.toContainText('CommandShortcut')
  })
})

test.describe('Context Menu Playground', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/components/context-menu')
  })

  test('populates code block on load', async ({ page }) => {
    await expect(codeBlock(page)).not.toBeEmpty()
    await expect(codeBlock(page)).toContainText('ContextMenu')
  })

  test('changing variant to destructive updates code block', async ({ page }) => {
    await selectOption(page, 'destructive')
    await expect(codeBlock(page)).toContainText('destructive')
  })
})

test.describe('Portal Playground', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/components/portal')
  })

  test('populates code block on load', async ({ page }) => {
    await expect(codeBlock(page)).not.toBeEmpty()
    await expect(codeBlock(page)).toContainText('createPortal')
  })

  test('switching to custom container adds container prop to code block', async ({ page }) => {
    await selectOption(page, 'custom')
    await expect(codeBlock(page)).toContainText('container')
  })
})
