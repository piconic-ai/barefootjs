/**
 * #4021: the CSR template binds a const whose initializer can give a
 * different value each time it is evaluated (it allocates, constructs or
 * calls) once per template evaluation, instead of splicing the initializer
 * at every read. Two reads then see one object (`B === B`) and one sample
 * (`Math.random()`), as on the server. A const the initializer of which
 * only reads names and combines them is still spliced, byte-identical.
 */
import { describe, expect, test } from 'bun:test'
import { compileJSX } from '../index.ts'
import { HonoAdapter } from '../../../adapter-hono/src/adapter/index.ts'

function templateOf(source: string): string {
  const result = compileJSX(source, 'host.tsx', { adapter: new HonoAdapter() })
  const errors = result.errors.filter(e => e.severity === 'error')
  expect(errors).toEqual([])
  const js = result.files.find(f => f.path.endsWith('.client.js'))?.content
  if (!js) throw new Error('no client JS emitted')
  const line = js.split('\n').find(l => l.startsWith("hydrate('Host'"))
  if (!line) throw new Error('no hydrate line')
  return line
}

function occurrences(haystack: string, needle: string): number {
  return haystack.split(needle).length - 1
}

const host = (pre: string, body: string, markup: string): string => `'use client'
import { createSignal } from '@barefootjs/client'
${pre}
export function Host(props: { v?: string }) {
  const [n] = createSignal(1)
  ${body}
  return ${markup}
}
`

describe('#4021 — a fresh-per-evaluation const is bound once per template evaluation', () => {
  test.each([
    ['a module object literal', `const B = { k: 'v' }`, '', `{ k: 'v' }`],
    ['a component object literal', '', `const B = { k: 'v' }`, `{ k: 'v' }`],
    ['an array literal', `const B = [1, 2]`, '', '[1, 2]'],
    ['a new expression', `const B = new Date(0)`, '', 'new Date(0)'],
    ['a sampling call', `const B = Math.random()`, '', 'Math.random()'],
    ['a sample below an operator', `const B = 'x' + Math.random()`, '', `'x' + Math.random()`],
    ['a zero-param module helper call', `const V = 'v'\nconst mk = () => ({ k: V })\nconst B = mk()`, '', `(() => ({ k: ('v') }))()`],
    ['an object reading a prop', '', `const B = { k: props.v }`, '{ k: _p.v }'],
    ['an object reading a signal', '', `const B = { k: n() }`, '{ k: (1) }'],
  ])('%s is evaluated once and every read sees the binding', (_label, pre, body, value) => {
    const template = templateOf(host(pre, body, '<p data-a={String(B === B)}>{String(B === B)}</p>'))
    expect(template).toContain('((__bf_const_B) => `')
    expect(template).toContain(`)((${value}))`)
    expect(occurrences(template, value)).toBe(1)
    expect(template).toContain('String((__bf_const_B) === (__bf_const_B))')
  })

  test('a repeatable function literal call keeps its lowered body, bound once', () => {
    const template = templateOf(host(`const B = (() => ({ k: 'v' }))()`, '', '<p>{String(B === B)}{B.k}</p>'))
    expect(occurrences(template, `{ k: 'v' }`)).toBe(1)
    expect(template).toContain('(__bf_const_B).k')
  })

  test('a read inside a loop row reads the binding the template evaluation made', () => {
    const template = templateOf(host(`const B = { k: 'v' }`, '', '<ul>{[1, 2].map(i => <li key={i}>{String(B === B)}{B.k}</li>)}</ul>'))
    expect(occurrences(template, `{ k: 'v' }`)).toBe(1)
    expect(template).toContain('.map((i) => `')
    expect(template).toContain('String((__bf_const_B) === (__bf_const_B))')
  })

  test('a loop row binding of the same name is the row value, not the const', () => {
    const template = templateOf(host(`const B = { k: 'v' }`, '', `<ul>{[{ k: 'a' }].map(B => <li key={B.k}>{B.k}</li>)}{B.k}</ul>`))
    expect(template).toContain('escapeText(B.k)')
    expect(template).toContain('(__bf_const_B).k')
  })

  test('a const read once is bound as well, with the value a splice gives', () => {
    const template = templateOf(host(`const B = { k: 'v' }`, '', '<p>{B.k}</p>'))
    expect(template).toContain('escapeTextOrMarkup((__bf_const_B).k)')
    expect(template).toContain(`)(({ k: 'v' }))}\``)
  })

  test.each([
    ['a module string literal', `const B = 'v'`, ''],
    ['an operator over a prop', '', `const B = (props.v ?? '') + '-x'`],
  ])('%s is still spliced, with no binding', (_label, pre, body) => {
    const template = templateOf(host(pre, body, '<p>{B}{B}</p>'))
    expect(template).not.toContain('__bf_const_')
  })

  test('a const the template does not read is not bound', () => {
    const template = templateOf(host(`const B = { k: 'v' }`, '', '<p>x</p>'))
    expect(template).not.toContain('__bf_const_')
  })

  /** Evaluate a template lambda with `Math.random` returning 0.1, 0.2, ... */
  function renderSampled(template: string): string {
    const lambda = template.match(/template: (\(_p\) => `.*`) \}\)/)?.[1]
    expect(lambda).toBeDefined()
    let n = 0
    const math = { ...Math, random: () => ++n / 10 }
    const helpers = ['escapeAttr', 'escapeText', 'escapeTextOrMarkup']
    return new Function('Math', ...helpers, `return ${lambda}`)(math, String, String, String)({})
  }

  test.each([
    ['a sampling call', 'const B = Math.random()'],
    ['a sample below an operator', `const B = 'x' + Math.random()`],
    ['an object holding a sample', 'const B = { k: Math.random() }'],
  ])('%s reads one sample at every read of one template evaluation', (_label, decl) => {
    const read = decl.includes('{ k') ? 'B.k' : 'B'
    const template = templateOf(host(decl, '', `<p title={String(${read})}>{String(${read})}</p>`))
    const html = renderSampled(template)
    expect(occurrences(html, '0.1')).toBe(2)
    expect(html).not.toContain('0.2')
  })

  /** Evaluate a template lambda with no runtime helper beyond string escaping. */
  function renderPlain(template: string): string {
    const lambda = template.match(/template: (\(_p\) => `.*`) \}\)/)?.[1]
    expect(lambda).toBeDefined()
    const helpers = ['escapeAttr', 'escapeText', 'escapeTextOrMarkup']
    return new Function(...helpers, `return ${lambda}`)(String, String, String)({})
  }

  test.each([
    ['a map callback', `[1, 2].map(__bf_const_B => B.k + __bf_const_B).join(',')`, '43,44'],
    ['a filter callback', `[1, 2, 3].filter(__bf_const_B => __bf_const_B > 1).map(x => B.k + x).join(',')`, '44,45'],
    ['a reduce callback', `[1, 2].reduce((acc, __bf_const_B) => acc + B.k + __bf_const_B, 0)`, '87'],
    ['a nested callback', `[1].map(a => [2].map(__bf_const_B => B.k + a + __bf_const_B).join('')).join('')`, '45'],
    ['a destructured parameter', `[{ v: 1 }].map(({ v: __bf_const_B }) => B.k + __bf_const_B).join('')`, '43'],
    ['a parameter default', `[undefined].map((__bf_const_B = 5) => B.k + __bf_const_B).join('')`, '47'],
    ['a parameter suffixed like a second choice', `[1].map((__bf_const_B, __bf_const_B_1) => B.k + __bf_const_B).join('')`, '43'],
  ])('a source binding spelled like the generated parameter in %s is not captured', (_label, expr, expected) => {
    const template = templateOf(host(`const B = { k: 42 }`, '', `<p>{${expr}}</p>`))
    expect(renderPlain(template)).toContain(`>${expected}<`)
  })

  test('a const that reads another fresh const is still spliced, so the two keep main\'s values', () => {
    // Its substituted value is chain-closed (`{ a: Math.random() }`), so
    // binding it would sample `A` a second time while looking bound; it is
    // left to the splice (the `module-const-alias-identity` limitation).
    const template = templateOf(host(`const A = Math.random()\nconst B = { a: A }`, '', '<p>{String(A)}{String(B.a)}</p>'))
    expect(template).toContain('__bf_const_A')
    expect(template).not.toContain('__bf_const_B')
  })

  test.each([
    ['through an alias', `const A = { k: 'v' }\nconst X = A\nconst B = { x: X }`],
    ['through a helper that reads it', `const A = { k: 'v' }\nconst mk = () => ({ a: A })\nconst B = mk()`],
    ['through a chain', `const A = { k: 'v' }\nconst C = { a: A }\nconst B = { c: C }`],
  ])('a const reading a fresh const %s is not bound', (_label, pre) => {
    const template = templateOf(host(pre, '', '<p>{String(B === B)}</p>'))
    expect(template).not.toContain('__bf_const_B')
  })

  test('a const reading a primitive const is bound', () => {
    const template = templateOf(host(`const A = 'v'\nconst B = { a: A }`, '', '<p>{String(B === B)}{B.a}</p>'))
    expect(template).toContain('__bf_const_B')
    expect(renderPlain(template)).toContain('true')
  })
})
