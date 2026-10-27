/**
 * #3688 — a `{...props}` spread onto a child component in the client JS.
 *
 * Phase 1 marks a child-component spread of the component's own props
 * object (`SpreadAttr.propsObject`). The client then keeps that spread at
 * its source position in the registration template's `renderChild(...)`
 * props, and reads an explicit prop written before it from the caller's
 * props first in `initChild`'s `forwardProps(...)` overrides, so both merge
 * like the JSX call does. A `{...rest}` bag is not the caller's props (it
 * leaves out the destructured keys) and is not marked.
 *
 * The end-to-end runtime check lives in
 * `packages/client/__tests__/runtime/issue-3688-props-spread-merge.test.ts`;
 * the rendered output is pinned by the `component-spread-*` conformance
 * fixtures.
 */
import { describe, test, expect } from 'bun:test'
import { compileJSX } from '../compiler'
import { TestAdapter } from '../adapters/test-adapter'
import { analyzeComponent } from '../analyzer'
import { jsxToIR } from '../jsx-to-ir'
import type { IRNode, IRComponent } from '../types'

const adapter = new TestAdapter()

function clientJs(source: string): string {
  const result = compileJSX(source, 'Repro.tsx', { adapter })
  expect(result.errors.filter(e => e.severity === 'error')).toHaveLength(0)
  return result.files.find(f => f.type === 'clientJs')!.content
}

function findComponent(node: IRNode, name: string): IRComponent | null {
  if (node.type === 'component' && node.name === name) return node
  const children = 'children' in node && Array.isArray(node.children) ? (node.children as IRNode[]) : []
  for (const child of children) {
    const found = findComponent(child, name)
    if (found) return found
  }
  return null
}

function tagSpread(source: string, componentName: string) {
  const ctx = analyzeComponent(source, 'Repro.tsx', componentName)
  const ir = jsxToIR(ctx)!
  const tag = findComponent(ir, 'Tag')!
  return tag.props.find(p => p.name === '...')!.value
}

describe('#3688 — Phase 1 marks a props-object spread onto a child', () => {
  test('the props object, directly and through an alias, is marked', () => {
    expect(tagSpread(`
      import { Tag } from './tag'
      export function A(props: { tone?: string }) { return <p><Tag {...props} /></p> }
    `, 'A')).toMatchObject({ kind: 'spread', propsObject: true })
    expect(tagSpread(`
      import { Tag } from './tag'
      export function B(props: { tone?: string }) { const p2 = props; return <p><Tag {...p2} /></p> }
    `, 'B')).toMatchObject({ kind: 'spread', propsObject: true })
  })

  test('an open rest bag and an ordinary object are not marked', () => {
    const rest = tagSpread(`
      import { Tag } from './tag'
      export function C({ title, ...rest }: { title?: string; [key: string]: any }) {
        return <p title={title}><Tag {...rest} /></p>
      }
    `, 'C')
    expect(rest.kind).toBe('spread')
    expect(rest).not.toHaveProperty('propsObject')
    const local = tagSpread(`
      import { Tag } from './tag'
      export function D(props: { tone?: string }) { const extra = { tone: 'x' }; return <p><Tag {...extra} /></p> }
    `, 'D')
    expect(local).not.toHaveProperty('propsObject')
  })
})

describe('#3688 — the client JS merges a props-object spread in source order', () => {
  const source = `
    import { Tag } from './tag'
    export function Parent(props: { tone?: string; size?: string; label?: string }) {
      return <p><Tag tone="first" size="s" {...props} label="last" /></p>
    }
  `

  test('the registration template keeps the spread between the explicit props', () => {
    expect(clientJs(source)).toContain(`renderChild('Tag', {tone: "first", size: "s", ..._p, label: "last"}`)
  })

  test("initChild reads an explicit prop written before the spread from the caller's props first", () => {
    const js = clientJs(source)
    expect(js).toContain(`get tone() { return "tone" in _p ? _p["tone"] : "first" }`)
    expect(js).toContain(`get size() { return "size" in _p ? _p["size"] : "s" }`)
    // A prop after the spread always wins: a plain override.
    expect(js).toContain(`label: "last" }`)
  })

  test('a conditional branch template keeps the spread too', () => {
    const js = clientJs(`
      'use client'
      import { createSignal } from '@barefootjs/client'
      import { Tag } from './tag'
      export function Toggle(props: { tone?: string }) {
        const [on, setOn] = createSignal(true)
        return <div onClick={() => setOn(!on())}>{on() ? <Tag {...props} tone="x" /> : <i>off</i>}</div>
      }
    `)
    expect(js).toContain(`renderChild('Tag', {..._p, tone: "x"}`)
    expect(js).not.toContain(`"tone" in _p`)
  })

  test('an open rest bag stays out of the template props', () => {
    const js = clientJs(`
      import { Tag } from './tag'
      export function Rest({ title, ...rest }: { title?: string; [key: string]: any }) {
        return <p title={title}><Tag title="x" {...rest} /></p>
      }
    `)
    expect(js).toContain(`renderChild('Tag', {title: "x"}`)
    expect(js).not.toContain(`"title" in _p`)
  })
})
