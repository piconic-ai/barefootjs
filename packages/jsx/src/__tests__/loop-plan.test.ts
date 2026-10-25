/**
 * The loop decisions shared by the DSL adapters (#3473): what `planLoop`
 * decides about a `.map()` loop against the scope outside it.
 */

import { describe, test, expect } from 'bun:test'
import { analyzeComponent } from '../analyzer'
import { jsxToIR } from '../jsx-to-ir'
import { planLoop, spellDestructureLocals, spellFilteredRow, spellSortedSource, type LoopPlanContext, type LoopSortSpelling } from '../adapters/loop-plan'
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
      filter: null,
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

  test('a comparator outside the evaluator falls back to the structured descriptor', () => {
    const sorted = plan(`export function Test(props: { items: { name: string }[] }) { return <ul>{props.items.toSorted((a, b) => a.name.localeCompare(b.name)).map(x => <li key={x.name}>{x.name}</li>)}</ul> }`)
    expect(sorted.sort).toMatchObject({ kind: 'structured-sort', comparator: { keys: [{ key: { kind: 'field', field: 'name' }, type: 'string', direction: 'asc' }] } })
  })

  test('the sorted source spells each arm of the sort plan', () => {
    const refusals: string[] = []
    const spelling: LoopSortSpelling = {
      emit: (e) => (e.kind === 'identifier' ? `v.${e.name}` : '?'),
      eval: {
        call: (helper, operands) => `${helper}(${operands.join(', ')})`,
        string: (value) => `'${value}'`,
        boolean: (value) => String(value),
        env: (entries) => `{${entries.map(([name, value]) => `${name}: ${value}`).join(', ')}}`,
      },
      structured: (recv, comparator) => `sort(${recv}, ${comparator.keys.map((k) => (k.key.kind === 'field' ? k.key.field : 'self')).join(',')})`,
      refuse: (message) => refusals.push(message),
    }
    expect(spellSortedSource(null, 'xs', spelling)).toBe('xs')
    const evaluated = spellSortedSource({ kind: 'eval', helper: 'sort_eval', operands: [{ kind: 'string', value: 'body' }], captured: ['k'] }, 'xs', spelling)
    expect(evaluated).toBe(`sort_eval(xs, 'body', {k: v.k})`)
    const structured = plan(`export function Test(props: { items: { name: string }[] }) { return <ul>{props.items.toSorted((a, b) => a.name.localeCompare(b.name)).map(x => <li key={x.name}>{x.name}</li>)}</ul> }`)
    expect(spellSortedSource(structured.sort, 'xs', spelling)).toBe('sort(xs, name)')
    expect(spellSortedSource({ kind: 'refuse', message: 'no form', suggestion: '' }, 'xs', spelling)).toBe('xs')
    expect(refusals).toEqual(['no form'])
  })

  test('a filter capture a row binding would shadow gets a per-loop alias', () => {
    const captured = plan(`export function Test(props: { items: { id: string }[]; id: string }) {
      const id = props.id
      return <ul>{props.items.filter(x => x.id !== id).map(id => <li key={id.id}>{id.id}</li>)}</ul>
    }`)
    expect(captured.captureAliases).toEqual([{ name: 'id', alias: expect.stringMatching(/^__bf_cap_\w+_id$/) }])
  })

  test('a filter predicate is renamed for the row: captures to their aliases, the filter param to the loop param', () => {
    const filtered = plan(`export function Test(props: { items: { id: string; label: string }[]; id: string }) {
      const id = props.id
      return <ul>{props.items.filter(x => x.id !== id && x.label !== 'x').map(id => <li key={id.id}>{id.id}</li>)}</ul>
    }`)
    const alias = filtered.captureAliases[0]!.alias
    expect(filtered.filter).toMatchObject({ kind: 'predicate', param: 'x', aliases: new Map([[alias, 'id']]) })
    if (filtered.filter?.kind !== 'predicate') throw new Error('expected a predicate')
    const names = (e: unknown): string[] => {
      if (Array.isArray(e)) return e.flatMap(names)
      if (e === null || typeof e !== 'object') return []
      const node = e as Record<string, unknown>
      if (node.kind === 'identifier') return [node.name as string]
      return Object.values(node).flatMap(names)
    }
    expect(names(filtered.filter.predicate)).toEqual(['x', 'id', 'x'])
    expect(names(filtered.filter.captured)).toEqual(['x', alias, 'x'])
    expect(names(filtered.filter.onRow)).toEqual(['id', alias, 'id'])
  })

  test('a filter without a predicate is refused, and a loop without a filter plans none', () => {
    const loop = (filterPredicate: IRLoop['filterPredicate']): IRLoop => {
      const ctx = analyzeComponent(`export function Test(props: { items: string[] }) { return <ul>{props.items.map(x => <li key={x}>{x}</li>)}</ul> }`, 'Test.tsx')
      return { ...firstLoop(jsxToIR(ctx)), filterPredicate }
    }
    const ctx: LoopPlanContext<unknown[]> = {
      scope: BindingScope.EMPTY,
      localConstants: [],
      resolveLiteralConst: () => null,
      callbackLowering: { adapterName: 'Test' },
      spellStatic: (items) => items,
    }
    expect(planLoop(loop(undefined), ctx).filter).toBeNull()
    expect(planLoop(loop({ param: 'x', raw: 'x => { return x }' }), ctx).filter).toMatchObject({
      kind: 'refuse',
      message: expect.stringContaining('no Test loop-filter form'),
    })
  })

  test('a filtered row spells inside its guard, a refused one under the stand-in condition', () => {
    const refusals: string[] = []
    const spelling = {
      condition: (f: { param: string }) => `ok(${f.param})`,
      refuse: (message: string) => refusals.push(message),
      refused: 'true',
      open: (condition: string) => `if ${condition}`,
      close: 'end',
    }
    expect(spellFilteredRow(null, ['a', 'b'], spelling)).toEqual(['a', 'b'])
    expect(spellFilteredRow({ kind: 'refuse', message: 'no form', suggestion: '' }, ['a'], spelling)).toEqual(['if true', 'a', 'end'])
    expect(refusals).toEqual(['no form'])
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
