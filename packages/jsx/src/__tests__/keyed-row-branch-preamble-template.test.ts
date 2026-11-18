/**
 * #3913 — a keyed `.map()` row whose callback-preamble local feeds a
 * conditional branch. The branch's `template()` closure is handed to
 * `insert()`, which calls it on each swap into the branch. The closure used
 * to read the local declared once in the row's first render, so a row reused
 * with new data and a flipped condition showed the stale value.
 *
 * The fix re-runs the row preamble at the top of the `template()` closure
 * (`LoopChildConditional.branchesReadPreamble`). These tests pin the compiled
 * output; the live-DOM behaviour is pinned by the `keyed-row-branch-preamble*`
 * shared fixtures in `packages/adapter-tests`.
 */

import { describe, test, expect } from 'bun:test'
import { compileJSX } from '../compiler'
import { TestAdapter } from '../adapters/test-adapter'

const adapter = new TestAdapter()

function clientJsFor(source: string): string {
  const result = compileJSX(source, 'Repro.tsx', { adapter })
  expect(result.errors.filter(e => e.severity === 'error')).toHaveLength(0)
  const clientJs = result.files.find(f => f.type === 'clientJs')
  expect(clientJs).toBeDefined()
  return clientJs!.content
}

/** The `template: () => { ... }` closures of the branches, in source order. */
function branchTemplates(js: string): string[] {
  return js.match(/template: \(\) => \{[^\n]*__slots[^\n]*\},?\n/g) ?? []
}

describe('keyed row branch template re-runs the preamble (#3913)', () => {
  test('a local read by both branches is recomputed inside each template closure', () => {
    const js = clientJsFor(`
      'use client'
      import { createSignal } from '@barefootjs/client'
      export function F() {
        const [items] = createSignal([{ id: 'a', name: 'x', on: true }])
        return (
          <ul>
            {items().map((it, i) => {
              const label = it.name + i
              return <li key={it.id}>{it.on ? <b>{label}</b> : <i>{label}</i>}</li>
            })}
          </ul>
        )
      }
    `)
    const templates = branchTemplates(js).filter(t => t.includes('__bfSlot(label'))
    expect(templates).toHaveLength(2)
    for (const t of templates) {
      expect(t).toMatch(/template: \(\) => \{ const label = it\(\)\.name \+ i\(\); const __slots = \[\];/)
    }
  })

  test('a branch that does not read the local keeps its template closure as it was', () => {
    const js = clientJsFor(`
      'use client'
      import { createSignal } from '@barefootjs/client'
      export function F() {
        const [items] = createSignal([{ id: 'a', name: 'x', on: true }])
        return (
          <ul>
            {items().map(it => {
              const label = it.name + '!'
              return <li key={it.id}>{label}{it.on ? <b>{it.name}</b> : <i>{it.name}</i>}</li>
            })}
          </ul>
        )
      }
    `)
    for (const t of branchTemplates(js)) {
      expect(t).toContain('template: () => { const __slots = [];')
    }
  })

  test('a local read only under a nested conditional is recomputed in the outer branch template', () => {
    const js = clientJsFor(`
      'use client'
      import { createSignal } from '@barefootjs/client'
      export function F() {
        const [items] = createSignal([{ id: 'a', name: 'x', on: true, hot: false }])
        return (
          <ul>
            {items().map(it => {
              const label = '[' + it.name + ']'
              return <li key={it.id}>{it.on ? (it.hot ? <b>{label}</b> : <u>{label}</u>) : <i>{it.name}</i>}</li>
            })}
          </ul>
        )
      }
    `)
    const withLabel = branchTemplates(js).filter(t => t.includes('__bfSlot(label') || t.includes('escapeText(label'))
    expect(withLabel.length).toBeGreaterThan(0)
    for (const t of withLabel) expect(t).toContain("const label = '[' + it().name + ']';")
  })
})
