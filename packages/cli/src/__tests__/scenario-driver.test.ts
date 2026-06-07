/**
 * Scenario driver (#1690, SR2/SR7) — the dynamic half of `bf debug profile`.
 *
 * Mounts a component's instrumented build in happy-dom, fires its interactive
 * elements, and records the reactive event stream. This exercises the real
 * runtime end-to-end (the unit tests in @barefootjs/jsx feed synthetic streams).
 */

import { describe, test, expect } from 'bun:test'
import { writeFileSync, mkdtempSync, rmSync } from 'fs'
import { join } from 'path'
import { tmpdir } from 'os'
import { runAutoScenario, runFileScenario } from '../lib/scenario-driver'

const COUNTER = `
  'use client'
  import { createSignal, createMemo } from '@barefootjs/client'
  export function Counter() {
    const [count, setCount] = createSignal(0)
    const doubled = createMemo(() => count() * 2)
    return <button onClick={() => setCount(count() + 1)}>{doubled()}</button>
  }
`

describe('runAutoScenario', () => {
  test('mounts, fires the handler, and records a turn-stamped stream', async () => {
    const r = await runAutoScenario(COUNTER, 'Counter.tsx', 'Counter')
    expect(r.rootTag).toBe('button')
    expect(r.fired).toBeGreaterThanOrEqual(1)
    expect(r.events.length).toBeGreaterThan(0)

    // The auto-click drove the compiled handler's beginTurn/endTurn wrapper.
    const turn = r.events.find(e => e.type === 'turnBegin')
    expect(turn?.handlerId).toMatch(/^Counter#handler:s\d+:click$/)

    // The set landed inside that turn, and the memo re-ran with its real id.
    const set = r.events.find(e => e.type === 'signalSet' && e.signal === 'Counter#signal:count')
    expect(set?.turn).toBe(turn!.handlerId)
    expect(r.events.some(e => e.type === 'effectEnter' && e.subscriber === 'Counter#memo:doubled')).toBe(true)
  })

  test('fires list-item (delegated) handlers, not just buttons (#1796)', async () => {
    const LIST = `
      'use client'
      import { createSignal } from '@barefootjs/client'
      export function List() {
        const [items, setItems] = createSignal([{ id: 1 }, { id: 2 }])
        return (
          <ul>
            {items().map(it => (
              <li key={it.id} onClick={() => setItems(items().filter(x => x.id !== it.id))}>row</li>
            ))}
          </ul>
        )
      }
    `
    const r = await runAutoScenario(LIST, 'List.tsx', 'List')
    // The delegated li handler fired (a turn opened) even though there's no button.
    const turn = r.events.find(e => e.type === 'turnBegin')
    expect(turn?.handlerId).toMatch(/^List#handler:s\d+:click$/)
    expect(r.fired).toBeGreaterThanOrEqual(2) // one per rendered row
  })

  test('a component with no handler records no interaction turns', async () => {
    const DISPLAY = `
      'use client'
      import { createSignal } from '@barefootjs/client'
      export function Display() { const [n] = createSignal(5); return <div>{n()}</div> }
    `
    const r = await runAutoScenario(DISPLAY, 'Display.tsx', 'Display')
    expect(r.events.some(e => e.type === 'turnBegin')).toBe(false)
  })
})

describe('runFileScenario (composition, #1796)', () => {
  test('compiles a story + its local import, mounts the composition, fires it', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'bf-story-'))
    try {
      writeFileSync(join(dir, 'toggle.tsx'), `
        'use client'
        import { createSignal } from '@barefootjs/client'
        export function Toggle() {
          const [on, setOn] = createSignal(false)
          return <button onClick={() => setOn(!on())}>{on() ? 'on' : 'off'}</button>
        }
      `)
      writeFileSync(join(dir, 'story.tsx'), `
        import { Toggle } from './toggle'
        export function Story() { return <div><Toggle /></div> }
      `)

      const r = await runFileScenario(join(dir, 'story.tsx'))
      // Both files were loaded (dependency first, story last).
      expect(r.sources.map(s => s.filePath.split('/').pop())).toEqual(['toggle.tsx', 'story.tsx'])
      // The composed Toggle's handler fired through the Story wrapper.
      const turn = r.events.find(e => e.type === 'turnBegin')
      expect(turn?.handlerId).toMatch(/^Toggle#handler:s\d+:click$/)
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
  })
})
