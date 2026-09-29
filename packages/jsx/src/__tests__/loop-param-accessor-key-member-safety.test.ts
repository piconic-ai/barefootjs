/**
 * #3239: a reactive `.map()` row's plain (non-destructured) callback param
 * gets accessor-wrapped (`choice` → `choice()`) via a naive
 * `\bchoice\b`-style regex in `wrapLoopParamAsAccessor` (and its
 * `wrapIndexParamAsAccessor` twin). That regex also matches tokens that
 * merely SPELL the param name without referencing it:
 *
 *   - an object-literal key (`{ choice: 1 }`)
 *   - a shorthand property (`{ choice }`)
 *   - a member/property name (`obj.choice`)
 *
 * Depending on position the result is either invalid JS (key/shorthand —
 * esbuild's `Expected "{" but found "}"`, a hard build failure) or
 * valid-but-wrong JS (member access — `obj.choice()` throws `TypeError` at
 * row-creation time). This is the plain-parameter sibling of #1244 (which
 * fixed the equivalent shorthand corruption for *destructured* loop params
 * via `expandShorthandBindings`) and #2856.
 *
 * These tests compile through `compileJSX` — the exact function
 * `packages/vite/src/plugin.ts` calls to produce a component's client JS —
 * with a REACTIVE array (`createSignal`), which is required to reach the
 * `mapArrayLazy`/`createRow`/`applyItem` code path this bug lives in (a
 * plain non-reactive array takes the static `forEach` hydration path and
 * never goes through `wrapLoopParamAsAccessor` at all).
 */

import { describe, test, expect } from 'bun:test'
import { compileJSX } from '../compiler'
import { TestAdapter } from '../adapters/test-adapter'

const adapter = new TestAdapter()

function getClientJs(source: string, filename = 'App.tsx'): string {
  const result = compileJSX(source, filename, { adapter })
  const hardErrors = result.errors.filter(e => e.severity === 'error')
  expect(hardErrors).toHaveLength(0)
  const clientJs = result.files.find(f => f.type === 'clientJs')
  expect(clientJs).toBeDefined()
  return clientJs!.content
}

/**
 * Every emitted row-construction function (`createRow`, `applyItem`,
 * `applyOuter`, …) must be syntactically valid JS. `new Function` uses the
 * host's real JS parser — the same class of check esbuild's transform
 * performs during a real `vite build` — so a corrupted key/shorthand
 * position (invalid JS) throws a `SyntaxError` here exactly as it did in
 * the reported esbuild failure, without needing esbuild itself as a test
 * dependency.
 */
function assertParses(clientJs: string): void {
  const body = clientJs
    .replace(/^import[^\n]*\n/gm, '')
    .replace(/^export function/gm, 'function')
    .replace(/^export \{[^}]*\}\n?/gm, '')
  expect(() => new Function(body)).not.toThrow()
}

describe('.map() row: object-literal key / shorthand / member positions vs. the loop param (#3239)', () => {
  test('shorthand property `{ choice }` expands to `{ choice: choice() }`, not `{ choice() }`', () => {
    const source = `
      'use client'
      import { createSignal } from '@barefootjs/client'
      function f(o: { key: string; choice: string }): string {
        return o.key + ':' + o.choice
      }
      export function App() {
        const [items] = createSignal(['a', 'b'])
        return (
          <div>
            {items().map(choice => (
              <b key={choice}>{f({ key: 'x', choice })}</b>
            ))}
          </div>
        )
      }
    `
    const js = getClientJs(source)
    assertParses(js)
    expect(js).toContain("f({ key: 'x', choice: choice() })")
    // The corrupted shape would have been the bare identifier used as a
    // key with no value at all: `f({ key: 'x', choice() })`.
    expect(js).not.toContain("f({ key: 'x', choice() })")
  })

  test('explicit non-shorthand key `{ choice: 1 }` is left untouched (the key is not a reference)', () => {
    const source = `
      'use client'
      import { createSignal } from '@barefootjs/client'
      export function App() {
        const [items] = createSignal(['a', 'b'])
        return (
          <div>
            {items().map(choice => (
              <b key={choice}>{JSON.stringify({ choice: 1 })}</b>
            ))}
          </div>
        )
      }
    `
    const js = getClientJs(source)
    assertParses(js)
    expect(js).toContain('JSON.stringify({ choice: 1 })')
    expect(js).not.toContain('choice(): 1')
    expect(js).not.toContain('choice(): 1')
  })

  test('explicit key with matching value `{ choice: choice }` rewrites only the value', () => {
    const source = `
      'use client'
      import { createSignal } from '@barefootjs/client'
      function f(o: { key: string; choice: string }): string {
        return o.key + ':' + o.choice
      }
      export function App() {
        const [items] = createSignal(['a', 'b'])
        return (
          <div>
            {items().map(choice => (
              <b key={choice}>{f({ key: 'x', choice: choice })}</b>
            ))}
          </div>
        )
      }
    `
    const js = getClientJs(source)
    assertParses(js)
    expect(js).toContain("f({ key: 'x', choice: choice() })")
    expect(js).not.toContain('choice():')
  })

  test('member access `CONST.choice` leaves the member name alone (not `CONST.choice()`)', () => {
    const source = `
      'use client'
      import { createSignal } from '@barefootjs/client'
      const CONST = { choice: 'z' }
      export function App() {
        const [items] = createSignal(['a', 'b'])
        return (
          <div>
            {items().map(choice => (
              <b key={choice}>{CONST.choice}</b>
            ))}
          </div>
        )
      }
    `
    const js = getClientJs(source)
    assertParses(js)
    expect(js).toContain('CONST.choice')
    expect(js).not.toContain('CONST.choice()')
  })

  test('renamed key `{ a: choice }` (no name collision) keeps working — regression guard', () => {
    const source = `
      'use client'
      import { createSignal } from '@barefootjs/client'
      function f(o: { a: string }): string { return o.a }
      export function App() {
        const [items] = createSignal(['a', 'b'])
        return (
          <div>
            {items().map(choice => (
              <b key={choice}>{f({ a: choice })}</b>
            ))}
          </div>
        )
      }
    `
    const js = getClientJs(source)
    assertParses(js)
    expect(js).toContain('f({ a: choice() })')
  })

  test('plain reference and member access ON the item itself still wrap correctly — regression guard', () => {
    const source = `
      'use client'
      import { createSignal } from '@barefootjs/client'
      export function App() {
        const [items] = createSignal(['aa', 'bb'])
        return (
          <div>
            {items().map(choice => (
              <b key={choice}>{choice.length}</b>
            ))}
          </div>
        )
      }
    `
    const js = getClientJs(source)
    assertParses(js)
    expect(js).toContain('choice().length')
  })

  test('index param (#2859): object key `{ i: 1 }` and member access `obj.i` are left alone on the EAGER (non-lazy) path', () => {
    // A child component inside the row forces the row out of the lazy-row
    // graph (`hasChildComponent`, `lazy-row-eligibility.ts`) and onto the
    // `mapArray` eager path — the only path that runs
    // `wrapIndexParamAsAccessor` at all (`build-plain-row.ts`: the lazy
    // path hands `applyItem`/`createRow` a plain `__e.index` instead, see
    // `loop-index-reactivity.test.ts`).
    const source = `
      'use client'
      import { createSignal } from '@barefootjs/client'
      const obj = { i: 5 }
      function Child({ x }: { x: number }) { return <span>{x}</span> }
      export function App() {
        const [items] = createSignal(['a', 'b'])
        return (
          <ul>
            {items().map((choice, i) => (
              <li key={choice}>
                <Child x={i} />
                {JSON.stringify({ i: 1 })}{obj.i}{i}
              </li>
            ))}
          </ul>
        )
      }
    `
    const js = getClientJs(source)
    assertParses(js)
    expect(js).toContain('JSON.stringify({ i: 1 })')
    expect(js).toContain('obj.i')
    expect(js).not.toContain('obj.i()')
    expect(js).not.toContain('i(): 1')
    // The genuine index references (passed to the child, and read directly
    // in the row's own text) are still wrapped as accessor calls.
    expect(js).toContain('return i()')
    expect(js).toContain('String(i())')
  })
})
