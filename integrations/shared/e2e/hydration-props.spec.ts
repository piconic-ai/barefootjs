/**
 * Shared hydration-props (`bf-p`) contract E2E tests.
 *
 * Pins the bf-p hydration-payload contract: it carries ONLY user-declared
 * props (the same shape the Hono reference adapter emits), never the
 * server's internal scope bookkeeping (scopeID/scope_id, bfIsRoot,
 * bfIsChild, bfParent/bf_parent, bfMount/bf_mount, bfDataKey/bf_data_key).
 *
 * Found via a bf-p semantic-comparison audit across the go-template, erb,
 * and jinja adapters: all three leaked their internal scope id into the
 * bf-p JSON (Go: a `ScopeID` struct field serialised as `scopeID`; erb/
 * jinja: a `scope_id` dict key), even though the shared client runtime's
 * only bf-p consumer (`packages/client/src/runtime/hydrate.ts`'s
 * `parseProps` -> `runInit`) never reads it back out — dead weight on
 * every request, and a payload that silently diverges from the Hono
 * reference's shape. Fixed by excluding the internal fields at each
 * adapter's marshal boundary (Go: `json:"-"` on the struct field; erb/
 * jinja: a filter in `props_attr`).
 *
 * Uses the shared Toggle page (see `toggle.spec.ts`): the `Toggle` root
 * scope (`.settings-panel[bf-s]`) is rendered with real user props
 * (`toggleItems`, an array of `{ label, defaultOn }`) across every
 * integration harness, so its `bf-p` attribute is a stable, non-empty
 * cross-adapter fixture for this assertion.
 */

import { test, expect } from '@playwright/test'

// Internal server-side bookkeeping keys that must never reach the client
// hydration payload, across all three affected adapters' naming
// conventions (Go camelCase-JSON-tag / Ruby & Python snake_case dict key).
const INTERNAL_KEYS = [
  'scopeID',
  'scope_id',
  'bfIsRoot',
  'bf_is_root',
  'bfIsChild',
  'bf_is_child',
  'bfParent',
  'bf_parent',
  'bfMount',
  'bf_mount',
  'bfDataKey',
  'bf_data_key',
]

/** Recursively collect every object key in a parsed JSON value (bf-p may
 *  nest internal fields on array/object prop values too — e.g. Go's
 *  struct-slice auto-marshal previously carried a per-item `scopeID`
 *  inside `toggleItems`). */
function collectKeys(value: unknown, into: Set<string>): void {
  if (Array.isArray(value)) {
    for (const item of value) collectKeys(item, into)
    return
  }
  if (value && typeof value === 'object') {
    for (const [key, v] of Object.entries(value as Record<string, unknown>)) {
      into.add(key)
      collectKeys(v, into)
    }
  }
}

/**
 * Run the hydration-props contract tests.
 *
 * @param baseUrl - The base URL of the server (e.g., 'http://localhost:3001')
 */
export function hydrationPropsTests(baseUrl: string) {
  test.describe('Hydration Props (bf-p) Contract', () => {
    test.beforeEach(async ({ page }) => {
      await page.goto(`${baseUrl}/toggle`)
      await page.waitForSelector('.toggle-item[bf-s]', { timeout: 10000 })
    })

    // (1) Hydration actually works on this page — the bf-p payload isn't
    // just present, it's consumed by a live, interactive component.
    test('hydrated interaction still works', async ({ page }) => {
      const setting1Button = page.locator('.toggle-item').nth(0).locator('button')
      await expect(setting1Button).toHaveText('ON')
      await setting1Button.click()
      await expect(setting1Button).toHaveText('OFF')
    })

    // (2) The bf-p JSON pin: only user props, no internal scope fields.
    test('bf-p carries only user props, never internal scope bookkeeping', async ({ page }) => {
      const panel = page.locator('.settings-panel[bf-s]')
      await expect(panel).toHaveCount(1)

      const raw = await panel.getAttribute('bf-p')
      expect(raw, 'Toggle is rendered with real props (toggleItems), so bf-p must be present').not.toBeNull()

      // `getAttribute` returns the DOM's already entity-decoded attribute
      // value, so the original JSON text is ready for JSON.parse without
      // any further unescaping.
      const parsed = JSON.parse(raw as string)

      const allKeys = new Set<string>()
      collectKeys(parsed, allKeys)

      for (const internalKey of INTERNAL_KEYS) {
        expect(allKeys.has(internalKey), `bf-p must not contain internal key "${internalKey}": ${raw}`).toBe(false)
      }

      // The user-prop payload itself must still be intact — the fix
      // excludes internal fields, not the actual props. Per-item shape is
      // asserted with `toMatchObject` (not an exact key set): go-template
      // additionally seeds each item's initial signal value (`on`, derived
      // from `defaultOn`) here, which is legitimate per-item hydration
      // state, not server bookkeeping — the INTERNAL_KEYS check above is
      // what actually guards the scopeID/scope_id contract.
      expect(parsed).toHaveProperty('toggleItems')
      expect(Array.isArray(parsed.toggleItems)).toBe(true)
      expect(parsed.toggleItems).toHaveLength(3)
      expect(parsed.toggleItems[0]).toMatchObject({ label: 'Setting 1', defaultOn: true })
      expect(parsed.toggleItems[1]).toMatchObject({ label: 'Setting 2', defaultOn: false })
      expect(parsed.toggleItems[2]).toMatchObject({ label: 'Setting 3', defaultOn: false })
    })
  })
}
