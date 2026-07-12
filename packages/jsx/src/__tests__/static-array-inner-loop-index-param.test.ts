/**
 * A FULLY-STATIC nested loop's inner `.map((item, i) => ...)` index param
 * referenced in a child-component prop (#2231). Follow-up to #2218, which
 * fixed the reactive (`mapArray`) and branch-arm paths — this covers the
 * static-array child-init family (`plan/build-static-array-child-init.ts` /
 * `stringify/static-array-child-init.ts`), which those fixes didn't reach
 * because it never goes through `loopKeyFn` or the renderItem alias.
 *
 * Root cause: the `inner-loop-nested` shape hardcoded the synthetic
 * `__innerIdx` as the inner `forEach`'s index param, and the
 * `component-rooted-inner-loop` shape (#1725) declared no index params at
 * all — so a prop getter like `get label() { return i }` threw
 * `ReferenceError: i is not defined` on `initChild`'s first prop read at
 * hydration.
 *
 * Fix: emit the user's declared index name directly as the `forEach` index
 * param — the same idiom the outer loop has always used (`elem.index ||
 * '__idx'`). No alias binding is needed because `forEach` supplies the real
 * array index positionally. Loops that declare no index keep byte-identical
 * output (`__innerIdx` fallback for `inner-loop-nested`, bare single-param
 * heads for `component-rooted-inner-loop`).
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

describe('static inner-loop index param in child-component props (#2231)', () => {
  test('inner-loop-nested: the inner forEach binds the user index name', () => {
    const content = clientJsFor(`
      'use client'
      import { Cell } from './cell'
      const OUTER = [
        { id: 1, subs: [{ id: 11 }, { id: 12 }] },
        { id: 2, subs: [{ id: 21 }] },
      ]
      export function Repro() {
        return (
          <div>
            {OUTER.map((o, oi) => (
              <div key={o.id}>
                {o.subs.map((sub, i) => (
                  <Cell key={sub.id} label={i} outerPos={oi} />
                ))}
              </div>
            ))}
          </div>
        )
      }
    `)

    // The inner forEach's index param is the user's name, so the prop
    // getters `return i` / `return oi` resolve.
    expect(content).toContain('o.subs.forEach((sub, i) => {')
    // The inner element offset indexes with the same (renamed) param.
    expect(content).toContain('__ic.children[i]')
    expect(content).toContain('get label() { return i }')
    expect(content).toContain('get outerPos() { return oi }')
    expect(content).not.toContain('__innerIdx')
  })

  test('inner-loop-nested: no declared index keeps the synthetic __innerIdx (byte stability)', () => {
    const content = clientJsFor(`
      'use client'
      import { Cell } from './cell'
      const OUTER = [
        { id: 1, subs: [{ id: 11 }, { id: 12 }] },
      ]
      export function Repro() {
        return (
          <div>
            {OUTER.map((o) => (
              <div key={o.id}>
                {o.subs.map((sub) => (
                  <Cell key={sub.id} label={sub.id} />
                ))}
              </div>
            ))}
          </div>
        )
      }
    `)

    expect(content).toContain('o.subs.forEach((sub, __innerIdx) => {')
    expect(content).toContain('__ic.children[__innerIdx]')
  })

  test('component-rooted-inner-loop: outer AND inner index params are bound', () => {
    const content = clientJsFor(`
      'use client'
      import { Card, Cell } from './cell'
      const OUTER = [
        { id: 1, subs: [{ id: 11 }, { id: 12 }] },
      ]
      export function Repro2() {
        return (
          <div>
            {OUTER.map((o, oi) => (
              <Card key={o.id}>
                {o.subs.map((sub, i) => (
                  <Cell key={sub.id} label={i} outerPos={oi} />
                ))}
              </Card>
            ))}
          </div>
        )
      }
    `)

    // Document-order zip: both forEach heads carry the declared index names.
    expect(content).toContain('OUTER.forEach((o, oi) => {')
    expect(content).toContain('o.subs.forEach((sub, i) => {')
    expect(content).toContain('get label() { return i }')
    expect(content).toContain('get outerPos() { return oi }')
  })

  test('component-rooted-inner-loop: no declared index keeps bare single-param heads (byte stability)', () => {
    const content = clientJsFor(`
      'use client'
      import { Card, Cell } from './cell'
      const OUTER = [
        { id: 1, subs: [{ id: 11 }] },
      ]
      export function Repro2() {
        return (
          <div>
            {OUTER.map((o) => (
              <Card key={o.id}>
                {o.subs.map((sub) => (
                  <Cell key={sub.id} label={sub.id} />
                ))}
              </Card>
            ))}
          </div>
        )
      }
    `)

    expect(content).toContain('OUTER.forEach((o) => {')
    expect(content).toContain('o.subs.forEach((sub) => {')
  })

  test('index named like a property access is not confused (item.i stays untouched)', () => {
    const content = clientJsFor(`
      'use client'
      import { Cell } from './cell'
      const OUTER = [
        { id: 1, subs: [{ id: 11, i: 'a' }] },
      ]
      export function Repro() {
        return (
          <div>
            {OUTER.map((o) => (
              <div key={o.id}>
                {o.subs.map((sub) => (
                  <Cell key={sub.id} label={sub.i} />
                ))}
              </div>
            ))}
          </div>
        )
      }
    `)

    // No index declared → synthetic param; the `sub.i` property access is
    // untouched (this fix renames the forEach param, never rewrites bodies).
    expect(content).toContain('o.subs.forEach((sub, __innerIdx) => {')
    expect(content).toContain('get label() { return sub.i }')
  })
})
