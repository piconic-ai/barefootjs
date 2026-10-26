/**
 * Memoizes an adapter's render function for one `runAdapterConformanceTests`
 * run (#3667).
 *
 * Several suites in that run render the same fixture with the same props:
 * the JSX suite, claim-plan conformance and the data-point gate each render
 * a fixture with `fixture.props`, and the render contract renders
 * `counter-buttons` again. For a native adapter each render is a full
 * backend round trip (a `go build` plus a run for Go Template, a JVM or
 * interpreter start for the others), and 32% of Go Template's builds in a
 * `pr`-tier run compiled a program identical to one already built.
 *
 * The cache key is every render input except the adapter instance. That is
 * sound because every render through one cache uses a fresh instance from
 * the same `factory`, and none of the suites reads adapter state after the
 * render. A new `RenderOptions` field becomes part of the key automatically.
 * The promise is stored, so concurrent tests share one in-flight render, and
 * a rejection is shared too, so `onRenderError` sees the same outcome in each
 * suite. Inputs that `renderKey` cannot serialize faithfully are rendered
 * without the cache.
 */
import type { RenderOptions } from './jsx-runner'

export type RenderFn = (options: RenderOptions) => Promise<string>

export function memoizeRender(render: RenderFn): RenderFn {
  const cache = new Map<string, Promise<string>>()
  return (options) => {
    // Computed before rendering: a fixture source that mutates its props
    // (`.sort()`, `.reverse()`) must not change the key it is stored under.
    const key = renderKey(options)
    if (key === undefined) return render(options)
    let pending = cache.get(key)
    if (!pending) {
      pending = render(options)
      cache.set(key, pending)
    }
    return pending
  }
}

/**
 * The cache key for `options` without its adapter, or `undefined` when an
 * input holds a value `stableKey` does not serialize. A `RenderOptions`
 * field set to `undefined` means the same as an absent one (the suites pass
 * `props: undefined` where the render contract leaves `props` out), so those
 * are dropped here. Inside `props` the two stay distinct.
 */
export function renderKey(options: RenderOptions): string | undefined {
  const inputs: Record<string, unknown> = {}
  for (const [field, value] of Object.entries(options)) {
    if (field !== 'adapter' && value !== undefined) inputs[field] = value
  }
  return stableKey(inputs)
}

/**
 * A serialization that tells apart the values a render can tell apart:
 * `-0` from `0`, a `Date` from its ISO string, an absent key from one set to
 * `undefined`, an array hole from `undefined`, and two objects whose keys
 * enumerate in a different order (`Object.entries(counts).map(...)` renders
 * them in that order, so the key keeps `Object.keys` order). Returns `undefined` for anything it cannot represent
 * that faithfully: functions, Maps, class instances, symbol-keyed objects,
 * arrays or Dates carrying extra own properties, and cyclic values.
 */
export function stableKey(value: unknown): string | undefined {
  return keyOf(value, new Set())
}

function keyOf(value: unknown, path: Set<object>): string | undefined {
  switch (typeof value) {
    case 'undefined':
      return 'u'
    case 'boolean':
      return value ? 'T' : 'F'
    case 'number':
      return Object.is(value, -0) ? 'd:-0' : `d:${value}`
    case 'bigint':
      return `i:${value}`
    case 'string':
      return `s:${JSON.stringify(value)}`
    case 'object': {
      if (value === null) return 'n'
      if (path.has(value)) return undefined
      path.add(value)
      const key = objectKey(value, path)
      path.delete(value)
      return key
    }
    default:
      return undefined
  }
}

function objectKey(value: object, path: Set<object>): string | undefined {
  if (Object.getOwnPropertySymbols(value).length > 0) return undefined
  const proto = Object.getPrototypeOf(value)
  if (value instanceof Date) {
    return proto === Date.prototype && Object.keys(value).length === 0 ? `t:${value.getTime()}` : undefined
  }
  if (Array.isArray(value)) {
    if (proto !== Array.prototype) return undefined
    const items: string[] = []
    let own = 0
    for (let i = 0; i < value.length; i++) {
      if (!(i in value)) {
        items.push('h')
        continue
      }
      own++
      const item = keyOf(value[i], path)
      if (item === undefined) return undefined
      items.push(item)
    }
    // Own keys beyond the indices (`Object.assign([1], { label })`).
    if (Object.keys(value).length !== own) return undefined
    return `[${items.join(',')}]`
  }
  if (proto !== Object.prototype && proto !== null) return undefined
  const entries: string[] = []
  for (const k of Object.keys(value)) {
    const item = keyOf((value as Record<string, unknown>)[k], path)
    if (item === undefined) return undefined
    entries.push(`${JSON.stringify(k)}:${item}`)
  }
  return `{${entries.join(',')}}`
}
