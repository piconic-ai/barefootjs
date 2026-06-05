/**
 * Pins the `IRComponent.dynamicTag` flag — the additive signal the Go
 * template adapter uses to lower a runtime-chosen tag (`const Tag =
 * children.tag`) to a children passthrough instead of an impossible
 * `{{template "Tag" ...}}` call.
 *
 * Background: the `Slot` component does
 *   `const Tag = children.tag; return <Tag {...}>{...}</Tag>`
 * The compiler treats `<Tag>` as a PascalCase component reference, so a
 * naive Go lowering emits `{{template "Tag" .TagSlot0}}` — a template
 * that can never be registered. Go's html/template escape-walks ALL
 * registered templates (even dead branches), so the whole render fails
 * with `no such template "Tag"`. `dynamicTag` lets the Go adapter detect
 * and defuse this; Hono/CSR/Mojo ignore the flag.
 *
 * The binding lives inside an `if (isValidElement(children)) { … }`
 * block, so detection must scan nested scopes (not just component-body
 * `localConstants`). These tests pin both that positive detection and
 * the negative case — a real imported `<Button>` must NOT be flagged.
 */

import { describe, test, expect } from 'bun:test'
import { compileJSX } from '../compiler'
import { TestAdapter } from '../adapters/test-adapter'
import type { IRNode, IRComponent } from '../types'

const adapter = new TestAdapter()

function compileToIR(source: string) {
  const result = compileJSX(source, 'demo.tsx', { adapter, outputIR: true })
  expect(result.errors.filter(e => e.severity === 'error')).toEqual([])
  const ir = result.files.find(f => f.type === 'ir')!
  return JSON.parse(ir.content)
}

function findComponent(node: IRNode, name: string): IRComponent | null {
  if (node.type === 'component' && (node as IRComponent).name === name) {
    return node as IRComponent
  }
  const anyNode = node as IRNode & {
    children?: IRNode[]
    consequent?: IRNode
    alternate?: IRNode
    then?: IRNode
    else?: IRNode
  }
  for (const key of ['children', 'consequent', 'alternate', 'then', 'else'] as const) {
    const v = anyNode[key]
    if (!v) continue
    const list = Array.isArray(v) ? v : [v]
    for (const c of list) {
      const found = findComponent(c, name)
      if (found) return found
    }
  }
  return null
}

describe('IRComponent.dynamicTag', () => {
  test('a block-scoped `const Tag = children.tag` JSX tag is flagged dynamicTag', () => {
    const ir = compileToIR(`
function isValidElement(el: unknown): el is { tag: unknown; props: Record<string, unknown> } {
  return !!(el && typeof el === 'object' && 'tag' in el && 'props' in el)
}
export function Slot({ children, className, ...props }: { children?: any; className?: string; [k: string]: unknown }) {
  if (children && isValidElement(children)) {
    const Tag = children.tag as any
    const childProps = children.props
    return <Tag {...childProps} {...props} className={className}>{childProps.children}</Tag>
  }
  return <>{children}</>
}
`)
    const tag = findComponent(ir.root, 'Tag')
    expect(tag).not.toBeNull()
    expect(tag!.dynamicTag).toBe(true)
  })

  test('a real imported component is NOT flagged dynamicTag', () => {
    const ir = compileToIR(`
import { Button } from './button'
export function Demo() {
  return <Button>hi</Button>
}
`)
    const button = findComponent(ir.root, 'Button')
    expect(button).not.toBeNull()
    expect(button!.dynamicTag).toBeUndefined()
  })

  test('a local JSX-producing const factory is NOT flagged dynamicTag', () => {
    const ir = compileToIR(`
export function Demo() {
  const Inner = () => <span>x</span>
  return <div><Inner /></div>
}
`)
    const inner = findComponent(ir.root, 'Inner')
    // Local component factories lower via the jsx* inlining paths; whether
    // they survive as an IRComponent node or get inlined, they must never
    // carry the dynamicTag flag (their initializer is an arrow, not `.tag`).
    if (inner) expect(inner.dynamicTag).toBeUndefined()
  })
})
