/**
 * Profile-mode ids on loop-child DOM-binding effects (#1690, SR3/SR4,
 * issue #1795 Phase 2).
 *
 * Inside a `map(it => …)` body the emitter wraps every loop-param read in a
 * `createEffect`. In profile mode each of those per-item attribute / text
 * effects now carries a `<Component>#binding:<slotId>` id, and `buildIdIndex`
 * resolves it from the graph's loop-child `domBindings` (slot + loc) — the
 * analyzer now threads loop-param context so `{it.t}` / `class={it.n…}` reads
 * register as reactive bindings. Off by default the effects are byte-identical
 * (SR8).
 */

import { describe, test, expect } from 'bun:test'
import { compileJSX } from '../compiler'
import { TestAdapter } from '../adapters/test-adapter'
import { buildIdIndex } from '../profiler'
import { buildComponentAnalysis } from '../debug'

const adapter = new TestAdapter()

// `{it.t}` and `: {it.n}` are loop-child text effects (s0, s1); `class={…}` is
// a loop-child attribute effect (s2); the loop itself is s3.
const source = `
  'use client'
  import { createSignal } from '@barefootjs/client'
  export function List() {
    const [items] = createSignal([{ id: 1, t: 'a', n: 0 }])
    return (
      <ul>
        {items().map(it => (
          <li key={it.id} class={it.n > 0 ? 'hot' : 'cold'}>
            <span>{it.t}</span>: {it.n}
          </li>
        ))}
      </ul>
    )
  }
`

function clientJs(profile: boolean): string {
  return compileJSX(source, 'List.tsx', { adapter, profile })
    .files.find(f => f.type === 'clientJs')!.content
}

describe('loop-child binding-effect ids (#1795 Phase 2)', () => {
  test('profile off: no #binding ids anywhere (SR8)', () => {
    expect(clientJs(false)).not.toContain('#binding:')
  })

  test('profile on: loop-child text effects carry #binding ids', () => {
    const on = clientJs(true)
    // Both `{it.t}` and `{it.n}` text effects.
    expect(on).toMatch(/__rt_s\d+\.textContent = String\(it\(\)\.t\) }, "List#binding:s\d+"\)/)
    expect(on).toMatch(/__rt_s\d+\.textContent = String\(it\(\)\.n\) }, "List#binding:s\d+"\)/)
  })

  test('profile on: the loop-child attribute effect carries a #binding id', () => {
    const on = clientJs(true)
    expect(on).toMatch(/setAttribute\('class'[\s\S]*?}, "List#binding:s\d+"\)/)
  })

  test('profile on: the `key` attribute is NOT emitted as a binding effect', () => {
    const on = clientJs(true)
    // `key` becomes the loop keyFn / data-key, never a createEffect.
    expect(on).not.toContain('it().id) }, "List#binding')
  })

  test('analyzer registers loop-child text/attribute bindings (not `key`)', () => {
    const { graph } = buildComponentAnalysis(source, 'List.tsx')
    const loopChild = graph.domBindings.filter(b => b.type !== 'loop')
    // class (attribute) + two texts = 3; `key` is excluded.
    expect(loopChild.map(b => b.label).sort()).toEqual(['class', 'text "s0"', 'text "s1"'])
    expect(loopChild.every(b => b.classification === 'reactive')).toBe(true)
  })

  test('a loop-param name inside a string literal is NOT mistaken for a read', () => {
    // Index param `i`; `data-lit={'i'}` references no identifier — only the
    // string literal `'i'`. Lexer-aware detection (freeIdentifiers / freeRefs)
    // must not register it as a reactive binding, where a raw-string regex would.
    const litSource = `
      'use client'
      import { createSignal } from '@barefootjs/client'
      export function L() {
        const [items] = createSignal([{ id: 1 }])
        return <ul>{items().map((it, i) => <li key={it.id} data-lit={'i'} data-idx={i === 0 ? 'a' : 'b'}>x</li>)}</ul>
      }
    `
    const { graph } = buildComponentAnalysis(litSource, 'L.tsx')
    const labels = graph.domBindings.filter(b => b.type === 'attribute').map(b => b.label)
    // `data-idx` reads the index identifier → reactive; `data-lit` is literal-only → not.
    expect(labels).toContain('data-idx')
    expect(labels).not.toContain('data-lit')
  })

  test('buildIdIndex resolves every loop-child binding to source loc', () => {
    const { graph } = buildComponentAnalysis(source, 'List.tsx')
    const index = buildIdIndex(graph)
    for (const b of graph.domBindings) {
      const node = index.get(`List#binding:${b.slotId}`)
      expect(node?.kind, `binding ${b.slotId} (${b.type})`).toBe('effect')
      expect(node?.loc.file).toBe('List.tsx')
      expect(node?.loc.line).toBeGreaterThan(0)
    }
  })
})
