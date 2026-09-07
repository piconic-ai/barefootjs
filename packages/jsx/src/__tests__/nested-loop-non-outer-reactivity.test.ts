/**
 * BarefootJS Compiler — nested `.map()` reactivity when the inner array
 * (or the row's own bindings) does NOT derive from the outer loop's item.
 *
 * #2865: before this fix, `build-inner-loop.ts` decided "reactive vs
 * static" for a nested loop by checking only whether `inner.array`
 * textually referenced the OUTER loop's item — `refsParent`. Anything
 * else the inner loop depended on fell through to a hydration-only
 * `forEach` (`emitStatic` in `stringify/inner-loop.ts`) that never wired
 * a single `createEffect`, regardless of whether the array itself, or a
 * text/attr/conditional inside the row, was genuinely reactive. That
 * fork has been removed — every nested loop now gets the full reactive
 * `mapArray` emission unconditionally.
 *
 * This file pins the previously-frozen shapes directly (as opposed to
 * `nested-loop-plain.test.ts` / `nested-loop-index-param.test.ts`, whose
 * relevant cases were originally written to pin the OLD static shape and
 * have been flipped in place).
 */

import { describe, test, expect } from 'bun:test'
import { compileJSX } from '../compiler'
import { TestAdapter } from '../adapters/test-adapter'

const adapter = new TestAdapter()

function clientJsFor(source: string): string {
  const result = compileJSX(source, 'Repro.tsx', { adapter })
  expect(result.errors.filter(e => e.severity === 'error')).toHaveLength(0)
  const clientJs = result.files.find(f => f.type === 'clientJs')
  expect(clientJs).toBeDefined()
  return clientJs!.content
}

describe('nested .map() reactivity independent of the outer item (#2865)', () => {
  test('inner array read from a component signal (not the outer item) wires a nested mapArray', () => {
    const content = clientJsFor(`
      'use client'
      import { createSignal } from '@barefootjs/client'
      export function Repro() {
        const [rows] = createSignal([{ id: 1 }])
        const [tags] = createSignal(['x', 'y'])
        return (
          <div>
            {rows().map(row => (
              <div key={row.id}>
                <ul>
                  {tags().map(t => <li key={t}>{t}</li>)}
                </ul>
              </div>
            ))}
          </div>
        )
      }
    `)

    // The old bug emitted `tags().forEach(...)` with no mapArray/createEffect
    // at all — appending a tag never reached the DOM.
    expect(content).toMatch(/mapArray\(\(\) => tags\(\) \|\| \[\], /)
    expect(content).not.toMatch(/tags\(\)\.forEach\(/)
  })

  test('inner array read from a memo (not the outer item) wires a nested mapArray', () => {
    const content = clientJsFor(`
      'use client'
      import { createSignal, createMemo } from '@barefootjs/client'
      export function Repro() {
        const [rows] = createSignal([{ id: 1 }])
        const [count] = createSignal(2)
        const tags = createMemo(() => Array.from({ length: count() }, (_, i) => \`t\${i}\`))
        return (
          <div>
            {rows().map(row => (
              <div key={row.id}>
                <ul>
                  {tags().map(t => <li key={t}>{t}</li>)}
                </ul>
              </div>
            ))}
          </div>
        )
      }
    `)

    expect(content).toMatch(/mapArray\(\(\) => tags\(\) \|\| \[\], /)
    expect(content).not.toMatch(/tags\(\)\.forEach\(/)
  })

  test('a row-content signal read (text) inside a LITERAL inner array still wires createEffect', () => {
    // Even when the ARRAY itself is a plain constant (never needs to
    // reconcile), a text/attr/conditional inside the row that reads a
    // component signal must still update. The old static emitter never
    // read `reactiveTexts`/`reactiveAttrs`/`conditionals` at all, so this
    // froze independent of whether the array was reactive.
    const content = clientJsFor(`
      'use client'
      import { createSignal } from '@barefootjs/client'
      const TAGS = ['x', 'y']
      export function Repro() {
        const [rows] = createSignal([{ id: 1 }])
        const [count, setCount] = createSignal(0)
        return (
          <div onClick={() => setCount(c => c + 1)}>
            {rows().map(row => (
              <div key={row.id}>
                <ul>
                  {TAGS.map(t => <li key={t}>{t}: {count()}</li>)}
                </ul>
              </div>
            ))}
          </div>
        )
      }
    `)

    expect(content).toMatch(/mapArray\(\(\) => TAGS \|\| \[\], /)
    expect(content).toContain('createEffect(')
    expect(content).not.toMatch(/TAGS\.forEach\(/)
  })

  test('destructured outer param used by the inner array no longer throws ReferenceError at row construction', () => {
    // Before #2865: static mode skipped the destructure-unwrap statement,
    // so the emitted `forEach` referenced a bare `tags` identifier that
    // was never declared in scope.
    const content = clientJsFor(`
      'use client'
      import { createSignal } from '@barefootjs/client'
      interface Row { id: number; tags: string[] }
      export function Repro() {
        const [rows] = createSignal<Row[]>([{ id: 1, tags: ['a', 'b'] }])
        return (
          <div>
            {rows().map(({ id, tags }) => (
              <div key={id}>
                <ul>
                  {tags.map(t => <li key={t}>{t}</li>)}
                </ul>
              </div>
            ))}
          </div>
        )
      }
    `)

    // `tags` must resolve through the outer row accessor
    // (`__bfItem().tags`) — not a bare free identifier that was never
    // declared in scope (the old static-mode bug: the destructured
    // pattern names `tags` for the SSR template, but the reactive
    // renderItem's own param is the whole-item accessor, and every
    // reference to a destructured name is rewritten to go through it).
    expect(content).toMatch(/mapArray\(\(\) => __bfItem\(\)\.tags \|\| \[\], /)
  })

  test('outer-index-derived inner array wires a nested mapArray', () => {
    const content = clientJsFor(`
      'use client'
      import { createSignal } from '@barefootjs/client'
      export function Repro() {
        const [matrix] = createSignal([['a', 'b'], ['c']])
        return (
          <div>
            {matrix().map((row, i) => (
              <div key={i}>
                <ul>
                  {matrix()[i].map(cell => <li key={cell}>{cell}</li>)}
                </ul>
              </div>
            ))}
          </div>
        )
      }
    `)

    expect(content).toContain('mapArray(')
    expect(content).not.toMatch(/\.forEach\(\(cell,/)
  })
})
