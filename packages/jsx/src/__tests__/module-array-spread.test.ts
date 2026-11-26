import { describe, expect, test } from 'bun:test'
import { analyzeComponent } from '../analyzer.ts'
import { buildMetadata } from '../compiler.ts'
import { compileJSX } from '../compiler.ts'
import { stringifyParsedExpr } from '../expression-parser.ts'
import { TestAdapter } from '../adapters/test-adapter.ts'

/** The parsed tree of module const `name` in `source`, spelled back as JS. */
function parsedOf(source: string, name: string): string | undefined {
  const constants = buildMetadata(analyzeComponent(source, 'c.tsx')).localConstants
  const constant = constants.find(c => c.isModule && c.name === name)
  return constant?.parsed ? stringifyParsedExpr(constant.parsed) : undefined
}

const component = `export function C() { return <p>{ALL.length}</p> }`

/** Whether module const `ALL` in `source` still holds an element no template lowers (an unexpanded spread). */
function stillSpreads(source: string): boolean {
  const constants = buildMetadata(analyzeComponent(source, 'c.tsx')).localConstants
  const parsed = constants.find(c => c.isModule && c.name === 'ALL')?.parsed
  return parsed?.kind === 'array-literal' && parsed.elements.some(e => e.kind === 'unsupported')
}

describe('expandModuleArraySpreads (#3979)', () => {
  test('a spread of a literal array const is replaced by its elements, in place', () => {
    expect(parsedOf(`const BASE = ['y']\nconst ALL = ['a', ...BASE, 'z']\n${component}`, 'ALL')).toBe(`["a", "y", "z"]`)
  })

  test('a chain of spreads resolves, in declaration order', () => {
    const source = `const A = ['a']\nconst B = [...A, 'b']\nconst ALL = [...B, ...A]\n${component}`
    expect(parsedOf(source, 'B')).toBe(`["a", "b"]`)
    expect(parsedOf(source, 'ALL')).toBe(`["a", "b", "a"]`)
  })

  test('a spread of an inline array literal, itself spreading a const, is expanded', () => {
    expect(parsedOf(`const A = ['a']\nconst ALL = [...['x', ...A]]\n${component}`, 'ALL')).toBe(`["x", "a"]`)
  })

  test('a typed or asserted source and spread read the same', () => {
    const source = `const BASE: string[] = ['y'] as const\nconst ALL = [...(BASE as string[]), 'z'] satisfies string[]\n${component}`
    expect(parsedOf(source, 'ALL')).toBe(`["y", "z"]`)
  })

  test('object rows are copied by their parsed trees', () => {
    const source = `const ROWS = [{ id: 'a' }]\nconst ALL = [...ROWS, { id: 'b' }]\n${component}`
    expect(parsedOf(source, 'ALL')).toBe(`[({ id: 'a' }), ({ id: 'b' })]`)
  })

  test('a source with no compile-time elements leaves the spread as it is', () => {
    const left = (decls: string) => stillSpreads(`${decls}\n${component}`)
    // A call, a Set, a member, a string.
    expect(left(`function mk() { return ['y'] }\nconst ALL = [...mk(), 'z']`)).toBe(true)
    expect(left(`const ALL = [...new Set(['y']), 'z']`)).toBe(true)
    expect(left(`const R = { xs: ['y'] }\nconst ALL = [...R.xs, 'z']`)).toBe(true)
    expect(left(`const S = 'y'\nconst ALL = [...S, 'z']`)).toBe(true)
    // A `let`, which a later statement may reassign.
    expect(left(`let BASE = ['y']\nconst ALL = [...BASE, 'z']`)).toBe(true)
    // A source with its own unresolved spread.
    expect(left(`const BASE = [...new Set(['y'])]\nconst ALL = [...BASE, 'z']`)).toBe(true)
  })

  test('a source a statement writes is not expanded', () => {
    const source = `const BASE = ['y']\nconst ALL = [...BASE, 'z']\nexport function C() {\n  BASE.push('w')\n  return <p>{ALL.length}</p>\n}`
    expect(stillSpreads(source)).toBe(true)
  })

  test('a const declared after the one spreading it is not read (JS throws in its TDZ)', () => {
    expect(stillSpreads(`const ALL = [...BASE, 'z']\nconst BASE = ['y']\n${component}`)).toBe(true)
  })

  test('a spread it cannot resolve keeps its place beside one it can', () => {
    const parsed = parsedOf(`const A = ['a']\nconst ALL = [...A, ...new Set(['y'])]\n${component}`, 'ALL')
    expect(parsed?.startsWith(`["a", `)).toBe(true)
  })

  test('a component-scope const is not expanded', () => {
    const source = `const BASE = ['y']\nexport function C() {\n  const local = [...BASE, 'z']\n  return <p>{local.length}</p>\n}`
    const constants = buildMetadata(analyzeComponent(source, 'c.tsx')).localConstants
    const local = constants.find(c => c.name === 'local')
    expect(local?.parsed?.kind).toBe('array-literal')
    expect(local?.parsed?.kind === 'array-literal' && local.parsed.elements[0].kind).toBe('unsupported')
  })

  test('the const keeps its source text: the client bundle still spreads the source', () => {
    const source = `'use client'\nimport { createMemo } from '@barefootjs/client'\nconst BASE = ['y']\nconst ALL = [...BASE, 'z']\nexport function C() {\n  const n = createMemo(() => ALL.length)\n  return <p>{n()}</p>\n}`
    const constants = buildMetadata(analyzeComponent(source, 'c.tsx')).localConstants
    expect(constants.find(c => c.name === 'ALL')?.value).toBe(`[...BASE, 'z']`)
    const result = compileJSX(source, 'c.tsx', { adapter: new TestAdapter() })
    const clientJs = result.files.find(f => f.type === 'clientJs')?.content ?? ''
    expect(clientJs).toContain('...BASE')
  })
})
