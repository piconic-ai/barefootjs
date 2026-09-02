/**
 * Fragment-bodied `.map()` row key extraction (#2763).
 *
 * A `.map()` callback whose body is a fragment (`<><li key={..}/><li/></>`)
 * used to make `extractLoopKey` (`jsx-to-ir.ts`) return `null` — it handled
 * `element`, `component`, and `conditional`, but not `fragment`. That made
 * every SSR adapter silently drop the row-key attribute AND left
 * `mapArray`'s `keyFn` unset (positional reconciliation), while
 * `html-template.ts`'s client row builder kept baking `data-key` from the
 * raw `key` JSX attribute — a silent SSR/CSR divergence with no diagnostic.
 *
 * The fix adds a `fragment` case to both `extractLoopKey` and its write-side
 * twin `applyLoopKeyAttr`, reading/stamping the key on the fragment's FIRST
 * ELEMENT child (skipping whitespace-only text), matching the "first
 * element, not first node" rule `IRElement.keyAttr`'s docstring already
 * documents for the render-root relay case. `html-template.ts`'s client
 * template builders were also changed to read `IRElement.keyAttr` instead
 * of the raw attribute (see `resolvedKeyAttrName` in that file) — this test
 * covers only the SSR/IR-resolution half.
 */
import { describe, test, expect } from 'bun:test'
import { analyzeComponent } from '../analyzer'
import { jsxToIR } from '../jsx-to-ir'
import { compileJSX } from '../compiler'
import { TestAdapter } from '../adapters/test-adapter'
import type { IRElement, IRLoop, IRNode } from '../types'

function compile(source: string, name = 'Test'): IRNode {
  const ir = jsxToIR(analyzeComponent(source, `${name}.tsx`))
  expect(ir).not.toBeNull()
  return ir!
}

/** The single `loop` node anywhere in the tree (depth-first), or null. */
function findLoop(node: IRNode): IRLoop | null {
  if (node.type === 'loop') return node
  const children: IRNode[] =
    'children' in node && Array.isArray((node as { children?: unknown }).children)
      ? (node as { children: IRNode[] }).children
      : []
  for (const c of children) {
    const found = findLoop(c)
    if (found) return found
  }
  return null
}

const SOURCE = `
'use client'
import { createSignal } from '@barefootjs/client'
type Item = { id: number; label: string }
export function KeyFrag(props: { items: Item[] }) {
  const [items] = createSignal<Item[]>(props.items)
  return (
    <ul>
      {items().map(item => (
        <>
          <li key={item.id}>{item.label}</li>
          <li>x</li>
        </>
      ))}
    </ul>
  )
}
`

describe('fragment-bodied .map() row key extraction (#2763)', () => {
  test('IRElement.keyAttr lands on the fragment\'s first element, not the second', () => {
    const ir = compile(SOURCE, 'KeyFrag')
    const loop = findLoop(ir)
    expect(loop).not.toBeNull()
    const fragment = loop!.children[0]
    expect(fragment.type).toBe('fragment')
    if (fragment.type !== 'fragment') return
    const [firstLi, secondLi] = fragment.children.filter(
      (c): c is IRElement => c.type === 'element',
    )
    expect(firstLi.keyAttr).toEqual({ name: 'data-key', value: 'item.id' })
    expect(secondLi.keyAttr).toBeUndefined()
  })

  test('mapArray receives a real keyFn instead of reconciling positionally', () => {
    const result = compileJSX(SOURCE, 'KeyFrag.tsx', { adapter: new TestAdapter() })
    expect(result.errors.filter((e) => (e as { severity?: string }).severity === 'error')).toHaveLength(0)
    const cjs = result.files.find((f) => f.type === 'clientJs')
    expect(cjs).toBeDefined()
    const calls = cjs!.content
      .split('\n')
      .map((ln) => ln.trim())
      .filter((ln) => ln.startsWith('mapArray(') || ln.startsWith('mapArrayLazy('))
    expect(calls).toHaveLength(1)
    expect(calls[0]).toContain('String(item.id)')
    expect(calls[0]).not.toMatch(/_s\d+, null,/)
  })
})
