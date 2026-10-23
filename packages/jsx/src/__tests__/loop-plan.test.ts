/**
 * The loop decisions shared by the DSL adapters (#3473): what `planLoop`
 * decides about a `.map()` loop against the scope outside it.
 */

import { describe, test, expect } from 'bun:test'
import { analyzeComponent } from '../analyzer'
import { jsxToIR } from '../jsx-to-ir'
import { planLoop, spellDestructureLocals, type LoopPlanContext } from '../adapters/loop-plan'
import { BindingScope } from '../scope/binding-scope'
import type { IRLoop, IRNode } from '../types'

function firstLoop(node: IRNode | null): IRLoop {
  const visit = (n: IRNode): IRLoop | null => {
    if (n.type === 'loop') return n
    for (const child of ('children' in n ? (n.children as IRNode[]) : []) ?? []) {
      const found = visit(child)
      if (found) return found
    }
    return null
  }
  const loop = node ? visit(node) : null
  if (!loop) throw new Error('no loop in the component')
  return loop
}

function plan(source: string, overrides: Partial<LoopPlanContext<unknown[]>> = {}) {
  const ctx = analyzeComponent(source, 'Test.tsx')
  const loop = firstLoop(jsxToIR(ctx))
  const literals = new Set(['LIMITS'])
  return planLoop(loop, {
    scope: BindingScope.EMPTY,
    localConstants: ctx.localConstants,
    resolveLiteralConst: (name) => (literals.has(name) ? name : null),
    callbackLowering: { adapterName: 'Test' },
    spellStatic: (items) => items,
    ...overrides,
  })
}

describe('planLoop', () => {
  test('a plain loop: no destructure, no static source, no sort, no captures', () => {
    expect(plan(`export function Test(props: { items: string[] }) { return <ul>{props.items.map(x => <li key={x}>{x}</li>)}</ul> }`)).toEqual({
      destructure: 'none',
      staticSource: null,
      unresolvableConst: null,
      sort: null,
      captureAliases: [],
      itemVar: 'x',
      indexLocal: null,
      destructureLocals: [],
    })
  })

  test('an inline literal source is spelled statically', () => {
    expect(plan(`export function Test() { return <ul>{['a', 'b'].map(x => <li key={x}>{x}</li>)}</ul> }`).staticSource).toEqual(['a', 'b'])
  })

  test('a static const source the backend cannot spell is BF101 instead', () => {
    const source = `export function Test() {
      const items = [{ id: 1, on: true }]
      return <ul>{items.map(x => <li key={x.id}>{String(x.on)}</li>)}</ul>
    }`
    expect(plan(source)).toMatchObject({ staticSource: [{ id: 1, on: true }], unresolvableConst: null })
    const perl = plan(source, { spellStatic: (items) => (JSON.stringify(items).includes('true') ? null : items) })
    expect(perl.staticSource).toBeNull()
    expect(perl.unresolvableConst?.name).toBe('items')
  })

  test('a computed const source no template binds is BF101, unless a loop binding shadows it', () => {
    const source = `export function Test(props: { labels: Record<string, string> }) {
      const entries = Object.keys(props.labels)
      return <ul>{entries.map(x => <li key={x}>{x}</li>)}</ul>
    }`
    expect(plan(source).unresolvableConst?.name).toBe('entries')
    const shadowed = BindingScope.EMPTY.enterLoopRow({ param: 'entries' } as IRLoop)
    expect(plan(source, { scope: shadowed }).unresolvableConst).toBeNull()
  })

  test('a parenthesized computed const source is the same const (#3473)', () => {
    const source = `export function Test(props: { labels: Record<string, string> }) {
      const entries = Object.keys(props.labels)
      return <ul>{(entries).map(x => <li key={x}>{x}</li>)}</ul>
    }`
    expect(plan(source).unresolvableConst?.name).toBe('entries')
  })

  test('a lowerable destructure, and one no template binds', () => {
    expect(plan(`export function Test(props: { rows: { a: string }[] }) { return <ul>{props.rows.map(({ a }) => <li key={a}>{a}</li>)}</ul> }`).destructure).toBe('lowerable')
    expect(
      plan(`export function Test(props: { rows: { a: string; b: string }[] }) { return <ul>{props.rows.map(({ a, ...rest }) => <li key={a}>{String(rest)}</li>)}</ul> }`).destructure,
    ).toBe('unlowerable')
  })

  test('a sort comparator takes the shared callback lowering', () => {
    const sorted = plan(`export function Test(props: { items: { n: number }[] }) { return <ul>{props.items.toSorted((a, b) => a.n - b.n).map(x => <li key={x.n}>{x.n}</li>)}</ul> }`)
    expect(sorted.sort).toMatchObject({ kind: 'eval', helper: 'sort_eval' })
  })

  test('a filter capture a row binding would shadow gets a per-loop alias', () => {
    const captured = plan(`export function Test(props: { items: { id: string }[]; id: string }) {
      const id = props.id
      return <ul>{props.items.filter(x => x.id !== id).map(id => <li key={id.id}>{id.id}</li>)}</ul>
    }`)
    expect(captured.captureAliases).toEqual([{ name: 'id', alias: expect.stringMatching(/^__bf_cap_\w+_id$/) }])
  })

  test('the row binds its index through a local, except in an object iteration', () => {
    expect(plan(`export function Test(props: { items: string[] }) { return <ul>{props.items.map((x, i) => <li key={x}>{i}</li>)}</ul> }`)).toMatchObject({
      itemVar: 'x',
      indexLocal: 'i',
    })
    expect(plan(`export function Test(props: { items: string[] }) { return <ul>{props.items.keys().map(k => <li key={k}>{k}</li>)}</ul> }`)).toMatchObject({
      itemVar: '__bf_item',
      indexLocal: 'k',
    })
    expect(plan(`export function Test(props: { m: Record<string, string> }) { return <ul>{Object.entries(props.m).map(([k, v]) => <li key={k}>{v}</li>)}</ul> }`)).toMatchObject({
      indexLocal: null,
      destructureLocals: [],
    })
  })

  test('a lowered destructure binds one local per binding off the item', () => {
    const lowered = plan(`export function Test(props: { rows: { id: string; user: { name: string }; tags: string[]; on: boolean }[] }) {
      return <ul>{props.rows.map(({ id, user: { name }, ...rest }) => <li key={id} data-on={rest.on}>{name}</li>)}</ul>
    }`)
    expect(lowered.itemVar).toBe('__bf_item')
    expect(lowered.destructureLocals).toEqual([
      { name: 'id', value: { kind: 'path', segments: [{ kind: 'field', key: 'id', isIdent: true }] } },
      { name: 'name', value: { kind: 'path', segments: [{ kind: 'field', key: 'user', isIdent: true }, { kind: 'field', key: 'name', isIdent: true }] } },
      { name: 'rest', value: { kind: 'omit', segments: [], exclude: ['id', 'user'] } },
    ])
    const tuple = plan(`export function Test(props: { rows: string[][] }) { return <ul>{props.rows.map(([head, ...tail]) => <li key={head}>{tail.length}</li>)}</ul> }`)
    expect(tuple.destructureLocals).toEqual([
      { name: 'head', value: { kind: 'path', segments: [{ kind: 'index', index: 0 }] } },
      { name: 'tail', value: { kind: 'slice', segments: [], from: 1 } },
    ])
    const spelled = spellDestructureLocals(tuple, 'it', {
      accessor: (item, segments) => item + segments.map((s) => (s.kind === 'index' ? `[${s.index}]` : `.${s.key}`)).join(''),
      slice: (parent, from) => `slice(${parent}, ${from})`,
      omit: (parent, keys) => `omit(${parent}, ${keys.join('|')})`,
    })
    expect(spelled).toEqual([
      { name: 'head', value: 'it[0]' },
      { name: 'tail', value: 'slice(it, 1)' },
    ])
  })

  test('an unlowerable destructure binds no locals', () => {
    const refused = plan(`export function Test(props: { rows: { a: string; b: string }[] }) { return <ul>{props.rows.map(({ a, ...rest }) => <li key={a}>{String(rest)}</li>)}</ul> }`)
    expect(refused).toMatchObject({ destructure: 'unlowerable', destructureLocals: [] })
  })
})
