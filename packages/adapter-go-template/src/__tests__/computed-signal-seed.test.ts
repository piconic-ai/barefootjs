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
})
