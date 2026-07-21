import { describe, test, expect } from 'bun:test'
import { GoTemplateAdapter, conformancePins as goTemplatePins } from '@barefootjs/go-template'
import { compileForCompat, buildCompatCell, COMPILE_THREW_CODE } from '../engine'
import { buildCompatReport, formatCompatJson, formatCompatMarkdown } from '../report'

// #2038 repro shape — a filter predicate with a NESTED higher-order
// callback call. The Go template adapter has no faithful lowering and
// refuses with BF101 (packages/adapter-go-template/src/conformance-pins.ts,
// `filter-nested-callback-predicate` entry). Inlined here rather than
// imported from the shared fixture corpus so this unit test stays
// self-contained; compat-pins.test.ts is what cross-checks against the
// real corpus.
const NESTED_CALLBACK_PREDICATE_SOURCE = `
'use client'
import { createSignal } from '@barefootjs/client'
type Item = { id: number }
export function NestedCallbackPredicate() {
  const [items, setItems] = createSignal<Item[]>([])
  const [picked, setPicked] = createSignal<Item[]>([])
  return <ul>{items().filter(t => !picked().some(p => p.id === t.id)).map((t, i) => <li key={i}>{t.id}</li>)}</ul>
}
`

const OK_SOURCE = `
export function Hello() {
  return <div>Hello</div>
}
`

describe('compileForCompat', () => {
  test('build mode: clean component produces no diagnostics', () => {
    const adapter = new GoTemplateAdapter()
    const errors = compileForCompat(OK_SOURCE, 'component.tsx', adapter, 'build')
    expect(errors).toEqual([])
    const cell = buildCompatCell(errors, {})
    expect(cell).toEqual({ ok: true, diagnostics: [] })
  })

  test('build mode: a refused shape fires BF101 and the cell is not ok', () => {
    const adapter = new GoTemplateAdapter()
    const errors = compileForCompat(NESTED_CALLBACK_PREDICATE_SOURCE, 'component.tsx', adapter, 'build')
    expect(errors.some(e => e.code === 'BF101' && e.severity === 'error')).toBe(true)

    const cell = buildCompatCell(errors, goTemplatePins)
    expect(cell.ok).toBe(false)
    // `issues` is the UNION of every issue URL any BF101 pin carries on
    // this adapter (buildCompatCell attributes by code, not by fixture —
    // see its docstring) — #2320 (this shape, nested filter callback,
    // successor to #2038) and #2321 (static-array-from-props computed loop
    // source) surface here even though this test only exercises the nested-
    // filter-callback shape. #2319 (dangerous-inner-html-dynamic) is no
    // longer among them — it graduated to a faithful raw-output lowering on
    // every template adapter, so its BF101 pin was removed. #2208's
    // `static-array-children` BF101 pin was likewise removed (its loop-source
    // gate now bakes a fully-static array-of-objects const directly) — see
    // `go-template`'s `conformance-pins.ts`.
    expect(cell.diagnostics).toEqual([
      {
        code: 'BF101',
        severity: 'error',
        issues: [
          'https://github.com/piconic-ai/barefootjs/issues/2320',
          'https://github.com/piconic-ai/barefootjs/issues/2321',
        ],
      },
    ])
  })

  test('conformance mode compiles components children before the entry', () => {
    const adapter = new GoTemplateAdapter()
    const childSource = `
export function Child() {
  return <span>child</span>
}
`
    const parentSource = `
import { Child } from './child'
export function Parent() {
  return <div><Child /></div>
}
`
    // Should not throw — children compile first, then the parent, and
    // errors from both are concatenated (mirrors collectFixtureDiagnostics).
    const errors = compileForCompat(parentSource, 'component.tsx', adapter, 'conformance', {
      'child.tsx': childSource,
    })
    expect(Array.isArray(errors)).toBe(true)
  })

  test('a thrown compileJSX becomes a synthetic COMPILE_THREW error diagnostic', () => {
    const throwingAdapter = new GoTemplateAdapter()
    // Corrupt the adapter after construction so `generate()` throws instead
    // of returning normally — proves compileForCompat never propagates.
    ;(throwingAdapter as unknown as { generate: () => never }).generate = () => {
      throw new Error('boom')
    }
    const errors = compileForCompat(OK_SOURCE, 'component.tsx', throwingAdapter, 'build')
    expect(errors).toEqual([
      {
        code: COMPILE_THREW_CODE,
        severity: 'error',
        message: '',
        loc: { file: 'component.tsx', start: { line: 0, column: 0 }, end: { line: 0, column: 0 } },
      },
    ])
    const cell = buildCompatCell(errors, {})
    expect(cell.ok).toBe(false)
  })
})

describe('buildCompatCell', () => {
  test('dedupes, sorts by code then severity, and drops info severity', () => {
    const cell = buildCompatCell(
      [
        { code: 'BF102', severity: 'warning', message: '', loc: { file: 'f', start: { line: 0, column: 0 }, end: { line: 0, column: 0 } } },
        { code: 'BF101', severity: 'error', message: '', loc: { file: 'f', start: { line: 0, column: 0 }, end: { line: 0, column: 0 } } },
        { code: 'BF101', severity: 'error', message: 'duplicate', loc: { file: 'f', start: { line: 1, column: 0 }, end: { line: 1, column: 0 } } },
        { code: 'BF999', severity: 'info', message: '', loc: { file: 'f', start: { line: 0, column: 0 }, end: { line: 0, column: 0 } } },
      ],
      {},
    )
    expect(cell.diagnostics).toEqual([
      { code: 'BF101', severity: 'error', issues: [] },
      { code: 'BF102', severity: 'warning', issues: [] },
    ])
    expect(cell.ok).toBe(false)
  })

  test('warning-only cells are ok', () => {
    const cell = buildCompatCell(
      [{ code: 'BF102', severity: 'warning', message: '', loc: { file: 'f', start: { line: 0, column: 0 }, end: { line: 0, column: 0 } } }],
      {},
    )
    expect(cell.ok).toBe(true)
  })

  test('issue URLs are attached from pins matching the code, deduped and sorted', () => {
    const pins = {
      'fixture-a': [{ code: 'BF101', severity: 'error' as const, issue: 'https://example.com/2' }],
      'fixture-b': [{ code: 'BF101', severity: 'error' as const, issue: 'https://example.com/1' }],
      'fixture-c': [{ code: 'BF101', severity: 'error' as const, issue: 'https://example.com/1' }],
      'fixture-d': [{ code: 'BF999', severity: 'error' as const }],
    }
    const cell = buildCompatCell(
      [{ code: 'BF101', severity: 'error', message: '', loc: { file: 'f', start: { line: 0, column: 0 }, end: { line: 0, column: 0 } } }],
      pins,
    )
    expect(cell.diagnostics).toEqual([
      { code: 'BF101', severity: 'error', issues: ['https://example.com/1', 'https://example.com/2'] },
    ])
  })
})

describe('buildCompatReport adapter ordering', () => {
  test('hono sorts first when present; the remainder stays alphabetical', () => {
    const report = buildCompatReport({
      widget: {
        twig: { ok: true, diagnostics: [] },
        'go-template': { ok: true, diagnostics: [] },
        hono: { ok: true, diagnostics: [] },
        erb: { ok: true, diagnostics: [] },
      },
    })
    expect(report.adapters).toEqual(['hono', 'erb', 'go-template', 'twig'])
    // Row key order (from `for (const id of adapters)` in buildCompatReport)
    // mirrors the column order — hono leads each component's row too.
    expect(Object.keys(report.components.widget)).toEqual(['hono', 'erb', 'go-template', 'twig'])
  })

  test('a report without hono is purely alphabetical', () => {
    const report = buildCompatReport({
      widget: {
        twig: { ok: true, diagnostics: [] },
        'go-template': { ok: true, diagnostics: [] },
        erb: { ok: true, diagnostics: [] },
      },
    })
    expect(report.adapters).toEqual(['erb', 'go-template', 'twig'])
  })
})

describe('formatCompatMarkdown', () => {
  test('a component missing a cell for an adapter renders `?`, never `✓`', () => {
    // `beta` ran against both adapters; `alpha` only ran against
    // `adapter-a` (e.g. a partial run), so `cells.alpha['adapter-b']` is
    // absent. buildCompatReport derives the adapter column list from the
    // union of columns actually present, so `adapter-b` still appears as
    // a column even though alpha has no cell for it.
    const report = buildCompatReport({
      alpha: { 'adapter-a': { ok: true, diagnostics: [] } },
      beta: {
        'adapter-a': { ok: true, diagnostics: [] },
        'adapter-b': { ok: true, diagnostics: [] },
      },
    })

    const md = formatCompatMarkdown(report)
    const alphaLine = md.split('\n').find(line => line.startsWith('| alpha |'))
    expect(alphaLine).toBe('| alpha | ✓ | ? |')
  })
})

describe('determinism', () => {
  test('two engine runs over the same inputs produce deep-equal and byte-equal reports', () => {
    const runOnce = () => {
      const adapter = new GoTemplateAdapter()
      const errors = compileForCompat(NESTED_CALLBACK_PREDICATE_SOURCE, 'component.tsx', adapter, 'build')
      const cell = buildCompatCell(errors, goTemplatePins)
      return buildCompatReport({ 'nested-callback-predicate': { 'go-template': cell } })
    }

    const first = runOnce()
    const second = runOnce()
    expect(first).toEqual(second)
    expect(formatCompatJson(first)).toBe(formatCompatJson(second))
  })
})
