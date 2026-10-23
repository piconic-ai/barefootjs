/**
 * #3595: an inner `.map()` in a loop-row child component's forwarded
 * children rebinds a name the outer row binds. The forwarded children are
 * rewritten with the outer row's accessor (`wrapLoopParamAsAccessor`), and
 * that rewrite once turned the inner callback's PARAMETER into the outer
 * accessor: `o().tags.map((tag, i()) => …)`, a SyntaxError ("Invalid binding
 * pattern") in the emitted client JS. The rewrite now follows the shared
 * lexical-scope walk (`walkWithScope`): the binder is never rewritten and
 * the references it shadows read the inner binding, while references
 * outside the inner callback still read the outer row's accessor.
 *
 * Conformance coverage: `loop-row-child-children-inner-loop-shadow`.
 */

import { describe, test, expect } from 'bun:test'
import ts from 'typescript'
import { compileJSX } from '../compiler'
import { TestAdapter } from '../adapters/test-adapter'

const adapter = new TestAdapter()

function clientJsOf(row: string, mapParams: string): string {
  const source = `
    'use client'
    function Chip({ children }: { children?: any }) {
      return <span class="chip">{children}</span>
    }
    type Row = { id: string; tags: string[] }
    export function Shadow(props: { rows: Row[] }) {
      return <p>{props.rows.map((${mapParams}) => (${row}))}</p>
    }
  `
  const result = compileJSX(source, 'Shadow.tsx', { adapter })
  expect(result.errors.filter(e => e.severity === 'error')).toHaveLength(0)
  const js = result.files.find(f => f.type === 'clientJs')!.content
  const diagnostics = ts.transpileModule(js, {
    reportDiagnostics: true,
    compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.Latest },
  }).diagnostics ?? []
  expect(diagnostics.filter(d => d.category === ts.DiagnosticCategory.Error)).toHaveLength(0)
  return js
}

describe('inner loop in forwarded loop-row children shadows the outer row (#3595)', () => {
  test('an inner index named like the outer index keeps its binder and is read plain', () => {
    const js = clientJsOf(
      '<Chip key={o.id}><em>{i}</em><ul>{o.tags.map((tag, i) => <li key={tag}>{tag}-{i}</li>)}</ul></Chip>',
      'o, i',
    )
    expect(js).toContain('o().tags.map((tag, i) => `<li data-key-1="${escapeAttr(tag)}">')
    expect(js).toContain('-<!--bf:^s2-->${escapeText(i)}<!--/--></li>')
    // Outside the inner callback the name is still the outer row's index.
    expect(js).toContain('<em><!--bf:^s0-->${escapeText(i())}<!--/--></em>')
    expect(js).not.toContain('i()) =>')
  })

  test('an inner item named like the outer item reads the inner item', () => {
    const js = clientJsOf(
      '<Chip key={o.id}><ul>{o.tags.map((o) => <li key={o}>{o}</li>)}</ul></Chip>',
      'o',
    )
    expect(js).toContain('o().tags.map((o) => `<li data-key-1="${escapeAttr(o)}"><!--bf:^s0-->${escapeText(o)}<!--/--></li>`)')
    expect(js).not.toContain('(o()) =>')
  })

  test('an inner param named like an outer destructured binding reads the inner param', () => {
    const js = clientJsOf(
      '<Chip key={id}><ul>{tags.map((id, i) => <li key={id}>{id}-{i}</li>)}</ul></Chip>',
      '{ id, tags }, i',
    )
    expect(js).toContain('__bfItem().tags.map((id, i) => `<li data-key-1="${escapeAttr(id)}"><!--bf:^s0-->${escapeText(id)}<!--/-->-<!--bf:^s1-->${escapeText(i)}<!--/--></li>`)')
    expect(js).not.toContain('__bfItem().id, i')
  })
})
