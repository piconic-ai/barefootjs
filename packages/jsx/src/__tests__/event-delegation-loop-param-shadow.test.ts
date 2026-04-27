/**
 * BarefootJS Compiler - Event delegation must not shadow user loop params (#135).
 *
 * When a user writes `arr.map((e) => ...)` and the body has an event handler
 * that closes over `e`, the generated event delegation listener must not use
 * `e` as the event parameter name. Otherwise:
 *
 *   const e = __bfLoopItem            // user loop param
 *   ((ev) => { setX(e.id) })(e)        // ← `e` here was previously the
 *                                       //   addEventListener `(e) =>` param
 *                                       //   (the actual Event), shadowing
 *                                       //   the loop item.
 *
 * Discovered while implementing the Graph/DAG Editor block (Phase 9 #135).
 * The block uses `edges.map((e) => <path onPointerDown={(ev) => {
 *   ev.stopPropagation(); setSelectedEdgeId(e.id) }} />)` and clicking the
 * path threw "ev.stopPropagation is not a function" because `ev` was
 * receiving the loop item, not the event.
 *
 * Fix: rename the synthetic event parameter to `__bfEvt` (a name that
 * cannot collide with user code).
 */

import { describe, test, expect } from 'bun:test'
import { compileJSXSync } from '../compiler'
import { TestAdapter } from '../adapters/test-adapter'

const adapter = new TestAdapter()

describe('event delegation must not shadow user loop params (#135)', () => {
  test('listener parameter is __bfEvt, not e', () => {
    const source = `
      'use client'
      import { createSignal } from '@barefootjs/client'

      interface Edge { id: string }

      export function Graph() {
        const [edges, setEdges] = createSignal<Edge[]>([])
        const [sel, setSel] = createSignal<string | null>(null)

        return (
          <svg>
            {edges().map((e) => (
              <path key={e.id} d="M0 0" onPointerDown={(ev) => {
                ev.stopPropagation()
                setSel(e.id)
              }} />
            ))}
          </svg>
        )
      }
    `
    const result = compileJSXSync(source, 'Graph.tsx', { adapter })
    expect(result.errors).toHaveLength(0)

    const clientJs = result.files.find(f => f.type === 'clientJs')
    expect(clientJs).toBeDefined()
    const content = clientJs!.content

    // The synthetic event parameter must use the bf-namespaced name to avoid
    // shadowing user loop params named `e`.
    expect(content).toContain(".addEventListener('pointerdown', (__bfEvt) => {")
    expect(content).toContain('const target = __bfEvt.target')

    // The handler must be invoked with the synthetic event, not with `e`
    // (which would resolve to the user's loop item).
    expect(content).toContain('(__bfEvt)')
    expect(content).not.toContain('addEventListener(\'pointerdown\', (e) =>')
  })

  test('user loop param e is preserved and accessible inside the handler', () => {
    const source = `
      'use client'
      import { createSignal } from '@barefootjs/client'

      interface Edge { id: string }

      export function Graph() {
        const [edges, setEdges] = createSignal<Edge[]>([])
        const [sel, setSel] = createSignal<string | null>(null)

        return (
          <svg>
            {edges().map((e) => (
              <path key={e.id} d="M0 0" onPointerDown={() => setSel(e.id)} />
            ))}
          </svg>
        )
      }
    `
    const result = compileJSXSync(source, 'Graph.tsx', { adapter })
    expect(result.errors).toHaveLength(0)

    const clientJs = result.files.find(f => f.type === 'clientJs')
    const content = clientJs!.content

    // `e` is bound to the loop item via the keyed-lookup preamble; the
    // handler closure references `e.id` directly.
    expect(content).toMatch(/const e = __bfLoopItem|const e = edges\(\)\.find/)
    expect(content).toContain('setSel(e.id)')
  })
})
