/**
 * Unit tests for resolveFreeRefs — the single classification entry point for
 * `OriginInfo.freeRefs` (issue #1248 + #1251). These tests pin down the
 * resolver in isolation; analyzer-integration coverage lives in
 * reactivity-classification/.
 */

import { describe, test, expect } from 'bun:test'
import ts from 'typescript'
import { resolveFreeRefs, type BindingEnvironment } from '../free-refs'
import type { SignalInfo, MemoInfo, ParamInfo, ConstantInfo, FunctionInfo, ImportInfo } from '../types'

const dummyLoc = { file: 'test.tsx', start: { line: 1, column: 0 }, end: { line: 1, column: 0 } }

function parseExpression(text: string): ts.Expression {
  const sf = ts.createSourceFile(
    'test.ts',
    `const __probe = (${text});`,
    ts.ScriptTarget.Latest,
    true
  )
  const stmt = sf.statements[0] as ts.VariableStatement
  const decl = stmt.declarationList.declarations[0]
  // Unwrap the parenthesized expression we added so consumers see the bare expr.
  const init = decl.initializer as ts.ParenthesizedExpression
  return init.expression
}

function emptyEnv(): BindingEnvironment {
  return {
    signals: [] as readonly SignalInfo[],
    memos: [] as readonly MemoInfo[],
    propsParams: [] as readonly ParamInfo[],
    propsObjectName: null,
    restPropsName: null,
    localConstants: [] as readonly ConstantInfo[],
    localFunctions: [] as readonly FunctionInfo[],
    imports: [] as readonly ImportInfo[],
    ambientGlobals: new Set<string>(),
    checker: null,
  }
}

function mkSignal(getter: string, setter: string | null = null): SignalInfo {
  return {
    getter,
    setter,
    initialValue: '0',
    type: { kind: 'unknown', raw: 'number' },
    loc: dummyLoc,
  } as SignalInfo
}

function mkMemo(name: string): MemoInfo {
  return {
    name,
    computation: '0',
    type: { kind: 'unknown', raw: 'number' },
    deps: [],
    loc: dummyLoc,
  } as MemoInfo
}

function mkProp(name: string): ParamInfo {
  return { name, type: { kind: 'unknown', raw: 'unknown' }, optional: false } as ParamInfo
}

function mkConst(name: string): ConstantInfo {
  return { name } as ConstantInfo
}

describe('resolveFreeRefs — kind resolution', () => {
  test('signal getter is classified as signal-getter', () => {
    const node = parseExpression('count()')
    const env = { ...emptyEnv(), signals: [mkSignal('count', 'setCount')] }
    const refs = resolveFreeRefs(node, env)
    const count = refs.find(r => r.name === 'count')
    expect(count?.kind).toBe('signal-getter')
  })

  test('memo reference is classified as memo-getter (whether called or bare)', () => {
    // Case 2 from #1248: bare memo reference must still classify as memo-getter
    const env = { ...emptyEnv(), memos: [mkMemo('doubled')] }
    const called = resolveFreeRefs(parseExpression('doubled()'), env)
    const bare = resolveFreeRefs(parseExpression('doubled'), env)
    expect(called.find(r => r.name === 'doubled')?.kind).toBe('memo-getter')
    expect(bare.find(r => r.name === 'doubled')?.kind).toBe('memo-getter')
  })

  test('destructured prop name is classified as prop, even when renamed', () => {
    // Case 3 from #1248: `({ value: renamed })` registers `renamed` in propsParams
    const env = { ...emptyEnv(), propsParams: [mkProp('renamed')] }
    const refs = resolveFreeRefs(parseExpression('renamed'), env)
    expect(refs.find(r => r.name === 'renamed')?.kind).toBe('prop')
  })

  test('props object reference is classified as prop', () => {
    const env = { ...emptyEnv(), propsObjectName: 'props' }
    const refs = resolveFreeRefs(parseExpression('props.label'), env)
    expect(refs.find(r => r.name === 'props')?.kind).toBe('prop')
  })

  test('local constant is classified as init-local', () => {
    const env = { ...emptyEnv(), localConstants: [mkConst('x')] }
    const refs = resolveFreeRefs(parseExpression('x'), env)
    expect(refs.find(r => r.name === 'x')?.kind).toBe('init-local')
  })

  test('loop param is classified as render-item (overrides outer init-local)', () => {
    const env = {
      ...emptyEnv(),
      localConstants: [mkConst('item')],
      loopValueBoundNames: new Set(['item']),
    }
    const refs = resolveFreeRefs(parseExpression('item'), env)
    expect(refs.find(r => r.name === 'item')?.kind).toBe('render-item')
  })

  test('unrecognised identifier without ambient global hit is classified as global', () => {
    const refs = resolveFreeRefs(parseExpression('unknownThing'), emptyEnv())
    expect(refs.find(r => r.name === 'unknownThing')?.kind).toBe('global')
  })

  test('identifier in ambientGlobals is excluded entirely', () => {
    const env = { ...emptyEnv(), ambientGlobals: new Set(['window']) }
    const refs = resolveFreeRefs(parseExpression('window.foo'), env)
    expect(refs.find(r => r.name === 'window')).toBeUndefined()
  })
})

describe('resolveFreeRefs — skip rules', () => {
  test('property name on member access is not a free ref', () => {
    const env = { ...emptyEnv(), propsObjectName: 'props' }
    const refs = resolveFreeRefs(parseExpression('props.label'), env)
    // `label` is a property name; only `props` should appear
    expect(refs.find(r => r.name === 'label')).toBeUndefined()
    expect(refs.find(r => r.name === 'props')).toBeDefined()
  })

  test('object literal key is not a free ref', () => {
    const refs = resolveFreeRefs(parseExpression('{ foo: 1 }'), emptyEnv())
    expect(refs.find(r => r.name === 'foo')).toBeUndefined()
  })
})

describe('resolveFreeRefs — dedup', () => {
  test('same name resolved to same kind appears once', () => {
    const env = { ...emptyEnv(), signals: [mkSignal('count', 'setCount')] }
    const refs = resolveFreeRefs(parseExpression('count() + count()'), env)
    const matches = refs.filter(r => r.name === 'count')
    expect(matches.length).toBe(1)
  })
})
