/**
 * `memoizeRender` (#3667): one render per distinct input in a conformance
 * run. Pinned here: equal inputs share one render (concurrent callers
 * included) whatever the adapter instance; any input difference a render
 * can observe gets its own render; a rejection is shared; and inputs the key
 * cannot serialize bypass the cache.
 */
import { describe, expect, test } from 'bun:test'
import { HonoAdapter } from '@barefootjs/hono'
import type { RenderOptions } from '../jsx-runner'
import { renderHonoComponent } from '@barefootjs/hono/test-render'
import { fixture as objectEntriesMap } from '../../fixtures/object-entries-map'
import { normalizeHTML } from '../html-normalize'
import { memoizeRender, renderKey, stableKey } from '../render-memo'

const SOURCE = 'export function A() { return <p /> }'

function counting(result: (o: RenderOptions) => Promise<string> = async () => '<p></p>') {
  let calls = 0
  const render = memoizeRender(async (o) => {
    calls++
    return result(o)
  })
  return { render, calls: () => calls }
}

const opts = (extra: Partial<RenderOptions> = {}): RenderOptions => ({
  source: SOURCE,
  adapter: new HonoAdapter(),
  ...extra,
})

describe('memoizeRender', () => {
  test('equal inputs render once, across fresh adapter instances', async () => {
    const { render, calls } = counting()
    await render(opts({ props: { a: 1 } }))
    await render(opts({ props: { a: 1 } }))
    expect(calls()).toBe(1)
  })

  test('concurrent callers share one in-flight render', async () => {
    const { render, calls } = counting()
    const [a, b] = await Promise.all([render(opts()), render(opts())])
    expect(a).toBe(b)
    expect(calls()).toBe(1)
  })

  test('a rejection is shared, not retried', async () => {
    const { render, calls } = counting(async () => {
      throw new Error('go build failed')
    })
    await expect(render(opts())).rejects.toThrow('go build failed')
    await expect(render(opts())).rejects.toThrow('go build failed')
    expect(calls()).toBe(1)
  })

  test('the key is taken before the render can mutate its props', async () => {
    const { render, calls } = counting(async (o) => {
      ;(o.props?.items as number[]).reverse()
      return ''
    })
    await render(opts({ props: { items: [1, 2] } }))
    await render(opts({ props: { items: [1, 2] } }))
    expect(calls()).toBe(1)
  })

  test('each distinct input gets its own render', async () => {
    const { render, calls } = counting()
    await render(opts())
    await render(opts({ source: `${SOURCE}\n` }))
    await render(opts({ componentName: 'A' }))
    await render(opts({ components: { 'child.tsx': 'x' } }))
    await render(opts({ componentModules: { './child': '/abs/child.js' } }))
    expect(calls()).toBe(5)
  })

  test('reordered object props render separately (object-entries-map, real Hono render)', async () => {
    const render = memoizeRender(renderHonoComponent)
    const run = (counts: Record<string, number>) =>
      render({ source: objectEntriesMap.source, adapter: new HonoAdapter(), props: { counts } })
    const appleFirst = normalizeHTML(await run({ apple: 3, banana: 5 }))
    const bananaFirst = normalizeHTML(await run({ banana: 5, apple: 3 }))
    expect(bananaFirst).not.toBe(appleFirst)
    expect(bananaFirst.indexOf('banana')).toBeLessThan(bananaFirst.indexOf('apple'))
  })

  test('an input the key cannot serialize renders every time', async () => {
    const { render, calls } = counting()
    await render(opts({ props: { m: new Map() } }))
    await render(opts({ props: { m: new Map() } }))
    expect(calls()).toBe(2)
  })
})

describe('stableKey tells apart what a render can tell apart', () => {
  const distinct: Array<[string, unknown, unknown]> = [
    ['-0 vs 0', -0, 0],
    ['number vs numeric string', 1, '1'],
    ['fraction vs its rounding', 1.5, 2],
    ['Date vs its ISO string', new Date(0), new Date(0).toISOString()],
    ['absent key vs key set to undefined', {}, { a: undefined }],
    ["'' vs absent", { a: '' }, {}],
    ['0 vs false', 0, false],
    ['null vs undefined', null, undefined],
    ['array hole vs undefined', [, 1], [undefined, 1]],
    ['nested values', { a: { b: [1] } }, { a: { b: [2] } }],
  ]
  for (const [label, a, b] of distinct) {
    test(label, () => {
      expect(stableKey(a)).not.toBe(stableKey(b))
    })
  }

  test('object key order is part of the key, since a render can enumerate it', () => {
    expect(stableKey({ a: 1, b: 2 })).not.toBe(stableKey({ b: 2, a: 1 }))
    expect(stableKey({ c: { a: 1, b: 2 } })).not.toBe(stableKey({ c: { b: 2, a: 1 } }))
    expect(stableKey({ a: 1, b: 2 })).toBe(stableKey({ a: 1, b: 2 }))
  })

  test('NaN and the infinities have keys of their own', () => {
    expect(new Set([stableKey(Number.NaN), stableKey(Infinity), stableKey(-Infinity), stableKey(0)]).size).toBe(4)
  })

  test('values outside plain data are not keyed', () => {
    expect(stableKey(() => 1)).toBeUndefined()
    expect(stableKey(new Map())).toBeUndefined()
    expect(stableKey({ [Symbol('s')]: 1 })).toBeUndefined()
    expect(stableKey(new (class C {})())).toBeUndefined()
    expect(stableKey(Object.assign([1], { label: 'x' }))).toBeUndefined()
    expect(stableKey(Object.assign(new Date(0), { tz: 'UTC' }))).toBeUndefined()
    expect(stableKey(new (class L extends Array {})())).toBeUndefined()
  })

  test('a cyclic value is not keyed, and its render bypasses the cache', async () => {
    const cyclic: Record<string, unknown> = {}
    cyclic.self = cyclic
    expect(stableKey(cyclic)).toBeUndefined()
    const { render, calls } = counting()
    await render(opts({ props: cyclic }))
    await render(opts({ props: cyclic }))
    expect(calls()).toBe(2)
  })

  test('a value reached twice without a cycle is still keyed', () => {
    const shared = { a: 1 }
    expect(stableKey({ x: shared, y: shared })).toBe(stableKey({ x: { a: 1 }, y: { a: 1 } }))
  })

  test('the adapter instance is not part of the key', () => {
    expect(renderKey(opts())).toBe(renderKey(opts()))
  })

  test('a RenderOptions field set to undefined keys like an absent one', () => {
    expect(renderKey(opts({ props: undefined, componentModules: undefined }))).toBe(renderKey(opts()))
  })

  test('inside props, undefined and absent stay distinct', () => {
    expect(renderKey(opts({ props: { a: undefined } }))).not.toBe(renderKey(opts({ props: {} })))
  })
})
