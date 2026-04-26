/**
 * BarefootJS Compiler - SVG mapArray namespace preservation (#135).
 *
 * When a `.map()` inside an `<svg>` produces SVG elements (e.g.
 * `<path>`), the compiler-generated `renderItem` must parse its
 * template under SVG context. The default `template.innerHTML = '<path/>'`
 * produces an `HTMLUnknownElement` in xhtml namespace, so the SVG
 * renderer ignores it (`getBoundingClientRect()` returns 0×0). Surfaced
 * by the Graph/DAG Editor block — newly created edges were "missing"
 * from the canvas because their `<path>` was in the wrong namespace.
 *
 * Fix: wrap the `innerHTML` in `<svg>...</svg>` and descend one extra
 * level when the loop body's root tag is an SVG element.
 */

import { describe, test, expect } from 'bun:test'
import { compileJSXSync } from '../compiler'
import { TestAdapter } from '../adapters/test-adapter'

const adapter = new TestAdapter()

describe('SVG mapArray namespace preservation (#135)', () => {
  test('SVG path mapArray wraps innerHTML with <svg> for correct namespace', () => {
    const source = `
      'use client'
      import { createSignal } from '@barefootjs/client'

      interface Edge { id: string; d: string }

      export function Graph() {
        const [edges, setEdges] = createSignal<Edge[]>([])
        return (
          <svg>
            {edges().map((e) => (
              <path key={e.id} d={e.d} />
            ))}
          </svg>
        )
      }
    `
    const result = compileJSXSync(source, 'Graph.tsx', { adapter })
    expect(result.errors).toHaveLength(0)

    const clientJs = result.files.find(f => f.type === 'clientJs')
    const content = clientJs!.content

    // Must wrap with <svg>...</svg> for foreign-content parsing
    expect(content).toContain('<svg>')
    expect(content).toContain('</svg>')
    // Descend one extra level
    expect(content).toContain('.firstElementChild.firstElementChild.cloneNode(true)')
    // The plain HTML clone path must NOT be used for SVG roots
    expect(content).not.toMatch(/__tpl\.innerHTML = `<path[^`]*`/)
  })

  test('SVG circle mapArray uses SVG context too', () => {
    const source = `
      'use client'
      import { createSignal } from '@barefootjs/client'

      interface Node { id: string; x: number; y: number }

      export function Pts() {
        const [nodes, setNodes] = createSignal<Node[]>([])
        return (
          <svg>
            <g>
              {nodes().map((n) => (
                <circle key={n.id} cx={n.x} cy={n.y} r={5} />
              ))}
            </g>
          </svg>
        )
      }
    `
    const result = compileJSXSync(source, 'Pts.tsx', { adapter })
    expect(result.errors).toHaveLength(0)

    const clientJs = result.files.find(f => f.type === 'clientJs')
    const content = clientJs!.content

    expect(content).toContain('<svg>')
    expect(content).toContain('.firstElementChild.firstElementChild.cloneNode(true)')
  })

  test('HTML li mapArray is unchanged (no SVG wrapping)', () => {
    const source = `
      'use client'
      import { createSignal } from '@barefootjs/client'

      interface Item { id: string; label: string }

      export function L() {
        const [items, setItems] = createSignal<Item[]>([])
        return (
          <ul>
            {items().map((it) => (
              <li key={it.id}>{it.label}</li>
            ))}
          </ul>
        )
      }
    `
    const result = compileJSXSync(source, 'L.tsx', { adapter })
    expect(result.errors).toHaveLength(0)

    const clientJs = result.files.find(f => f.type === 'clientJs')
    const content = clientJs!.content

    // HTML loops must NOT be wrapped — keep the plain single-descent path
    expect(content).toContain('.firstElementChild.cloneNode(true)')
    expect(content).not.toContain('.firstElementChild.firstElementChild.cloneNode(true)')
    expect(content).not.toContain('<svg>')
  })
})
