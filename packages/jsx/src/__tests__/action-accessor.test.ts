/**
 * Unit tests for the shared recognition/gate/seed module (#3166, part B of
 * #3158). `async-action-refusal.ts` (BF117's refusal-lift) and the seed pass
 * (`seedActionAccessorReads`, run from `jsx-to-ir.ts`) both call the same
 * gate, `seedableActionAccessorRead`, so they can never drift apart.
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
  seedableActionAccessorRead,
  ARIA_BOOLEAN_STATE_ATTRS,
} from '../action-accessor.ts'
import { parseExpression } from '../expression-parser.ts'
import type { TemplatePositionRole } from '../template-position-walk.ts'
import type { SignalInfo } from '../types.ts'
import { isAriaBooleanAttr as bladeIsAriaBooleanAttr } from '../../../adapter-blade/src/adapter/boolean-result'
import { isAriaBooleanAttr as erbIsAriaBooleanAttr } from '../../../adapter-erb/src/adapter/boolean-result'
import { isAriaBooleanAttr as jinjaIsAriaBooleanAttr } from '../../../adapter-jinja/src/adapter/boolean-result'
import { isAriaBooleanAttr as mojoIsAriaBooleanAttr } from '../../../adapter-mojolicious/src/adapter/boolean-result'
import { isAriaBooleanAttr as pebbleIsAriaBooleanAttr } from '../../../adapter-pebble/src/adapter/boolean-result'
import { isAriaBooleanAttr as rustIsAriaBooleanAttr } from '../../../adapter-rust/src/adapter/boolean-result'
import { isAriaBooleanAttr as twigIsAriaBooleanAttr } from '../../../adapter-twig/src/adapter/boolean-result'
import { isAriaBooleanAttr as xslateIsAriaBooleanAttr } from '../../../adapter-xslate/src/adapter/boolean-result'

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

describe('seedableActionAccessorRead — the one gate for the BF117 lift and the seed', () => {
  const actions = new Set(['fetchPosts'])
  const at = (source: string, role: TemplatePositionRole, attrName?: string) =>
    seedableActionAccessorRead({ expr: parseExpression(source), role, attrName }, actions)

  test('a condition admits both accessors (truthiness only: false ≡ undefined)', () => {
    expect(at('fetchPosts.isPending()', 'condition')).toEqual({ action: 'fetchPosts', accessor: 'isPending' })
    expect(at('fetchPosts.error()', 'condition')).toEqual({ action: 'fetchPosts', accessor: 'error' })
  })

  test('an ARIA boolean-state element attribute admits isPending() only', () => {
    expect(at('fetchPosts.isPending()', 'element-attr', 'aria-busy')).toEqual({ action: 'fetchPosts', accessor: 'isPending' })
    expect(at('fetchPosts.isPending()', 'element-attr', 'aria-hidden')).not.toBeNull()
    // Hono omits an `undefined` attribute; the `false` seed would render it.
    expect(at('fetchPosts.error()', 'element-attr', 'aria-busy')).toBeNull()
  })

  test('any other attribute refuses — Mojolicious / Xslate render the false literal as 0 there', () => {
    expect(at('fetchPosts.isPending()', 'element-attr', 'aria-label')).toBeNull()
    expect(at('fetchPosts.isPending()', 'element-attr', 'title')).toBeNull()
    expect(at('fetchPosts.isPending()', 'element-attr', 'data-pending')).toBeNull()
    expect(at('fetchPosts.error()', 'element-attr', 'title')).toBeNull()
  })

  test('text, prop, spread, template-part and loop-array positions refuse', () => {
    for (const role of ['text', 'prop', 'spread', 'template-part', 'loop-array'] as const) {
      expect(at('fetchPosts.isPending()', role, role === 'prop' ? 'aria-busy' : undefined)).toBeNull()
      expect(at('fetchPosts.error()', role)).toBeNull()
    }
  })

  test('an unrecognised or compound read is never admitted, whatever the position', () => {
    expect(at('other.isPending()', 'condition')).toBeNull()
    expect(at('!fetchPosts.isPending()', 'condition')).toBeNull()
    expect(at('other.isPending()', 'element-attr', 'aria-busy')).toBeNull()
  })
})

describe('ARIA_BOOLEAN_STATE_ATTRS agrees with every DSL adapter', () => {
  // The seed renders `aria-x={false}` as `aria-x="false"` (Hono's output) only
  // where the adapter stringifies a boolean JS-style; outside its own
  // `isAriaBooleanAttr` set, Mojolicious / Xslate render the literal as `0`.
  // Go renders `{{false}}` as `false` on every attribute, so it has no set.
  const adapters: Array<[string, (name: string) => boolean]> = [
    ['blade', bladeIsAriaBooleanAttr],
    ['erb', erbIsAriaBooleanAttr],
    ['jinja', jinjaIsAriaBooleanAttr],
    ['mojolicious', mojoIsAriaBooleanAttr],
    ['pebble', pebbleIsAriaBooleanAttr],
    ['rust', rustIsAriaBooleanAttr],
    ['twig', twigIsAriaBooleanAttr],
    ['xslate', xslateIsAriaBooleanAttr],
  ]
  for (const [adapter, isAriaBooleanAttr] of adapters) {
    test(`${adapter} stringifies every gated attribute as a boolean`, () => {
      expect([...ARIA_BOOLEAN_STATE_ATTRS].filter((name) => !isAriaBooleanAttr(name))).toEqual([])
    })
  }
})
