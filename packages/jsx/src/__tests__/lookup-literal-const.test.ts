import { describe, test, expect } from 'bun:test'
import { compileJSX, lookupLiteralConst, type ComponentIR } from '../index'
import { TestAdapter } from '../adapters/test-adapter'

function constantsOf(src: string): ComponentIR['metadata']['localConstants'] {
  const result = compileJSX(src.trimStart(), 'T.tsx', { adapter: new TestAdapter(), outputIR: true })
  const irFile = result.files.find(f => f.type === 'ir')
  if (!irFile) throw new Error('no IR')
  return (JSON.parse(irFile.content) as ComponentIR).metadata.localConstants
}

describe('lookupLiteralConst (#3312)', () => {
  const consts = constantsOf(`
const enabled = false
const limit = -2
const nz = -0
const big = 1e21
const missing = null
export function C() {
  const on = true
  const mode = 'on'
  const ratio = 1.5
  const multiline = 'a\\nb'
  const derived = mode + '!'
  return <div data-x={on && enabled ? mode : String(limit + ratio + nz + big) + derived + multiline} data-m={missing ?? 'm'}>x</div>
}
`)
  const never = () => false

  test('resolves boolean, number, string and null literals at module and function scope', () => {
    expect(lookupLiteralConst('on', consts, never)).toEqual({ kind: 'boolean', text: 'true' })
    expect(lookupLiteralConst('enabled', consts, never)).toEqual({ kind: 'boolean', text: 'false' })
    expect(lookupLiteralConst('limit', consts, never)).toEqual({ kind: 'number', text: '-2', value: -2 })
    expect(lookupLiteralConst('ratio', consts, never)).toEqual({ kind: 'number', text: '1.5', value: 1.5 })
    // A number carries its value: `-0` keeps its sign, which `text` cannot (#3824 step 6).
    const nz = lookupLiteralConst('nz', consts, never)
    expect(nz?.kind === 'number' && Object.is(nz.value, -0)).toBe(true)
    expect(lookupLiteralConst('big', consts, never)).toEqual({ kind: 'number', text: '1e+21', value: 1e21 })
    expect(lookupLiteralConst('mode', consts, never)).toEqual({ kind: 'string', text: 'on' })
    expect(lookupLiteralConst('multiline', consts, never)).toEqual({ kind: 'string', text: 'a\nb' })
    expect(lookupLiteralConst('missing', consts, never)).toEqual({ kind: 'null', text: 'null' })
  })

  test('declines a non-literal initializer and an unknown name', () => {
    expect(lookupLiteralConst('derived', consts, never)).toBeNull()
    expect(lookupLiteralConst('unknown', consts, never)).toBeNull()
  })

  test('declines a name the caller reports as shadowed', () => {
    expect(lookupLiteralConst('on', consts, n => n === 'on')).toBeNull()
  })
})
