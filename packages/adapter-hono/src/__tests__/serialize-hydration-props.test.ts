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
import { compileJSX } from '@barefootjs/jsx'
import { resolve } from 'node:path'
import { rm } from 'node:fs/promises'
import { serializeHydrationProps } from '../utils'
import { renderHonoComponent } from '../test-render'
import { HonoAdapter } from '../adapter/hono-adapter'

/**
 * Compile a single-component source with `HonoAdapter` and call the
 * generated function DIRECTLY (bypassing `renderHonoComponent`'s
 * `app.request()`) so a thrown error's exact message survives — Hono's
 * default error handler (no custom `app.onError`) collapses any thrown
 * error into a generic "Internal Server Error" 500 body, which is why the
 * Map/BigInt integration tests below only assert "the request fails", not
 * the message (already pinned by the direct unit tests above). The Move C
 * root-scope function-prop case additionally needs the message itself
 * pinned through REAL generated code (not just the `serializeHydrationProps`
 * unit above), so this bypasses HTTP entirely and calls the compiled
 * component like a plain function.
 */
async function callComponentDirect(source: string, props: Record<string, unknown>): Promise<unknown> {
  const result = compileJSX(source, 'component.tsx', { adapter: new HonoAdapter() })
  const errors = result.errors.filter((e) => e.severity === 'error')
  if (errors.length > 0) {
    throw new Error(`Compilation errors:\n${errors.map((e) => e.message).join('\n')}`)
  }
  const templateFile = result.files.find((f) => f.type === 'markedTemplate')
  if (!templateFile) throw new Error('No marked template in compile output')
  const code = `/** @jsxImportSource hono/jsx */\n${templateFile.content}`
  // Same temp dir `test-render.ts` uses — inside the hono package so
  // `hono/jsx` resolves.
  const tempDir = resolve(import.meta.dir, '../../.render-temp')
  const tempFile = resolve(tempDir, `direct-${Date.now()}-${Math.random().toString(36).slice(2)}.tsx`)
  await Bun.write(tempFile, code)
  try {
    const mod = await import(tempFile)
    const name = Object.keys(mod).find((k) => typeof mod[k] === 'function')
    if (!name) throw new Error('No component function found in compiled module')
    return mod[name]({ __instanceId: 'test', __bfChild: false, ...props })
  } finally {
    await rm(tempFile, { force: true }).catch(() => {})
  }
}

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

describe('serializeHydrationProps — liveOnlyProps (Move C, Prop Boundary Contract)', () => {
  test('a function value for a prop NOT in liveOnlyProps is silently dropped, like JSON.stringify already drops a function', () => {
    expect(serializeHydrationProps({ cb: () => 1, a: 1 }, 'Foo')).toBe(JSON.stringify({ a: 1 }))
  })

  test('a function value for a prop IN liveOnlyProps throws a clear, actionable TypeError', () => {
    const fn = () => 1
    expect(() =>
      serializeHydrationProps({ value: fn }, 'Display', { value: '() => number' }),
    ).toThrow(TypeError)
  })

  test('the thrown message is pinned to the documented wording', () => {
    const fn = () => 1
    try {
      serializeHydrationProps({ value: fn }, 'Display', { value: '() => number' })
      throw new Error('expected a throw')
    } catch (e) {
      expect((e as Error).message).toBe(
        "[barefootjs] Cannot serialize prop 'value' of <Display> for hydration: it is declared `() => number` " +
          "and read by the component's client code, but a function cannot cross the bf-p JSON boundary (the " +
          'client would hydrate against `undefined` and throw). A function-typed prop can only reach <Display> ' +
          'live — render <Display> from a compiled parent component (initChild) or mount it client-side ' +
          '(createComponent); from a route handler pass the data and let the component own the accessor.',
      )
    }
  })

  test('a live-only prop alongside an unrelated non-function prop still serializes the rest', () => {
    expect(() =>
      serializeHydrationProps({ value: () => 1, label: 'x' }, 'Display', { value: '() => number' }),
    ).toThrow(TypeError)
  })
})

describe('function-typed prop at the hydration boundary — root vs. child (Move C, Prop Boundary Contract)', () => {
  // `Display` reads `value` LIVE (calls it, both in the click handler and
  // in the rendered text) — exactly #2760's own example
  // (`<Display value={count} />`), and the shape the background section of
  // this Move calls out as silently dropped before this fix.
  const DISPLAY_SOURCE = `
    'use client'
    export function Display({ value }: { value: () => number }) {
      return <button onClick={() => console.log(value())}>{value()}</button>
    }
  `

  test('positive: as the hydration ROOT, a live function-typed prop fails SSR with the pinned message', async () => {
    await expect(callComponentDirect(DISPLAY_SOURCE, { value: () => 42 })).rejects.toThrow(
      "[barefootjs] Cannot serialize prop 'value' of <Display> for hydration: it is declared `() => number` " +
        "and read by the component's client code, but a function cannot cross the bf-p JSON boundary (the " +
        'client would hydrate against `undefined` and throw). A function-typed prop can only reach <Display> ' +
        'live — render <Display> from a compiled parent component (initChild) or mount it client-side ' +
        '(createComponent); from a route handler pass the data and let the component own the accessor.',
    )
  })

  test('negative — client parent: the same component, rendered as a child of a "use client" parent, renders successfully', async () => {
    const html = await renderHonoComponent({
      adapter: new HonoAdapter(),
      source: `
        'use client'
        import { createSignal } from '@barefootjs/client'
        import { Display } from './display'
        export function ClientParent() {
          const [count] = createSignal(() => 42)
          return <div><Display value={count} /></div>
        }
      `,
      components: { './display.tsx': DISPLAY_SOURCE },
    })
    // A child never carries bf-p; it hydrates via initChild instead.
    expect(html).toContain('bf-h=')
    expect(html).not.toContain('bf-p=')
  })

  test('negative — server parent: the same component, rendered as a child of a plain (non-"use client") server component, renders successfully', async () => {
    // The function value originates as a LOCAL constant in the server
    // parent's own body, never crossing that parent's own hydration
    // boundary (the parent has no props of its own to serialize) — the
    // legitimate "always used as a compiled child" pattern the Move A/C
    // design calls out (Context-provider-style components). The parent
    // still ends up needing its own client wiring (`__bfChild={true}`
    // passed to `Display`) purely because it renders an interactive child.
    const html = await renderHonoComponent({
      adapter: new HonoAdapter(),
      source: `
        import { Display } from './display'
        export function ServerParent() {
          const getValue = () => 42
          return <div><Display value={getValue} /></div>
        }
      `,
      components: { './display.tsx': DISPLAY_SOURCE },
    })
    expect(html).toContain('bf-h=')
    expect(html).not.toContain('bf-p=')
  })

  test('gating regression: a CHILD-scope component with an unrelated rich-type (Map) prop now renders successfully instead of 500ing', async () => {
    // Before the __bfChild gate (Move C step 2), `serializeHydrationProps`
    // ran unconditionally even for a child mount whose __bfPropsJson is
    // never read — so a child carrying ANY offender-shaped prop (a Map
    // here, nothing to do with functions) used to fail SSR for a value
    // that was always going to be discarded. `data` is typed `unknown` so
    // BF049 has no static evidence to refuse it at compile time either.
    const html = await renderHonoComponent({
      adapter: new HonoAdapter(),
      source: `
        import { Leaf } from './leaf'
        export function MapParent() {
          const data = new Map([['x', 1]])
          return <div><Leaf data={data} /></div>
        }
      `,
      components: {
        './leaf.tsx': `
          'use client'
          export function Leaf({ data }: { data: unknown }) {
            return <button onClick={() => console.log(data)}>go</button>
          }
        `,
      },
    })
    expect(html).toContain('bf-h=')
    expect(html).not.toContain('bf-p=')
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
