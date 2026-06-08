/**
 * Profile-mode turn markers on the loop event-delegation path (#1690, SR3).
 *
 * A dynamic list delegates its child events to a single container listener.
 * In profile mode each delegated handler call is bracketed with
 * `beginTurn`/`endTurn` so the reactive work it triggers is attributed to one
 * turn, with the same id namespace as direct handlers. Off by default the
 * dispatcher is unchanged (SR8).
 */

import { describe, test, expect } from 'bun:test'
import { compileJSX } from '../compiler'
import { TestAdapter } from '../adapters/test-adapter'

const adapter = new TestAdapter()

const source = `
  'use client'
  import { createSignal } from '@barefootjs/client'

  export function TodoList() {
    const [items, setItems] = createSignal([{ id: 1, label: 'a' }])
    return (
      <ul>
        {items().map(item => (
          <li key={item.id} onClick={() => setItems(xs => xs.filter(x => x.id !== item.id))}>
            {item.label}
          </li>
        ))}
      </ul>
    )
  }
`

function clientJs(profile: boolean): string {
  return compileJSX(source, 'TodoList.tsx', { adapter, profile })
    .files.find(f => f.type === 'clientJs')!.content
}

describe('loop delegation — profile off (SR8)', () => {
  test('dispatcher carries no turn markers', () => {
    const off = clientJs(false)
    expect(off).toContain('addEventListener') // sanity: delegation present
    expect(off).not.toContain('beginTurn')
    expect(off).not.toContain('endTurn')
  })
})

describe('loop delegation — profile on (SR3)', () => {
  test('brackets the delegated handler call with a try/finally turn', () => {
    const on = clientJs(true)
    expect(on).toContain('beginTurn("TodoList#handler:')
    expect(on).toContain('try {')
    expect(on).toContain('finally { endTurn() }')
  })

  test('auto-wires the beginTurn/endTurn runtime import', () => {
    const on = clientJs(true)
    const importLine = on.split('\n').find(l => l.includes('@barefootjs/client/runtime'))
    expect(importLine).toContain('beginTurn')
    expect(importLine).toContain('endTurn')
  })
})
