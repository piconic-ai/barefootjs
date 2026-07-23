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
 * The fix guards the match with `<container>.contains(sNEl)`. The delegating
 * container holds every slot it delegates on, so a same-id element in an
 * *ancestor* component (never a descendant of the container) is rejected and
 * the handler falls through to the correct branch — without growing the
 * client runtime (native `closest` + native `contains`).
 */

import { describe, test, expect } from 'bun:test'
import { compileJSX } from '../compiler'
import { TestAdapter } from '../adapters/test-adapter'

const adapter = new TestAdapter()

describe('delegated handler slot lookups are container-scoped (#2367)', () => {
  test('keyed dynamic loop guards each slot match with container.contains', () => {
    // WordTable-shaped repro: a <tbody> delegates keydown to two input slots
    // (front/back). Each slot match must be gated to the tbody container.
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

    // Both slot branches gate the match on `<container>.contains(sNEl)` so a
    // same-id element in an ancestor component (never a descendant of the
    // container) can't be taken.
    const guards = [...content.matchAll(/if \((s\d+)El && (_s\d+)\.contains\(\1El\)\)/g)]
    expect(guards.length).toBe(2)
    for (const m of guards) {
      expect(m[2]).toBe(container)
    }

    // The lookup itself stays a plain native `closest` — no new runtime helper.
    expect(content).toContain(`target.closest('[bf="`)
    expect(content).not.toContain('closestWithin')
  })

  test('static-array delegation is also gated by container.contains', () => {
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
    expect(content).toMatch(/if \(s\d+El && _s\d+\.contains\(s\d+El\)\)/)
    expect(content).not.toContain('closestWithin')
  })
})
