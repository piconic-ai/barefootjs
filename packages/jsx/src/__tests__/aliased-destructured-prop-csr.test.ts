/**
 * Aliased (renaming) destructured props on the CSR/client-JS path (#2524).
 *
 * `_p` is uniformly keyed by the caller-facing property name
 * (`sourceName ?? name` — see `ParamInfo.sourceName`'s docstring in
 * `types.ts`) across every producer/consumer. Before this fix, client-JS
 * emission kept reading `_p.<localBinding>` for a renaming destructure
 * (`{ n: count }`), so `_p.count` read a property the caller never sent
 * (the caller passes `n`) and the local binding hydrated to `undefined`.
 *
 * Mirrors `ssr-defaults.test.ts`'s aliased-prop describes (#2460) for the
 * SSR-defaults half; this covers the generated `initXxx` extraction and
 * the CSR `template:` lambda.
 */

import { describe, test, expect } from 'bun:test'
import { compileJSX } from '../compiler'
import { TestAdapter } from '../adapters/test-adapter'

const adapter = new TestAdapter()

describe('aliased destructured props reach client JS under the caller-facing key (#2524)', () => {
  test('{ text, n: count } — init extraction and template lambda both read `_p.n`, not `_p.count`', () => {
    const source = `
      'use client'
      import { createEffect } from '@barefootjs/client'
      export function Badge({ text, n: count }: { text: string; n: number }) {
        createEffect(() => {
          console.log(count)
        })
        return <span>{text}:{count}</span>
      }
    `
    const result = compileJSX(source, 'Badge.tsx', { adapter })
    const errors = result.errors.filter((e) => e.severity === 'error')
    expect(errors).toEqual([])

    const clientJs = result.files.find((f) => f.type === 'clientJs')
    expect(clientJs).toBeDefined()
    // `initBadge` extracts the local binding `count` from the
    // CALLER-facing key `n` — never the local key `count`.
    expect(clientJs!.content).toContain('const count = _p.n')
    expect(clientJs!.content).not.toContain('_p.count')
    // The CSR `template:` lambda (module-scope SSR fallback) reads the
    // same caller-facing key.
    expect(clientJs!.content).toContain('escapeText(_p.n)')
  })

  test('{ text, n } — un-aliased: byte-identical to the pre-fix `_p.n` extraction', () => {
    // `sourceName ?? name` is an identity for an un-aliased prop, so this
    // case must be indistinguishable from before the rename-aware fix.
    const source = `
      'use client'
      import { createEffect } from '@barefootjs/client'
      export function Badge({ text, n }: { text: string; n: number }) {
        createEffect(() => {
          console.log(n)
        })
        return <span>{text}:{n}</span>
      }
    `
    const result = compileJSX(source, 'Badge.tsx', { adapter })
    const errors = result.errors.filter((e) => e.severity === 'error')
    expect(errors).toEqual([])

    const clientJs = result.files.find((f) => f.type === 'clientJs')
    expect(clientJs).toBeDefined()
    expect(clientJs!.content).toContain('const n = _p.n')
    expect(clientJs!.content).toContain('escapeText(_p.n)')
  })

  test('aliased controlled-signal prop — the accessor reads the caller-facing key', () => {
    // `build-declaration-emit`'s controlled-signal path resolves
    // `controlled.propName` (a LOCAL name) through the prop's
    // `sourceName` before emitting the `_p.` accessor.
    const source = `
      'use client'
      import { createSignal } from '@barefootjs/client'
      export function Toggle({ isOpen: open = false }: { isOpen?: boolean }) {
        const [openState, setOpenState] = createSignal(open)
        return <button onClick={() => setOpenState(!openState())}>{openState() ? 'on' : 'off'}</button>
      }
    `
    const result = compileJSX(source, 'Toggle.tsx', { adapter })
    const errors = result.errors.filter((e) => e.severity === 'error')
    expect(errors).toEqual([])

    const clientJs = result.files.find((f) => f.type === 'clientJs')
    expect(clientJs).toBeDefined()
    expect(clientJs!.content).toContain('_p.isOpen')
    expect(clientJs!.content).not.toContain('_p.open')
  })

  test('aliased event-handler prop — the handler const reads the caller-facing key', () => {
    // `props-event-handlers` extracts the handler under its LOCAL name
    // from the CALLER-facing `_p` key.
    const source = `
      'use client'
      export function Clicker({ onPress: handlePress }: { onPress?: () => void }) {
        return <button onClick={handlePress}>go</button>
      }
    `
    const result = compileJSX(source, 'Clicker.tsx', { adapter })
    const errors = result.errors.filter((e) => e.severity === 'error')
    expect(errors).toEqual([])

    const clientJs = result.files.find((f) => f.type === 'clientJs')
    expect(clientJs).toBeDefined()
    expect(clientJs!.content).toContain('const handlePress = _p.onPress')
    expect(clientJs!.content).not.toContain('_p.handlePress')
  })
})
