/**
 * Unit tests for getControlledPropName() — controlled prop detection.
 *
 * Verifies that createSignal initializers referencing props are correctly
 * identified so the compiler generates sync effects for controlled components.
 * The answer comes from `SignalInfo.propSeed`, which the analyzer records
 * from the parsed initializer (`signalPropSeed`, #3508); `controlled` below
 * sets it the same way.
 */

import { describe, test, expect } from 'bun:test'
import { getControlledPropName } from '../ir-to-client-js/prop-handling'
import { parseExpression } from '../expression-parser'
import { signalPropSeed } from '../props-binding'
import type { ParamInfo, SignalInfo, TypeInfo } from '../types'

const boolType: TypeInfo = { kind: 'primitive', raw: 'boolean', primitive: 'boolean' }
const strType: TypeInfo = { kind: 'primitive', raw: 'string', primitive: 'string' }
const numType: TypeInfo = { kind: 'primitive', raw: 'number', primitive: 'number' }
const loc = { file: 'test.tsx', start: { line: 1, column: 0 }, end: { line: 1, column: 0 } }

function makeSignal(initialValue: string): SignalInfo {
  return {
    getter: 'value',
    setter: 'setValue',
    initialValue,
    type: strType,
    loc,
  }
}

function controlled(initialValue: string, params: ParamInfo[], propsObjectName = 'props'): string | null {
  const signal = makeSignal(initialValue)
  const parsed = parseExpression(`(${initialValue})`)
  const seed = signalPropSeed(parsed.kind === 'unsupported' ? undefined : parsed, params, propsObjectName)
  if (seed) signal.propSeed = seed
  return getControlledPropName(signal)
}

const propsParams: ParamInfo[] = [
  { name: 'checked', type: boolType, optional: true },
  { name: 'value', type: strType, optional: true },
  { name: 'initial', type: numType, optional: true },
  { name: 'defaultChecked', type: boolType, optional: true },
  { name: 'defaultValue', type: strType, optional: true },
]

describe('getControlledPropName', () => {
  test('direct props.xxx reference', () => {
    expect(controlled('props.checked', propsParams)).toBe('checked')
  })

  test('props.xxx ?? default (bug fix: #434)', () => {
    expect(controlled('props.initial ?? 0', propsParams)).toBe('initial')
  })

  test('props.xxx ?? string default (bug fix: #434)', () => {
    expect(controlled("props.value ?? ''", propsParams)).toBe('value')
  })

  test('props.xxx || fallback', () => {
    expect(controlled("props.value || ''", propsParams)).toBe('value')
  })

  test('default-prefixed prop is excluded', () => {
    expect(controlled('props.defaultChecked', propsParams)).toBeNull()
  })

  test('default-prefixed prop with ?? is excluded', () => {
    expect(controlled('props.defaultChecked ?? false', propsParams)).toBeNull()
  })

  test('destructured prop name', () => {
    expect(controlled('checked', propsParams)).toBe('checked')
  })

  test('destructured prop with ?? fallback', () => {
    expect(controlled('checked ?? false', propsParams)).toBe('checked')
  })

  test('destructured default-prefixed prop is excluded', () => {
    expect(controlled("defaultValue ?? ''", propsParams)).toBeNull()
  })

  test('complex expression returns null', () => {
    expect(controlled('someFunction(props.value)', propsParams)).toBeNull()
  })

  test('an initializer that only starts with a prop read returns null (#3508)', () => {
    for (const init of ["props.value && 'x'", 'props.initial + 1', "props.value ? 'a' : 'b'", 'props.value.trim()']) {
      expect(controlled(init, propsParams)).toBeNull()
    }
  })

  test('unknown prop name returns null', () => {
    expect(controlled('props.unknown', propsParams)).toBeNull()
  })

  describe('custom props parameter name', () => {
    test('p.checked with propsObjectName="p"', () => {
      expect(controlled('p.checked', propsParams, 'p')).toBe('checked')
    })

    test('p.initial ?? 0 with propsObjectName="p"', () => {
      expect(controlled('p.initial ?? 0', propsParams, 'p')).toBe('initial')
    })

    test('p.defaultChecked ?? false is excluded', () => {
      expect(controlled('p.defaultChecked ?? false', propsParams, 'p')).toBeNull()
    })

    test('prop.value || "" with propsObjectName="prop"', () => {
      expect(controlled("prop.value || ''", propsParams, 'prop')).toBe('value')
    })

    test('props.checked is not matched when propsObjectName="p"', () => {
      expect(controlled('props.checked', propsParams, 'p')).toBeNull()
    })
  })
})
