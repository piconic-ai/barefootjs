import { describe, test, expect } from 'bun:test'
import ts from 'typescript'
import { AXIS_NAMES, AXIS_VALUES, type AxisCombo, type AxisName } from '../../pairwise/axes'
import { buildCoveringArray, isValidCombo } from '../../pairwise/covering-array'
import { assertNoMarkers, composeCase } from '../../pairwise/compose'

/**
 * The pairwise generator's contract test (#2481 step 5). This is the PR's
 * real deliverable — see CLAUDE.md's "a subset extension merges only with
 * fixtures in the same PR" precedent, applied here to a test-generation
 * tool: the coverage guarantee is worthless unless it's asserted
 * mechanically, not assumed from reading the greedy construction.
 */

function allAxisPairs(): Array<{ a: AxisName; b: AxisName }> {
  const pairs: Array<{ a: AxisName; b: AxisName }> = []
  for (let i = 0; i < AXIS_NAMES.length; i++) {
    for (let j = i + 1; j < AXIS_NAMES.length; j++) {
      pairs.push({ a: AXIS_NAMES[i], b: AXIS_NAMES[j] })
    }
  }
  return pairs
}

describe('pairwise covering array — coverage floor (#2481 t=2)', () => {
  test('every VALID pair of axis values is covered by at least one generated case', () => {
    const { cases, totalValidPairs } = buildCoveringArray()
    const covered = new Set<string>()
    for (const combo of cases) {
      for (const { a, b } of allAxisPairs()) {
        covered.add(`${a}=${combo[a]}&${b}=${combo[b]}`)
      }
    }

    const missing: string[] = []
    for (const { a, b } of allAxisPairs()) {
      for (const valueA of AXIS_VALUES[a]) {
        for (const valueB of AXIS_VALUES[b]) {
          const partial = { [a]: valueA, [b]: valueB } as Partial<AxisCombo>
          if (!isValidCombo(partial)) continue
          const key = `${a}=${valueA}&${b}=${valueB}`
          if (!covered.has(key)) missing.push(key)
        }
      }
    }

    expect(missing).toEqual([])
    expect(covered.size).toBe(totalValidPairs)
  })

  test('no generated case contains an invalid pair', () => {
    const { cases } = buildCoveringArray()
    for (const combo of cases) {
      expect(isValidCombo(combo)).toBe(true)
    }
  })

  test('case count is in the expected ~100-130 range for this grammar', () => {
    const { cases } = buildCoveringArray()
    expect(cases.length).toBeGreaterThanOrEqual(80)
    expect(cases.length).toBeLessThanOrEqual(150)
  })

  test('two generations with the same seed produce byte-identical case tuples', () => {
    const first = buildCoveringArray()
    const second = buildCoveringArray()
    expect(JSON.stringify(second.cases)).toBe(JSON.stringify(first.cases))
  })
})

describe('pairwise covering array — declared constraints', () => {
  test('event values requiring a loop are never paired with a non-loop structure', () => {
    const { cases } = buildCoveringArray()
    for (const combo of cases) {
      if (combo.event === 'handler-reading-loop-param' || combo.event === 'delegated-handler-in-row') {
        expect(['keyed-loop', 'unkeyed-loop', 'static-array-loop', 'signal-array-loop', 'nested-loop-depth-2', 'component-row-root-loop', 'fragment-row-loop', 'preamble-builder-body']).toContain(
          combo.structure,
        )
      }
    }
  })

  test('array-decoration callback values are never paired with a non-loop structure', () => {
    const { cases } = buildCoveringArray()
    for (const combo of cases) {
      if (combo.callback === 'sort-comparator' || combo.callback === 'filter-predicate' || combo.callback === 'flatmap-callback') {
        expect(['keyed-loop', 'unkeyed-loop', 'static-array-loop', 'signal-array-loop', 'nested-loop-depth-2', 'component-row-root-loop', 'fragment-row-loop', 'preamble-builder-body']).toContain(
          combo.structure,
        )
      }
    }
  })

  test('controlled bindings are never paired with the unsettable `prop` state', () => {
    const { cases } = buildCoveringArray()
    for (const combo of cases) {
      if (combo.binding === 'controlled-input' || combo.binding === 'controlled-select' || combo.binding === 'controlled-textarea') {
        expect(combo.state).not.toBe('prop')
      }
    }
  })
})

describe('pairwise compose — marker substitution', () => {
  test('throws when a marker identifier is used by a template with no substitute supplied', () => {
    // Exercises the same failure `substituteMarkers` guards against, from
    // the public surface: `composeCase` must never emit a case with a
    // marker still in it (this would happen if a future structure
    // template referenced e.g. `__source` without composeCase supplying
    // one — reproduced directly here rather than mutating internal state).
    const factory = ts.factory
    const marker = factory.createIdentifier('__rowContent')
    expect(() => assertNoMarkers(marker)).toThrow(/marker identifier/)
  })

  test('assertNoMarkers accepts a tree with no marker identifiers', () => {
    const factory = ts.factory
    const clean = factory.createIdentifier('totallyFine')
    expect(() => assertNoMarkers(clean)).not.toThrow()
  })

  test('assertNoMarkers finds a leaked marker nested inside a larger tree', () => {
    const factory = ts.factory
    const leaked = factory.createCallExpression(factory.createIdentifier('doStuff'), undefined, [factory.createIdentifier('__eventAttrs')])
    expect(() => assertNoMarkers(leaked)).toThrow(/__eventAttrs/)
  })
})

describe('pairwise compose — composition smoke', () => {
  test('every generated case parses as valid TSX with no syntactic diagnostics', () => {
    const { cases } = buildCoveringArray()
    for (const combo of cases) {
      const composed = composeCase(combo)
      const sourceFile = ts.createSourceFile(`${combo.state}-${combo.structure}.tsx`, composed.source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX)
      const diagnostics = (sourceFile as unknown as { parseDiagnostics?: readonly ts.Diagnostic[] }).parseDiagnostics ?? []
      expect({ combo, diagnostics: diagnostics.map(d => ts.flattenDiagnosticMessageText(d.messageText, ' ')) }).toEqual({ combo, diagnostics: [] })
    }
  })

  test('every generated case declares the component name it reports and stays marker-free', () => {
    const { cases } = buildCoveringArray()
    for (const combo of cases) {
      const composed = composeCase(combo)
      expect(composed.source).toContain(`function ${composed.componentName}`)
      expect(composed.source).not.toMatch(/__source\b|__rowContent\b|__eventAttrs\b|__condition\b/)
    }
  })
})
