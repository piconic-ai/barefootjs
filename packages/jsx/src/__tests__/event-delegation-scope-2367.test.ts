/**
 * BarefootJS Compiler - Delegated handler slot lookups are scoped (#2367)
 *
 * A stateful component's delegated event handlers resolve the child slot that
 * owns an event with `target.closest('[bf="sN"]')`. Because `bf` ids are
 * assigned **per component**, the same id string legitimately exists in
 * several components — so an *unscoped* `closest()` climbs across component
 * boundaries and can match a same-id element in an ancestor component. The
 * delegation then takes the wrong branch, fails a downstream lookup, and
 * silently drops the real handler (no error thrown).
 *
 * The fix bounds the lookup to the delegating container (which holds every
 * slot it delegates on) via `closestWithin(target, '[bf="sN"]', <container>)`.
 */

import { describe, test, expect } from 'bun:test'
import { compileJSX } from '../compiler'
import { TestAdapter } from '../adapters/test-adapter'

const adapter = new TestAdapter()

describe('delegated handler slot lookups are container-scoped (#2367)', () => {
  test('keyed dynamic loop bounds each slot lookup to the container', () => {
    // WordTable-shaped repro: a <tbody> delegates keydown to two input slots
    // (front/back). Each slot lookup must be bounded to the tbody container.
    const source = `
      'use client'
      import { createSignal } from '@barefootjs/client'

      interface Row { id: string; front: string; back: string }

      export function WordTable() {
        const [rows, setRows] = createSignal<Row[]>([])
        const handleFront = (row: Row) => console.log('front', row.id)
        const handleBack = (row: Row) => console.log('back', row.id)

        return (
          <table>
            <tbody>
              {rows().map(row => (
                <tr key={row.id}>
                  <td><input onKeyDown={() => handleFront(row)} /></td>
                  <td><input onKeyDown={() => handleBack(row)} /></td>
                </tr>
              ))}
            </tbody>
          </table>
        )
      }
    `
    const result = compileJSX(source, 'WordTable.tsx', { adapter })
    expect(result.errors).toHaveLength(0)

    const clientJs = result.files.find(f => f.type === 'clientJs')!
    const content = clientJs.content

    // Delegation is wired on the tbody container.
    expect(content).toContain(".addEventListener('keydown', (__bfEvt) => {")

    // The container variable the listener is attached to.
    const containerMatch = content.match(/if \((_s\d+)\) \1\.addEventListener\('keydown'/)
    expect(containerMatch).not.toBeNull()
    const container = containerMatch![1]

    // Every slot lookup is bounded to that container — and NOT an unscoped
    // `target.closest('[bf="sN"]')` that could climb into an ancestor scope.
    const slotLookups = [...content.matchAll(/closestWithin\(target, '\[bf="s\d+"\]', (_s\d+)\)/g)]
    expect(slotLookups.length).toBe(2)
    for (const m of slotLookups) {
      expect(m[1]).toBe(container)
    }

    // No unscoped bf-slot closest() survives.
    expect(content).not.toContain(`target.closest('[bf="`)

    // The runtime helper is imported.
    expect(content).toContain('closestWithin')
    expect(content).toMatch(/import \{[^}]*\bclosestWithin\b[^}]*\} from '@barefootjs\/client\/runtime'/)
  })

  test('static-array delegation is also container-scoped', () => {
    const source = `
      'use client'

      export function List() {
        const items = [{ id: '1', label: 'A' }, { id: '2', label: 'B' }]
        const handleClick = (id: string) => console.log('item', id)

        return (
          <ul>
            {items.map(item => (
              <li key={item.id}>
                <button onClick={() => handleClick(item.id)}>Go</button>
              </li>
            ))}
          </ul>
        )
      }
    `
    const result = compileJSX(source, 'List.tsx', { adapter })
    expect(result.errors).toHaveLength(0)

    const content = result.files.find(f => f.type === 'clientJs')!.content
    expect(content).toContain('closestWithin(target,')
    expect(content).not.toContain(`target.closest('[bf="`)
  })
})
