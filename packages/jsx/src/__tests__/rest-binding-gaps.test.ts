/**
 * Rest-binding and body-destructure shapes that used to compile without a
 * diagnostic and render wrong (#3851, #3854). Each is either decided in
 * Phase 1 so every backend renders it as JS does, or refused with a
 * diagnostic. The rendered output is pinned by the conformance fixtures
 * (`rest-spread-explicit-before-closed-rest`,
 * `rest-binding-shadowed-by-loop-row`, `body-rest-member-read`, and the
 * refused `body-destructure-*` / `body-rest-taken-key-read`); these tests
 * pin the Phase 1 decisions and the refusals of the shapes no fixture
 * renders.
 */

import { describe, test, expect } from 'bun:test'
import { compileJSX } from '../compiler'
import { TestAdapter } from '../adapters/test-adapter'
import type { ComponentIR, IRNode } from '../types'

function compile(source: string) {
  return compileJSX(source, 'Component.tsx', { adapter: new TestAdapter(), outputIR: true })
}

function codes(source: string): string[] {
  return compile(source).errors.filter(e => e.severity === 'error').map(e => e.code)
}

function irOf(source: string): ComponentIR {
  const file = compile(source).files.find(f => f.type === 'ir')
  if (!file) throw new Error('no IR')
  return JSON.parse(file.content) as ComponentIR
}

/** Every element of `node`'s tree with tag `tag`. */
function elements(node: IRNode, tag: string): Array<Extract<IRNode, { type: 'element' }>> {
  const out: Array<Extract<IRNode, { type: 'element' }>> = []
  const visit = (n: unknown): void => {
    if (Array.isArray(n)) return n.forEach(visit)
    if (n === null || typeof n !== 'object') return
    const rec = n as { type?: string; tag?: string }
    if (rec.type === 'element' && rec.tag === tag) out.push(n as Extract<IRNode, { type: 'element' }>)
    for (const v of Object.values(n)) visit(v)
  }
  visit(node)
  return out
}

function attrExpr(el: Extract<IRNode, { type: 'element' }>, name: string): string[] {
  return el.attrs.filter(a => a.name === name).map(a => (a.value.kind === 'expression' ? a.value.expr : a.value.kind))
}

describe('an attribute before a closed rest spread (#3851)', () => {
  test('the spread key falls back to the earlier value, which is dropped', () => {
    const ir = irOf(`
export function P({ label, ...rest }: { label: string; title?: string }) {
  return <p title="fixed" {...rest}>{label}</p>
}
`)
    const [p] = elements(ir.root, 'p')
    expect(attrExpr(p, 'title')).toEqual(['rest.title ?? ("fixed")'])
  })

  test('a later attribute still wins over the spread, with no fallback', () => {
    const ir = irOf(`
export function P({ label, ...rest }: { label: string; title?: string }) {
  return <p {...rest} title="fixed">{label}</p>
}
`)
    const [p] = elements(ir.root, 'p')
    expect(attrExpr(p, 'title')).toEqual(['rest.title', 'literal'])
  })

  test('a member read before the spread is a fallback', () => {
    expect(codes(`
export function P({ label, row, ...rest }: { label: string; row: { t: string }; title?: string }) {
  return <p title={row.t} {...rest}>{label}</p>
}
`)).toEqual([])
  })

  test('a value that may have an effect is refused (BF021)', () => {
    expect(codes(`
function mark(): string { return 'm' }
export function P({ label, ...rest }: { label: string; title?: string }) {
  return <p title={mark()} {...rest}>{label}</p>
}
`)).toEqual(['BF021'])
  })

  test('a JSX element value is refused (BF021)', () => {
    expect(codes(`
import { Card } from './card'
export function P({ ...rest }: { header?: unknown }) {
  return <Card header={<b>h</b>} {...rest} />
}
`)).toEqual(['BF021'])
  })
})

describe('a loop row named like the rest binding (#3851)', () => {
  test('a spread of the row stays a spread of the row', () => {
    const ir = irOf(`
export function P({ rows, ...rest }: { rows: { id: string }[]; tone?: string }) {
  return <ul data-tone={rest.tone}>{rows.map(rest => <li key={rest.id} {...rest}>{rest.id}</li>)}</ul>
}
`)
    const [li] = elements(ir.root, 'li')
    const spread = li.attrs.find(a => a.name === '...')
    expect(spread?.value.kind).toBe('spread')
    expect(spread?.value.kind === 'spread' && spread.value.callerBag).toBeFalsy()
    expect(li.attrs.some(a => a.name === 'tone')).toBe(false)
  })
})

describe('a member read of a props-object body rest (#3854)', () => {
  test('reads the props object', () => {
    const ir = irOf(`
export function C(props: { label: string; id?: string }) {
  const { label, ...rest } = props
  return <i data-x={rest.id}>{label}</i>
}
`)
    const [i] = elements(ir.root, 'i')
    expect(attrExpr(i, 'data-x')).toEqual(['props.id'])
  })

  test('a row shadowing the rest keeps its own read', () => {
    const ir = irOf(`
export function C(props: { label: string; id?: string; rows: { id: string }[] }) {
  const { label, ...rest } = props
  return <ul>{props.rows.map(rest => <li key={rest.id} data-x={rest.id}>{label}</li>)}</ul>
}
`)
    const [li] = elements(ir.root, 'li')
    expect(attrExpr(li, 'data-x')).toEqual(['rest.id'])
  })

  test('a key the props type does not declare stays a read of the rest', () => {
    const ir = irOf(`
export function C(props: { label: string; [key: string]: unknown }) {
  const { label, ...rest } = props
  return <i data-x={rest.other}>{label}</i>
}
`)
    const [i] = elements(ir.root, 'i')
    expect(attrExpr(i, 'data-x')).toEqual(['rest.other'])
  })

  test('a read of a taken key is refused (BF101)', () => {
    expect(codes(`
export function C(props: { label: string; id?: string }) {
  const { label, ...rest } = props
  return <i>{label}{rest.label}</i>
}
`)).toEqual(['BF101'])
  })
})

describe('a component-body destructure with no const form (#3854)', () => {
  const wrap = (stmt: string, use: string) => `
const conf = { a: 'A', b: 'B' }
function getConf() { return conf }
export function C(props: { b: string; nested: { a: string } }) {
  ${stmt}
  return <i>{${use}}</i>
}
`

  test.each([
    ['a rest element', 'const { a, ...more } = conf', 'more.b'],
    ['a non-literal default', 'const { a = props.b } = conf', 'a'],
    ['a call source', 'const { a } = getConf()', 'a'],
    ['a member source', 'const { a } = props.nested', 'a'],
    ['a let destructure', 'let { a } = conf', 'a'],
  ])('%s is refused (BF101)', (_name, stmt, use) => {
    expect(codes(wrap(stmt, use))).toEqual(['BF101'])
  })

  test('a const destructure of a const object still compiles', () => {
    expect(codes(wrap(`const { a, b: bee = 'x' } = conf`, 'a + bee'))).toEqual([])
  })
})
