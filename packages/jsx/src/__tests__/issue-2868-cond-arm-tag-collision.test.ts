/**
 * #2868: a reactive conditional branch's own re-render `template()` builder
 * could corrupt a tag name that collides with an enclosing `.map()`'s
 * item/index parameter — `<i>` became `<i()>` — because the loop-param
 * accessor rewrite ran as a word-boundary regex over the branch's already-
 * assembled HTML string, and `<`/`>` are non-word characters so `<i>` and
 * `<i` + identifier `i` are indistinguishable to that regex.
 *
 * Fixed by rendering every branch's HTML against the full loop-param chain
 * at IR time (`irToHtmlTemplate`'s `loopParams`) and deleting the post-hoc
 * regex pass entirely — `wrapLoopParamAsAccessor` only ever runs over
 * parsed JS expression positions now, never over assembled markup.
 */

import { describe, test, expect } from 'bun:test'
import { compileJSX } from '../compiler'
import { TestAdapter } from '../adapters/test-adapter'

function compile(source: string): string {
  const r = compileJSX(source, 'T.tsx', { adapter: new TestAdapter() })
  expect(r.errors).toEqual([])
  return r.files.find((f) => f.type === 'clientJs')?.content ?? ''
}

/** No tag name (or attribute) was corrupted into an accessor call. */
function expectNoCorruption(clientJs: string): void {
  expect(clientJs).not.toMatch(/<\/?[A-Za-z][\w-]*\(\)/)
  expect(clientJs).not.toMatch(/[\w-]+\(\)=["']/)
}

describe('reactive conditional branch does not corrupt a colliding tag name (#2868)', () => {
  test('index param named like the branch tag (<i>) — eager row (forced via ref)', () => {
    const clientJs = compile(`
'use client'
import { createSignal } from '@barefootjs/client'
function T() {
  const [items] = createSignal([{ id: 'a' }, { id: 'b' }])
  const [flag] = createSignal(true)
  return (
    <ul>
      {items().map((item, i) => (
        <li key={item.id} ref={(el: HTMLElement | null) => {}}>
          {flag() ? <b>even</b> : <i>odd</i>}
        </li>
      ))}
    </ul>
  )
}
export { T }`)
    expectNoCorruption(clientJs)
    expect(clientJs).toContain('<i bf-c="s0">odd</i>')
  })

  test('item param named like the branch tag (<b>)', () => {
    const clientJs = compile(`
'use client'
import { createSignal } from '@barefootjs/client'
function T() {
  const [items] = createSignal([{ id: 'a' }])
  const [flag] = createSignal(true)
  return (
    <ul>
      {items().map((b) => (
        <li key={b.id} ref={(el: HTMLElement | null) => {}}>
          {flag() ? <b>even</b> : <em>odd</em>}
        </li>
      ))}
    </ul>
  )
}
export { T }`)
    expectNoCorruption(clientJs)
  })

  test('nested conditional inside a branch arm', () => {
    const clientJs = compile(`
'use client'
import { createSignal } from '@barefootjs/client'
function T() {
  const [items] = createSignal([{ id: 'a' }])
  const [outer, setOuter] = createSignal(true)
  const [inner] = createSignal(true)
  return (
    <ul>
      {items().map((item, i) => (
        <li key={item.id} ref={(el: HTMLElement | null) => {}}>
          {outer() ? (inner() ? <b>x</b> : <i>y</i>) : <em>z</em>}
        </li>
      ))}
    </ul>
  )
}
export { T }`)
    expectNoCorruption(clientJs)
  })

  test('row template (build-plain-row): index-named tag as the row root, no ref forcing eager', () => {
    const clientJs = compile(`
'use client'
import { createSignal } from '@barefootjs/client'
function T() {
  const [items] = createSignal([{ id: 'a' }])
  return (
    <ul>
      {items().map((item, i) => (
        <li key={item.id} ref={(el: HTMLElement | null) => {}}>
          <i>{i}</i>
        </li>
      ))}
    </ul>
  )
}
export { T }`)
    expectNoCorruption(clientJs)
  })

  test("nested .map() conditional arm reads the OUTER loop's own index (ancestor chain)", () => {
    const clientJs = compile(`
'use client'
import { createSignal } from '@barefootjs/client'
function T() {
  const [groups] = createSignal([{ id: 'g1', kids: [{ id: 'k1' }] }])
  const [flag] = createSignal(true)
  return (
    <ul>
      {groups().map((group, gi) => (
        <li key={group.id}>
          <ul>
            {group.kids.map((kid) => (
              <li key={kid.id}>
                {flag() ? <b>{gi}</b> : <em>none</em>}
              </li>
            ))}
          </ul>
        </li>
      ))}
    </ul>
  )
}
export { T }`)
    expectNoCorruption(clientJs)
    // The outer index must be called as an accessor inside the inner loop's
    // branch arm, not passed by reference — passing the bare function would
    // stringify to its source text instead of its current value.
    expect(clientJs).toContain('gi()')
    expect(clientJs).not.toMatch(/__bfSlot\(gi,/)
  })
})
