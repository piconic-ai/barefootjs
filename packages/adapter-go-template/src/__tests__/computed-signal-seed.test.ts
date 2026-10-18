/**
 * #3519: a signal seeded by a computed expression over a prop is seeded by
 * the runtime evaluator (`bf.EvalExpr`), for the props-object and the
 * destructured form alike. Before, `||` seeded the bare prop and `&&` / an
 * arithmetic expression seeded `nil`. A top-level `??` keeps its hoisted
 * prop-fallback variable, and a bare prop read keeps its field.
 */
import { describe, test, expect } from 'bun:test'
import { compileJSX, type ComponentIR } from '@barefootjs/jsx'
import { GoTemplateAdapter } from '../adapter/go-template-adapter'

function compileTypes(params: string, init: string, body = '<p title={String(v())}>x</p>'): string {
  const src = `
'use client'
import { createSignal } from '@barefootjs/client'
export function T(${params}) {
  const [v] = createSignal(${init})
  return ${body}
}
`
  const adapter = new GoTemplateAdapter()
  const result = compileJSX(src.trimStart(), 'T.tsx', { adapter, outputIR: true })
  const irFile = result.files.find(f => f.type === 'ir')
  if (!irFile) throw new Error('no IR')
  return adapter.generate(JSON.parse(irFile.content) as ComponentIR).types
}

function seedOf(params: string, init: string): string {
  const src = `
'use client'
import { createSignal } from '@barefootjs/client'
export function T(${params}) {
  const [v] = createSignal(${init})
  return <p title={String(v())}>x</p>
}
`
  const adapter = new GoTemplateAdapter()
  const result = compileJSX(src.trimStart(), 'T.tsx', { adapter, outputIR: true })
  const irFile = result.files.find(f => f.type === 'ir')
  if (!irFile) throw new Error('no IR')
  const { types } = adapter.generate(JSON.parse(irFile.content) as ComponentIR)
  const seed = types.match(/^\s+V: (.+),$/m)
  if (!seed) throw new Error(`no V seed in:\n${types}`)
  return seed[1]
}

const PROPS = 'props: { label?: string; flag?: boolean; n?: number }'
const DESTRUCTURED = '{ label, flag, n }: { label?: string; flag?: boolean; n?: number }'

describe('computed signal seed (#3519)', () => {
  test.each([
    [PROPS, "props.label || 'none'"],
    [PROPS, "props.flag && 'on'"],
    [PROPS, 'props.n * 2'],
    [PROPS, "(props.label ?? 'a') + 'b'"],
    [DESTRUCTURED, "label || 'none'"],
    [DESTRUCTURED, "flag && 'on'"],
    [DESTRUCTURED, 'n * 2'],
  ])('%s: %s is evaluated', (params, init) => {
    expect(seedOf(params, init)).toContain('bf.EvalExpr(')
  })

  test.each([
    [PROPS, "props.label ?? 'd'"],
    [DESTRUCTURED, "label ?? 'd'"],
    [PROPS, 'props.label'],
    [DESTRUCTURED, 'label'],
    [PROPS, '1 + 2'],
  ])('%s: %s keeps its existing seed', (params, init) => {
    expect(seedOf(params, init)).not.toContain('bf.EvalExpr(')
  })

  test.each([
    ['props.n * 2', '{props.n}', 'int'],
    ['props.n * 2', '{props.n.toFixed(1)}', 'float64'],
    ['props.n * 1.5', '{props.n}', 'float64'],
    ['props.n % 3', '{props.n}', 'interface{}'],
  ])('%s with %s is typed %s', (init, text, goType) => {
    const types = compileTypes('props: { n: number }', init, `<p data-v={v()}>${text}</p>`)
    expect(types).toMatch(new RegExp(`^\\s+V ${goType.replace(/[{}]/g, '\\$&')} `, 'm'))
  })
})

function generate(params: string, init: string): { types: string; errors: { code: string; message: string }[] } {
  const src = `
'use client'
import { createSignal } from '@barefootjs/client'
type Row = { id: number }
export function T(${params}) {
  const [v] = createSignal(${init})
  return <p title={String(v())}>x</p>
}
`
  const adapter = new GoTemplateAdapter()
  const result = compileJSX(src.trimStart(), 'T.tsx', { adapter, outputIR: true })
  const irFile = result.files.find(f => f.type === 'ir')
  if (!irFile) throw new Error('no IR')
  const { types } = adapter.generate(JSON.parse(irFile.content) as ComponentIR)
  return { types, errors: result.errors }
}

describe('call and member seeds (#3540)', () => {
  test.each([
    [PROPS, "(props.label ?? 'x').toUpperCase()"],
    [PROPS, "(props.label ?? '').length"],
    [PROPS, 'Math.max(props.n ?? 0, 1)'],
    [PROPS, '[props.n ?? 0].length'],
    [DESTRUCTURED, "(label ?? 'x').toUpperCase()"],
    [DESTRUCTURED, 'Math.max(n ?? 0, 1)'],
  ])('%s: %s is evaluated', (params, init) => {
    expect(seedOf(params, init)).toContain('bf.EvalExpr(')
  })

  test('a prop seed outside the evaluator refuses instead of baking a zero value', () => {
    const { errors } = generate(PROPS, "(props.label ?? '').padStart(3, '0')")
    expect(errors.filter(e => e.code === 'BF101').map(e => e.message)).toEqual([
      expect.stringContaining("Initial value '(props.label ?? '').padStart(3, '0')' has no Go template lowering"),
    ])
  })

  test('the legacy row seed `(props.X ?? []).map(…)` keeps the prop field', () => {
    const { types, errors } = generate('props: { rows?: Row[] }', '(props.rows ?? []).map(r => ({ ...r }))')
    expect(errors).toEqual([])
    expect(types).toMatch(/^\s+V: in\.Rows,$/m)
  })
})

describe('an absent prop under `??` in an evaluated seed (#3532)', () => {
  test('the prop takes the nillable field, so the evaluator gets nil', () => {
    const { types } = generate(PROPS, '(props.n ?? 1) * 2')
    expect(types).toMatch(/^\s+N interface\{\} /m)
    expect(types).toMatch(/^\s+V int /m)
  })

  test('a zero-equivalent default keeps the concrete field', () => {
    const { types } = generate(PROPS, '(props.n ?? 0) * 2')
    expect(types).toMatch(/^\s+N int /m)
  })
})

describe('Math.max / Math.min seeds type as a number (#3540)', () => {
  test('over int operands the field is int, so a large value prints in full', () => {
    const { types } = generate(PROPS, 'Math.max(props.n ?? 0, 1)')
    expect(types).toMatch(/^\s+V int /m)
  })

  test('a fractional operand widens the field to float64', () => {
    const { types } = generate(PROPS, 'Math.min(props.n ?? 0, 1.5)')
    expect(types).toMatch(/^\s+V float64 /m)
  })
})
