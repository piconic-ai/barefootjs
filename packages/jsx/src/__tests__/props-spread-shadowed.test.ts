/**
 * `{...props}` where a binding named like the component's props object is in
 * scope (#3727). Phase 1 marks the spread (`SpreadAttr.shadowsPropsObject`)
 * and `spreadsPropsObject` is the one answer every adapter reads, so a row
 * named `props` spreads the row and every other `{...props}` still spreads
 * the component's props. The rendered output is pinned by the
 * `loop-param-named-props-spread-*` conformance fixtures.
 */

import { describe, test, expect } from 'bun:test'
import { compileJSX } from '../compiler'
import { TestAdapter } from '../adapters/test-adapter'
import { planComponentProps } from '../adapters/component-props'
import { planSpreadAttr, spreadsPropsObject } from '../adapters/attr-plan'
import type { ComponentIR, IRNode, SpreadAttr } from '../types'

function irOf(source: string): ComponentIR {
  const file = compileJSX(source, 'Component.tsx', { adapter: new TestAdapter(), outputIR: true }).files.find(f => f.type === 'ir')
  if (!file) throw new Error('no IR')
  return JSON.parse(file.content) as ComponentIR
}

/** Every spread value in `node`'s tree, on elements and on component calls. */
function spreads(node: IRNode): SpreadAttr[] {
  const out: SpreadAttr[] = []
  const visit = (n: unknown): void => {
    if (Array.isArray(n)) return n.forEach(visit)
    if (n === null || typeof n !== 'object') return
    const rec = n as { kind?: string }
    if (rec.kind === 'spread') out.push(n as SpreadAttr)
    for (const v of Object.values(n)) visit(v)
  }
  visit(node)
  return out
}

const propsObjectName = 'props'

describe('the Phase 1 mark on a spread of a binding named like the props object', () => {
  test.each([
    ['a loop row', `rows.map((props) => <li key={props.id}><span {...props} /></li>)`],
    ['a destructured row field', `rows.map(({ props }) => <li key={props.id}><span {...props} /></li>)`],
    ['a row-local const', `rows.map((r) => { const props = r; return <li key={r.id}><span {...props} /></li> })`],
    ['an inner loop row', `rows.map((r) => <li key={r.id}>{[r].map((props) => <i key={props.id} {...props} />)}</li>)`],
    ['a parenthesized spread', `rows.map((props) => <li key={props.id}><span {...(props)} /></li>)`],
  ])('%s is marked and is not the props object', (_name, body) => {
    const ir = irOf(`
type Row = { id: string; props?: { id: string } }
export function C(props: { rows: Row[]; id: string }) {
  const rows = props.rows
  return <ul>{${body}}</ul>
}
`)
    const found = spreads(ir.root)
    expect(found).toHaveLength(1)
    expect(found[0]!.shadowsPropsObject).toBe(true)
    expect(found[0]!.callerBag).toBeUndefined()
    expect(spreadsPropsObject(found[0]!, propsObjectName)).toBe(false)
  })

  test('a custom props name is shadowed by a row of that name, not by one named props', () => {
    const ir = irOf(`
export function C(p: { rows: { id: string }[] }) {
  return <ul>{p.rows.map((p) => <li key={p.id}><span {...p} /></li>)}{p.rows.map((props) => <li key={props.id}><span {...props} /></li>)}</ul>
}
`)
    const [shadowed, other] = spreads(ir.root)
    expect(shadowed!.shadowsPropsObject).toBe(true)
    expect(spreadsPropsObject(shadowed!, 'p')).toBe(false)
    expect(other!.shadowsPropsObject).toBeUndefined()
    expect(spreadsPropsObject(other!, 'p')).toBe(false)
  })

  test.each([
    ['at the top level', `<div {...props} />`],
    ['in a row not named props', `props.rows.map((row) => <li key={row.id} {...props} />)`],
    ['in a row beside an outer spread', `<div {...props}>{props.rows.map((r) => <i key={r.id} />)}</div>`],
  ])('%s is the props object', (_name, body) => {
    const ir = irOf(`
export function C(props: { rows: { id: string }[]; id: string }) {
  return <section>{${body}}</section>
}
`)
    const found = spreads(ir.root)
    expect(found.length).toBeGreaterThan(0)
    for (const value of found) {
      expect(value.shadowsPropsObject).toBeUndefined()
      expect(spreadsPropsObject(value, propsObjectName)).toBe(true)
    }
  })
})

describe('the planners on a marked spread', () => {
  const shadowed = { kind: 'spread', expr: 'props', shadowsPropsObject: true } as SpreadAttr
  const plain = { kind: 'spread', expr: 'props' } as SpreadAttr

  test('an element spread of a shadowing binding spreads its own value', () => {
    const ctx = { propsObjectName, propsParams: [{ name: 'id' }], localConstants: [], isBound: () => true }
    expect(planSpreadAttr(shadowed, ctx).kind).toBe('value')
    expect(planSpreadAttr(plain, { ...ctx, isBound: () => false }).kind).toBe('props-object')
  })

  test('a child spread of a shadowing binding is a spread segment, not the props params', () => {
    const comp = (value: SpreadAttr) => ({
      props: [{ name: '', value, loc: {} }],
      children: [],
      slotId: null,
    }) as unknown as Parameters<typeof planComponentProps>[0]
    const options = { propsObjectName, propsParams: [{ name: 'id' }] }
    expect(planComponentProps(comp(shadowed), options).map(s => s.kind)).toEqual(['entries', 'spread'])
    expect(planComponentProps(comp(plain), options).some(s => s.kind === 'spread')).toBe(false)
  })
})
