/**
 * A string literal the compiler builds in Phase 1 into an expression that
 * reaches the output (#3726) is spelled by `codeSafeStringLiteral`: a
 * controlled `<select>`'s per-option `selected` comparison against each
 * option's literal value. Both outputs that carry it, the Hono marked
 * template (TSX) and the client JS, must spell `<` as `\u003c` and
 * still compare against the option's value.
 */

import { describe, test, expect } from 'bun:test'
import ts from 'typescript'
import { compileJSX } from '@barefootjs/jsx'
import { HonoAdapter } from '../adapter/hono-adapter'

const source = `
"use client"
import { createSignal } from '@barefootjs/client'
export function Pick() {
  const [val] = createSignal('a')
  return (
    <select value={val()}>
      <option value="a">A</option>
      <option value="x < y">X</option>
      <option value="</script>">S</option>
    </select>
  )
}
`

/**
 * Every `(val()) === <string literal>` comparison in `code` (the client
 * template's `('a') === …` too): the literal's source text and the value
 * that text evaluates to.
 */
function comparisons(code: string, kind: ts.ScriptKind): Array<{ raw: string; value: unknown }> {
  const sf = ts.createSourceFile('out', code, ts.ScriptTarget.Latest, true, kind)
  const out: Array<{ raw: string; value: unknown }> = []
  const visit = (node: ts.Node): void => {
    if (
      ts.isBinaryExpression(node) &&
      node.operatorToken.kind === ts.SyntaxKind.EqualsEqualsEqualsToken &&
      ts.isStringLiteral(node.right) &&
      // The client template reads the signal's initial value in place of
      // `val()`: `(('a')) === …`.
      ['val', "'a'"].includes(node.left.getText(sf).replace(/[()\s]/g, ''))
    ) {
      const raw = node.right.getText(sf)
      out.push({ raw, value: new Function(`return ${raw}`)() })
    }
    ts.forEachChild(node, visit)
  }
  visit(sf)
  return out
}

describe('output-bound Phase 1 string literals (#3726)', () => {
  const result = compileJSX(source, 'Pick.tsx', { adapter: new HonoAdapter() })
  const outputs = [
    { name: 'marked template', kind: ts.ScriptKind.TSX, code: result.files.find(f => f.type === 'markedTemplate')?.content ?? '' },
    { name: 'client JS', kind: ts.ScriptKind.JS, code: result.files.find(f => f.type === 'clientJs')?.content ?? '' },
  ]

  test('compiles', () => {
    expect(result.errors).toHaveLength(0)
  })

  for (const { name, kind, code } of outputs) {
    test(`${name}: each option comparison evaluates to the option's value and holds no raw <`, () => {
      const found = comparisons(code, kind)
      expect(new Set(found.map(c => c.value))).toEqual(new Set(['a', 'x < y', '</script>']))
      for (const { raw } of found) expect(raw).not.toMatch(/</)
    })
  }
})
