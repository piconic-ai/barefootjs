/**
 * #2778 — a local `const` alias of a signal getter (`const items__alias
 * = items`) was substituted as the literal `undefined` in the CSR
 * template instead of following the alias to the signal's initializer.
 * `(undefined)()` is a guaranteed `TypeError` on pure CSR mount.
 *
 * The alias binding is not a value copy — `items__alias` IS `items` for
 * substitution purposes — so `resolveGetterAliases` (`csr-substitute.ts`)
 * registers it as the SAME call-kind substitution entry as its origin,
 * the same mechanism that already substitutes `items()` correctly.
 */
import { describe, test, expect } from 'bun:test'
import { compileJSX } from '../compiler'
import { TestAdapter } from '../adapters/test-adapter'

const adapter = new TestAdapter()

function compile(source: string) {
  const result = compileJSX(source, 'Repro.tsx', { adapter })
  const clientJs = result.files.find(f => f.type === 'clientJs')?.content ?? ''
  return { errors: result.errors.filter(e => e.severity === 'error'), clientJs }
}

describe('#2778 — signal/memo getter alias resolves in the CSR template', () => {
  test('a one-hop signal-getter alias as a .map() source inlines the array, not `undefined`', () => {
    const { errors, clientJs } = compile(`
      "use client";
      import { createSignal } from '@barefootjs/client'
      export function Aliased() {
        const [items] = createSignal([{ id: 1, label: 'a' }, { id: 2, label: 'b' }])
        const items__alias = items
        return (
          <ul>
            {items__alias().map(it => <li key={it.id}>{it.label}</li>)}
          </ul>
        )
      }
    `)
    expect(errors).toHaveLength(0)
    expect(clientJs).not.toContain('(undefined)')
    expect(clientJs).toContain(`[{ id: 1, label: 'a' }, { id: 2, label: 'b' }]`)
  })

  test('a one-hop memo alias inlines the memo body', () => {
    const { errors, clientJs } = compile(`
      "use client";
      import { createSignal, createMemo } from '@barefootjs/client'
      export function Aliased() {
        const [count] = createSignal(3)
        const doubled = createMemo(() => count() * 2)
        const doubled__alias = doubled
        return <span>{doubled__alias()}</span>
      }
    `)
    expect(errors).toHaveLength(0)
    expect(clientJs).not.toContain('(undefined)')
  })

  test('a two-hop alias chain resolves without a spurious diagnostic', () => {
    const { errors, clientJs } = compile(`
      "use client";
      import { createSignal } from '@barefootjs/client'
      export function Aliased() {
        const [items] = createSignal([{ id: 1, label: 'a' }])
        const a = items
        const b = a
        return (
          <ul>
            {b().map(it => <li key={it.id}>{it.label}</li>)}
          </ul>
        )
      }
    `)
    expect(errors).toHaveLength(0)
    expect(clientJs).not.toContain('undefined')
  })

  test('a `.map()` row PARAMETER literally named after the alias is not rewritten (shadow guard)', () => {
    // A REAL component-scope alias must exist for this to exercise
    // anything — `resolveGetterAliases` only registers a substitution
    // entry for `items__alias` because of the `const [items] =
    // createSignal(...); const items__alias = items` pair below. Without
    // it (the original version of this test), the row parameter of the
    // SAME name in `rows.map(items__alias => ...)` shadows nothing, and
    // the assertion would pass identically whether or not the fix exists
    // (pullfrog review, PR #2814).
    const { errors, clientJs } = compile(`
      "use client";
      import { createSignal } from '@barefootjs/client'
      export function List() {
        const [items] = createSignal([{ id: 1, label: 'x' }])
        const items__alias = items
        const rows = [{ id: 1, name: 'a' }]
        return (
          <ul>
            <li>{items__alias().length}</li>
            {rows.map(items__alias => <li key={items__alias.id}>{items__alias.name}</li>)}
          </ul>
        )
      }
    `)
    expect(errors).toHaveLength(0)
    // Outside the loop, the component-scope alias substitutes correctly...
    expect(clientJs).toContain(`[{ id: 1, label: 'x' }]).length`)
    // ...but inside the loop, the SAME name is the row parameter and must
    // stay untouched — not rewritten to the origin signal's array, and not
    // flagged UNSAFE by the outer alias's unsafe-name bookkeeping either
    // (the two bugs this construction actually exercises).
    expect(clientJs).toContain('items__alias.name')
    expect(clientJs).toContain('escapeAttr(items__alias.id)')
    expect(clientJs).not.toContain('escapeAttr(undefined)')
  })
})
