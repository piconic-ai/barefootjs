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
export function C() {
  const on = true
  const mode = 'on'
  const ratio = 1.5
  const derived = mode + '!'
  return <div data-x={on && enabled ? mode : String(limit + ratio) + derived}>x</div>
}
`)
  const never = () => false

  test('resolves boolean, number and string literals at module and function scope', () => {
    expect(lookupLiteralConst('on', consts, never)).toEqual({ kind: 'boolean', text: 'true' })
    expect(lookupLiteralConst('enabled', consts, never)).toEqual({ kind: 'boolean', text: 'false' })
    expect(lookupLiteralConst('limit', consts, never)).toEqual({ kind: 'number', text: '-2' })
    expect(lookupLiteralConst('ratio', consts, never)).toEqual({ kind: 'number', text: '1.5' })
    expect(lookupLiteralConst('mode', consts, never)).toEqual({ kind: 'string', text: 'on' })
  })

  test('declines a non-literal initializer and an unknown name', () => {
    expect(lookupLiteralConst('derived', consts, never)).toBeNull()
    expect(lookupLiteralConst('missing', consts, never)).toBeNull()
  })

  test('declines a name the caller reports as shadowed', () => {
    expect(lookupLiteralConst('on', consts, n => n === 'on')).toBeNull()
  })
})
