/**
 * Compiler tests for #1212 — when a `.map(...)` callback returns a JSX
 * Fragment with two or more sibling root elements, the compiler must:
 *
 *   1. set `bodyIsMultiRoot` on the IRLoop,
 *   2. emit a per-item `<!--bf-loop-i-->` start marker in the SSR
 *      `markedTemplate` so the runtime can partition the loop range, and
 *   3. emit the multi-root template-clone block + `__bfExtras` stash in
 *      the client JS so CSR creates all sibling roots, not just the first.
 *
 * Single-root bodies (the common case) keep their existing emission with
 * no per-item marker and no `__bfExtras` reference.
 */

import { describe, test, expect } from 'bun:test'
import { compileJSX } from '../compiler'
import { HonoAdapter } from '../../../../packages/adapter-hono/src/adapter/hono-adapter'

const adapter = new HonoAdapter()

function compile(source: string, file = 'C.tsx') {
  const result = compileJSX(source, file, { adapter })
  expect(result.errors).toHaveLength(0)
  const markedTemplate = result.files.find((f) => f.type === 'markedTemplate')!
  const clientJs = result.files.find((f) => f.type === 'clientJs')
  return { markedTemplate, clientJs }
}

describe('multi-root loop body (#1212)', () => {
  test('Fragment-of-two-paths body emits per-item marker + multi-root clone', () => {
    const source = `
'use client'
import { createSignal } from '@barefootjs/client'
export function Edges() {
  const [edges, setEdges] = createSignal([{ id: 'a' }, { id: 'b' }])
  return (
    <svg>
      {edges().map(edge => (
        <>
          <path key={edge.id} data-hit-id={edge.id} stroke="transparent" />
          <path data-id={edge.id} />
        </>
      ))}
    </svg>
  )
}
`
    const { markedTemplate, clientJs } = compile(source, 'Edges.tsx')

    // SSR: per-item start marker is emitted inside the .map() body.
    // `bfComment(k)` itself prepends `bf-`, so the call argument is
    // `'loop-i'`, yielding `<!--bf-loop-i-->` (#2763 fixed a stray extra
    // `bf-` prefix here that had gone unexercised until that issue's
    // fixture was the first `bodyIsMultiRoot` case rendered on this adapter).
    expect(markedTemplate.content).toContain(`bfComment('loop-i')`)
    // Loop boundary markers also still present.
    expect(markedTemplate.content).toMatch(/bfComment\('loop:[^']+'\)/)
    expect(markedTemplate.content).toMatch(/bfComment\('\/loop:[^']+'\)/)

    // Client JS: the renderItem body uses the multi-root clone block.
    // It declares `__el` and `__extras`, and stashes extras on
    // `__el.__bfExtras` for mapArray to pick up.
    expect(clientJs).toBeDefined()
    expect(clientJs!.content).toContain('__bfExtras')
    expect(clientJs!.content).toContain('let __el, __extras')
  })

  test('single-root body does NOT emit per-item marker or extras stash', () => {
    const source = `
'use client'
import { createSignal } from '@barefootjs/client'
export function Items() {
  const [items, setItems] = createSignal([{ id: 'a' }, { id: 'b' }])
  return (
    <ul>
      {items().map(item => (
        <li key={item.id} className={item.id}>{item.id}</li>
      ))}
    </ul>
  )
}
`
    const { markedTemplate, clientJs } = compile(source, 'Items.tsx')

    // No per-item markers in the single-root case (zero-cost).
    expect(markedTemplate.content).not.toContain(`bfComment('loop-i')`)
    expect(clientJs).toBeDefined()
    expect(clientJs!.content).not.toContain('__bfExtras')
  })

  test('nested-fragment body that flattens to a single root is treated as single-root', () => {
    const source = `
'use client'
import { createSignal } from '@barefootjs/client'
export function Items() {
  const [items, setItems] = createSignal([{ id: 'a' }])
  return (
    <ul>
      {items().map(item => (
        <>
          <>
            <li key={item.id}>{item.id}</li>
          </>
        </>
      ))}
    </ul>
  )
}
`
    const { markedTemplate, clientJs } = compile(source, 'NestedFrag.tsx')
    expect(markedTemplate.content).not.toContain(`bfComment('loop-i')`)
    expect(clientJs).toBeDefined()
    expect(clientJs!.content).not.toContain('__bfExtras')
  })
})
