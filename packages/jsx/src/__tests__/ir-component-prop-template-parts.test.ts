/**
 * Pins the component-prop-side counterpart to `ir-const-resolution`.
 *
 * `jsx-to-ir` collapses structured `template` AttrValues into `expression`
 * on component-prop sites so the value can flow through runtime hydration
 * (Hono evaluates the JS expression directly). Template-based SSR adapters
 * (Mojo, Go) need the parsed parts back, so the collapse carries them on
 * `ExpressionAttr.parts` rather than losing the structure.
 *
 * These tests pin the carry-through contract so any future refactor of
 * the IR producer (the eventual "lift template parts to first-class
 * IRProp" landing in #1264 / #1244 follow-ups) doesn't silently drop
 * structure that the template-based adapters now depend on.
 */

import { describe, test, expect } from 'bun:test'
import { compileJSX } from '../compiler'
import { TestAdapter } from '../adapters/test-adapter'
import type { IRNode, IRComponent, AttrValue, ExpressionAttr } from '../types'

const adapter = new TestAdapter()

function compileToIR(source: string) {
  const result = compileJSX(source, 'demo.tsx', { adapter, outputIR: true })
  expect(result.errors.filter(e => e.severity === 'error')).toEqual([])
  const ir = result.files.find(f => f.type === 'ir')!
  return JSON.parse(ir.content)
}

function findComponentPropValue(node: IRNode, propName: string): AttrValue | null {
  if (node.type === 'component') {
    const comp = node as IRComponent
    for (const p of comp.props) {
      if (p.name === propName) return p.value
    }
  }
  const anyNode = node as IRNode & {
    children?: IRNode[]
    consequent?: IRNode
    alternate?: IRNode
  }
  if (anyNode.children) {
    for (const c of anyNode.children) {
      const v = findComponentPropValue(c, propName)
      if (v !== null) return v
    }
  }
  if (anyNode.consequent) {
    const v = findComponentPropValue(anyNode.consequent, propName)
    if (v !== null) return v
  }
  if (anyNode.alternate) {
    const v = findComponentPropValue(anyNode.alternate, propName)
    if (v !== null) return v
  }
  return null
}

describe('IR component-prop template-parts carry-through', () => {
  test('inline template literal on a component prop keeps lookup parts on ExpressionAttr', () => {
    const ir = compileToIR(`
import { Slot } from './slot'
export function Demo({ variant }: { variant: 'a' | 'b' }) {
  const classes: Record<'a' | 'b', string> = { a: 'class-a', b: 'class-b' }
  return <Slot className={\`base \${classes[variant]}\`}>hi</Slot>
}
`)
    const v = findComponentPropValue(ir.root, 'className') as ExpressionAttr
    // Producer collapses to `expression` for runtime hydration paths…
    expect(v.kind).toBe('expression')
    // …but template-based SSR adapters depend on `parts` surviving.
    expect(v.parts).toBeDefined()
    const lookup = v.parts!.find(p => p.type === 'lookup') as Extract<NonNullable<typeof v.parts>[number], { type: 'lookup' }>
    expect(lookup).toBeDefined()
    expect(lookup.cases).toEqual({ a: 'class-a', b: 'class-b' })
    expect(lookup.key).toContain('variant')
  })

  test('intermediate-const template literal on a component prop also carries parts', () => {
    // The shape `create-barefootjs`'s shadcn-style Button uses:
    // `const classes = template-literal; <Slot className={classes}>`.
    const ir = compileToIR(`
import { Slot } from './slot'
export function Demo({ variant }: { variant: 'a' | 'b' }) {
  const classes: Record<'a' | 'b', string> = { a: 'class-a', b: 'class-b' }
  const composed = \`base \${classes[variant]}\`
  return <Slot className={composed}>hi</Slot>
}
`)
    const v = findComponentPropValue(ir.root, 'className') as ExpressionAttr
    expect(v.kind).toBe('expression')
    expect(v.parts).toBeDefined()
    const lookup = v.parts!.find(p => p.type === 'lookup') as Extract<NonNullable<typeof v.parts>[number], { type: 'lookup' }>
    expect(lookup).toBeDefined()
    expect(lookup.cases).toEqual({ a: 'class-a', b: 'class-b' })
  })

  test('bare expression (no template literal) does NOT grow synthetic parts', () => {
    // Negative pin: only the template-literal collapse path carries
    // `parts`. A plain identifier prop must NOT acquire `parts` (else
    // adapters would mis-dispatch through `convertTemplateLiteralPartsToPerl`
    // for shapes that don't have a structured form).
    const ir = compileToIR(`
import { Slot } from './slot'
export function Demo(props: { label: string }) {
  return <Slot className={props.label}>hi</Slot>
}
`)
    const v = findComponentPropValue(ir.root, 'className') as ExpressionAttr
    expect(v.kind).toBe('expression')
    expect(v.parts).toBeUndefined()
  })
})
