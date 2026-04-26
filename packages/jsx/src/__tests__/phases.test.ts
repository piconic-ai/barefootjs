/**
 * Registry-validation tests for `PHASES` in `phases.ts`.
 *
 * Catches drift in the dependsOn graph at compile / test time so a broken
 * cross-phase contract surfaces here before it becomes a silent emission
 * order bug. Pairs with the runtime `runPhases` cycle / unknown-id check.
 */

import { describe, test, expect } from 'bun:test'
import { PHASES } from '../ir-to-client-js/phases'

describe('PHASES registry', () => {
  test('every dependsOn id refers to an existing phase', () => {
    const knownIds = new Set(PHASES.map(p => p.id))
    for (const phase of PHASES) {
      for (const dep of phase.dependsOn) {
        expect(knownIds.has(dep)).toBe(true)
      }
    }
  })

  test('phase ids are unique', () => {
    const seen = new Set<string>()
    for (const phase of PHASES) {
      expect(seen.has(phase.id)).toBe(false)
      seen.add(phase.id)
    }
  })

  test('dependency graph is acyclic (topological order exists)', () => {
    // Run a virtual sort: pick phases whose deps are satisfied; loop until
    // empty or stuck. Stuck → cycle.
    const emitted = new Set<string>()
    const remaining = PHASES.slice()
    while (remaining.length > 0) {
      const idx = remaining.findIndex(p => p.dependsOn.every(d => emitted.has(d)))
      expect(idx).toBeGreaterThanOrEqual(0)
      const phase = remaining.splice(idx, 1)[0]
      emitted.add(phase.id)
    }
  })

  test('the load-bearing constraint loop-updates → provider-and-child-inits is recorded', () => {
    // Encoded directly in the registry rather than as a code comment, so
    // re-ordering can't silently break the runtime contract that parent
    // components must call provideContext() before loop children call
    // useContext().
    const loop = PHASES.find(p => p.id === 'loop-updates')
    expect(loop).toBeDefined()
    expect(loop!.dependsOn).toContain('provider-and-child-inits')
  })
})
