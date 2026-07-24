/**
 * Stage 2 of spec/callback-fidelity.md — folding a `.map()` callback whose
 * body is an if/else-if chain or `switch` (optionally preceded by a
 * `const`/`let` preamble) into a nested `IRConditional`, instead of the prior
 * silent verbatim leak. Also pins the conservative bail for shapes the fold
 * can't yet carry (branch-local locals), so nothing is dropped silently.
 */

import { describe, test, expect } from 'bun:test'
import { compileJSX } from '../compiler'
import { extractMultiReturnJsxBranches } from '../analyzer'
import { TestAdapter } from '../adapters/test-adapter'
import * as ts from 'typescript'

const adapter = new TestAdapter()

function clientJs(source: string): string {
  const result = compileJSX(source, 'List.tsx', { adapter })
  expect(result.errors).toHaveLength(0)
  const cj = result.files.find(f => f.type === 'clientJs')
  expect(cj).toBeDefined()
  return cj!.content
}

const wrap = (body: string) => `
function List({ items }: { items: { id: string; on: boolean; kind: string }[] }) {
  return <ul>{items.map((it) => ${body})}</ul>
}
export { List }
`

describe('.map() multi-return body fold (Stage 2)', () => {
  test('if/else-if chain folds to a conditional — no raw JSX leak', () => {
    const js = clientJs(wrap(`{
      if (it.kind === 'a') return <li key={it.id}>A</li>
      else if (it.kind === 'b') return <li key={it.id}>B</li>
      return <li key={it.id}>C</li>
    }`))
    // The raw \`if (...) return <li ...>\` must not survive into the callback.
    expect(js).not.toMatch(/return <li/)
    // A ternary chain over the branch conditions is emitted instead.
    expect(js).toMatch(/kind === 'a'/)
    expect(js).toMatch(/kind === 'b'/)
  })

  test('switch (with default) folds with a parenthesized strict-equality condition', () => {
    const js = clientJs(wrap(`{
      switch (it.kind) {
        case 'a': return <b key={it.id}>A</b>
        default: return <span key={it.id}>D</span>
      }
    }`))
    expect(js).not.toMatch(/switch\s*\(/)
    // Both operands parenthesized so a low-precedence case keeps === semantics.
    expect(js).toMatch(/\(it\(\)\.kind\) === \('a'\)/)
  })

  test('switch with fallthrough case labels folds with an OR condition', () => {
    const js = clientJs(wrap(`{
      switch (it.kind) {
        case 'a':
        case 'b':
          return <b key={it.id}>AB</b>
        default:
          return <span key={it.id}>D</span>
      }
    }`))
    expect(js).not.toMatch(/switch\s*\(/)
    expect(js).not.toMatch(/return <(b|span)/)
    // Both fallthrough labels OR-joined into one branch condition.
    expect(js).toMatch(/=== \('a'\)/)
    expect(js).toMatch(/=== \('b'\)/)
    expect(js).toMatch(/\|\|/)
  })

  describe('conservative bail — no silent drop', () => {
    function extract(body: string) {
      const sf = ts.createSourceFile('t.tsx', `const f = (it: any) => ${body}`, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX)
      let block: ts.Block | undefined
      const visit = (n: ts.Node) => {
        if (ts.isArrowFunction(n) && ts.isBlock(n.body)) block = n.body
        ts.forEachChild(n, visit)
      }
      visit(sf)
      return extractMultiReturnJsxBranches(block!)
    }

    test('a branch-local const bails (would otherwise be dropped)', () => {
      const r = extract(`{ if (it.on) { const x = it.kind; return <b>{x}</b> } return <span>Z</span> }`)
      expect(r).toBeNull()
    })

    test('a switch case with an extra statement bails', () => {
      const r = extract(`{ switch (it.kind) { case 'a': { const y = it.id; return <b>{y}</b> } default: return <span>D</span> } }`)
      expect(r).toBeNull()
    })

    test('a leading const preamble bails (deferred — DSL cannot carry the local)', () => {
      const body = `{ const label = it.kind; if (it.on) return <b>{label}</b>; return <span>{label}</span> }`
      expect(extract(body)).toBeNull()
    })
  })
})
