/**
 * #2798: a static (non-signal) array's `.map()` faithfully invokes a
 * `ref` callback, and reactively updates a signal-derived text, on the
 * TOP-LEVEL row (`buildStaticLoopPlan`'s `childRefs`/`texts`). But a
 * nested `.map()` INSIDE a static outer row's item — a plain element,
 * not a child component — reached `elem.innerLoops` processing only
 * when it had matching depth-N CHILD COMPONENTS
 * (`buildStaticArrayChildInitsPlan`'s `innerComps.length === 0`
 * skip). A plain-element inner loop under a static outer array had
 * NOTHING wired: no ref invocation, no reactive-text/attr effect — the
 * whole row was silently frozen at its SSR-baked value.
 *
 * (The issue's own repro — a TOP-LEVEL static loop with a `ref` — was
 * already fixed by the time this was investigated; that shape is
 * pinned here too as regression armor against the issue's own
 * misdiagnosis being reintroduced.)
 */
import { describe, test, expect } from 'bun:test'
import { compileJSX } from '../index'
import { HonoAdapter } from '../../../adapter-hono/src/adapter/index'

function compileClientJs(source: string): string {
  const result = compileJSX(source, 'test.tsx', { adapter: new HonoAdapter() })
  expect(result.errors.filter(e => e.severity === 'error')).toHaveLength(0)
  const clientJs = result.files.find(f => f.type === 'clientJs')
  if (!clientJs) throw new Error('No client JS emitted')
  return clientJs.content
}

describe('static array ref/reactive bindings (#2798)', () => {
  test('top-level static loop still invokes a ref on each row (regression armor)', () => {
    const source = `
'use client'
export function StaticRefCase() {
  const items = [{ id: 1 }, { id: 2 }]
  const trackMount = (el: Element) => { el.setAttribute('data-tracked', '1') }
  return (
    <ul>
      {items.map(item => (
        <li key={item.id} ref={trackMount}>{item.id}</li>
      ))}
    </ul>
  )
}
`
    const js = compileClientJs(source)
    expect(js).toContain('(trackMount)(')
  })

  test('a static outer loop with a nested .map() invokes the inner ref on each row', () => {
    const source = `
'use client'
export function StaticNestedRefCase() {
  const items = [{ id: 1, children: [{ id: 11 }, { id: 12 }] }]
  const trackMount = (el: Element) => { el.setAttribute('data-tracked', '1') }
  return (
    <ul>
      {items.map(item => (
        <li key={item.id}>
          {item.children.map(child => (
            <span key={child.id} ref={trackMount}>{child.id}</span>
          ))}
        </li>
      ))}
    </ul>
  )
}
`
    const js = compileClientJs(source)
    // Double forEach (outer item, inner child), with the ref invoked
    // inside the inner one.
    expect(js).toContain('items.forEach((item, __idx) => {')
    expect(js).toContain('item.children.forEach((child, __innerIdx) => {')
    expect(js).toContain('(trackMount)(')
  })

  test('a static outer loop with a nested .map() reactively updates a signal-derived inner text', () => {
    const source = `
'use client'
import { createSignal } from '@barefootjs/client'
export function StaticNestedSignalCase() {
  const items = [{ id: 1, children: [{ id: 11 }, { id: 12 }] }]
  const [count] = createSignal(0)
  return (
    <ul>
      {items.map(item => (
        <li key={item.id}>
          {item.children.map(child => (
            <span key={child.id}>{child.id}:{count()}</span>
          ))}
        </li>
      ))}
    </ul>
  )
}
`
    const js = compileClientJs(source)
    // Pre-fix, this text was frozen at its SSR-baked value — no
    // `createEffect` at all inside the inner forEach body.
    expect(js).toMatch(/createEffect\(\(\) => \{ __bfw_\w+\('s\d+', String\(count\(\)\)\) \}\)/)
  })

  test('a static outer loop with a nested .map() wires a reactive attr on the inner element', () => {
    const source = `
'use client'
import { createSignal } from '@barefootjs/client'
export function StaticNestedAttrCase() {
  const items = [{ id: 1, children: [{ id: 11 }, { id: 12 }] }]
  const [sel] = createSignal(11)
  return (
    <ul>
      {items.map(item => (
        <li key={item.id}>
          {item.children.map(child => (
            <span key={child.id} data-active={child.id === sel()}>{child.id}</span>
          ))}
        </li>
      ))}
    </ul>
  )
}
`
    const js = compileClientJs(source)
    expect(js).toContain('data-active')
    expect(js).toMatch(/createEffect\(\(\) => \{/)
  })
})
