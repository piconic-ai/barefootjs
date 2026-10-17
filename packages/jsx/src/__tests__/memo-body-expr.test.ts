/**
 * #3510: a memo's value expression is read from the callback node
 * (`MemoInfo.bodyExpr`), not by matching `() =>` in `computation`.
 * Consumers substitute it for `memo()`, so every callback shape must yield
 * an expression that evaluates to the memo's value — never the uncalled
 * function.
 */

import { describe, test, expect } from 'bun:test'
import { analyzeComponent } from '../analyzer'
import { compileJSX } from '../compiler'
import { TestAdapter } from '../adapters/test-adapter'

function memoOf(callback: string, props = '') {
  const source = `
    'use client'
    import { createSignal, createMemo } from '@barefootjs/client'
    export function C(${props}) {
      const [count] = createSignal(2)
      const m = createMemo(${callback})
      return <p>{m()}</p>
    }
  `
  const memo = analyzeComponent(source, 'C.tsx').memos.find((x) => x.name === 'm')
  if (!memo) throw new Error('memo not collected')
  return memo
}

describe('MemoInfo.bodyExpr (#3510)', () => {
  test.each([
    ['() => count() * 2', 'count() * 2'],
    ['(): number => count() * 2', 'count() * 2'],
    ['() => { return count() * 2 }', 'count() * 2'],
    ['function () { return count() * 2 }', 'count() * 2'],
    ['(() => count() * 2)', 'count() * 2'],
    ['(function () { return count() * 2 })', 'count() * 2'],
  ])('%s yields its returned expression', (callback, expected) => {
    expect(memoOf(callback).bodyExpr).toBe(expected)
  })

  test('a multi-statement body yields a call of the whole callback', () => {
    expect(memoOf('() => { const k = count(); return k * 3 }').bodyExpr)
      .toBe('(() => { const k = count(); return k * 3 })()')
    expect(memoOf('function () { const k = count(); return k * 3 }').bodyExpr)
      .toBe('(function () { const k = count(); return k * 3 })()')
  })

  test('a callback that is not a plain zero-parameter function is called as written', () => {
    expect(memoOf('async () => count()').bodyExpr).toBe('(async () => count())()')
    expect(memoOf('count').bodyExpr).toBe('(count)()')
  })

  test('templateBodyExpr rewrites a destructured prop read in the body', () => {
    const memo = memoOf('function () { return count() + base }', '{ base }: { base: number }')
    expect(memo.bodyExpr).toBe('count() + base')
    expect(memo.templateBodyExpr).toBe('count() + _p.base')
  })

  test('a function expression carries the same structured parse as a block arrow', () => {
    const fn = memoOf('function () { return count() * 2 }')
    const arrow = memoOf('() => { return count() * 2 }')
    expect(fn.parsedBlock).toEqual(arrow.parsedBlock)
    expect(fn.parsedBlockComplete).toBe(true)
  })

  test('a function expression that needs its own scope is called as a whole', () => {
    for (const callback of [
      'function base() { return typeof base }',
      'function () { return arguments.length }',
      'function () { return this }',
      'function () { return Object.keys({ [arguments.length]() {} })[0] }',
      'function () { return class extends (this ? Object : Object) {} }',
    ]) {
      const memo = memoOf(callback, '{ base }: { base: number }')
      expect(memo.bodyExprIsCall).toBe(true)
      expect(memo.bodyExpr).toBe(`(${callback})()`)
      expect(memo.parsedBlock).toBeUndefined()
    }
  })

  test('the CSR template evaluates a scope-bound callback to its own value', () => {
    const source = `
      'use client'
      import { createMemo } from '@barefootjs/client'
      export function C({ base }: { base: number }) {
        const named = createMemo(function base() { return typeof base })
        const args = createMemo(function () { return arguments.length })
        return <p>{named()}|{args()}</p>
      }
    `
    const result = compileJSX(source, 'C.tsx', { adapter: new TestAdapter() })
    const line = result.files.find((f) => f.type === 'clientJs')!.content.split('\n').find((l) => l.includes('hydrate('))!
    const lambda = line.match(/template: (\(_p\) => `.*`) \}\)$/)![1]
    const template = new Function('escapeTextOrMarkup', 'escapeText', 'escapeAttr', `return ${lambda}`)(String, String, String)
    const html = template({ base: 7 })
    expect(html).toContain('-->function<!--')
    expect(html).toContain('-->0<!--')
  })

  test('a callback whose nested function only binds its own scope is still extracted', () => {
    const memo = memoOf('function () { return [1].map(function () { return arguments.length })[0] }')
    expect(memo.bodyExprIsCall).toBeUndefined()
  })

  test('a computed method name reading the callback\'s arguments renders its own value', () => {
    const source = `
      'use client'
      import { createMemo } from '@barefootjs/client'
      export function C() {
        const key = createMemo(function () { return Object.keys({ [arguments.length]() {} })[0] })
        return <p>{key()}</p>
      }
    `
    const result = compileJSX(source, 'C.tsx', { adapter: new TestAdapter() })
    const line = result.files.find((f) => f.type === 'clientJs')!.content.split('\n').find((l) => l.includes('hydrate('))!
    const lambda = line.match(/template: (\(_p\) => `.*`) \}\)$/)![1]
    const template = new Function('escapeTextOrMarkup', 'escapeText', 'escapeAttr', `return ${lambda}`)(String, String, String)
    expect(template({})).toContain('-->0<!--')
  })
})
