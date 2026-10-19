/**
 * `planStyleObject` lowers a `style={{ … }}` attribute from the IR's parsed
 * object literal, once for every template adapter (#3541).
 */

import { describe, test, expect } from 'bun:test'
import { planStyleObject } from '../adapters/style-object'
import { parseExpression } from '../expression-parser'

/** An attribute value as the IR carries it: `parsed` holds the object literal. */
const attr = (source: string) => ({ expr: source, parsed: parseExpression(`(${source})`) })

describe('planStyleObject', () => {
  test('kebab-cases keys and splits literal vs expression values', () => {
    expect(planStyleObject(attr("{ backgroundColor: color, padding: '8px' }"))).toEqual([
      { cssKey: 'background-color', kind: 'expr', expr: 'color', parsed: { kind: 'identifier', name: 'color' } },
      { cssKey: 'padding', kind: 'literal', value: '8px' },
    ])
  })

  test('accepts the shorthand `{ color }` the text parser refused', () => {
    expect(planStyleObject(attr('{ color }'))).toEqual([
      { cssKey: 'color', kind: 'expr', expr: 'color', parsed: { kind: 'identifier', name: 'color' } },
    ])
  })

  test('signal-getter calls and numbers are expressions; quoted and template keys are literals', () => {
    const plan = planStyleObject(attr("{ background: bg(), 'z-index': '1', width: `10px`, padding: 8 }"))
    expect(plan?.map(e => [e.cssKey, e.kind === 'literal' ? e.value : e.expr])).toEqual([
      ['background', 'bg()'],
      ['z-index', '1'],
      ['width', '10px'],
      ['padding', '8'],
    ])
  })

  test('vendor-prefixed keys keep the leading dash', () => {
    expect(planStyleObject(attr("{ WebkitTransform: 'none', msTransform: 'none' }"))?.map(e => e.cssKey)).toEqual([
      '-webkit-transform',
      '-ms-transform',
    ])
  })

  test('a spread, a numeric key or a non-object value stays on the refusal path', () => {
    expect(planStyleObject(attr('{ ...rest }'))).toBeNull()
    expect(planStyleObject(attr("{ 1: 'a' }"))).toBeNull()
    expect(planStyleObject(attr('color'))).toBeNull()
    expect(planStyleObject(attr('{}'))).toBeNull()
  })

  test('an attribute without a parsed tree stays on the refusal path', () => {
    expect(planStyleObject({ expr: '{ color }' })).toBeNull()
  })
})
