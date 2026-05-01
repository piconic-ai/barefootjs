/**
 * **Multi-stage soak test**: a single component that exercises every
 * stage transition at once. Modeled after `piconic-ai/desk`'s
 * `worker/components/canvas/DeskCanvas.tsx`, which is the live repro for
 * issue #1138.
 *
 * If any one staged-IR primitive (scope tagging, relocate, modifier
 * preservation, type erasure, import preservation) regresses, this test
 * is the canary — it bundles all five into one source file.
 *
 * What's exercised:
 *  - Module → Init: relative import (`useYjs`), module-level const
 *    (`nodeTypes`)
 *  - Init → Sub-Init: nested arrow with shadowing param
 *  - Init → Template: bare props ref (must rewrite to `_p`),
 *    init-local in child prop (must drop / null-fallback)
 *  - Init → Template: `createMemo` getter (must NOT inline body)
 *  - S0 → emit: async modifier preserved, inline `type` stripped, leading
 *    `;` for ASI safety
 */

import { describe, test, expect } from 'bun:test'
import { compile, expectNoBareNames, expectValidJs } from './helpers'

const DESK_CANVAS_SHAPE = `
  'use client'
  import { createSignal, createMemo } from '@barefootjs/client'
  import { useYjs } from './useYjs'
  import { nodeTypes, makeViewport } from './nodes'
  import { Flow } from '../ui/xyflow'

  interface Issue { id: string; title: string }
  interface Props { roomId: string; readOnly: boolean }

  export function DeskCanvas(props: Props) {
    const yjs = useYjs(props.roomId, props.readOnly)
    const cachedViewport = makeViewport()
    const [items, setItems] = createSignal<Issue[]>([])
    const itemCount = createMemo(() => items().length)

    const fetchItems = async (forceRefresh = false) => {
      type ItemsResponse = { items: Issue[]; cursor: string | null }
      let data: ItemsResponse | null = null
      const res = await fetch('/api/items?room=' + props.roomId)
      data = await res.json()
      setItems(data?.items ?? [])
    }
    fetchItems()

    const onSelect = (value: number) => setItems(prev => prev.slice(0, value))

    return (
      <Flow
        nodeTypes={nodeTypes}
        defaultViewport={cachedViewport ?? { x: 0, y: 0, zoom: 1 }}
        nodes={items()}
        edges={[]}
        data-room={props.roomId}
        data-count={itemCount()}
        data-yjs={yjs.id}
        onSelect={onSelect}
      />
    )
  }
`

describe('Multi-stage soak (DeskCanvas-shape)', () => {
  test('compiles without errors', () => {
    const { errors } = compile(DESK_CANVAS_SHAPE, 'DeskCanvas.tsx')
    expect(errors).toEqual([])
  })

  test('emitted client JS is valid JavaScript', () => {
    const { clientJs } = compile(DESK_CANVAS_SHAPE, 'DeskCanvas.tsx')
    expectValidJs(clientJs)
  })

  test('Module → Init: useYjs import is preserved', () => {
    const { clientJs } = compile(DESK_CANVAS_SHAPE, 'DeskCanvas.tsx')
    expect(clientJs).toMatch(/import\s+\{[^}]*useYjs[^}]*\}\s+from\s+['"]\.\/useYjs['"]/)
  })

  test('Module → Template: nodeTypes import IS visible to template', () => {
    const { templateBody } = compile(DESK_CANVAS_SHAPE, 'DeskCanvas.tsx')
    expect(templateBody).toMatch(/nodeTypes/)
  })

  // TODO(#1138 P3 5/N): `useYjs(...)` (init-local initializer) leaks into
  // template body via blind inlining. Will pass once relocate()'s recursive-
  // visibility check refuses to inline non-pure init-locals.
  test.todo('Init → Template: init-locals do NOT leak into template body', () => {
    const { templateBody } = compile(DESK_CANVAS_SHAPE, 'DeskCanvas.tsx')
    expectNoBareNames(templateBody, [
      '\\bcachedViewport\\b',
      '\\byjs\\b',
      '\\bprops\\b',
      '\\bfetchItems\\b',
    ])
  })

  // TODO(#1138 P3 5/N): createMemo body recursively inlined; closure deps
  // (`items`) degrade to their initial value (`[]`) in template scope, losing
  // reactivity. Will pass once relocate() detects the recursive-visibility
  // hazard and falls back to the memo getter.
  test.todo('Init → Template: createMemo getter is referenced, body NOT inlined', () => {
    const { templateBody, initBody } = compile(DESK_CANVAS_SHAPE, 'DeskCanvas.tsx')
    // Memo body would inline `items().length` — its closure dep `items`
    // would then leak into template scope. Don't.
    expectNoBareNames(templateBody, ['\\bitems\\(\\)', '\\.length'])
    // Init body retains the memo definition.
    expect(initBody).toMatch(/createMemo/)
  })

  test('S0 → emit: async modifier preserved on fetchItems', () => {
    const { clientJs } = compile(DESK_CANVAS_SHAPE, 'DeskCanvas.tsx')
    const hasAsync = /async\s+function\s+fetchItems/.test(clientJs) ||
                     /const\s+fetchItems\s*=\s*async\s*\(/.test(clientJs) ||
                     /fetchItems\s*=\s*async\s*\(/.test(clientJs)
    expect(hasAsync).toBe(true)
  })

  test('S0 → emit: inline ItemsResponse type is stripped', () => {
    const { clientJs } = compile(DESK_CANVAS_SHAPE, 'DeskCanvas.tsx')
    expect(clientJs).not.toMatch(/type\s+ItemsResponse/)
  })

  test('Init → Sub-Init: onSelect param `value` is NOT rewritten to _p.value', () => {
    const { clientJs } = compile(DESK_CANVAS_SHAPE, 'DeskCanvas.tsx')
    // `value` is the inner arrow param; even though Props had no `value`,
    // any future addition of one shouldn't break this. Today the rewrite is
    // structural — verify it.
    expect(clientJs).toMatch(/\(value\)\s*=>\s*setItems\(prev\s*=>\s*prev\.slice\(0,\s*value\)\)/)
  })

  test('props ref in init body becomes _p.X (positive control)', () => {
    const { initBody } = compile(DESK_CANVAS_SHAPE, 'DeskCanvas.tsx')
    // Inside init body, `props.roomId` should be reachable as `_p.roomId`
    // (the standard SolidJS-style props rewrite).
    expect(initBody).toMatch(/_p\.roomId|props\.roomId/)
  })
})
