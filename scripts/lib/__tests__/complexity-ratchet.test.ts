import { describe, expect, test } from 'bun:test'
import {
  type CcccFunction,
  type CcccReport,
  type ComplexityBaseline,
  baselineGrowth,
  buildBaseline,
  collectAboveThreshold,
  compareToBaseline,
  flattenFunctions,
  formatVerdict,
  parseCcccVersion,
  regenerationGrowth,
  serializeBaseline,
} from '../complexity-ratchet'

const fn = (name: string, cognitive: number, children: CcccFunction[] = []): CcccFunction => ({
  name,
  kind: 'function',
  line: 1,
  cognitive,
  cyclomatic: 1,
  children,
})

const report = (files: Record<string, CcccFunction[]>): CcccReport => ({
  files: Object.entries(files).map(([path, functions]) => ({ path, cognitive: 0, cyclomatic: 0, functions })),
  summary: { file_count: Object.keys(files).length, function_count: 0, parse_error_count: 0, parse_error_file_count: 0 },
})

const baseline = (files: ComplexityBaseline['files'], threshold = 25): ComplexityBaseline => ({
  $comment: '',
  cccc: '1.8.0',
  threshold,
  files,
})

describe('flattenFunctions', () => {
  test('qualifies nested functions by their enclosing names', () => {
    const tree = [fn('outer', 30, [fn('visit', 10, [fn('<anonymous>', 3)])]), fn('top', 1)]
    expect(flattenFunctions(tree)).toEqual([
      ['outer', 30],
      ['outer/visit', 10],
      ['outer/visit/<anonymous>', 3],
      ['top', 1],
    ])
  })
})

describe('collectAboveThreshold', () => {
  test('keeps only functions strictly above the threshold, sorted by path and name', () => {
    const r = report({
      'b.ts': [fn('z', 26), fn('a', 25)],
      'a.ts': [fn('m', 100)],
    })
    expect(Object.keys(collectAboveThreshold(r, 25))).toEqual(['a.ts', 'b.ts'])
    expect(collectAboveThreshold(r, 25)['b.ts']).toEqual({ z: [26] })
  })

  test('same-named functions in one file become one descending list', () => {
    const r = report({ 'a.ts': [fn('visit', 30), fn('x', 1, [fn('visit', 42)]), fn('visit', 40)] })
    expect(collectAboveThreshold(r, 25)['a.ts']).toEqual({ visit: [40, 30], 'x/visit': [42] })
  })

  test('a file with nothing above the threshold is omitted', () => {
    expect(collectAboveThreshold(report({ 'a.ts': [fn('f', 25)] }), 25)).toEqual({})
  })
})

describe('compareToBaseline', () => {
  test('passes when the tree matches the baseline exactly', () => {
    const r = report({ 'a.ts': [fn('f', 30), fn('g', 5)] })
    const verdict = compareToBaseline(r, baseline({ 'a.ts': { f: [30] } }))
    expect(verdict).toEqual({ ok: true, violations: [], aboveThreshold: 1 })
  })

  test('a function above the threshold that got more complex fails', () => {
    const r = report({ 'a.ts': [fn('f', 31)] })
    const verdict = compareToBaseline(r, baseline({ 'a.ts': { f: [30] } }))
    expect(verdict.ok).toBe(false)
    expect(verdict.violations).toEqual([{ kind: 'grew', path: 'a.ts', name: 'f', from: 30, to: 31 }])
  })

  test('a function that crosses the threshold for the first time fails as entered', () => {
    const r = report({ 'a.ts': [fn('f', 30), fn('g', 26)] })
    const verdict = compareToBaseline(r, baseline({ 'a.ts': { f: [30] } }))
    expect(verdict.violations).toEqual([{ kind: 'entered', path: 'a.ts', name: 'g', cognitive: 26 }])
  })

  test('a function in a file the baseline does not know fails as entered', () => {
    const r = report({ 'new.ts': [fn('f', 40)] })
    expect(compareToBaseline(r, baseline({})).violations).toEqual([
      { kind: 'entered', path: 'new.ts', name: 'f', cognitive: 40 },
    ])
  })

  test('a function that got simpler makes the baseline stale (regenerate, never hand-edit)', () => {
    const r = report({ 'a.ts': [fn('f', 20)] })
    const verdict = compareToBaseline(r, baseline({ 'a.ts': { f: [30] } }))
    expect(verdict.violations).toEqual([{ kind: 'stale', path: 'a.ts', name: 'f', baseline: 30, current: null }])
  })

  test('a lowered function still above the threshold is stale, with its current value', () => {
    const r = report({ 'a.ts': [fn('f', 28)] })
    const verdict = compareToBaseline(r, baseline({ 'a.ts': { f: [30] } }))
    expect(verdict.violations).toEqual([{ kind: 'stale', path: 'a.ts', name: 'f', baseline: 30, current: 28 }])
  })

  test('same-named functions pair by descending value, so reordering them is not a change', () => {
    const r = report({ 'a.ts': [fn('visit', 30), fn('visit', 42)] })
    expect(compareToBaseline(r, baseline({ 'a.ts': { visit: [42, 30] } })).ok).toBe(true)
  })

  test('same-named functions: one growing past the other is caught', () => {
    const r = report({ 'a.ts': [fn('visit', 45), fn('visit', 30)] })
    const verdict = compareToBaseline(r, baseline({ 'a.ts': { visit: [42, 40] } }))
    expect(verdict.violations).toEqual([
      { kind: 'grew', path: 'a.ts', name: 'visit', from: 42, to: 45 },
      { kind: 'stale', path: 'a.ts', name: 'visit', baseline: 40, current: 30 },
    ])
  })

  test('functions below the threshold are ignored however they change', () => {
    const r = report({ 'a.ts': [fn('f', 30), fn('g', 25), fn('h', 2)] })
    const verdict = compareToBaseline(r, baseline({ 'a.ts': { f: [30] } }))
    expect(verdict.ok).toBe(true)
  })

  test('the baseline threshold is the one compared against', () => {
    const r = report({ 'a.ts': [fn('f', 30)] })
    const verdict = compareToBaseline(r, baseline({}, 50))
    expect(verdict).toEqual({ ok: true, violations: [], aboveThreshold: 0 })
  })
})

describe('buildBaseline / serializeBaseline', () => {
  test('round-trips through JSON with sorted keys and a trailing newline', () => {
    const r = report({ 'b.ts': [fn('f', 30)], 'a.ts': [fn('g', 26), fn('g', 27)] })
    const text = serializeBaseline(buildBaseline(r, 25, '1.8.0'))
    expect(text.endsWith('\n')).toBe(true)
    const parsed = JSON.parse(text) as ComplexityBaseline
    expect(parsed.cccc).toBe('1.8.0')
    expect(parsed.threshold).toBe(25)
    expect(Object.keys(parsed.files)).toEqual(['a.ts', 'b.ts'])
    expect(parsed.files['a.ts']).toEqual({ g: [27, 26] })
    expect(compareToBaseline(r, parsed).ok).toBe(true)
  })

  test('a regenerated baseline is byte-identical for the same report', () => {
    const r = report({ 'a.ts': [fn('f', 30)] })
    expect(serializeBaseline(buildBaseline(r, 25, '1.8.0'))).toBe(serializeBaseline(buildBaseline(r, 25, '1.8.0')))
  })
})

describe('formatVerdict', () => {
  test('names each violation class with its fix', () => {
    const r = report({ 'a.ts': [fn('f', 31), fn('g', 26)], 'b.ts': [] })
    const verdict = compareToBaseline(r, baseline({ 'a.ts': { f: [30] }, 'b.ts': { h: [40] } }))
    const text = formatVerdict(verdict, 25)
    expect(text).toContain('a.ts f: 30 -> 31')
    expect(text).toContain('a.ts g: 26')
    expect(text).toContain('b.ts h: 40 -> below 25 or gone')
    expect(text).toContain('bun run complexity:baseline')
  })
})

describe('baselineGrowth (the --update guard)', () => {
  test('a renamed hotspot that grew raises its file sum, which name pairing alone cannot see', () => {
    const previous = baseline({ 'a.ts': { foo: [40] } })
    const next = baseline({ 'a.ts': { bar: [60] } })
    expect(compareToBaseline(report({ 'a.ts': [fn('bar', 60)] }), previous).violations.map((v) => v.kind)).toEqual([
      'entered',
      'stale',
    ])
    expect(baselineGrowth(previous, next)).toEqual([{ path: 'a.ts', from: 40, to: 60 }])
  })

  test('one closure leaving the threshold while its sibling grows is still growth when the sum rises', () => {
    const previous = baseline({ 'a.ts': { visit: [40, 30] } })
    expect(baselineGrowth(previous, baseline({ 'a.ts': { visit: [38] } }))).toEqual([])
    expect(baselineGrowth(previous, baseline({ 'a.ts': { visit: [71] } }))).toEqual([{ path: 'a.ts', from: 70, to: 71 }])
  })

  test('a new file above the threshold is growth; a lowered or removed file is not', () => {
    const previous = baseline({ 'a.ts': { f: [30] } })
    expect(baselineGrowth(previous, baseline({ 'a.ts': { f: [30] }, 'b.ts': { g: [26] } }))).toEqual([
      { path: 'b.ts', from: 0, to: 26 },
    ])
    expect(baselineGrowth(previous, baseline({}))).toEqual([])
    expect(baselineGrowth(previous, baseline({ 'a.ts': { f: [28] } }))).toEqual([])
  })

  test('a split that lowers the total is not growth even though it adds names', () => {
    const previous = baseline({ 'a.ts': { big: [100] } })
    expect(baselineGrowth(previous, baseline({ 'a.ts': { a: [30], b: [30], c: [30] } }))).toEqual([])
  })
})

describe('regenerationGrowth (everything --update refuses)', () => {
  test('a function that grew behind a sibling that got simpler by more is still growth', () => {
    const previous = baseline({ 'a.ts': { f: [60], g: [40] } })
    const r = report({ 'a.ts': [fn('f', 61), fn('g', 30)] })
    const next = buildBaseline(r, 25, '1.8.0')
    expect(baselineGrowth(previous, next)).toEqual([])
    expect(regenerationGrowth(r, previous, next)).toEqual({
      functions: [{ kind: 'grew', path: 'a.ts', name: 'f', from: 60, to: 61 }],
      files: [],
    })
  })

  test('a new function above the threshold is growth', () => {
    const previous = baseline({ 'a.ts': { f: [60] } })
    const r = report({ 'a.ts': [fn('f', 60), fn('h', 26)] })
    expect(regenerationGrowth(r, previous, buildBaseline(r, 25, '1.8.0')).functions).toEqual([
      { kind: 'entered', path: 'a.ts', name: 'h', cognitive: 26 },
    ])
  })

  test('a renamed hotspot that grew is caught by the file total even though names do not pair', () => {
    const previous = baseline({ 'a.ts': { foo: [40] } })
    const r = report({ 'a.ts': [fn('bar', 60)] })
    const growth = regenerationGrowth(r, previous, buildBaseline(r, 25, '1.8.0'))
    expect(growth.functions.map((v) => v.kind)).toEqual(['entered'])
    expect(growth.files).toEqual([{ path: 'a.ts', from: 40, to: 60 }])
  })

  test('a plain lowering (stale entries only) is not growth, so regeneration proceeds', () => {
    const previous = baseline({ 'a.ts': { f: [60], g: [40] } })
    const r = report({ 'a.ts': [fn('f', 59), fn('g', 20)] })
    expect(regenerationGrowth(r, previous, buildBaseline(r, 25, '1.8.0'))).toEqual({ functions: [], files: [] })
  })
})

describe('parseCcccVersion', () => {
  test('reads the bare version out of `cccc --version`', () => {
    expect(parseCcccVersion('cccc 1.8.0\n')).toBe('1.8.0')
    expect(parseCcccVersion('something else')).toBeNull()
  })
})
