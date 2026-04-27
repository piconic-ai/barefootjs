/**
 * Regression tests for #1071: reactive attribute bindings inside a
 * conditional branch must re-attach when `insert()` swaps in a fresh
 * element on the rising edge of the condition.
 *
 * Surfaced by the Phase 9 graph editor (#135). The block has a
 * connect-preview path mounted via `{cond ? <path d={signal()}/> : null}`.
 * Before this fix, the compiler emitted the reactive `d` updater at the
 * init-level top-level: a single `_sN` variable was resolved once via
 * `__scope.querySelector('[bf="sN"]')`, and the surrounding
 * `createEffect(...)` always wrote to that initial reference. When
 * `insert()` later swapped in a fresh element for the truthy branch, the
 * effect kept writing to the now-detached placeholder and the live
 * element's `d` attribute never updated.
 *
 * The fix moves branch-interior reactive attribute bindings into the
 * branch's `bindEvents(__branchScope)` callback so they re-resolve their
 * slot from the freshly-inserted DOM on every swap. The init-level emit
 * for those slots disappears; the only `setAttribute('d', …)` for the
 * conditional path lives inside the truthy arm's `bindEvents` body.
 */

import { describe, test, expect } from 'bun:test'
import { compileJSXSync } from '../compiler'
import { TestAdapter } from '../adapters/test-adapter'

const adapter = new TestAdapter()

function getClientJs(source: string, filename: string): string {
  const result = compileJSXSync(source, filename, { adapter })
  expect(result.errors.filter(e => e.severity === 'error')).toHaveLength(0)
  const clientJs = result.files.find(f => f.type === 'clientJs')
  expect(clientJs).toBeDefined()
  return clientJs!.content
}

describe('conditional reactive bindings re-attach on branch swap (#1071)', () => {
  test('reactive attr inside a conditional element lives in bindEvents, not at init level', () => {
    const source = `
      'use client'
      import { createSignal } from '@barefootjs/client'

      export function Demo() {
        const [shown, setShown] = createSignal(false)
        const [d, setD] = createSignal('M 0 0 L 10 10')
        return (
          <svg onClick={() => setShown(true)}>
            {shown() ? (
              <path data-preview d={d()} />
            ) : null}
          </svg>
        )
      }
    `

    const clientJs = getClientJs(source, 'Demo.tsx')

    // The reactive `d` setter must live inside the truthy branch's
    // bindEvents body, scoped on `__branchScope`. Without this, the
    // setter writes to a stale, detached node.
    const insertIdx = clientJs.indexOf('insert(')
    expect(insertIdx).toBeGreaterThanOrEqual(0)
    const insertBlock = clientJs.slice(insertIdx)
    expect(insertBlock).toMatch(/bindEvents:\s*\(__branchScope\)\s*=>\s*\{[\s\S]*?setAttribute\(['"]d['"]/)

    // The slot must be resolved relative to __branchScope so each fresh
    // DOM swap finds the live element, not a once-captured reference.
    expect(insertBlock).toMatch(/qsa\(__branchScope,\s*'\[bf="[^"]+"\]'\)/)
  })

  test('reactive attr inside a conditional is not also emitted at the init top-level', () => {
    // The bug was that the reactive updater appeared BOTH at init level
    // (binding to a stale `_sN`) and (after the fix) inside bindEvents.
    // The branch path is the only one that should remain — otherwise
    // both effects fire, and the init-level effect writes to the
    // detached node every signal change.
    const source = `
      'use client'
      import { createSignal } from '@barefootjs/client'

      export function Demo() {
        const [shown, setShown] = createSignal(false)
        const [d, setD] = createSignal('M 0 0 L 10 10')
        return (
          <svg onClick={() => setShown(true)}>
            {shown() ? (
              <path data-preview d={d()} />
            ) : null}
          </svg>
        )
      }
    `

    const clientJs = getClientJs(source, 'Demo.tsx')
    const insertIdx = clientJs.indexOf('insert(')
    expect(insertIdx).toBeGreaterThanOrEqual(0)

    // Everything before insert() is the init-level emit. There must be
    // NO setAttribute('d', …) call there — the only one is inside the
    // bindEvents body of the truthy arm.
    const initSection = clientJs.slice(0, insertIdx)
    expect(initSection).not.toMatch(/setAttribute\(['"]d['"]/)
  })

  test('branch-interior reactive effect uses createDisposableEffect for cleanup on branch swap', () => {
    // Branch-scoped effects must dispose when the branch deactivates,
    // otherwise stale subscriptions accumulate every time the condition
    // flips. `createDisposableEffect` returns a dispose callback; the
    // arm body collects them into `__disposers` and returns a cleanup
    // closure that the runtime's `branchCleanup` calls before swap.
    const source = `
      'use client'
      import { createSignal } from '@barefootjs/client'

      export function Demo() {
        const [shown, setShown] = createSignal(false)
        const [d, setD] = createSignal('M 0 0 L 10 10')
        return (
          <svg onClick={() => setShown(true)}>
            {shown() ? (
              <path data-preview d={d()} />
            ) : null}
          </svg>
        )
      }
    `

    const clientJs = getClientJs(source, 'Demo.tsx')
    const insertIdx = clientJs.indexOf('insert(')
    expect(insertIdx).toBeGreaterThanOrEqual(0)
    const insertBlock = clientJs.slice(insertIdx)

    // The branch body wraps the reactive attr update in createDisposableEffect.
    expect(insertBlock).toMatch(/createDisposableEffect\(\(\)\s*=>\s*\{[\s\S]*?setAttribute\(['"]d['"]/)
  })
})
