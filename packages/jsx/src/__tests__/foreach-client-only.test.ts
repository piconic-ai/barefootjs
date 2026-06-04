/**
 * `.forEach()` is client-callback-only (#1448 Tier C / Tier D-class).
 *
 * `.forEach()` returns `undefined`, so it has no template-position meaning
 * and is never a lowering target. This pins the two halves of that contract:
 *
 *  1. In **template position** the support gate refuses it (the template
 *     adapters surface this as BF101 via `isSupported`), with a dedicated
 *     reason that explains the `undefined` return — not the generic
 *     `/* @client *​/` escape-hatch hint.
 *  2. Inside an **event handler / `createEffect` callback** it is client JS
 *     and passes straight through to the emitted runtime untouched — this is
 *     the only valid use.
 */

import { describe, test, expect } from 'bun:test'
import { parseExpression, isSupported } from '../expression-parser'
import { compileJSX } from '../compiler'
import { TestAdapter } from '../adapters/test-adapter'

const adapter = new TestAdapter()

describe('.forEach() — template position is refused (#1448)', () => {
  test('isSupported reports forEach as unsupported', () => {
    const support = isSupported(parseExpression('items().forEach(t => t.x)'))
    expect(support.supported).toBe(false)
    expect(support.level).toBe('L5_UNSUPPORTED')
  })

  test('refusal reason explains the undefined return and points to the valid uses', () => {
    const support = isSupported(parseExpression('items().forEach(t => t.x)'))
    expect(support.supported).toBe(false)
    if (support.supported) return
    // Dedicated forEach message that steers to .map(...) / createEffect —
    // not the generic refusal, which offers the /* @client */ escape hatch.
    expect(support.reason).toContain('returns undefined')
    expect(support.reason).toContain('createEffect')
    expect(support.reason).toContain('.map(')
    expect(support.reason).not.toContain('/* @client */')
  })

  test('a bare-identifier receiver is refused too (not just signal getters)', () => {
    const support = isSupported(parseExpression('list.forEach(x => x)'))
    expect(support.supported).toBe(false)
    expect(support.level).toBe('L5_UNSUPPORTED')
  })
})

describe('.forEach() — client-callback use passes through (#1448)', () => {
  // forEach inside an event handler and a createEffect callback is client JS;
  // it must reach the emitted runtime verbatim with no compile error.
  const source = `
    'use client'
    import { createSignal, createEffect } from '@barefootjs/client'

    export function C() {
      const [items, setItems] = createSignal<any[]>([])
      const handle = () => { items().forEach(t => console.log(t)) }
      createEffect(() => { items().forEach(t => t) })
      return <button onClick={handle}>go</button>
    }
  `

  test('no compile errors for forEach in callbacks', () => {
    const result = compileJSX(source, 'C.tsx', { adapter })
    expect(result.errors).toHaveLength(0)
  })

  test('forEach reaches the emitted client JS verbatim', () => {
    const result = compileJSX(source, 'C.tsx', { adapter })
    const client = result.files.find(f => f.path.endsWith('.client.js'))
    expect(client).toBeDefined()
    // Target the user's own `items().forEach(...)` calls specifically — a bare
    // `/forEach/g` count would also catch any `forEach` the client-code
    // generator emits for loop / hydration infrastructure, making this flaky.
    // Both the handler call and the createEffect call must survive verbatim.
    const occurrences = client!.content.match(/items\(\)\.forEach\(/g) ?? []
    expect(occurrences.length).toBe(2)
  })
})
