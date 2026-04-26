/**
 * Unit tests for the AST-based prop-access detector
 * (`ir-to-client-js/walk-prop-accesses.ts`).
 *
 * Documents the patterns the detector catches that the pre-C1 regex
 * pair silently missed — most notably optional-chaining property access
 * (`props?.foo`) and computed access through arbitrary expressions.
 */

import { describe, test, expect } from 'bun:test'
import { collectPropAccesses } from '../ir-to-client-js/walk-prop-accesses'

describe('collectPropAccesses', () => {
  const propNames = new Set(['props', 'user'])

  test('plain `props.foo` records property access', () => {
    const out = new Map<string, Set<'property' | 'index'>>()
    collectPropAccesses('props.name', propNames, out)
    expect(out.get('props')?.has('property')).toBe(true)
  })

  test('optional-chaining `props?.foo` records property access (C1 regression guard)', () => {
    // Pre-C1 the detector regex `\\b<name>\\.[a-zA-Z_]` failed to match
    // because the `?` between the identifier and the dot broke the
    // direct-dot match. The AST walk treats both PropertyAccessExpression
    // forms identically.
    const out = new Map<string, Set<'property' | 'index'>>()
    collectPropAccesses('props?.name', propNames, out)
    expect(out.get('props')?.has('property')).toBe(true)
  })

  test('computed `props[i]` records index access', () => {
    const out = new Map<string, Set<'property' | 'index'>>()
    collectPropAccesses('props[i]', propNames, out)
    expect(out.get('props')?.has('index')).toBe(true)
  })

  test('optional-chaining computed `props?.[i]` records index access', () => {
    const out = new Map<string, Set<'property' | 'index'>>()
    collectPropAccesses('props?.[i]', propNames, out)
    expect(out.get('props')?.has('index')).toBe(true)
  })

  test('template literal interpolations are scanned', () => {
    const out = new Map<string, Set<'property' | 'index'>>()
    collectPropAccesses('<div>${props.title}: ${user?.name}</div>', propNames, out)
    expect(out.get('props')?.has('property')).toBe(true)
    expect(out.get('user')?.has('property')).toBe(true)
  })

  test('does not record names that only appear bare (no member access)', () => {
    const out = new Map<string, Set<'property' | 'index'>>()
    collectPropAccesses('props', propNames, out)
    expect(out.has('props')).toBe(false)
  })

  test('does not record sibling identifiers that share a substring', () => {
    // `propsX.foo` is a different identifier — must not match `props`.
    const out = new Map<string, Set<'property' | 'index'>>()
    collectPropAccesses('propsX.foo', propNames, out)
    expect(out.has('props')).toBe(false)
  })

  test('mixes property and index access for the same prop', () => {
    const out = new Map<string, Set<'property' | 'index'>>()
    collectPropAccesses('props.items[0].name', propNames, out)
    expect(out.get('props')?.has('property')).toBe(true)
    expect(out.get('props')?.has('index')).toBe(false) // index is on `.items`, not on `props`
  })
})
