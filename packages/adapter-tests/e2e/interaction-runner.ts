/**
 * Shared `InteractionStep` execution (#2481).
 *
 * Extracted from `fixture-hydrate.playwright.ts` so `oracle.playwright.ts`'s
 * idempotence oracle can replay the same action steps against a second
 * host mode without a second copy of the step-dispatch switch. Behavior
 * unchanged — this is the identical `runStep` body, just relocated.
 *
 * `InteractionStep`'s twelve variants split into two families: ACTIONS
 * (`click`/`fill`/`hover`/`press`/`drag`) mutate the page, ASSERTIONS
 * (`expectText`/`expectContains`/`expectAttribute`/`expectVisible`/
 * `expectHidden`/`expectValue`/`expectFetchCount`) only read it. The idempotence oracle
 * replays only the former — an `expect*` step is a claim about ONE
 * render's behavior (already checked by `fixture-hydrate.playwright.ts`),
 * not an action whose *end state* two independently-produced renders
 * should agree on.
 */

import { expect, type Page } from '@playwright/test'
import type { InteractionStep } from '../src/types'

export type ActionStep = Extract<InteractionStep, { type: 'click' | 'fill' | 'hover' | 'press' | 'drag' }>

const ACTION_TYPES: ReadonlySet<InteractionStep['type']> = new Set([
  'click',
  'fill',
  'hover',
  'press',
  'drag',
])

export function isActionStep(step: InteractionStep): step is ActionStep {
  return ACTION_TYPES.has(step.type)
}

/** Every action step in `steps`, in order, dropping every assertion step. */
export function actionStepsOf(steps: ReadonlyArray<InteractionStep> | undefined): ActionStep[] {
  return (steps ?? []).filter(isActionStep)
}

/** Where `installFetchRecorder` keeps the URL of every `fetch()` call the page makes. */
const FETCH_LOG = '__bfFetchLog'

/**
 * Record the URL of every `fetch()` call the page makes, at call time, for
 * `expectFetchCount`. Must run before navigation (it is an init script).
 */
export async function installFetchRecorder(page: Page): Promise<void> {
  await page.addInitScript((logKey: string) => {
    const w = window as unknown as Record<string, unknown>
    const log: string[] = []
    w[logKey] = log
    const original = window.fetch.bind(window)
    window.fetch = (input: RequestInfo | URL, init?: RequestInit) => {
      log.push(input instanceof Request ? input.url : String(input))
      return original(input, init)
    }
  }, FETCH_LOG)
}

function assertNever(value: never): never {
  throw new Error(`Unhandled InteractionStep variant: ${JSON.stringify(value)}`)
}

/**
 * `timeout` bounds each Playwright action's own wait (default: unbounded,
 * falling through to the test's overall timeout — unchanged behavior for
 * `fixture-hydrate.playwright.ts`, which drives one known-good render and
 * has never needed this). `oracle.playwright.ts`'s idempotence replay
 * passes an explicit bound: a selector that legitimately doesn't exist in
 * one of its two independently-produced legs (a real divergence) would
 * otherwise hang until Playwright's outer per-test timeout force-cancels
 * the whole test — which does NOT unwind through a normal `catch`, so the
 * quarantine ledger's rot-check (`oracle.playwright.ts`'s
 * `runQuarantined`, a plain `try`/`catch`) would never get a chance to
 * recognize the failure as "still broken" and turn it green.
 */
export async function runStep(page: Page, step: InteractionStep, options?: { timeout?: number }): Promise<void> {
  const timeout = options?.timeout
  switch (step.type) {
    case 'click':
      await page.locator(step.selector).first().click({ timeout })
      return
    case 'expectText':
      await expect(page.locator(step.selector).first()).toHaveText(step.text, { timeout })
      return
    case 'expectContains':
      await expect(page.locator(step.selector).first()).toContainText(step.text, { timeout })
      return
    case 'expectAttribute':
      await expect(page.locator(step.selector).first()).toHaveAttribute(
        step.attribute,
        step.value,
        { timeout },
      )
      return
    case 'expectVisible':
      await expect(page.locator(step.selector).first()).toBeVisible({ timeout })
      return
    case 'expectHidden':
      await expect(page.locator(step.selector).first()).toBeHidden({ timeout })
      return
    case 'fill':
      await page.locator(step.selector).first().fill(step.value, { timeout })
      return
    case 'expectValue':
      await expect(page.locator(step.selector).first()).toHaveValue(step.value, { timeout })
      return
    case 'hover':
      await page.locator(step.selector).first().hover({ position: step.position, timeout })
      return
    case 'press':
      await page.locator(step.selector).first().press(step.key, { timeout })
      return
    case 'drag': {
      // Real pointer drag from the element centre. Embla binds
      // `pointerdown`/`pointermove`/`pointerup`, which Playwright's mouse
      // API dispatches alongside the mouse events. Stepped move so the
      // gesture registers as a drag, not a teleport.
      const el = page.locator(step.selector).first()
      const box = await el.boundingBox({ timeout })
      if (!box) {
        throw new Error(`drag: no bounding box for selector ${step.selector}`)
      }
      const startX = box.x + box.width / 2
      const startY = box.y + box.height / 2
      await page.mouse.move(startX, startY)
      await page.mouse.down()
      await page.mouse.move(startX + (step.deltaX ?? 0), startY + (step.deltaY ?? 0), {
        steps: 10,
      })
      await page.mouse.up()
      return
    }
    case 'expectFetchCount':
      await expect
        .poll(
          () =>
            page.evaluate(
              ({ logKey, urlIncludes }) => {
                const log = (window as unknown as Record<string, string[] | undefined>)[logKey]
                if (!log) throw new Error('expectFetchCount: installFetchRecorder was not called for this page')
                return log.filter((url) => url.includes(urlIncludes)).length
              },
              { logKey: FETCH_LOG, urlIncludes: step.urlIncludes },
            ),
          { timeout },
        )
        .toBe(step.count)
      return
    default:
      return assertNever(step)
  }
}
