/**
 * The attribute emission plan shared by the DSL adapters (#3478): which kind
 * `planAttrExpression` picks for an `{expr}` attribute value, and what
 * `planSpreadAttr` makes of a `{...spread}`.
 */

import { describe, test, expect } from 'bun:test'
import { planAttrExpression, planSpreadAttr, type AttrPlanContext, type SpreadPlanContext } from '../adapters/attr-plan'
import { parseExpression } from '../expression-parser'
import type { ExpressionAttr, SpreadAttr } from '../types'

const expression = (expr: string, extra: Partial<ExpressionAttr> = {}): ExpressionAttr => ({
  kind: 'expression',
  expr,
  parsed: parseExpression(expr),
  ...extra,
})

function context(overrides: Partial<AttrPlanContext> = {}): AttrPlanContext {
  return {
    propsObjectName: 'props',
    restPropsName: 'rest',
    nullableOptionalProps: new Set(['id', 'tag']),
    nullableSignalGetters: new Set(['title']),
    nullishAttrCtx: { nullableSignals: new Set(['title']), memos: new Map() },
    isLoopBound: () => false,
    boolStr: (expr) => expr === 'open',
    ...overrides,
  }
}

const plan = (value: ExpressionAttr, name = 'data-x', ctx = context()) => planAttrExpression(value, name, ctx)

describe('planAttrExpression', () => {
  test('a bare read of a nullable optional prop or signal is guarded', () => {
    expect(plan(expression('id'))).toEqual({ kind: 'omit-nullable', boolStr: false, restKey: false })
    expect(plan(expression('props.id'))).toEqual({ kind: 'omit-nullable', boolStr: false, restKey: false })
    expect(plan(expression('rest.tag'))).toEqual({ kind: 'omit-nullable', boolStr: false, restKey: true })
    expect(plan(expression('title()'))).toEqual({ kind: 'omit-nullable', boolStr: false, restKey: false })
  })

  test('a loop binding that shadows the name is the row, not the prop (#2488)', () => {
    expect(plan(expression('id'), 'data-x', context({ isLoopBound: (n) => n === 'id' }))).toEqual({ kind: 'plain', boolStr: false })
  })

  test('a boolean attribute is present when truthy, even over a nullable prop', () => {
    expect(plan(expression('id'), 'disabled')).toEqual({ kind: 'boolean-attr' })
  })

  test('`expr || undefined` binds the value once and renders it when truthy', () => {
    expect(plan(expression('open', { presenceOrUndefined: true }))).toEqual({ kind: 'presence', boolStr: true })
    expect(plan(expression('id', { presenceOrUndefined: true }))).toEqual({ kind: 'presence', boolStr: false })
  })

  test('`cond ? value : undefined` carries the parsed branches', () => {
    expect(plan(expression(`active ? 'page' : undefined`))).toMatchObject({
      kind: 'undefined-alternate',
      ternary: { condition: 'active', testParsed: { kind: 'identifier', name: 'active' }, consequentParsed: { kind: 'literal' } },
    })
    expect(plan(expression(`active ? 'page' : null`))).toMatchObject({ kind: 'undefined-alternate' })
    expect(plan(expression(`active ? 'page' : 'none'`))).toMatchObject({ kind: 'plain' })
  })

  test('a value that may reach nil through a signal is bound and tested', () => {
    expect(plan(expression(`title() ?? undefined`))).toMatchObject({ kind: 'omit-nil' })
  })

  test('anything else renders, through bool_str when the adapter says so', () => {
    expect(plan(expression('open'))).toEqual({ kind: 'plain', boolStr: true })
    expect(plan(expression('count()'))).toEqual({ kind: 'plain', boolStr: false })
  })
})

describe('planSpreadAttr', () => {
  const spread = (expr: string): SpreadAttr => ({ kind: 'spread', expr, parsed: parseExpression(expr) }) as SpreadAttr
  const ctx = (overrides: Partial<SpreadPlanContext> = {}): SpreadPlanContext => ({
    propsObjectName: 'props',
    propsParams: [{ name: 'id' }, { name: 'tone' }],
    localConstants: [
      { name: 'sizeAttrs', value: `size ? { 'data-size': size } : {}` },
      { name: 'alias', value: 'other' },
      { name: 'moduleAttrs', value: `on ? { a: 1 } : {}`, isModule: true },
    ] as SpreadPlanContext['localConstants'],
    isBound: () => false,
    ...overrides,
  })

  test('{...props} enumerates the props params', () => {
    expect(planSpreadAttr(spread(' props '), ctx())).toEqual({ kind: 'props-object', params: ['id', 'tone'] })
  })

  test('a function-scope const adds its initializer as a second candidate', () => {
    const plan = planSpreadAttr(spread('sizeAttrs'), ctx())
    expect(plan.kind === 'value' && plan.candidates.map((c) => c?.kind)).toEqual(['identifier', 'conditional'])
  })

  test('no second candidate for a bare-name initializer, a module const, or a shadowed name (#2489)', () => {
    for (const [name, c] of [
      ['alias', ctx()],
      ['moduleAttrs', ctx()],
      ['sizeAttrs', ctx({ isBound: (n) => n === 'sizeAttrs' })],
      ['attrs()', ctx()],
    ] as const) {
      const plan = planSpreadAttr(spread(name), c)
      expect({ name, candidates: plan.kind === 'value' ? plan.candidates.length : -1 }).toEqual({ name, candidates: 1 })
    }
  })
})
