/**
 * Unit tests for the shared recognition/seed module (#3166, part B of #3158)
 * that `async-action-refusal.ts` (BF117's refusal-lift) and `jsx-to-ir.ts`
 * (the IR-time seed substitution) both read, so they can never drift apart.
 * Cross-adapter output and end-to-end compiler behaviour are covered by
 * `create-query.test.ts` and the `create-query-action-read` conformance
 * fixture; this file pins the module's own contract in isolation.
 */

import { describe, test, expect } from 'bun:test'
import {
  matchActionAccessorCall,
  actionAccessorSeedParsed,
  actionAccessorSeedText,
  collectActionNames,
} from '../action-accessor.ts'
import { parseExpression } from '../expression-parser.ts'
import type { SignalInfo } from '../types.ts'

function factorySignal(action: string): Pick<SignalInfo, 'factory'> {
  return { factory: { kind: 'query', callee: 'createQuery', argsText: '', argsFreeIdentifiers: new Set(), action } }
}

describe('collectActionNames', () => {
  test('collects only signals with a recognised factory action', () => {
    const actions = collectActionNames([factorySignal('fetchPosts'), {}, factorySignal('fetchUsers')])
    expect([...actions].sort()).toEqual(['fetchPosts', 'fetchUsers'])
  })

  test('empty for a component with no async factory', () => {
    expect(collectActionNames([{}, {}]).size).toBe(0)
  })
})

describe('matchActionAccessorCall', () => {
  const actions = new Set(['fetchPosts'])

  test('matches a direct isPending()/error() call on a recognised action', () => {
    expect(matchActionAccessorCall(parseExpression('fetchPosts.isPending()'), actions))
      .toEqual({ action: 'fetchPosts', accessor: 'isPending' })
    expect(matchActionAccessorCall(parseExpression('fetchPosts.error()'), actions))
      .toEqual({ action: 'fetchPosts', accessor: 'error' })
  })

  test('rejects an unrecognised object, even with the same accessor name', () => {
    expect(matchActionAccessorCall(parseExpression('otherThing.isPending()'), actions)).toBeNull()
  })

  test('rejects an accessor name the action does not carry', () => {
    expect(matchActionAccessorCall(parseExpression('fetchPosts.refetch()'), actions)).toBeNull()
  })

  test('rejects a call with arguments — the real accessors take none', () => {
    expect(matchActionAccessorCall(parseExpression('fetchPosts.isPending(true)'), actions)).toBeNull()
  })

  test('rejects the uncalled member access — only the CALL is a seeded value', () => {
    expect(matchActionAccessorCall(parseExpression('fetchPosts.isPending'), actions)).toBeNull()
  })

  test('rejects a computed member access', () => {
    expect(matchActionAccessorCall(parseExpression("fetchPosts['isPending']()"), actions)).toBeNull()
  })

  test('rejects a compound expression — only the WHOLE expression matches', () => {
    expect(matchActionAccessorCall(parseExpression('!fetchPosts.isPending()'), actions)).toBeNull()
    expect(matchActionAccessorCall(parseExpression('fetchPosts.isPending() && x'), actions)).toBeNull()
  })

  test('empty actions set matches nothing', () => {
    expect(matchActionAccessorCall(parseExpression('fetchPosts.isPending()'), new Set())).toBeNull()
  })
})

describe('seeds (spec/async.md §7.3)', () => {
  test('actionAccessorSeedParsed is the boolean literal false for both accessors', () => {
    expect(actionAccessorSeedParsed('isPending')).toEqual({ kind: 'literal', value: false, literalType: 'boolean' })
    expect(actionAccessorSeedParsed('error')).toEqual({ kind: 'literal', value: false, literalType: 'boolean' })
  })

  test('actionAccessorSeedText is JS source text: false / undefined', () => {
    expect(actionAccessorSeedText('isPending')).toBe('false')
    expect(actionAccessorSeedText('error')).toBe('undefined')
  })
})
