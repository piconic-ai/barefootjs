/**
 * JSX render-nothing literal folding (#2171).
 *
 * Per JSX semantics, `{null}` / `{undefined}` / `{true}` / `{false}` in
 * child position render NOTHING, while `{0}` renders "0" and `{''}`
 * renders the empty string. Historically the literals fell through to
 * the scalar IRExpression fallback and each adapter stringified them
 * its own way (Hono emitted the text "null" for `{null}`; the template
 * adapters emitted "false" for `{false}`) — the Priority-12 sweep's
 * `falsy-text-values` fixture pinned that three-way divergence. Folding
 * in Phase 1 means the IR simply carries no node for these children,
 * so every adapter agrees by construction.
 */

import { describe, expect, test } from 'bun:test'
import { analyzeComponent } from '../analyzer'
import { jsxToIR } from '../jsx-to-ir'
import type { IRElement, IRNode } from '../types'

function irFor(source: string): IRNode {
  const analyzer = analyzeComponent(source, 'test.tsx')
  const ir = jsxToIR(analyzer)
  if (!ir) throw new Error('no IR produced')
  return ir
}

function childrenOf(ir: IRNode): IRNode[] {
  return (ir as IRElement).children ?? []
}

describe('render-nothing literal children fold in Phase 1', () => {
  test.each(['null', 'undefined', 'true', 'false'])(
    '{%s} child produces no IR node',
    (literal) => {
      const ir = irFor(`
        export function C() {
          return <div><span>a</span>{${literal}}<span>b</span></div>
        }
      `)
      const children = childrenOf(ir)
      expect(children).toHaveLength(2)
      expect(children.every(c => c.type === 'element')).toBe(true)
    },
  )

  test('transparently wrapped spellings fold too', () => {
    for (const wrapped of ['(null)', 'null as unknown', 'undefined!']) {
      const ir = irFor(`
        export function C() {
          return <div>{${wrapped}}</div>
        }
      `)
      expect(childrenOf(ir)).toHaveLength(0)
    }
  })

  test('{0} and {""} still produce expression children', () => {
    const ir = irFor(`
      export function C() {
        return <div>{0}{''}</div>
      }
    `)
    const children = childrenOf(ir)
    expect(children).toHaveLength(2)
    expect(children.every(c => c.type === 'expression')).toBe(true)
  })

  test('a dynamic expression that may evaluate to null is NOT folded', () => {
    const ir = irFor(`
      export function C(props: { name?: string }) {
        return <div>{props.name}</div>
      }
    `)
    expect(childrenOf(ir)).toHaveLength(1)
    expect(childrenOf(ir)[0].type).toBe('expression')
  })

  test('conditional null branches keep their existing handling', () => {
    // `cond ? <a/> : null` routes through the conditional transformer,
    // not the JSX-child scalar path — the fold must not disturb it.
    const ir = irFor(`
      'use client'
      import { createSignal } from '@barefootjs/client'
      export function C() {
        const [show] = createSignal(false)
        return <div>{show() ? <span>on</span> : null}</div>
      }
    `)
    const children = childrenOf(ir)
    expect(children).toHaveLength(1)
    expect(children[0].type).toBe('conditional')
  })
})
