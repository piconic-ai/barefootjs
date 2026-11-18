/**
 * #3731: a child component inside an inner loop of a loop-row child
 * component's forwarded children. The signal-array row owns its
 * initialisation (`upsertChild` in each inner row, hydrated and client-built
 * alike); the static array keeps its own `initChild` pass, so no component is
 * initialised twice.
 *
 * Conformance coverage: `loop-row-child-children-inner-loop-component`.
 */

import { describe, test, expect } from 'bun:test'
import { compileJSX } from '../compiler'
import { TestAdapter } from '../adapters/test-adapter'

const adapter = new TestAdapter()

function clientJsOf(source: string): string {
  const result = compileJSX(source, 'Comp.tsx', { adapter })
  expect(result.errors.filter(e => e.severity === 'error')).toHaveLength(0)
  return result.files.find(f => f.type === 'clientJs')!.content
}

const prelude = `
  'use client'
  import { createSignal } from '@barefootjs/client'
  function Chip({ children }: { children?: any }) { return <span class="chip">{children}</span> }
  function Btn({ onPick }: { onPick: () => void }) { return <button onClick={onPick}>b</button> }
  const ROWS = [{ id: 'a', tags: ['x'] }]
`

const inner = `<Chip key={o.id}><ul>{o.tags.map((t) => <li key={t}><Btn onPick={() => pick(o.id, t)} /></li>)}</ul></Chip>`

describe('component in an inner loop of a component-root row (#3731)', () => {
  test('a signal-array row initialises it once per row path (hydrated and client-built)', () => {
    const js = clientJsOf(`${prelude}
      export function Comp() {
        const [rows] = createSignal(ROWS)
        const pick = (a: string, b: string) => {}
        return <div>{rows().map((o) => (${inner}))}</div>
      }`)
    expect(js.match(/upsertChild\(__innerEl[^,]*, 'Btn__/g)).toHaveLength(2)
    expect(js).not.toContain('Initialize component-rooted inner-loop components')
  })

  test('a static array keeps its single initChild pass', () => {
    const js = clientJsOf(`${prelude}
      export function Comp() {
        const pick = (a: string, b: string) => {}
        return <div>{ROWS.map((o) => (${inner}))}</div>
      }`)
    expect(js).toContain('Initialize component-rooted inner-loop components')
    expect(js).not.toContain('upsertChild(')
  })

  test('a handler two inner loops deep reads every enclosing row as an accessor', () => {
    const js = clientJsOf(`${prelude}
      export function Comp() {
        const [rows] = createSignal([{ id: 'a', groups: [{ id: 'b', tags: ['x'] }] }])
        const pick = (a: string) => {}
        return <div>{rows().map((o) => (
          <Chip key={o.id}><ul>{o.groups.map((g) => (
            <li key={g.id}><ol>{g.tags.map((t) => <li key={t}><Btn onPick={() => pick(o.id + g.id + t)} /></li>)}</ol></li>
          ))}</ul></Chip>
        ))}</div>`)
    expect(js).toContain('pick(o().id + g().id + t())')
    expect(js).not.toMatch(/pick\(o\.id/)
  })
})
