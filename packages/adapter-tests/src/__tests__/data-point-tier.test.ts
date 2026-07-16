/**
 * PR-vs-nightly data-point tiering (#2278). Pins the deterministic
 * generated-point sampler the PR tier uses — the full matrix runs in the
 * nightly `schedule` workflow, so the sample must be stable (reproducible
 * failures) and spread (both ends + middle, not just the first few).
 */

import { describe, test, expect } from 'bun:test'
import { sampleGeneratedPoints } from '../data-point-conformance'
import type { JSXDataPoint } from '../types'

const pts = (...names: string[]): JSXDataPoint[] => names.map(name => ({ name, props: {} }))

describe('sampleGeneratedPoints (#2278)', () => {
  test('returns the input unchanged when at or below the cap', () => {
    const three = pts('a', 'b', 'c')
    expect(sampleGeneratedPoints(three, 3).map(p => p.name)).toEqual(['a', 'b', 'c'])
    expect(sampleGeneratedPoints(pts('a'), 3).map(p => p.name)).toEqual(['a'])
    expect(sampleGeneratedPoints([], 3)).toEqual([])
  })

  test('caps a longer list to exactly `cap` points', () => {
    expect(sampleGeneratedPoints(pts('a', 'b', 'c', 'd', 'e', 'f', 'g', 'h'), 3)).toHaveLength(3)
  })

  test('spreads the sample across the list (not just the first N)', () => {
    // 8 points, cap 3 → indices floor(0), floor(8/3), floor(16/3) = 0, 2, 5.
    const sampled = sampleGeneratedPoints(pts('p0', 'p1', 'p2', 'p3', 'p4', 'p5', 'p6', 'p7'), 3)
    expect(sampled.map(p => p.name)).toEqual(['p0', 'p2', 'p5'])
  })

  test('is deterministic — identical input yields identical output', () => {
    const input = pts('a', 'b', 'c', 'd', 'e', 'f', 'g')
    expect(sampleGeneratedPoints(input, 3)).toEqual(sampleGeneratedPoints(input, 3))
  })

  test('always keeps the first point (the boundary case regressions cluster on)', () => {
    expect(sampleGeneratedPoints(pts('first', 'x', 'y', 'z', 'w'), 3)[0].name).toBe('first')
  })
})
