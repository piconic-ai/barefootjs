/**
 * A NESTED (inner) `.map()` callback closing over its own `.map((item, i) =>
 * ...)` index param (#2218). Sibling of `event-delegation-index-param.test.ts`
 * (#2189), which fixed the same class of bug for delegated event handlers —
 * this covers the emit path #2189 did NOT touch: the nested-loop `key`,
 * reactive text/attr, and template-interpolation emit path in
 * `control-flow/plan/build-inner-loop.ts` / `stringify/inner-loop.ts` (and
 * the conditional-branch-arm sibling in `build-loop-child-arm.ts` /
 * `stringify/loop-child-arm.ts`).
 *
 * Root cause: `NestedLoop` never carried an `index` field, so `loopKeyFn`
 * dropped the index param from the keyFn's own parameter list, and the
 * renderItem body only ever received the index as a synthetic
 * `__innerIdx<uid>` positional param — the user's index name (e.g. `i`) was
 * never bound to it, so any reference threw `ReferenceError: i is not
 * defined` and the inner loop rendered nothing.
 *
 * Gating (byte-for-byte stability, same philosophy as #2189): the alias
 * `const i = __innerIdx<uid>` is only emitted when something in the inner
 * loop body actually references the index — see `nestedLoopReferencesIndex`
 * in `control-flow/shared.ts`.
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

describe('nested .map() index param referenced in key/text/attr (#2218)', () => {
  test('key={i}: keyFn includes the index param and renderItem binds the alias', () => {
    const content = clientJsFor(`
      'use client'
      import { createSignal } from '@barefootjs/client'
      interface Item { id: number; text: string }
      interface Group { id: number; items: Item[] }
      export function Repro() {
        const [outer] = createSignal<Group[]>([])
        return (
          <div>
            {outer().map((o) => (
              <div key={o.id}>
                {o.items.map((item, i) => (
                  <span key={i}>{item.text}</span>
                ))}
              </div>
            ))}
          </div>
        )
      }
    `)

    // keyFn threads the index param, mirroring TopLevelLoop/BranchLoop.
    expect(content).toContain('(item, i) => String(i)')
    // The renderItem body binds the alias before using it.
    expect(content).toContain('const i = __innerIdx')
    const aliasIdx = content.indexOf('const i = __innerIdx')
    const setAttrIdx = content.indexOf(`setAttribute('data-key-1', String(i))`)
    expect(aliasIdx).toBeGreaterThanOrEqual(0)
    expect(setAttrIdx).toBeGreaterThan(aliasIdx)
    // The alias must land before the clone IIFE too — the cloned template's
    // `data-key-1="${i}"` interpolation reads it.
    const cloneIdx = content.indexOf('__t.innerHTML')
    expect(cloneIdx).toBeGreaterThan(aliasIdx)
  })

  test('index referenced in a template text interpolation is bound and rendered', () => {
    const content = clientJsFor(`
      'use client'
      import { createSignal } from '@barefootjs/client'
      interface Item { id: number; text: string }
      interface Group { id: number; items: Item[] }
      export function Repro() {
        const [outer] = createSignal<Group[]>([])
        return (
          <div>
            {outer().map((o) => (
              <div key={o.id}>
                {o.items.map((item, i) => (
                  <span key={item.id}>{i}: {item.text}</span>
                ))}
              </div>
            ))}
          </div>
        )
      }
    `)

    expect(content).toContain('const i = __innerIdx')
    // The template's `${i}` interpolation is emitted (escaped for text).
    expect(content).toContain('escapeText(i)')
    const aliasIdx = content.indexOf('const i = __innerIdx')
    // The outer element's own clone IIFE also bakes the initial nested HTML
    // via a plain (unrelated, arrow-scoped) `.map((item, i) => ...)` — so
    // `escapeText(i)` appears once there too. Look for the occurrence
    // *after* the alias, inside the inner renderItem's own clone template.
    const templateIdx = content.indexOf('escapeText(i)', aliasIdx)
    expect(templateIdx).toBeGreaterThan(aliasIdx)
  })

  test('index referenced in a reactive attribute expression is bound', () => {
    const content = clientJsFor(`
      'use client'
      import { createSignal } from '@barefootjs/client'
      interface Item { id: number; text: string; active: boolean }
      interface Group { id: number; items: Item[] }
      export function Repro() {
        const [outer] = createSignal<Group[]>([])
        return (
          <div>
            {outer().map((o) => (
              <div key={o.id}>
                {o.items.map((item, i) => (
                  <span key={item.id} className={i % 2 === 0 ? 'even' : 'odd'}>{item.text}</span>
                ))}
              </div>
            ))}
          </div>
        )
      }
    `)

    expect(content).toContain('const i = __innerIdx')
    expect(content).toContain(`i % 2 === 0 ? 'even' : 'odd'`)
  })

  test('index referenced only in an event handler inside the inner loop is bound', () => {
    const content = clientJsFor(`
      'use client'
      import { createSignal } from '@barefootjs/client'
      interface Item { id: number; text: string }
      interface Group { id: number; items: Item[] }
      export function Repro() {
        const [outer] = createSignal<Group[]>([])
        const [clicked, setClicked] = createSignal(-1)
        return (
          <div>
            {outer().map((o) => (
              <div key={o.id}>
                {o.items.map((item, i) => (
                  <span key={item.id} onClick={() => setClicked(i)}>{item.text}</span>
                ))}
              </div>
            ))}
          </div>
        )
      }
    `)

    expect(content).toContain('const i = __innerIdx')
    expect(content).toContain('setClicked(i)')
  })

  test('byte-stability: index declared but never referenced emits no alias', () => {
    const content = clientJsFor(`
      'use client'
      import { createSignal } from '@barefootjs/client'
      interface Item { id: number; text: string }
      interface Group { id: number; items: Item[] }
      export function Repro() {
        const [outer] = createSignal<Group[]>([])
        return (
          <div>
            {outer().map((o) => (
              <div key={o.id}>
                {o.items.map((item, i) => (
                  <span key={item.id}>{item.text}</span>
                ))}
              </div>
            ))}
          </div>
        )
      }
    `)

    expect(content).not.toContain('const i = __innerIdx')
    // The keyFn also has no reason to thread `i` — the key doesn't use it.
    expect(content).toContain('(item, i) => String(item.id)')
  })

  test('index named like a property is not bound when only the property is used', () => {
    // Mirrors the #2189 test of the same name: gating is AST-based (free
    // identifiers), so `item.id` (a property access) never false-matches
    // an index param literally named `id`.
    const content = clientJsFor(`
      'use client'
      import { createSignal } from '@barefootjs/client'
      interface Item { id: number; text: string }
      interface Group { id: number; items: Item[] }
      export function Repro() {
        const [outer] = createSignal<Group[]>([])
        return (
          <div>
            {outer().map((o) => (
              <div key={o.id}>
                {o.items.map((item, id) => (
                  <span key={item.id}>{item.text}</span>
                ))}
              </div>
            ))}
          </div>
        )
      }
    `)

    expect(content).not.toContain('const id = __innerIdx')
  })

  test('static inner array (no signal dependency) also binds the index alias', () => {
    // Sibling of the reactive-path test above, exercising `emitStatic` in
    // `stringify/inner-loop.ts` (the `forEach` renderItem path used when the
    // inner array does not reference the outer loop param reactively).
    const content = clientJsFor(`
      'use client'
      import { createSignal } from '@barefootjs/client'
      interface Item { id: number; n: number }
      const SHARED: Item[] = [{ id: 1, n: 7 }]
      function MyChild(props: { tag: string }) {
        return <span>{props.tag}</span>
      }
      export function Repro() {
        const [rows, setRows] = createSignal([{ id: 1, key: 'a' }])
        return (
          <div onClick={() => setRows(prev => [...prev])}>
            {rows().map((row) => (
              <div key={row.id}>
                {SHARED.map((cell, i) => (
                  <MyChild key={cell.id} tag={\`\${i}-\${cell.n}\`} />
                ))}
              </div>
            ))}
          </div>
        )
      }
    `)

    expect(content).toMatch(/SHARED\.forEach\(\(cell, __innerIdx[^)]+\) => \{[\s\S]*?const\s+i\s*=\s*__innerIdx/)
  })

  test('conditional-branch-arm inner loop (loop -> conditional -> inner loop) binds the index alias', () => {
    // Exercises `build-loop-child-arm.ts::buildBranchInnerLoopsPlan` /
    // `stringify/loop-child-arm.ts::stringifyBranchInnerLoops` — the sibling
    // emit path for an inner loop that lives inside a reactive conditional
    // branch which is itself inside an outer loop's item body.
    const content = clientJsFor(`
      'use client'
      import { createSignal } from '@barefootjs/client'
      interface Item { id: number; text: string }
      interface Group { id: number; flag: boolean; items: Item[] }
      export function Repro() {
        const [outer] = createSignal<Group[]>([])
        return (
          <div>
            {outer().map((o) => (
              <div key={o.id}>
                {o.flag ? (
                  <div>
                    {o.items.map((item, i) => (
                      <span key={i}>{i}: {item.text}</span>
                    ))}
                  </div>
                ) : null}
              </div>
            ))}
          </div>
        )
      }
    `)

    expect(content).toContain('(item, i) => String(i)')
    expect(content).toContain('const i = __bidx')
    const aliasIdx = content.indexOf('const i = __bidx')
    const setAttrIdx = content.indexOf(`setAttribute('data-key-1', String(i))`)
    expect(aliasIdx).toBeGreaterThanOrEqual(0)
    expect(setAttrIdx).toBeGreaterThan(aliasIdx)
  })
})
