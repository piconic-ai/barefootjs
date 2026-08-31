/**
 * Constrained t=2 covering array over the `axes.ts` grammar (#2481 step 5).
 *
 * A greedy one-case-at-a-time construction, not IPOG: five axes with ≤12
 * values each is small enough that the simpler algorithm covers every
 * valid pair in roughly the same case count, and it is far easier to
 * review than a general covering-array solver. Each step picks the single
 * uncovered pair that comes FIRST in `uncovered`'s iteration order — plain
 * insertion order (axis-pair order × `AXIS_VALUES` order), not "most
 * constrained first" — seeds a candidate tuple around it, and greedily
 * fills the other three axes with whichever valid value covers the most
 * STILL-uncovered pairs.
 *
 * Deterministic: every random-like choice is seeded from a fixed
 * constant plus the running case index via `seedFromId`/mulberry32 (the
 * same #1494 discipline `snapshot-generator.ts`'s `withSeededMathRandom`
 * already follows) — never `Math.random()`/`Date.now()` — so two runs
 * produce byte-identical tuples and a failure reproduces.
 */

import { seedFromId } from '../src/snapshot-generator'
import type { AxisCombo, AxisName } from './axes'
import { AXIS_NAMES, AXIS_VALUES, isLoopStructure } from './axes'

const SEED_NAMESPACE = 'pairwise-covering-array-v1'

/** mulberry32, seeded once per case index via `seedFromId` — see the module docstring. */
function makeRng(caseIndex: number): () => number {
  let state = seedFromId(`${SEED_NAMESPACE}::${caseIndex}`) >>> 0
  return () => {
    state = (state + 0x6d2b79f5) >>> 0
    let t = state
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

function pickDeterministic<T>(values: readonly T[], rng: () => number): T {
  return values[Math.floor(rng() * values.length) % values.length]
}

// =============================================================================
// Constraint table
// =============================================================================

/**
 * `(axisA, valueA)` is incompatible with `(axisB, valueB)` whenever a
 * predicate over the OTHER axis's chosen value says so. Encoded as a
 * function per constrained value (rather than a static pair table) where
 * the condition depends on a structural property (`isLoopStructure`)
 * instead of an exact value match — a literal pair table would need one
 * row per loop-structure value for each of these, which is the same rule
 * spelled out eight times.
 */
interface Constraint {
  axis: AxisName
  /** The value on `axis` this constraint applies to. */
  value: string
  /** Why this value requires/forbids something about `combo`, given the OTHER axes chosen so far (may be partial). */
  reason: string
  isSatisfiedBy(combo: Readonly<Partial<AxisCombo>>): boolean
}

const CONSTRAINTS: readonly Constraint[] = [
  {
    axis: 'event',
    value: 'handler-reading-loop-param',
    reason: 'reads the .map() row/index param, which only exists inside a loop structure',
    isSatisfiedBy: combo => combo.structure === undefined || isLoopStructure(combo.structure),
  },
  {
    axis: 'event',
    value: 'delegated-handler-in-row',
    reason: 'delegation only means something for a handler attached inside a per-row loop template',
    isSatisfiedBy: combo => combo.structure === undefined || isLoopStructure(combo.structure),
  },
  {
    axis: 'callback',
    value: 'sort-comparator',
    reason: 'decorates the array-source expression a loop iterates; meaningless without a loop',
    isSatisfiedBy: combo => combo.structure === undefined || isLoopStructure(combo.structure),
  },
  {
    axis: 'callback',
    value: 'filter-predicate',
    reason: 'decorates the array-source expression a loop iterates; meaningless without a loop',
    isSatisfiedBy: combo => combo.structure === undefined || isLoopStructure(combo.structure),
  },
  {
    axis: 'callback',
    value: 'flatmap-callback',
    reason: 'decorates the array-source expression a loop iterates; meaningless without a loop',
    isSatisfiedBy: combo => combo.structure === undefined || isLoopStructure(combo.structure),
  },
  {
    axis: 'binding',
    value: 'controlled-input',
    reason: 'a controlled element writes back through a setter; `prop` state has none',
    isSatisfiedBy: combo => combo.state === undefined || combo.state !== 'prop',
  },
  {
    axis: 'binding',
    value: 'controlled-select',
    reason: 'a controlled element writes back through a setter; `prop` state has none',
    isSatisfiedBy: combo => combo.state === undefined || combo.state !== 'prop',
  },
  {
    axis: 'binding',
    value: 'controlled-textarea',
    reason: 'a controlled element writes back through a setter; `prop` state has none',
    isSatisfiedBy: combo => combo.state === undefined || combo.state !== 'prop',
  },
]

/** Whether a (possibly partial) combo violates any known constraint. Partial combos are checked only against constraints whose OWN axis is already set — a not-yet-chosen axis can't yet be in violation. */
export function isValidCombo(combo: Readonly<Partial<AxisCombo>>): boolean {
  for (const c of CONSTRAINTS) {
    if (combo[c.axis] !== c.value) continue
    if (!c.isSatisfiedBy(combo)) return false
  }
  return true
}

/** Full-tuple assertion used once a combo is complete — narrows the return type for callers that already know every axis is set. */
export function assertValidCombo(combo: AxisCombo): AxisCombo {
  if (!isValidCombo(combo)) {
    throw new Error(`pairwise covering-array: generated an invalid combo ${JSON.stringify(combo)}`)
  }
  return combo
}

// =============================================================================
// Pair enumeration
// =============================================================================

interface AxisPair {
  a: AxisName
  b: AxisName
}

/** Every unordered pair of the five axis names, in a fixed order (10 pairs). */
function allAxisPairs(): AxisPair[] {
  const pairs: AxisPair[] = []
  for (let i = 0; i < AXIS_NAMES.length; i++) {
    for (let j = i + 1; j < AXIS_NAMES.length; j++) {
      pairs.push({ a: AXIS_NAMES[i], b: AXIS_NAMES[j] })
    }
  }
  return pairs
}

function pairKey(pair: AxisPair, valueA: string, valueB: string): string {
  return `${pair.a}=${valueA}&${pair.b}=${valueB}`
}

/** Every VALID (axisA=valueA, axisB=valueB) pair, keyed by `pairKey`, for one `AxisPair`. */
function validValuePairs(pair: AxisPair): Array<{ valueA: string; valueB: string }> {
  const out: Array<{ valueA: string; valueB: string }> = []
  for (const valueA of AXIS_VALUES[pair.a]) {
    for (const valueB of AXIS_VALUES[pair.b]) {
      const partial = { [pair.a]: valueA, [pair.b]: valueB } as Partial<AxisCombo>
      if (isValidCombo(partial)) out.push({ valueA, valueB })
    }
  }
  return out
}

// =============================================================================
// Greedy construction
// =============================================================================

export interface CoveringArrayResult {
  cases: AxisCombo[]
  /** Total valid (axis, value) pairs across all 10 axis-pairs — the t=2 coverage denominator. */
  totalValidPairs: number
}

/**
 * Greedily fills in every axis NOT already set in `seed`, maximizing
 * `scoreFn` at each step, honoring constraints throughout. Shared by the
 * t=2 floor (`buildCoveringArray`, scored on newly-covered pairs) and the
 * t=3 promotion (`buildVariableStrengthArray`, scored on newly-covered
 * triples) — the fill strategy is identical, only what's being maximized
 * differs.
 */
function completeComboGreedy(
  seed: Partial<AxisCombo>,
  rng: () => number,
  scoreFn: (combo: AxisCombo) => number,
): AxisCombo {
  const combo: Partial<AxisCombo> = { ...seed }
  const remainingAxes = AXIS_NAMES.filter(a => combo[a] === undefined)
  for (const axis of remainingAxes) {
    let bestValues: string[] = []
    let bestScore = -1
    for (const value of AXIS_VALUES[axis]) {
      const candidate = { ...combo, [axis]: value } as Partial<AxisCombo>
      if (!isValidCombo(candidate)) continue
      const score = scoreFn(candidate as AxisCombo)
      if (score > bestScore) {
        bestScore = score
        bestValues = [value]
      } else if (score === bestScore) {
        bestValues.push(value)
      }
    }
    // `bestValues` is never empty: every axis has at least one value
    // with no constraint pointed at it from any OTHER axis (`state`,
    // `structure`, `event`'s two non-loop-only values, `callback`'s two
    // non-array-decoration values are all unconstrained), so some value
    // always keeps `candidate` valid regardless of what's chosen so far.
    combo[axis] = pickDeterministic(bestValues, rng) as never
  }
  return combo as AxisCombo
}

/**
 * Drives the greedy set-cover: repeatedly takes the FIRST still-uncovered
 * target in `uncovered` (plain `Map` insertion order — see the module
 * docstring), completes a combo around its seed via `completeComboGreedy`,
 * and lets `markFn` remove whatever that combo covered. Shared by the t=2
 * floor and the t=3 promotion — same driver loop, parameterized by what
 * "covered" means (`scoreFn`/`markFn` close over the caller's own
 * `uncovered` map and target arity).
 */
function buildGreedyCoveringCases(
  uncovered: Map<string, Partial<AxisCombo>>,
  scoreFn: (combo: AxisCombo) => number,
  markFn: (combo: Readonly<AxisCombo>) => void,
  startCaseIndex: number,
): AxisCombo[] {
  const cases: AxisCombo[] = []
  let caseIndex = startCaseIndex
  while (uncovered.size > 0) {
    const [, seed] = uncovered.entries().next().value as [string, Partial<AxisCombo>]
    const rng = makeRng(caseIndex)
    const combo = assertValidCombo(completeComboGreedy(seed, rng, scoreFn))
    cases.push(combo)
    markFn(combo)
    caseIndex++
  }
  return cases
}

/**
 * Builds the case list. Every uncovered valid pair is targeted by SOME
 * case (the coverage floor `pairwise-covering-array.test.ts` asserts
 * mechanically); no invalid pair is ever placed in a case (enforced by
 * construction, not by post-filtering — every candidate value considered
 * at every step is checked against `isValidCombo` first).
 */
export function buildCoveringArray(): CoveringArrayResult {
  const axisPairs = allAxisPairs()
  // Deterministic iteration order: `Map` preserves insertion order, and
  // entries are populated in a fixed order below (axis-pair order ×
  // AXIS_VALUES order), so `buildGreedyCoveringCases` visits pairs in the
  // same sequence every time.
  const uncovered = new Map<string, Partial<AxisCombo>>()
  let totalValidPairs = 0
  for (const pair of axisPairs) {
    for (const { valueA, valueB } of validValuePairs(pair)) {
      uncovered.set(pairKey(pair, valueA, valueB), { [pair.a]: valueA, [pair.b]: valueB } as Partial<AxisCombo>)
      totalValidPairs++
    }
  }

  function countNewlyCoveredPairs(combo: Readonly<AxisCombo>): number {
    let n = 0
    for (const pair of axisPairs) {
      if (uncovered.has(pairKey(pair, combo[pair.a], combo[pair.b]))) n++
    }
    return n
  }

  function markCovered(combo: Readonly<AxisCombo>): void {
    for (const pair of axisPairs) {
      uncovered.delete(pairKey(pair, combo[pair.a], combo[pair.b]))
    }
  }

  const cases = buildGreedyCoveringCases(uncovered, countNewlyCoveredPairs, markCovered, 0)

  return { cases, totalValidPairs }
}

// =============================================================================
// Variable-strength promotion: t=3 over the fragile axis subset (#2481 step 6)
// =============================================================================

/**
 * #2481's "Fragile axes: variable-strength coverage" subset F — the
 * tracker-history clusters overwhelmingly on loop structure, event
 * delegation/param resolution, and callback-shape lowering. Every
 * axis-TRIPLE with ≥2 members in F is promoted from t=2 to t=3 (every
 * valid VALUE-triple covered by some case, not just every pair) — see
 * `promotedTriples()`.
 */
const FRAGILE_AXES: ReadonlySet<AxisName> = new Set(['structure', 'event', 'callback'])

interface AxisTriple {
  a: AxisName
  b: AxisName
  c: AxisName
}

/** The 7 (of 10 total) axis-triples with ≥2 members in `FRAGILE_AXES`. */
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

function tripleKey(triple: AxisTriple, valueA: string, valueB: string, valueC: string): string {
  return `${triple.a}=${valueA}&${triple.b}=${valueB}&${triple.c}=${valueC}`
}

/** Every VALID (axisA=valueA, axisB=valueB, axisC=valueC) triple for one `AxisTriple`. */
function validValueTriples(triple: AxisTriple): Array<{ valueA: string; valueB: string; valueC: string }> {
  const out: Array<{ valueA: string; valueB: string; valueC: string }> = []
  for (const valueA of AXIS_VALUES[triple.a]) {
    for (const valueB of AXIS_VALUES[triple.b]) {
      for (const valueC of AXIS_VALUES[triple.c]) {
        const partial = { [triple.a]: valueA, [triple.b]: valueB, [triple.c]: valueC } as Partial<AxisCombo>
        if (isValidCombo(partial)) out.push({ valueA, valueB, valueC })
      }
    }
  }
  return out
}

export interface VariableStrengthResult extends CoveringArrayResult {
  /** The unmodified t=2 floor — same cases, same ids, same order as `buildCoveringArray()`. */
  floorCases: AxisCombo[]
  /** Cases appended beyond the t=2 floor purely to reach t=3 coverage on the fragile subset. */
  additionalCases: AxisCombo[]
}

/**
 * Extends `buildCoveringArray()`'s t=2 floor with additional cases so every
 * valid value-triple on the 7 fragile axis-triples is also covered (#2481
 * step 6). The floor's own cases are NEVER regenerated, reordered, or
 * otherwise disturbed here — `pairwise-quarantine.ts` keys its triage
 * entries on exact case id, so touching the floor would silently orphan
 * that whole ledger. Only new cases are appended, continuing the floor's
 * case-index sequence so seeds (and therefore case ids) stay deterministic.
 *
 * Wired into `scripts/pairwise-generate.ts`'s default output, which feeds
 * the nightly `test:pairwise` browser-oracle job directly (see
 * `packages/adapter-tests/package.json`) — only after `additionalCases`
 * went through the SAME real-diff triage discipline `pairwise-quarantine.ts`'s
 * history required for the t=2 floor (see that file's "#2481 t=3 sweep"
 * section), so the nightly job doesn't run untriaged cases unattended.
 */
export function buildVariableStrengthArray(): VariableStrengthResult {
  const floor = buildCoveringArray()
  const triples = promotedTriples()

  const uncovered = new Map<string, Partial<AxisCombo>>()
  for (const triple of triples) {
    for (const { valueA, valueB, valueC } of validValueTriples(triple)) {
      uncovered.set(tripleKey(triple, valueA, valueB, valueC), {
        [triple.a]: valueA,
        [triple.b]: valueB,
        [triple.c]: valueC,
      } as Partial<AxisCombo>)
    }
  }

  function markCoveredByCombo(combo: Readonly<AxisCombo>): void {
    for (const triple of triples) {
      uncovered.delete(tripleKey(triple, combo[triple.a], combo[triple.b], combo[triple.c]))
    }
  }

  for (const combo of floor.cases) markCoveredByCombo(combo)

  function countNewlyCoveredTriples(combo: Readonly<AxisCombo>): number {
    let n = 0
    for (const triple of triples) {
      if (uncovered.has(tripleKey(triple, combo[triple.a], combo[triple.b], combo[triple.c]))) n++
    }
    return n
  }

  const additionalCases = buildGreedyCoveringCases(uncovered, countNewlyCoveredTriples, markCoveredByCombo, floor.cases.length)

  return {
    cases: [...floor.cases, ...additionalCases],
    floorCases: floor.cases,
    additionalCases,
    totalValidPairs: floor.totalValidPairs,
  }
}
