import { describe, expect, test } from 'bun:test'
import ts from 'typescript'
import { compareToBaseline, measureSource, measureSourceFile, serializeBaseline } from '../emit-parse-ratchet'

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

/** Measures `body` with a checker, `JsSourceText` and an IR-like node declared beside it. */
function measureTyped(body: string): Record<string, number> {
  const file = '/virtual/x-adapter.ts'
  const text = `
    type JsSourceText = string & { readonly __jsSourceText?: 'JsSourceText' }
    interface Node { expr: JsSourceText; key: JsSourceText | null; name: string }
    ${body}
  `
  const options: ts.CompilerOptions = { target: ts.ScriptTarget.ESNext, strict: true, noLib: false, types: [] }
  const host = ts.createCompilerHost(options)
  const readFile = host.readFile.bind(host)
  const getSourceFile = host.getSourceFile.bind(host)
  host.readFile = name => (name === file ? text : readFile(name))
  host.fileExists = name => name === file || ts.sys.fileExists(name)
  host.getSourceFile = (name, version) =>
    name === file ? ts.createSourceFile(name, text, version, true) : getSourceFile(name, version)
  const program = ts.createProgram([file], options, host)
  return measureSourceFile(program.getSourceFile(file)!, ADAPTER, program.getTypeChecker())
}

describe('measureSourceFile with a checker: string operations on JsSourceText (#3543)', () => {
  test('counts a regex or string search on JsSourceText, not on a plain string', () => {
    const counts = measureTyped(`
      function onReceiver(n: Node) { return n.expr.replace(/x/g, 'y') }
      function onNullable(n: Node) { return n.key?.startsWith('(') }
      function asArgument(n: Node) { return /^[a-z]+$/.test(n.expr) }
      function onPlainString(n: Node) { return n.name.includes('x') }
      function regExpOf(n: Node) { return new RegExp(n.expr) }
      function searchedFor(n: Node, haystack: string) { return haystack.indexOf(n.expr) }
    `)
    expect(counts).toEqual({ onReceiver: 1, onNullable: 1, asArgument: 1, regExpOf: 1, searchedFor: 1 })
  })

  test('follows a text-preserving method and a const initializer', () => {
    const counts = measureTyped(`
      function trimmed(n: Node) { return n.expr.trim().endsWith(')') }
      function viaConst(n: Node) { const t = n.expr.trim(); return /=>/.exec(t) }
      function viaLet(n: Node) { let t = n.expr.trim(); t = 'x'; return t.includes('x') }
    `)
    expect(counts).toEqual({ trimmed: 1, viaConst: 1 })
  })

  test('passing the text through to output does not count', () => {
    expect(measureTyped('function emit(n: Node) { return `(${n.expr.trim()})()` }')).toEqual({})
  })

  test('without a checker only parser calls count', () => {
    expect(measureSource(ADAPTER, "function f(e: string) { return e.replace(/x/, '') }")).toEqual({})
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
