/**
 * #2482 Stage 1a Commit 2 — `ctx.scope` (`BindingScope`) must see a
 * `.map()` callback's preamble-declared locals BEFORE the return
 * expression's own child expressions are transformed, not only after
 * (jsx-to-ir.ts's `transformMapCall` discovers the full structured
 * `MapCallbackPreamble` well after `transformNode(returnExpr, ctx)` has
 * already run for several body shapes — see the ordering comment ahead of
 * the `returnStmt` pre-scan in `transformMapCall`).
 *
 * Without binding the preamble names early, a preamble-declared local
 * shadowing a same-named module-level const gets const-folded by
 * `tryResolveIdentifierAsTemplateLiteral` (`className={label}` here, the
 * cva-style "identifier bound to a template literal" resolution) into the
 * OUTER module value — baking one hard-coded value into every row instead
 * of leaving the per-row local unresolved. Same bug class as #2222
 * (loop-param shadowing), one level later: the shadowing name here is
 * preamble-declared, not the callback's own item/index parameter.
 *
 * Modeled on `csr-template-loop-shadowing.test.ts` (the item/index-param
 * shadowing pins) and `ir-const-resolution.test.ts`'s "function-scope
 * const shadows a same-named module-level const" case (the non-loop
 * shadowing pin this test is the loop-preamble analogue of).
 */

import { describe, test, expect } from 'bun:test'
import { compileJSX } from '../compiler'
import { TestAdapter } from '../adapters/test-adapter'
import type { IRNode, IRElement, AttrValue } from '../types'

const adapter = new TestAdapter()

function compileToIR(source: string) {
  const result = compileJSX(source, 'demo.tsx', { adapter, outputIR: true })
  expect(result.errors.filter(e => e.severity === 'error')).toEqual([])
  const ir = result.files.find(f => f.type === 'ir')!
  return JSON.parse(ir.content)
}

/** Walk the IR tree (including loop/conditional composites) for the first `class` attr. */
function findClassValue(node: IRNode): AttrValue | null {
  if (node.type === 'element') {
    const el = node as IRElement
    for (const attr of el.attrs) {
      if (attr.name === 'class') return attr.value
    }
  }
  const anyNode = node as IRNode & {
    children?: IRNode[]
    consequent?: IRNode
    alternate?: IRNode
    whenTrue?: IRNode
    whenFalse?: IRNode
  }
  if (anyNode.children) {
    for (const c of anyNode.children) {
      const v = findClassValue(c)
      if (v !== null) return v
    }
  }
  if (anyNode.consequent) {
    const v = findClassValue(anyNode.consequent)
    if (v !== null) return v
  }
  if (anyNode.alternate) {
    const v = findClassValue(anyNode.alternate)
    if (v !== null) return v
  }
  if (anyNode.whenTrue) {
    const v = findClassValue(anyNode.whenTrue)
    if (v !== null) return v
  }
  if (anyNode.whenFalse) {
    const v = findClassValue(anyNode.whenFalse)
    if (v !== null) return v
  }
  return null
}

describe('BindingScope sees preamble locals before the return expression transforms (#2482)', () => {
  test('a .map() preamble const shadowing a module-level template-literal const stays unresolved (row-local)', () => {
    const ir = compileToIR(`
'use client'
import { createSignal } from '@barefootjs/client'

const label = \`row-MODULE\`

export function Widget({ items }: { items: string[] }) {
  const [n, setN] = createSignal(0)
  return (
    <div onClick={() => setN(n() + 1)}>
      <ul>
        {items.map((item) => {
          const label = \`row-\${item}\`
          return <li key={item} className={label}>{item}</li>
        })}
      </ul>
    </div>
  )
}
`)
    const v = findClassValue(ir.root)
    expect(v).not.toBeNull()
    // The row-local `label` must survive as a bare expression reference —
    // NOT get const-folded into the module-level `label`'s literal value.
    expect(v!.kind).toBe('expression')
    expect((v as Extract<AttrValue, { kind: 'expression' }>).expr).toBe('label')
    if (v!.kind === 'template') {
      // Negative assertion in case a future change routes this through the
      // template-parts path instead: the module value must never appear.
      const parts = (v as Extract<AttrValue, { kind: 'template' }>).parts
      const concat = parts.map(p => (p.type === 'string' ? p.value : '')).join('')
      expect(concat).not.toContain('MODULE')
    }
  })
})
