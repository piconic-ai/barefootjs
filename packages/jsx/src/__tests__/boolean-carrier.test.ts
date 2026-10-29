import { describe, test, expect } from 'bun:test'
import { collectBooleanCarrierNames, mayYieldBooleanCarrier } from '../adapters/boolean-carrier'
import { parseExpression } from '../expression-parser'
import type { TypeInfo } from '../types'

const bool: TypeInfo = { kind: 'primitive', raw: 'boolean', primitive: 'boolean' }
const str: TypeInfo = { kind: 'primitive', raw: 'string', primitive: 'string' }
const undef: TypeInfo = { kind: 'primitive', raw: 'undefined', primitive: 'undefined' }
const unknown: TypeInfo = { kind: 'unknown', raw: 'unknown' }
const union = (...unionTypes: TypeInfo[]): TypeInfo => ({ kind: 'union', raw: 'union', unionTypes })

describe('collectBooleanCarrierNames (#3783)', () => {
  test('an optional boolean, a boolean union and a destructured union prop carry a boolean', () => {
    const { names, props } = collectBooleanCarrierNames({
      signals: [],
      memos: [],
      propsParams: [
        { name: 'off', type: bool, optional: true },
        { name: 'either', type: union(bool, str), optional: false },
        // A destructured union-typed prop: `type` is unresolved, `declaredType` keeps the union.
        { name: 'flag', type: unknown, declaredType: union(bool, undef), optional: false },
        { name: 'label', type: str, optional: false },
      ],
    })
    expect([...names].sort()).toEqual(['either', 'flag', 'off'])
    expect([...props].sort()).toEqual(['either', 'flag', 'off'])
  })

  test('a props object keeps only the caller-facing keys', () => {
    const { names, props } = collectBooleanCarrierNames({
      signals: [],
      memos: [],
      propsObjectName: 'props',
      propsParams: [{ name: 'off', type: bool, optional: true }],
    })
    expect([...names]).toEqual([])
    expect([...props]).toEqual(['off'])
  })

  test('a boolean-typed or untyped boolean-seeded signal carries a boolean; a string signal does not', () => {
    const signal = (getter: string, type: TypeInfo, initialValue: string) =>
      ({ getter, setter: null, type, initialValue }) as never
    const { names } = collectBooleanCarrierNames({
      signals: [signal('flag', union(bool, undef), 'false'), signal('open', unknown, 'true'), signal('text', str, "'x'")],
      memos: [],
      propsParams: [],
    })
    expect([...names].sort()).toEqual(['flag', 'open'])
  })
})

describe('mayYieldBooleanCarrier (#3783)', () => {
  const carriers = new Set(['off', 'flag'])
  const isCarrier = (n: string, componentProperty?: boolean) => (componentProperty ? n === 'off' : carriers.has(n))
  const yields = (src: string) => mayYieldBooleanCarrier(parseExpression(src)!, isCarrier)

  test('a carrier read through ?? / || / && or a ternary branch may yield it', () => {
    expect(yields("off ?? 'none'")).toBe(true)
    expect(yields("props.off ?? 'none'")).toBe(true)
    expect(yields("flag() ?? 'none'")).toBe(true)
    expect(yields("on && (off ?? 'none')")).toBe(true)
    expect(yields("label || off")).toBe(true)
    expect(yields("on ? (off ?? 'none') : 'x'")).toBe(true)
  })

  test('a carrier only in a ternary test, a call argument or a computed member does not', () => {
    expect(yields("off ? 'a' : 'b'")).toBe(false)
    expect(yields("label ?? 'none'")).toBe(false)
    expect(yields("fmt(off)")).toBe(false)
    expect(yields("props['off'] ?? 'none'")).toBe(false)
    expect(yields("flag(1) ?? 'none'")).toBe(false)
  })
})
