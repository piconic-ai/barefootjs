/**
 * Profile-mode ids on DOM-binding effects (#1690, SR3/SR4, issue #1795).
 *
 * Text / attribute updates emit `createEffect(…, "<Component>#binding:<slotId>")`
 * in profile mode, and `buildIdIndex` resolves those ids from the graph's
 * `domBindings` (slot + loc). Off by default the effect is unchanged (SR8).
 */

import { describe, test, expect } from 'bun:test'
import { compileJSX } from '../compiler'
import { TestAdapter } from '../adapters/test-adapter'
import { buildIdIndex } from '../profiler'
import { buildComponentAnalysis } from '../debug'

const adapter = new TestAdapter()

const source = `
  'use client'
  import { createSignal } from '@barefootjs/client'
  export function Widget() {
    const [n, setN] = createSignal(0)
    return <button class={n() > 0 ? 'on' : 'off'} onClick={() => setN(n() + 1)}>{n()}</button>
  }
`

function clientJs(profile: boolean): string {
  return compileJSX(source, 'Widget.tsx', { adapter, profile })
    .files.find(f => f.type === 'clientJs')!.content
}

const loopSource = `
  'use client'
  import { createSignal } from '@barefootjs/client'
  export function List() {
    const [items] = createSignal([{ id: 1, t: 'a' }, { id: 2, t: 'b' }])
    return <ul>{items().map(it => <li key={it.id}>{it.t}</li>)}</ul>
  }
`

describe('loop-effect id (mapArray bfId)', () => {
  test('profile on: mapArray carries the loop binding id; off: it does not', () => {
    const on = compileJSX(loopSource, 'List.tsx', { adapter, profile: true })
      .files.find(f => f.type === 'clientJs')!.content
    const off = compileJSX(loopSource, 'List.tsx', { adapter, profile: false })
      .files.find(f => f.type === 'clientJs')!.content
    expect(on).toMatch(/mapArray\(.*List#binding:s\d+/s)
    expect(off).not.toContain('#binding:')
  })

  test('buildIdIndex resolves the loop binding to source loc', () => {
    const { graph } = buildComponentAnalysis(loopSource, 'List.tsx')
    const index = buildIdIndex(graph)
    const loopBinding = graph.domBindings.find(b => b.type === 'loop')!
    const node = index.get(`List#binding:${loopBinding.slotId}`)
    expect(node?.kind).toBe('effect')
    expect(node?.loc.file).toBe('List.tsx')
  })
})

describe('binding-effect ids', () => {
  test('profile off: binding effects carry no id (SR8)', () => {
    expect(clientJs(false)).not.toContain('#binding:')
  })

  test('profile on: text/attribute binding effects carry a #binding id', () => {
    const on = clientJs(true)
    expect(on).toMatch(/Widget#binding:s\d+/)
  })

  test('buildIdIndex resolves #binding ids from domBindings to source loc', () => {
    const { graph } = buildComponentAnalysis(source, 'Widget.tsx')
    const index = buildIdIndex(graph)
    const bindingKeys = [...index.keys()].filter(k => k.startsWith('Widget#binding:'))
    expect(bindingKeys.length).toBeGreaterThan(0)
    const node = index.get(bindingKeys[0])!
    expect(node.kind).toBe('effect')
    expect(node.loc.file).toBe('Widget.tsx')
    expect(node.loc.line).toBeGreaterThan(0)
  })
})
