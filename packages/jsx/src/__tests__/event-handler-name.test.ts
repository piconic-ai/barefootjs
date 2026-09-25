/**
 * `isEventHandlerName` is the one event-handler classification (`on[A-Z]`)
 * shared by the IR builder, client-JS prop wiring and the SSR adapters. A
 * prop merely starting with `on` (`only`, `once`) is data.
 */
import { describe, test, expect } from 'bun:test'
import { analyzeComponent, buildMetadata, jsxToIR, isEventHandlerName } from '../index'
import { compileJSX } from '../compiler'
import { TestAdapter } from '../adapters/test-adapter'
import type { IRLoop, IRNode } from '../types'

describe('isEventHandlerName', () => {
  test('on + uppercase letter is an event handler', () => {
    for (const name of ['onClick', 'onValueChange', 'onX']) expect(isEventHandlerName(name)).toBe(true)
  })

  test('names that merely start with `on` are data', () => {
    for (const name of ['on', 'only', 'once', 'online', 'onclick', 'on-x', 'tone']) {
      expect(isEventHandlerName(name)).toBe(false)
    }
  })

  test("a loop child component's `isEventHandler` flag uses it", () => {
    const source = `
'use client'
function Mark(props: { once?: boolean; onPick?: () => void }) { return <em>x</em> }
export function Row() {
  const items = [{ id: 'a', flag: true }]
  return <ul>{items.map(o => <Mark key={o.id} once={o.flag} onPick={() => {}} />)}</ul>
}
`
    const ctx = analyzeComponent(source, 'test.tsx', 'Row')
    buildMetadata(ctx)
    const root = jsxToIR(ctx)!
    const findLoop = (n: IRNode): IRLoop | null => {
      if (n.type === 'loop') return n as IRLoop
      for (const c of (n as { children?: IRNode[] }).children ?? []) {
        const hit = findLoop(c)
        if (hit) return hit
      }
      return null
    }
    const props = findLoop(root)!.childComponent!.props
    expect(props.find(p => p.name === 'once')!.isEventHandler).toBe(false)
    expect(props.find(p => p.name === 'onPick')!.isEventHandler).toBe(true)
  })

  // Client-JS consequence: a loop row's child component receives an
  // `on`-prefixed DATA prop as a live getter like any other reactive prop,
  // not as a one-shot value the way a handler is passed. `onPick` stays a
  // plain handler entry.
  test('a loop child component receives `only`/`once` as reactive getters, not handler values', () => {
    const source = `
'use client'
import { createSignal } from '@barefootjs/client'
function Child(props: { only?: string; once?: boolean; onPick?: () => void }) {
  return <span data-only={props.only}>c</span>
}
export function Rows() {
  const [sel, setSel] = createSignal('a')
  const [flag] = createSignal(false)
  const items = [{ id: 'x' }, { id: 'y' }]
  return <ul>{items.map(it => <li key={it.id}><Child only={sel()} once={flag()} onPick={() => setSel(it.id)} /></li>)}</ul>
}
`
    const result = compileJSX(source, 'Rows.tsx', { adapter: new TestAdapter() })
    expect(result.errors).toHaveLength(0)
    const clientJs = result.files.find(f => f.type === 'clientJs')!.content
    expect(clientJs).toContain('get only() { return sel() }')
    expect(clientJs).toContain('get once() { return flag() }')
    expect(clientJs).not.toContain('only: sel()')
    expect(clientJs).toContain('onPick: () => setSel(it.id)')
  })
})
