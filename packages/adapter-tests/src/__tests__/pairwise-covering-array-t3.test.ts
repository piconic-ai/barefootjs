import { describe, test, expect } from 'bun:test'
import { AXIS_NAMES, AXIS_VALUES, type AxisCombo, type AxisName } from '../../pairwise/axes'
import { buildCoveringArray, buildVariableStrengthArray, isValidCombo } from '../../pairwise/covering-array'

/**
 * Contract test for the t=3 variable-strength promotion (#2481 step 6).
 * Mirrors `pairwise-covering-array.test.ts`'s t=2 contract test in shape and
 * rigor — the coverage guarantee is worthless unless it's asserted
 * mechanically, not assumed from reading the greedy construction.
 *
 * `FRAGILE_AXES`/`promotedTriples()` are internal to `covering-array.ts`
 * (not exported — nothing outside that module needs the raw triple list),
 * so this test recomputes the same 7-triple set from the same public
 * `FRAGILE_AXES` definition the issue names, keeping the two independent
 * enough that a typo in one wouldn't silently validate itself against the
 * other.
 */

const FRAGILE_AXES: ReadonlySet<AxisName> = new Set(['structure', 'event', 'callback'])

interface AxisTriple {
  a: AxisName
  b: AxisName
  c: AxisName
}

function promotedTriples(): AxisTriple[] {
  const triples: AxisTriple[] = []
  for (let i = 0; i < AXIS_NAMES.length; i++) {
    for (let j = i + 1; j < AXIS_NAMES.length; j++) {
      for (let k = j + 1; k < AXIS_NAMES.length; k++) {
        const [a, b, c] = [AXIS_NAMES[i], AXIS_NAMES[j], AXIS_NAMES[k]]
        const fragileCount = [a, b, c].filter(axis => FRAGILE_AXES.has(axis)).length
        if (fragileCount >= 2) triples.push({ a, b, c })
      }
    }
  }
  return triples
}

describe('pairwise variable-strength array — t=3 floor over the fragile subset (#2481 step 6)', () => {
  test('exactly 7 of the 10 axis-triples qualify for promotion (≥2 members in {structure, event, callback})', () => {
    expect(promotedTriples().length).toBe(7)
  })

  test('every VALID value-triple on a promoted axis-triple is covered by at least one generated case', () => {
    const { cases } = buildVariableStrengthArray()
    const triples = promotedTriples()
    const covered = new Set<string>()
    for (const combo of cases) {
      for (const t of triples) {
        covered.add(`${t.a}=${combo[t.a]}&${t.b}=${combo[t.b]}&${t.c}=${combo[t.c]}`)
      }
    }

    const missing: string[] = []
    for (const t of triples) {
      for (const valueA of AXIS_VALUES[t.a]) {
        for (const valueB of AXIS_VALUES[t.b]) {
          for (const valueC of AXIS_VALUES[t.c]) {
            const partial = { [t.a]: valueA, [t.b]: valueB, [t.c]: valueC } as Partial<AxisCombo>
            if (!isValidCombo(partial)) continue
            const key = `${t.a}=${valueA}&${t.b}=${valueB}&${t.c}=${valueC}`
            if (!covered.has(key)) missing.push(key)
          }
        }
      }
    }

    expect(missing).toEqual([])
  })

  test('the t=2 floor is preserved byte-for-byte as a prefix — no floor case is regenerated, reordered, or dropped', () => {
    const floor = buildCoveringArray()
    const { floorCases, cases } = buildVariableStrengthArray()
    expect(JSON.stringify(floorCases)).toBe(JSON.stringify(floor.cases))
    expect(JSON.stringify(cases.slice(0, floor.cases.length))).toBe(JSON.stringify(floor.cases))
  })

  test('no generated case (floor or additional) contains an invalid combo', () => {
    const { cases } = buildVariableStrengthArray()
    for (const combo of cases) {
      expect(isValidCombo(combo)).toBe(true)
    }
  })

  test('no two cases in the combined array are combo-identical', () => {
    const { cases } = buildVariableStrengthArray()
    const seen = new Set<string>()
    const dupes: string[] = []
    for (const combo of cases) {
      const key = JSON.stringify(combo)
      if (seen.has(key)) dupes.push(key)
      seen.add(key)
    }
    expect(dupes).toEqual([])
  })

  test('two generations with the same seed produce byte-identical case tuples', () => {
    const first = buildVariableStrengthArray()
    const second = buildVariableStrengthArray()
    expect(JSON.stringify(second.cases)).toBe(JSON.stringify(first.cases))
  })

  /**
   * A real measurement, not the issue's own pre-hoc guess: #2481 estimated
   * "+150–250 cases" for this promotion before any implementation existed.
   * The actual greedy construction (seeded on one of 1849 valid triples per
   * new case, filling the other two axes to maximize newly-covered triples)
   * needs more — see this describe block's own history for why the bound
   * moved. Asserting a measured range (not the original guess) so a future
   * axis-grammar change that swings the count wildly still gets caught,
   * without pretending the pre-implementation estimate was ever load-bearing.
   */
  test('additional-case count is in the expected ~300-420 range for this grammar', () => {
    const { additionalCases } = buildVariableStrengthArray()
    expect(additionalCases.length).toBeGreaterThanOrEqual(300)
    expect(additionalCases.length).toBeLessThanOrEqual(420)
  })
})
