/**
 * #2470: a nested ternary chain (`a ? … : b ? … : …`) sitting in the
 * ALTERNATE of a NON-reactive outer conditional (no signal/prop/call —
 * a module-level `const`) used to emit
 *
 *   {MODE === 'a' ? <span>A</span> : {MODE === 'b' ? <span>B</span> : <span>C</span>}}
 *
 * — the nested conditional re-wrapped in its own `{…}` in a position where
 * only a bare JS expression is legal, breaking the `.tsx` parse
 * (`Expected "}" but found "==="`) with zero diagnostics. See
 * `renderConditionalBody` / `renderBareBranch` in `hono-adapter.ts`.
 */
import { describe, expect, test } from 'bun:test'
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { join, resolve } from 'node:path'
import ts from 'typescript'
import { compileJSX } from '@barefootjs/jsx'
import { HonoAdapter } from '../adapter/index.ts'

const HERE = resolve(import.meta.dir)

const SOURCE = `
const MODE = 'b'
export function Chain() {
  return <div>{MODE === 'a' ? <span>A</span> : MODE === 'b' ? <span>B</span> : <span>C</span>}</div>
}
`

describe('nested ternary under a non-reactive outer condition (#2470)', () => {
  test('the emitted template has no double-braced nested conditional', () => {
    const result = compileJSX(SOURCE, '/virtual/Chain.tsx', {
      adapter: new HonoAdapter(),
    })
    expect(result.errors.filter(e => e.severity === 'error')).toEqual([])
    const template = result.files.find(f => f.type === 'markedTemplate')?.content
    expect(template).toBeDefined()

    // The nested conditional's branch must stay a bare `cond ? … : …`
    // splice, not a second `{…}`-wrapped expression, inside the outer
    // ternary's alternate.
    expect(template).toContain(
      "MODE === 'a' ? <span>A</span> : MODE === 'b' ? <span>B</span> : <span>C</span>",
    )
    expect(template).not.toContain(': {MODE ===')

    // The template must actually PARSE as valid TSX — this is the
    // regression the bug produced silently (no compiler diagnostic, just a
    // downstream syntax error at build time). `getSyntacticDiagnostics` is
    // the public API for this (mirrors `consumer-typecheck.test.ts`'s
    // `ts.createProgram` usage, scoped to syntax only since this file has
    // no import to resolve).
    const tmp = mkdtempSync(join(HERE, '.nested-ternary-bare-branch-'))
    try {
      const file = join(tmp, 'Chain.tsx')
      writeFileSync(file, template!)
      const program = ts.createProgram([file], {
        noEmit: true,
        target: ts.ScriptTarget.ESNext,
        jsx: ts.JsxEmit.ReactJSX,
        jsxImportSource: '@barefootjs/hono/jsx',
        allowImportingTsExtensions: true,
        skipLibCheck: true,
      })
      const syntaxDiagnostics = program.getSyntacticDiagnostics(program.getSourceFile(file))
      expect(syntaxDiagnostics.map(d => ts.flattenDiagnosticMessageText(d.messageText, ' '))).toEqual([])
    } finally {
      rmSync(tmp, { recursive: true, force: true })
    }
  }, 30_000)
})
