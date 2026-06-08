/**
 * Profile-mode turn markers on conditional-branch handler paths (#1690, SR3,
 * issue #1786): branch-arm direct listeners and branch-scoped loop delegation.
 */

import { describe, test, expect } from 'bun:test'
import { compileJSX } from '../compiler'
import { TestAdapter } from '../adapters/test-adapter'

const adapter = new TestAdapter()

const source = `
  'use client'
  import { createSignal } from '@barefootjs/client'
  export function Panel() {
    const [open, setOpen] = createSignal(false)
    const [items] = createSignal([{ id: 1 }])
    return (
      <div>
        <button onClick={() => setOpen(!open())}>toggle</button>
        {open() && (
          <div>
            <button onClick={() => setOpen(false)}>close</button>
            <ul>{items().map(i => <li key={i.id} onClick={() => setOpen(false)}>x</li>)}</ul>
          </div>
        )}
      </div>
    )
  }
`

function clientJs(profile: boolean): string {
  return compileJSX(source, 'Panel.tsx', { adapter, profile })
    .files.find(f => f.type === 'clientJs')!.content
}

describe('branch handler turn markers', () => {
  test('profile off: no turn markers anywhere (SR8)', () => {
    expect(clientJs(false)).not.toContain('beginTurn')
  })

  test('profile on: branch-arm listener and branch-loop delegation are wrapped', () => {
    const on = clientJs(true)
    // One per handler site: top-level toggle, branch-arm close, branch-loop li.
    expect((on.match(/beginTurn\("Panel#handler:/g) ?? []).length).toBe(3)
    // The branch-arm direct listener (addEventListener inside an arm).
    expect(on).toMatch(/addEventListener\('click', \(\.\.\.__bfa\) => \{ beginTurn\("Panel#handler:s\d+:click"\)/)
    // The branch-scoped loop's delegated handler (inline try/finally form).
    expect(on).toMatch(/beginTurn\("Panel#handler:s\d+:click"\); try \{ \(\(\) => setOpen\(false\)\)\(__bfEvt\)/)
  })
})
