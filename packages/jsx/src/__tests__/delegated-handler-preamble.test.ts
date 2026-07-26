/**
 * A keyed `.map()` body with an array-builder preamble (`const cells = [];
 * cells.push(<span>...)`) plus a row-level event handler used to make EVERY
 * delegated action throw `t is not a function` (BUG-3).
 *
 * Root cause: the delegated handler's item-lookup binds the plain `.find()`
 * result under the loop param (`const t = items().find(...)`) — `t` is a
 * plain object there, never a signal accessor. But the preamble's JSX leaf
 * was rendered through `irToHtmlTemplate` WITH a loopParams spec, the same
 * one used for the mapArray row-render context (where the param genuinely
 * IS an accessor). That rewrote leaf refs to `t().name` — a call on a plain
 * object — which throws at click time.
 *
 * `build-event-delegation.ts` now renders the delegation-context preamble
 * leaf with no loopParams spec, so refs stay in their plain (`t.name`) form.
 * It also only splices the preamble into a given event's handler when that
 * handler's free identifiers actually reference one of the preamble's
 * declared names (`MapCallbackPreamble.declaredNames`) — the common case is
 * an array builder the handler never reads (`cells` here) — and, when
 * spliced, the preamble always runs INSIDE the item-null guard (BUG-4: a
 * `.find()` miss from a stale-DOM race must short-circuit before a preamble
 * that dereferences the item runs).
 */

import { describe, test, expect } from 'bun:test'
import { compileJSX } from '../compiler'
import { TestAdapter } from '../adapters/test-adapter'

const adapter = new TestAdapter()

function clientJsFor(source: string): string {
  const result = compileJSX(source, 'Repro.tsx', { adapter })
  expect(result.errors.filter((e) => e.severity === 'error')).toHaveLength(0)
  const clientJs = result.files.find((f) => f.type === 'clientJs')
  expect(clientJs).toBeDefined()
  return clientJs!.content
}

/**
 * The delegated-dispatcher body sits between the loop's `addEventListener`
 * call and the `hydrate(...)` call that follows it in the emitted module —
 * isolate it so assertions about the HANDLER shape don't accidentally match
 * the (legitimately accessor-form) mapArray row-render callback that
 * precedes it in the same file.
 */
function delegationBlock(js: string): string {
  const start = js.indexOf('.addEventListener(')
  const end = js.indexOf('\n\nhydrate(')
  expect(start).toBeGreaterThan(-1)
  expect(end).toBeGreaterThan(start)
  return js.slice(start, end)
}

describe('delegated-handler preamble splicing (BUG-3 / BUG-4)', () => {
  test('unreferenced array-builder preamble: no getter-call leaf refs, no dead splice', () => {
    const js = clientJsFor(`
      'use client'
      import { createSignal } from '@barefootjs/client'
      export function R2a() {
        const [items, setItems] = createSignal([{ id: 1, name: 'x' }, { id: 2, name: 'y' }])
        const del = (id: number) => setItems(items().filter(i => i.id !== id))
        return <ul id="list">{items().map(t => {
          const cells = []
          cells.push(<span>{t.name}</span>)
          return <li key={t.id}>{cells}<button className="del" onClick={() => del(t.id)}>del</button></li>
        })}</ul>
      }
    `)
    const handler = delegationBlock(js)

    // BUG-3: the leaf inside the delegation-context preamble must stay in
    // plain-object form — `t` is the `.find()` result, not a signal accessor.
    expect(handler).not.toContain('t().')

    // The preamble (`cells`) is never read by the click handler
    // (`() => del(t.id)`) — it must not be spliced into the dispatcher at
    // all. `cells.push` legitimately appears twice elsewhere (the mapArray
    // row-render callback and the SSR-template literal it mirrors); it must
    // not appear a third time in the handler.
    expect(handler).not.toContain('cells.push')
    expect(js.split('cells.push')).toHaveLength(3) // two occurrences total

    // The item guard still gates the handler call.
    expect(handler).toContain('if (t) {')
    expect(handler).toContain('(() => del(t.id))(__bfEvt)')
  })

  test('preamble referenced by the handler: spliced in plain form, inside the item guard', () => {
    const js = clientJsFor(`
      'use client'
      import { createSignal } from '@barefootjs/client'
      export function R2b() {
        const [items, setItems] = createSignal([{ id: 1, name: 'x' }, { id: 2, name: 'y' }])
        const del = (label: string) => setItems(items().filter(i => i.name !== label))
        return <ul id="list">{items().map(t => {
          const label = t.name + '!'
          return <li key={t.id}>{label}<button className="del" onClick={() => del(label)}>del</button></li>
        })}</ul>
      }
    `)
    const handler = delegationBlock(js)

    // Spliced in plain (non-getter) form.
    expect(handler).toContain('const label = t.name + \'!\';')
    expect(handler).not.toContain('t().')

    // Guard-order (part 3): the preamble line and the handler call both
    // land AFTER `if (t) {`, i.e. inside the item-null guard.
    const guardIdx = handler.indexOf('if (t) {')
    const preambleIdx = handler.indexOf('const label = t.name')
    const callIdx = handler.indexOf('(() => del(label))(__bfEvt)')
    expect(guardIdx).toBeGreaterThanOrEqual(0)
    expect(preambleIdx).toBeGreaterThan(guardIdx)
    expect(callIdx).toBeGreaterThan(preambleIdx)
  })

  test('destructured param + preamble + handler: no accessor leaks, real destructure resolves refs', () => {
    const js = clientJsFor(`
      'use client'
      import { createSignal } from '@barefootjs/client'
      export function R2c() {
        const [items, setItems] = createSignal([{ id: 1, name: 'x' }, { id: 2, name: 'y' }])
        const del = (label: string) => setItems(items().filter(i => i.name !== label))
        return <ul id="list">{items().map(({ id, name }) => {
          const label = name + '!'
          return <li key={id}>{label}<button className="del" onClick={() => del(label)}>del</button></li>
        })}</ul>
      }
    `)
    const handler = delegationBlock(js)

    // No `__bfItem()`-style accessor leaks into the delegated handler — the
    // destructured names resolve as real local bindings off `__bfLoopItem`.
    expect(handler).not.toContain('__bfItem(')

    // Real destructure (#951 TDZ-safe shape) binds `id`/`name` for real —
    // the preamble and handler both close over the resulting plain locals.
    expect(handler).toContain('const __bfLoopItem = ')
    expect(handler).toContain('const { id, name } = __bfLoopItem')
    expect(handler).toContain('const label = name + \'!\';')
    expect(handler).toContain('(() => del(label))(__bfEvt)')

    // Guard-order holds for the bindings-branch shape too.
    const guardIdx = handler.indexOf('if (__bfLoopItem) {')
    const preambleIdx = handler.indexOf('const label = name')
    const callIdx = handler.indexOf('(() => del(label))(__bfEvt)')
    expect(guardIdx).toBeGreaterThanOrEqual(0)
    expect(preambleIdx).toBeGreaterThan(guardIdx)
    expect(callIdx).toBeGreaterThan(preambleIdx)
  })
})
