import { describe, expect, test } from 'bun:test'
import { compareToBaseline, measureSource, serializeBaseline } from '../emit-parse-ratchet'

const ADAPTER = 'packages/adapter-x/src/adapter/x-adapter.ts'
const EMITTER = 'packages/jsx/src/ir-to-client-js/x.ts'

describe('measureSource', () => {
  test('counts parser calls per qualified function, by the AST', () => {
    const counts = measureSource(
      ADAPTER,
      `
      // parseExpression(x) in a comment does not count
      const note = 'parseExpression(x)'
      export class XAdapter {
        lower(e: string) { return parseExpression(e) }
        cond(e: string) { const inner = () => parseLiteralExpression(e); return [parseExpression(e), inner()] }
      }
      function helper(e: string) { return ctx.parseExpression(e) }
      `,
    )
    expect(counts).toEqual({ 'XAdapter.lower': 1, 'XAdapter.cond': 1, 'XAdapter.cond/inner': 1, helper: 1 })
  })

  test('counts ts.createSourceFile in a template adapter, not in the client-JS emitter', () => {
    const src = 'function walk(code: string) { return ts.createSourceFile("a.ts", code, ts.ScriptTarget.Latest) }'
    expect(measureSource(ADAPTER, src)).toEqual({ walk: 1 })
    expect(measureSource(EMITTER, src)).toEqual({})
  })
})

describe('compareToBaseline', () => {
  const baseline = { files: { [ADAPTER]: { 'XAdapter.lower': 1 } } }

  test('the same tree passes', () => {
    expect(compareToBaseline({ [ADAPTER]: { 'XAdapter.lower': 1 } }, baseline).ok).toBe(true)
  })

  test('a new call, a grown function and a grown file fail', () => {
    const verdict = compareToBaseline({ [ADAPTER]: { 'XAdapter.lower': 2, other: 1 } }, baseline)
    expect(verdict.ok).toBe(false)
    expect(verdict.violations.map(v => v.kind).sort()).toEqual(['entered', 'file-grew', 'grew'])
  })

  test('a removed call fails until the baseline is regenerated', () => {
    const verdict = compareToBaseline({}, baseline)
    expect(verdict.violations).toEqual([{ kind: 'stale', path: ADAPTER, name: 'XAdapter.lower', from: 1, to: 0 }])
  })
})

test('serializeBaseline sorts files and functions and drops empty ones', () => {
  const out = JSON.parse(serializeBaseline({ b: { z: 1, a: 2 }, a: { x: 0 } }))
  expect(out).toEqual({ files: { b: { a: 2, z: 1 } } })
  expect(Object.keys(out.files.b)).toEqual(['a', 'z'])
})
