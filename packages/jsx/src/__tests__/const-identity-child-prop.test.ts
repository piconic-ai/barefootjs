/**
 * #3868: a const whose initializer allocates and reads nothing reactive,
 * passed as a child component prop, reaches the child as the binding the
 * declaration created. The prop getter used to return the initializer text
 * (`get token() { return { n: 1 } }`), so each read built a new object.
 * A primitive const and a const that reads a signal, a memo or a prop still
 * expand, as before.
 */
import { describe, expect, test } from 'bun:test'
import { compileJSX } from '../index.ts'
import { TestAdapter } from '../adapters/test-adapter.ts'

function clientJsOf(source: string): string {
  const result = compileJSX(source, 'host.tsx', { adapter: new TestAdapter() })
  const errors = result.errors.filter(e => e.severity === 'error')
  expect(errors).toEqual([])
  const js = result.files.find(f => f.path.endsWith('.client.js'))?.content
  if (!js) throw new Error('no client JS emitted')
  return js
}

const CHILD = `
function Child(props: { token: unknown }) {
  return <output>{props.token === props.token ? 'same' : 'different'}</output>
}
`

function hostWith(decls: string, props: string, params = ''): string {
  return `'use client'
import { createSignal, createMemo } from '@barefootjs/client'
function makeToken() { return { n: 4 } }
const MODULE_TOKEN = { n: 5 }
${CHILD}
export function Host(${params}) {
  const [count] = createSignal(1)
  const doubled = createMemo(() => count() * 2)
  ${decls}
  return <main>${props}</main>
}
`
}

describe('#3868 — an allocating, non-reactive const keeps one identity as a child prop', () => {
  test.each([
    ['an object literal', 'const token = { n: 1 }'],
    ['an array literal', 'const token = [1, 2]'],
    ['a new expression', 'const token = new Map()'],
    ['a call', 'const token = makeToken()'],
    ['an arrow function', 'const token = () => count()'],
    ['a ternary with an object arm', 'const token = Math.random() > 2 ? { n: 1 } : null'],
    ['an object reading another const', 'const base = { n: 1 }\n  const token = { base }'],
    ['an object typed with satisfies', 'const token = { n: 1 } satisfies { n: number }'],
  ])('%s is read as the binding', (_label, decl) => {
    const js = clientJsOf(hostWith(decl, '<Child token={token} />'))
    expect(js).toContain('get token() { return token }')
  })

  test('a module-scope object const is read as the binding', () => {
    const js = clientJsOf(hostWith('', '<Child token={MODULE_TOKEN} />'))
    expect(js).toContain('get token() { return MODULE_TOKEN }')
  })

  test('the binding is forwarded the same way through a nested child', () => {
    const js = clientJsOf(`'use client'
${CHILD}
function Forward(props: { token: unknown }) {
  return <Child token={props.token} />
}
export function Host() {
  const token = { n: 1 }
  return <main><Forward token={token} /></main>
}
`)
    expect(js).toContain('get token() { return token }')
    expect(js).not.toContain('return { n: 1 }')
  })

  test.each([
    ['a signal read', 'const token = { n: count() }', '{ n: count() }'],
    ['a memo read', 'const token = [doubled()]', '[doubled()]'],
  ])('an initializer with %s still expands, so the prop stays live', (_label, decl, expanded) => {
    const js = clientJsOf(hostWith(decl, '<Child token={token} />'))
    expect(js).toContain(`get token() { return ${expanded} }`)
  })

  test('an initializer reading a prop still expands', () => {
    const js = clientJsOf(hostWith('const token = { n: props.n }', '<Child token={token} />', 'props: { n: number }'))
    expect(js).toContain('get token() { return { n: _p.n } }')
  })

  test('an initializer calling a component-scope function still expands', () => {
    const js = clientJsOf(hostWith('const make = () => ({ n: count() })\n  const token = make()', '<Child token={token} />'))
    expect(js).toContain('get token() { return make() }')
  })

  // Review finding on the PR: a reactive source reached through a local
  // alias is still reactive, so the getter must keep re-evaluating.
  test('an initializer reading a prop through a props alias still expands', () => {
    const js = clientJsOf(hostWith('const p = props\n  const token = { n: p.n }', '<Child token={token} />', 'props: { n: number }'))
    expect(js).not.toContain('get token() { return token }')
  })

  test('an initializer calling a signal through an alias still expands', () => {
    const js = clientJsOf(hostWith('const get = count\n  const token = { n: get() }', '<Child token={token} />'))
    expect(js).not.toContain('get token() { return token }')
  })

  test('an initializer reading a const derived from a signal still expands', () => {
    const js = clientJsOf(hostWith('const half = count() / 2\n  const token = { n: half }', '<Child token={token} />'))
    expect(js).not.toContain('get token() { return token }')
  })

  test('an alias of an alias is followed', () => {
    const js = clientJsOf(hostWith('const p = props\n  const q = p\n  const token = { n: q.n }', '<Child token={token} />', 'props: { n: number }'))
    expect(js).not.toContain('get token() { return token }')
  })

  test('a const reading only non-reactive consts keeps its identity', () => {
    const js = clientJsOf(hostWith("const base = 3\n  const token = { n: base }", '<Child token={token} />'))
    expect(js).toContain('get token() { return token }')
  })

  test('a primitive const still expands as before', () => {
    const js = clientJsOf(hostWith("const token = 'x'", '<Child token={token} />'))
    expect(js).not.toContain('get token() { return token }')
  })
})
