import { describe, test, expect } from 'bun:test'
import { needsEffectWrapper } from '../../ir-to-client-js/reactivity'
import type { ClientJsContext } from '../../ir-to-client-js/types'

const dummyLoc = { file: 'test.tsx', start: { line: 1, column: 0 }, end: { line: 1, column: 0 } }

function makeContext(overrides: Partial<ClientJsContext> = {}): ClientJsContext {
  return {
    componentName: 'Test',
    signals: [],
    memos: [],
    effects: [],
    onMounts: [],
    localFunctions: [],
    localConstants: [],
    initStatements: [],
    propsParams: [],
    propsObjectName: null,
    restPropsName: null,
    interactiveElements: [],
    dynamicElements: [],
    conditionalElements: [],
    loopElements: [],
    refElements: [],
    childInits: [],
    reactiveProps: [],
    reactiveChildProps: [],
    reactiveAttrs: [],
    clientOnlyElements: [],
    clientOnlyConditionals: [],
    providerSetups: [],
    restAttrElements: [],
    warnings: [],
    ...overrides,
  }
}

describe('needsEffectWrapper', () => {
  describe('signal detection', () => {
    test('detects signal getter call', () => {
      const ctx = makeContext({ signals: [{ getter: 'count', setter: 'setCount', initialValue: '0', type: { kind: 'unknown', raw: 'number' }, loc: dummyLoc }] })
      expect(needsEffectWrapper('count()', ctx)).toBe(true)
    })

    test('does not match signal name without call', () => {
      const ctx = makeContext({ signals: [{ getter: 'count', setter: 'setCount', initialValue: '0', type: { kind: 'unknown', raw: 'number' }, loc: dummyLoc }] })
      expect(needsEffectWrapper('count', ctx)).toBe(false)
    })
  })

  describe('memo detection', () => {
    test('detects memo call', () => {
      const ctx = makeContext({ memos: [{ name: 'doubled', computation: 'count() * 2', type: { kind: 'unknown', raw: 'number' }, deps: [], loc: dummyLoc }] })
      expect(needsEffectWrapper('doubled()', ctx)).toBe(true)
    })
  })

  describe('props.xxx pattern detection', () => {
    test('detects props.xxx when propsParams is empty but propsObjectName is set', () => {
      const ctx = makeContext({ propsObjectName: 'props', propsParams: [] })
      expect(needsEffectWrapper('props.disabled ?? false', ctx)).toBe(true)
    })

    test('detects props.xxx in template literal', () => {
      const ctx = makeContext({ propsObjectName: 'props', propsParams: [] })
      expect(needsEffectWrapper('`${props.className ?? ""} extra`', ctx)).toBe(true)
    })

    test('detects props.xxx with custom props object name', () => {
      const ctx = makeContext({ propsObjectName: 'p', propsParams: [] })
      expect(needsEffectWrapper('p.disabled', ctx)).toBe(true)
    })

    test('excludes props.children', () => {
      const ctx = makeContext({ propsObjectName: 'props', propsParams: [] })
      expect(needsEffectWrapper('props.children', ctx)).toBe(false)
    })

    test('detects props.xxx even when props.children is also present', () => {
      const ctx = makeContext({ propsObjectName: 'props', propsParams: [] })
      expect(needsEffectWrapper('props.disabled || props.children', ctx)).toBe(true)
    })

    test('works alongside populated propsParams', () => {
      const ctx = makeContext({
        propsObjectName: 'props',
        propsParams: [{ name: 'checked', type: { kind: 'unknown', raw: 'boolean' }, optional: true }],
      })
      // 'checked' matched via propsParams, 'disabled' matched via fallback pattern
      expect(needsEffectWrapper('props.checked', ctx)).toBe(true)
      expect(needsEffectWrapper('props.disabled', ctx)).toBe(true)
    })

    test('does not match when propsObjectName is null (destructured)', () => {
      const ctx = makeContext({ propsObjectName: null, propsParams: [] })
      expect(needsEffectWrapper('props.disabled', ctx)).toBe(false)
    })

    test('does not match unrelated identifiers', () => {
      const ctx = makeContext({ propsObjectName: 'props', propsParams: [] })
      expect(needsEffectWrapper('"static string"', ctx)).toBe(false)
    })
  })
})

