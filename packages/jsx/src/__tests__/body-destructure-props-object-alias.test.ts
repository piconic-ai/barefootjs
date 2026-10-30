/**
 * A body destructure whose initializer is a component-scope `const` alias of
 * the props object (`const p = props; const { x } = p`) is a destructure of
 * the props object: the analyzer expands it into one `props.<key>`
 * `localConstants` entry per name, exactly like `const { x } = props`.
 * Before, only the literal props identifier was recognized and the
 * destructure was dropped with no diagnostic, so every read of `x` was an
 * unbound name (Hono SSR threw `ReferenceError`).
 *
 * Shapes that are not provably the props object stay unrecognized: a `let`
 * alias (a reassignment can repoint it), an alias declared after the
 * destructure, and a destructure in a nested block (a block-local binding
 * can shadow the alias there).
 */

import { describe, test, expect } from 'bun:test'
import { analyzeComponent } from '../analyzer'

function destructured(body: string) {
  const source = `
    type P = { value: number; label?: string; onPick?: () => void }
    export function C(props: P) {
      ${body}
      return <div />
    }
  `
  const ctx = analyzeComponent(source, 'test.tsx')
  return ctx.localConstants
    .filter(c => c.propsDestructure !== undefined)
    .map(c => ({ name: c.name, value: c.value, sourceKey: c.propsDestructure?.sourceKey }))
}

const EXPANDED = [
  { name: 'value', value: 'props.value', sourceKey: 'value' },
  { name: 'label', value: "props.label ?? 'none'", sourceKey: 'label' },
  { name: 'pick', value: 'props.onPick', sourceKey: 'onPick' },
]

describe('body destructure of a const alias of the props object', () => {
  test('the props object itself (baseline)', () => {
    expect(destructured(`const { value, label = 'none', onPick: pick } = props`)).toEqual(EXPANDED)
  })

  test('a const alias expands like the props object', () => {
    expect(destructured(`
      const p = props
      const { value, label = 'none', onPick: pick } = p
    `)).toEqual(EXPANDED)
  })

  test('a chain of const aliases expands like the props object', () => {
    expect(destructured(`
      const p = props
      const q = p
      const { value, label = 'none', onPick: pick } = q
    `)).toEqual(EXPANDED)
  })

  test('a let alias is not the props object', () => {
    expect(destructured(`
      let p = props
      const { value } = p
    `)).toEqual([])
  })

  test('an alias of a let alias is not the props object', () => {
    expect(destructured(`
      let p = props
      const q = p
      const { value } = q
    `)).toEqual([])
  })

  test('an alias of another object is not the props object', () => {
    expect(destructured(`
      const other = { value: 1 }
      const { value } = other
    `)).toEqual([])
  })

  test('an alias declared after the destructure is not resolved', () => {
    expect(destructured(`
      const { value } = p
      const p = props
    `)).toEqual([])
  })

  test('a destructure in a nested block does not resolve the alias', () => {
    expect(destructured(`
      const p = props
      if (p) {
        const p = { value: 2 }
        const { value } = p
      }
    `)).toEqual([])
  })
})
