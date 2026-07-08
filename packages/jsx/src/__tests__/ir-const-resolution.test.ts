/**
 * Pins jsx-to-ir's resolution of `className={classes}` against
 * local-const declarations (#1177). Two behaviors covered:
 *
 *   - String-literal const → `string` template part
 *   - `Record<T, string>[key]` lookup → `lookup` part with the
 *     resolved cases
 *   - Function-scope const shadows a same-named module-level const
 */

import { describe, test, expect } from 'bun:test'
import { compileJSX } from '../compiler'
import { TestAdapter } from '../adapters/test-adapter'
import type { IRNode, IRElement, AttrValue, TemplateAttr } from '../types'

const adapter = new TestAdapter()

function compileToIR(source: string) {
  const result = compileJSX(source, 'demo.tsx', { adapter, outputIR: true })
  expect(result.errors.filter(e => e.severity === 'error')).toEqual([])
  const ir = result.files.find(f => f.type === 'ir')!
  return JSON.parse(ir.content)
}

function findClassNameValue(node: IRNode): AttrValue | null {
  if (node.type === 'element') {
    const el = node as IRElement
    for (const attr of el.attrs) {
      if (attr.name === 'class') return attr.value
    }
    for (const child of el.children) {
      const v = findClassNameValue(child)
      if (v !== null) return v
    }
  }
  // Walk common composite shapes.
  const anyNode = node as IRNode & {
    children?: IRNode[]
    consequent?: IRNode
    alternate?: IRNode
    whenTrue?: IRNode
    whenFalse?: IRNode
  }
  if (anyNode.children) {
    for (const c of anyNode.children) {
      const v = findClassNameValue(c)
      if (v !== null) return v
    }
  }
  if (anyNode.consequent) {
    const v = findClassNameValue(anyNode.consequent)
    if (v !== null) return v
  }
  if (anyNode.alternate) {
    const v = findClassNameValue(anyNode.alternate)
    if (v !== null) return v
  }
  if (anyNode.whenTrue) {
    const v = findClassNameValue(anyNode.whenTrue)
    if (v !== null) return v
  }
  if (anyNode.whenFalse) {
    const v = findClassNameValue(anyNode.whenFalse)
    if (v !== null) return v
  }
  return null
}

describe('IR const resolution', () => {
  test('${IDENT} string-literal const inlines into template parts', () => {
    const ir = compileToIR(`
const baseClasses = 'inline-flex items-center'

export function Demo() {
  const classes = \`\${baseClasses} extra\`
  return <span className={classes}>x</span>
}
`)
    const v = findClassNameValue(ir.root) as TemplateAttr
    expect(v.kind).toBe('template')
    // The first non-empty static part should carry the resolved baseClasses.
    const concat = v.parts.map(p => (p.type === 'string' ? p.value : '')).join('')
    expect(concat).toContain('inline-flex items-center')
    expect(concat).toContain('extra')
  })

  test('${IDENT[KEY]} against a Record<T, string> emits a lookup part with all cases', () => {
    const ir = compileToIR(`
const variantClasses: Record<string, string> = {
  default: 'bg-primary',
  secondary: 'bg-secondary',
}

export function Tag(props: { variant?: 'default' | 'secondary' }) {
  const classes = \`\${variantClasses[props.variant ?? 'default']}\`
  return <span className={classes}>x</span>
}
`)
    const v = findClassNameValue(ir.root) as TemplateAttr
    expect(v.kind).toBe('template')
    const lookup = v.parts.find(p => p.type === 'lookup') as Extract<typeof v.parts[number], { type: 'lookup' }>
    expect(lookup).toBeDefined()
    expect(lookup.cases).toEqual({ default: 'bg-primary', secondary: 'bg-secondary' })
    // Key carries the runtime expression (`props.variant ?? 'default'` here).
    expect(lookup.key).toContain('variant')
  })

  test('function-scope const shadows a same-named module-level const', () => {
    const ir = compileToIR(`
const classes = 'module-scope'

export function Demo() {
  const classes = 'function-scope'
  return <span className={classes}>x</span>
}
`)
    const v = findClassNameValue(ir.root) as TemplateAttr
    expect(v.kind).toBe('template')
    expect(v.parts).toEqual([{ type: 'string', value: 'function-scope' }])
    // Negative assertion: the module-level binding must NOT win.
    const concat = v.parts.map(p => (p.type === 'string' ? p.value : '')).join('')
    expect(concat).not.toContain('module-scope')
  })

  test('non-string-literal Record values bail: leaves the bare-expression path', () => {
    // `() => 'x'` cases can't be statically lowered, so the resolver
    // should bail and the IR keeps the original `${ ... }` expression
    // text — never a partial cases map.
    const ir = compileToIR(`
const fn = () => 'computed'
const variantClasses = {
  default: fn(),
  secondary: 'bg-secondary',
}

export function Tag(props: { variant?: 'default' | 'secondary' }) {
  const classes = \`\${variantClasses[props.variant ?? 'default']}\`
  return <span className={classes}>x</span>
}
`)
    const v = findClassNameValue(ir.root)
    // Falls back to the raw identifier reference when un-lowerable.
    if (v && v.kind === 'template') {
      const hasLookup = v.parts.some(p => p.type === 'lookup')
      expect(hasLookup).toBe(false)
    }
  })
})
