/**
 * Text-slot HTML-escaping emit shape (#1694 + follow-up, #2651).
 *
 * Pins which interpolations the client template wraps in an escape call:
 *   - a plain, non-conditional dynamic text slot (`{stringValue}`) IS
 *     escaped — it becomes the slot's text content under `innerHTML`. Since
 *     #2651 this goes through `escapeTextOrMarkup`, not bare `escapeText`:
 *     the slot is claim-plan `kind: 'markup'` (the value may be a live
 *     `Node`, or a `bfMarkup()`-branded JSX-element-prop value), and
 *     `escapeTextOrMarkup` is a strict superset of `escapeText` for every
 *     non-branded value — this pin's actual escaping behaviour for a plain
 *     string is unchanged, only the call name changed to match the
 *     REACTIVE side's existing `escapeTextOrNode` classification;
 *   - a branch-slot expression (Child-position value inside a conditional
 *     `template()` arrow) is routed through `__bfSlot` and must NOT be
 *     wrapped in either escape call. `__bfSlot` returns raw
 *     `<!--bf-slot:N-->` markers for live nodes; escaping the whole call
 *     corrupts them and drops slotted content (the regression that broke
 *     `e2e-site-ui`). `__bfSlot` escapes its own plain-string path
 *     internally instead.
 */

import { describe, test, expect } from 'bun:test'
import { compileJSX } from '../compiler'
import { TestAdapter } from '../adapters/test-adapter'

const adapter = new TestAdapter()

function getClientJs(source: string, filename: string): string {
  const result = compileJSX(source, filename, { adapter })
  expect(result.errors.filter(e => e.severity === 'error')).toHaveLength(0)
  const clientJs = result.files.find(f => f.type === 'clientJs')
  expect(clientJs).toBeDefined()
  return clientJs!.content
}

describe('text-slot escaping', () => {
  test('a plain text slot is wrapped in escapeTextOrMarkup (#2651)', () => {
    const clientJs = getClientJs(
      `'use client'
       export function Label({ text }: { text: string }) {
         return <span>{text}</span>
       }`,
      'Label.tsx',
    )
    expect(clientJs).toMatch(/<!--bf:\w+-->\$\{escapeTextOrMarkup\(_p\.text\)\}<!--\/-->/)
  })

  test('a branch-slot expression is NOT wrapped in escapeTextOrMarkup or escapeText', () => {
    const clientJs = getClientJs(
      `'use client'
       import { createSignal } from '@barefootjs/client'
       export function Branch({ show }: { show: boolean }) {
         const [t] = createSignal('hi')
         return <div>{show ? <span>{t()}</span> : null}</div>
       }`,
      'Branch.tsx',
    )
    // The branch value goes through __bfSlot (raw markers preserved)…
    expect(clientJs).toMatch(/\$\{__bfSlot\(/)
    // …and must never be double-wrapped by either text-escape call.
    expect(clientJs).not.toMatch(/escapeTextOrMarkup\(\s*__bfSlot/)
    expect(clientJs).not.toMatch(/escapeText\(\s*__bfSlot/)
  })
})
