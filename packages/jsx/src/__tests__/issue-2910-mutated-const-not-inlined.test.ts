/**
 * Regression tests for #2910 (bug 2): a `const`/`let` binding mutated by a
 * same-scope statement AFTER its declaration must never be inlined by its
 * (now stale) declaration-time initializer text wherever the bare
 * identifier is referenced as a component prop value.
 *
 * `const config = {}; for (const s of series) config[s.key] = {...}` is the
 * `@barefootjs/chart` shape the issue reports: `expandDynamicPropValue`
 * (`ir-to-client-js/prop-handling.ts`) used to look up `config` in
 * `ctx.localConstants` and re-embed its initializer text (`"{}"`)
 * verbatim — a snapshot from BEFORE the mutating `for` loop ran — instead
 * of a live reference to the `config` binding. `markMutatedConstants`
 * (analyzer.ts) now flags such bindings `mutatedAfterDeclaration`, and
 * every inlining consumer checks that flag first.
 */
import { describe, expect, test } from 'bun:test'
import { compileJSX } from '../index.ts'
import { TestAdapter } from '../adapters/test-adapter.ts'

function clientJsOf(source: string, path: string): string {
  const result = compileJSX(source, path, { adapter: new TestAdapter() })
  const errors = result.errors.filter(e => e.severity === 'error')
  expect(errors).toEqual([])
  const js = result.files.find(f => f.path.endsWith('.client.js'))?.content
  if (!js) throw new Error(`no client JS emitted for ${path}`)
  return js
}

describe('#2910 — a mutated-after-declaration const is never re-inlined', () => {
  test('a for-of-loop-mutated object literal reaches the child prop as a live reference', () => {
    const js = clientJsOf(
      `'use client'
function Child(props: { config: Record<string, { color: string }> }) {
  const handleMount = (el: HTMLElement) => {
    for (const [k, v] of Object.entries(props.config)) el.style.setProperty('--color-' + k, v.color)
  }
  return <div ref={handleMount} />
}

export function Host() {
  const config: Record<string, { color: string }> = {}
  const series = [{ key: 'a', color: 'red' }, { key: 'b', color: 'blue' }]
  for (const s of series) config[s.key] = { color: s.color }
  return <Child config={config} />
}
`,
      'host.tsx',
    )

    expect(js).toContain('get config() { return config }')
    expect(js).not.toContain('return {}')
    // The prop can no longer be known statically at template time — the
    // child render must defer to init (`upsertChild`), not an inline
    // `initChild(..., { config: {} })` call.
    expect(js).toContain("upsertChild(__scope, 'Child")
    expect(js).not.toContain('config: ')
  })

  test('a reassigned let binding is treated the same as an in-place mutation', () => {
    const js = clientJsOf(
      `'use client'
function Child(props: { label: string }) {
  return <span>{props.label}</span>
}

export function Host() {
  let label = 'initial'
  if (Math.random() > 0.5) label = 'changed'
  return <Child label={label} />
}
`,
      'host-let.tsx',
    )

    expect(js).toContain('get label() { return label }')
    expect(js).not.toContain("get label() { return 'initial' }")
  })

  test('a .push()-mutated array reaches the child prop as a live reference', () => {
    const js = clientJsOf(
      `'use client'
function List(props: { items: string[] }) {
  return <span>{props.items.join(',')}</span>
}

export function Host() {
  const items: string[] = []
  items.push('a')
  items.push('b')
  return <List items={items} />
}
`,
      'host-push.tsx',
    )

    expect(js).toContain('get items() { return items }')
    expect(js).not.toContain('items: []')
  })

  test('an untouched object-literal const is still inlined (no regression)', () => {
    const js = clientJsOf(
      `'use client'
function Child(props: { config: Record<string, { color: string }> }) {
  return <span>{Object.keys(props.config).length}</span>
}

export function Host() {
  const config: Record<string, { color: string }> = { a: { color: 'red' }, b: { color: 'blue' } }
  return <Child config={config} />
}
`,
      'host-literal.tsx',
    )

    // Never mutated — the existing inlining behaviour is unaffected.
    expect(js).toContain("config: ({ a: { color: 'red' }, b: { color: 'blue' } })")
  })
})
