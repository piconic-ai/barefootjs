/**
 * Memo SSR seed classification (#3423): the boxed-arithmetic shapes are
 * classified once (`memo-seed-shape.ts`), and both the memo field's Go type
 * and the constructor seed read that classification, so a seed spelled as a
 * boxed `bf.<Op>` call always lands in an `interface{}` field.
 */
import { describe, test, expect } from 'bun:test'
import { compileJSX } from '@barefootjs/jsx'
import { GoTemplateAdapter } from '../adapter/go-template-adapter'

function types(src: string): string {
  const result = compileJSX(src.trimStart(), 'T.tsx', { adapter: new GoTemplateAdapter() })
  const file = result.files.find(f => f.path.endsWith('.types'))
  if (!file) throw new Error('no types file')
  return file.content
}

describe('boxed arithmetic: field type and seed agree along memo chains', () => {
  const src = types(`
'use client'
import { createSignal, createMemo } from '@barefootjs/client'
export function Calc(props: { value: number }) {
  const [a, setA] = createSignal<number>(1)
  const [b] = createSignal<number>(2)
  const total = createMemo(() => a() + b())
  const doubled = createMemo(() => total() * 2)
  const alias = createMemo(() => doubled())
  const eighth = createMemo(() => props.value / 8)
  return <div data-d={alias()} data-e={eighth()} onClick={() => setA(3)}>{total()}</div>
}
`)

  test('two numeric operands → bf.Add in an interface{} field', () => {
    expect(src).toMatch(/\tTotal interface\{\} /)
    expect(src).toContain('Total: bf.Add(1, 2),')
  })

  test('literal arithmetic on a boxed memo → bf.Mul over the dependency', () => {
    expect(src).toMatch(/\tDoubled interface\{\} /)
    expect(src).toContain('Doubled: bf.Mul(bf.Add(1, 2), 2),')
  })

  test('an identity memo over a boxed memo stays boxed', () => {
    expect(src).toMatch(/\tAlias interface\{\} /)
    expect(src).toContain('Alias: bf.Mul(bf.Add(1, 2), 2),')
  })

  test('division by a positive integer literal → bf.Div', () => {
    expect(src).toMatch(/\tEighth interface\{\} /)
    expect(src).toContain('Eighth: bf.Div(in.Value, 8),')
  })
})

describe('selection memo over a string-literal seed', () => {
  const selection = (seed: string) => types(`
'use client'
import { createSignal, createMemo } from '@barefootjs/client'
export function Sel() {
  const [tab, setTab] = createSignal(${seed})
  const isA = createMemo(() => tab() === 'a')
  const notA = createMemo(() => tab() !== 'a')
  return <div data-a={isA()} data-n={notA()} onClick={() => setTab('b')}>x</div>
}
`)

  test('folds to a Go bool constant whatever the seed quote style', () => {
    for (const [seed, isA] of [[`'a'`, true], [`"a"`, true], [`'it\\'s'`, false], [`"b"`, false]] as const) {
      const src = selection(seed)
      expect(src).toContain(`IsA: ${isA},`)
      expect(src).toContain(`NotA: ${!isA},`)
    }
  })
})
