/**
 * `serializeHydrationProps` (#2643) — the Hono-only runtime backstop for
 * BF049 (`packages/jsx/src/rich-type-refusal.ts`'s
 * `checkRichTypePropSerialization`). BF049 can only catch a prop whose type
 * is PROVABLE from `propsType`; an imported/aliased type or a loosely-typed
 * prop reaches Hono's serialization step uncaught, so this helper is the
 * actual floor: it throws a clear, actionable error for a value that cannot
 * survive the `bf-p` JSON boundary, instead of `JSON.stringify`'s opaque
 * `TypeError` (BigInt) or silent data loss (Map/Set/…).
 */

import { describe, test, expect } from 'bun:test'
import { serializeHydrationProps } from '../utils'
import { renderHonoComponent } from '../test-render'
import { HonoAdapter } from '../adapter/hono-adapter'

describe('serializeHydrationProps — unit', () => {
  test('empty props return undefined', () => {
    expect(serializeHydrationProps({}, 'Foo')).toBeUndefined()
  })

  test('a plain JSON-safe props object serializes normally', () => {
    expect(serializeHydrationProps({ a: 1, b: 'x', c: [1, 2], d: null }, 'Foo')).toBe(
      JSON.stringify({ a: 1, b: 'x', c: [1, 2], d: null }),
    )
  })

  test('a Date prop passes through untouched (handled by JSON.stringify’s own toJSON)', () => {
    const d = new Date('2024-01-01T00:00:00.000Z')
    expect(serializeHydrationProps({ createdAt: d }, 'Foo')).toBe(JSON.stringify({ createdAt: d }))
  })

  test.each([
    ['BigInt', { n: 123n }, 'n', 'BigInt'],
    ['Symbol', { s: Symbol('x') }, 's', 'Symbol'],
    ['Map', { data: new Map([['x', 1]]) }, 'data', 'Map'],
    ['Set', { tags: new Set(['x']) }, 'tags', 'Set'],
    ['WeakMap', { wm: new WeakMap() }, 'wm', 'WeakMap'],
    ['WeakSet', { ws: new WeakSet() }, 'ws', 'WeakSet'],
    ['Promise', { p: Promise.resolve(1) }, 'p', 'Promise'],
  ] as const)('%s prop throws a clear TypeError naming the prop, component, and #2643', (_label, props, propName, offender) => {
    expect(() => serializeHydrationProps(props, 'Foo')).toThrow(TypeError)
    try {
      serializeHydrationProps(props, 'Foo')
      throw new Error('expected a throw')
    } catch (e) {
      expect((e as Error).message).toContain(`prop '${propName}'`)
      expect((e as Error).message).toContain('<Foo>')
      expect((e as Error).message).toContain(offender)
      expect((e as Error).message).toContain('2643')
    }
  })

  test('a nested RegExp (inside a plain object) does not throw — only top-level values are checked', () => {
    // Matches the existing, shipped, TOLERATED degradation the InputOTP demo
    // relies on: JSON.stringify's own deep behavior for a nested rich value
    // is unchanged by this helper.
    const value = { wrapper: { pattern: /^[0-9]+$/ } }
    expect(() => serializeHydrationProps(value, 'Foo')).not.toThrow()
  })

  test('a top-level RegExp/Error/URLSearchParams degrades like JSON.stringify already did — not in the throw set', () => {
    expect(() => serializeHydrationProps({ pattern: /x/ }, 'Foo')).not.toThrow()
    expect(() => serializeHydrationProps({ err: new Error('x') }, 'Foo')).not.toThrow()
    expect(() => serializeHydrationProps({ q: new URLSearchParams('a=1') }, 'Foo')).not.toThrow()
  })
})

describe('serializeHydrationProps — integration via real Hono SSR render', () => {
  // Prop typed `unknown` so BF049 has no static evidence to fire on —
  // exercises the runtime backstop specifically, independent of the
  // compile-time check.
  const SOURCE = `
    'use client'
    export function Foo({ data }: { data: unknown }) {
      return <button onClick={() => console.log(data)}>go</button>
    }
  `

  // `renderHonoComponent` routes through Hono's own default error handler
  // (`app.request()`, no custom `app.onError`), which swallows a thrown
  // error's message into a generic 500 body — so these integration tests
  // only prove the WIRING actually fails the request end-to-end (the
  // `serializeHydrationProps` call is really reached from real generated
  // component code, via the real `@barefootjs/hono/utils` import). The
  // exact thrown message is already pinned by the direct unit tests above.
  test('a Map prop causes SSR to fail (the runtime backstop is really wired into generated code)', async () => {
    await expect(
      renderHonoComponent({ adapter: new HonoAdapter(), source: SOURCE, props: { data: new Map([['x', 1]]) } }),
    ).rejects.toThrow(/Render failed with status 500/)
  })

  test('a BigInt prop causes SSR to fail (previously an opaque JSON.stringify TypeError; behavior unchanged, now via the clearer helper)', async () => {
    await expect(
      renderHonoComponent({ adapter: new HonoAdapter(), source: SOURCE, props: { data: 123n } }),
    ).rejects.toThrow(/Render failed with status 500/)
  })

  test('an array prop (JSON-safe) renders successfully', async () => {
    const html = await renderHonoComponent({ adapter: new HonoAdapter(), source: SOURCE, props: { data: [1, 2, 3] } })
    expect(html).toContain('bf-p=')
  })
})
