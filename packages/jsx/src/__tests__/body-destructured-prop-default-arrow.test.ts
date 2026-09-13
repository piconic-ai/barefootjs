/**
 * Regression for #2940: a BODY-destructured prop's arrow-function default
 * (`const { fmt = (v) => 'v' + v } = props`) used to build
 * `ConstantInfo.value` as a bare `props.fmt ?? (v) => 'v' + v` —
 * `collectConstant`'s body-destructure branch (`analyzer.ts`) never checked
 * whether the default contained an arrow/function expression before
 * splicing it after `??`, unlike the PARAMETER-destructured sibling form,
 * which already parenthesized via `ParamInfo.defaultContainsArrow`
 * (`propReadFallback`, `props-binding.ts`).
 *
 * `a ?? (v) => expr` is not valid JS — an arrow function cannot appear
 * directly as the right operand of `??` without parens — so this was a
 * genuine SyntaxError in three places that all read `ConstantInfo.value`
 * verbatim: the emitted client-JS init body, the Hono SSR component (the
 * reference adapter also splices `value` unchanged), and every downstream
 * pass that re-parses it (which silently gave up and skipped instead of
 * crashing, masking the bug as a missed optimization rather than a syntax
 * error).
 *
 * The fix routes the analyzer's `value`-building through the same
 * `coalesceDefaultText` decision `propReadFallback` already used, so there
 * is one implementation of "how does a `??` default get parenthesized",
 * not two.
 */

import { describe, test, expect } from 'bun:test'
import ts from 'typescript'
import { analyzeComponent } from '../analyzer'
import { compileJSX } from '../index'
import { HonoAdapter } from '../../../adapter-hono/src/adapter/index'

const ARROW_DEFAULT_SOURCE = `
'use client'
function Child(props: { fmt?: (v: number) => string }) {
  const { fmt = (v) => 'v' + v } = props
  return <span>{fmt(1)}</span>
}
export { Child }
`

const RENAMED_ARROW_DEFAULT_SOURCE = `
'use client'
function Child(props: { fmt?: (v: number) => string }) {
  const { fmt: f = (v) => 'v' + v } = props
  return <span>{f(1)}</span>
}
export { Child }
`

function compile(source: string) {
  return compileJSX(source, 'Child.tsx', { adapter: new HonoAdapter() })
}

function parseDiagnosticCount(js: string): number {
  const sourceFile = ts.createSourceFile('generated.js', js, ts.ScriptTarget.Latest, false, ts.ScriptKind.JS)
  // @ts-expect-error - internal, but the established way this repo checks
  // "did the generated code actually parse" (see client-template-escape-
  // soundness.test.ts / map-body-no-silent-divergence.test.ts).
  return sourceFile.parseDiagnostics?.length ?? 0
}

describe('body-destructured prop with an arrow-function default (#2940)', () => {
  test('analyzer: `value` parenthesizes the arrow default', () => {
    const ctx = analyzeComponent(ARROW_DEFAULT_SOURCE, 'Child.tsx')
    const fmt = ctx.localConstants.find(c => c.name === 'fmt')
    expect(fmt).toBeDefined()
    expect(fmt?.value).toBe("props.fmt ?? ((v) => 'v' + v)")
    expect(fmt?.containsArrow).toBe(true)
  })

  test('emitted client JS parses as valid JS, with no bare `?? (v) =>`', () => {
    const warnings: unknown[][] = []
    const originalWarn = console.warn
    console.warn = (...args: unknown[]) => { warnings.push(args) }
    let result: ReturnType<typeof compile>
    try {
      result = compile(ARROW_DEFAULT_SOURCE)
    } finally {
      console.warn = originalWarn
    }

    const clientJs = result.files.find(f => f.type === 'clientJs')
    expect(clientJs).toBeDefined()
    const js = clientJs!.content

    expect(js).not.toMatch(/\?\?\s*\(v\)\s*=>/)
    expect(parseDiagnosticCount(js)).toBe(0)

    // The two downstream passes that used to silently bail because the
    // generated code didn't parse must now run to completion.
    expect(warnings.some(w => String(w[0]).includes('rewriteDestructuredPropReads'))).toBe(false)
    expect(warnings.some(w => String(w[0]).includes('pruneUnusedPropExtractions'))).toBe(false)
  })

  test('Hono SSR component also parenthesizes the default (the reference adapter splices `value` verbatim too)', () => {
    const result = compile(ARROW_DEFAULT_SOURCE)
    const ssrComponent = result.files.find(f => f.type === 'markedTemplate')
    expect(ssrComponent).toBeDefined()
    expect(ssrComponent!.content).not.toMatch(/\?\?\s*\(v\)\s*=>/)
  })

  test('renamed alias (`{ fmt: f = (v) => ... }`) gets the same paren-wrap', () => {
    const ctx = analyzeComponent(RENAMED_ARROW_DEFAULT_SOURCE, 'Child.tsx')
    const f = ctx.localConstants.find(c => c.name === 'f')
    expect(f).toBeDefined()
    expect(f?.value).toBe("props.fmt ?? ((v) => 'v' + v)")
    expect(f?.containsArrow).toBe(true)

    const result = compile(RENAMED_ARROW_DEFAULT_SOURCE)
    const clientJs = result.files.find(f => f.type === 'clientJs')
    expect(parseDiagnosticCount(clientJs!.content)).toBe(0)
  })
})
