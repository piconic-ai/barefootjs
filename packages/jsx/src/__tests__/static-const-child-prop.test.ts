import { describe, expect, test } from 'bun:test'
import { analyzeComponent } from '../analyzer'
import { jsxToIR } from '../jsx-to-ir'
import type { IRNode, IRProp } from '../types'

/**
 * Every component prop named `xs` in the IR tree, in source order: the
 * literal a template passes (`staticConstLiteral`), or `null` when the prop
 * carries none.
 */
function xsProps(source: string): Array<string | null> {
  const out: Array<string | null> = []
  const visit = (node: IRNode | null | undefined): void => {
    if (!node || typeof node !== 'object') return
    if (node.type === 'component') {
      for (const p of node.props as IRProp[]) {
        if (p.name !== 'xs') continue
        // JS-runtime consumers read `expr`, which stays the const's name.
        if (p.value.kind === 'expression') expect(p.value.expr.startsWith('[') || p.value.expr.startsWith('{')).toBe(false)
        out.push(p.value.kind === 'expression' ? (p.value.staticConstLiteral?.expr ?? null) : null)
      }
    }
    for (const value of Object.values(node)) {
      if (Array.isArray(value)) for (const child of value) visit(child as IRNode)
      else if (value && typeof value === 'object' && 'type' in value) visit(value as IRNode)
    }
  }
  visit(jsxToIR(analyzeComponent(source, 'C.tsx')))
  return out
}

describe('a const holding a static literal, passed whole as a child prop, carries the literal for templates', () => {
  test('a module array, a module object and a component-local array', () => {
    expect(xsProps(`
      import { Kid } from './kid'
      const QS = ['a', 'b"c']
      const REC = { lf: 'r', n: 3 }
      export function C() {
        const local = [1e3, .5]
        return <div><Kid xs={QS} /><Kid xs={REC} /><Kid xs={local} /></div>
      }
    `)).toEqual([`['a', 'b"c']`, `{ lf: 'r', n: 3 }`, '[1e3, .5]'])
  })

  test('a loop row or a prop of the same name is that binding', () => {
    expect(xsProps(`
      import { Kid } from './kid'
      const QS = ['a', 'b']
      const PS = ['m']
      export function C({ PS }: { PS: string[] }) {
        return (
          <div>
            {[['r']].map(QS => <Kid key={QS[0]} xs={QS} />)}
            <Kid xs={PS} />
          </div>
        )
      }
    `)).toEqual([null, null])
  })

  test('a const that reads a name, calls something or is changed carries no literal', () => {
    expect(xsProps(`
      import { Kid } from './kid'
      const BASE = 'b'
      const READS = [BASE]
      const CALLS = [String(1)]
      export function C(props: { v: string }) {
        const fromProp = [props.v]
        const changed = ['x']
        changed.push('y')
        return <div><Kid xs={READS} /><Kid xs={CALLS} /><Kid xs={fromProp} /><Kid xs={changed} /></div>
      }
    `)).toEqual([null, null, null, null])
  })

  test('a /* @client */ prop carries no literal', () => {
    expect(xsProps(`
      import { Kid } from './kid'
      const QS = ['a']
      export function C() {
        return <div><Kid xs={/* @client */ QS} /></div>
      }
    `)).toEqual([null])
  })
})
