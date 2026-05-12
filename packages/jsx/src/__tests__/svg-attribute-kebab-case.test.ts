/**
 * BarefootJS Compiler - SVG presentation attributes are emitted in kebab-case (#135).
 *
 * SVG presentation attributes are written camelCase in JSX (React-style)
 * but must reach the DOM as kebab-case. Both SSR template output and
 * client-side reactive `setAttribute` calls go through `toHtmlAttrName`,
 * so they must agree on the spelling.
 *
 * Without the conversion, SSR emits `stroke-width="1.5"` while
 * hydration writes `setAttribute('strokeWidth', '2.5')`, leaving both
 * attributes on the DOM. The SVG renderer reads the kebab-case form,
 * so reactive updates become invisible. Discovered by the Graph/DAG
 * Editor block (#135) — edge selection failed to thicken the stroke
 * even though `selectedEdgeId()` updated correctly.
 */

import { describe, test, expect } from 'bun:test'
import { compileJSX } from '../compiler'
import { TestAdapter } from '../adapters/test-adapter'

const adapter = new TestAdapter()

describe('SVG attribute kebab-case emission (#135)', () => {
  test('static SVG attributes are emitted as kebab-case in template', () => {
    const source = `
      export function Edge() {
        return <path d="M0 0" strokeWidth={1.5} fillOpacity={0.5} markerEnd="url(#a)" textAnchor="middle" />
      }
    `
    const result = compileJSX(source, 'Edge.tsx', { adapter })
    expect(result.errors).toHaveLength(0)

    const clientJs = result.files.find(f => f.type === 'clientJs')
    const content = clientJs!.content

    // Template literal must use kebab-case
    expect(content).toContain('stroke-width')
    expect(content).toContain('fill-opacity')
    expect(content).toContain('marker-end')
    expect(content).toContain('text-anchor')

    // Must NOT keep the camelCase form alongside the kebab form
    expect(content).not.toContain('strokeWidth=')
    expect(content).not.toContain('fillOpacity=')
    expect(content).not.toContain('markerEnd=')
    expect(content).not.toContain('textAnchor=')
  })

  test('reactive SVG attributes use kebab-case for setAttribute', () => {
    const source = `
      'use client'
      import { createSignal } from '@barefootjs/client'

      export function Edge() {
        const [width, setWidth] = createSignal(1.5)
        return <path d="M0 0" strokeWidth={width()} />
      }
    `
    const result = compileJSX(source, 'Edge.tsx', { adapter })
    expect(result.errors).toHaveLength(0)

    const clientJs = result.files.find(f => f.type === 'clientJs')
    const content = clientJs!.content

    // Reactive setAttribute must use kebab-case so SSR and hydration agree.
    expect(content).toContain("'stroke-width'")
    expect(content).not.toContain("'strokeWidth'")
  })

  test('className still maps to class (existing behavior preserved)', () => {
    const source = `
      export function Box() {
        return <div className="foo" />
      }
    `
    const result = compileJSX(source, 'Box.tsx', { adapter })
    expect(result.errors).toHaveLength(0)

    const clientJs = result.files.find(f => f.type === 'clientJs')
    const content = clientJs!.content

    expect(content).toContain('class="foo"')
    expect(content).not.toContain('className=')
  })

  test('reactive SVG attributes inside .map() use kebab-case for setAttribute', () => {
    // Regression: Pie chart "Animated" demo (#135 Concrete Additions). The
    // path lives inside a `.map()` body, and the reactive update on
    // `stroke-dashoffset` is driven by a high-frequency `progress()` signal
    // fed by `requestAnimationFrame`. If the per-item reactive
    // `setAttribute` did not match the SSR kebab spelling, both attributes
    // would coexist on the DOM and the rAF tick would write the wrong one.
    const source = `
      'use client'
      import { createSignal } from '@barefootjs/client'

      type Slice = { name: string; d: string; fill: string }

      export function Wheel() {
        const [progress] = createSignal(1)
        const slices: Slice[] = []
        return (
          <svg viewBox="0 0 100 100">
            <g>
              {slices.map((s) => (
                <path
                  key={s.name}
                  d={s.d}
                  fill={s.fill}
                  strokeDasharray={String(800)}
                  strokeDashoffset={String(800 * (1 - progress()))}
                />
              ))}
            </g>
          </svg>
        )
      }
    `
    const result = compileJSX(source, 'Wheel.tsx', { adapter })
    expect(result.errors).toHaveLength(0)

    const clientJs = result.files.find(f => f.type === 'clientJs')
    const content = clientJs!.content

    // Reactive update goes through setAttribute with the kebab spelling.
    expect(content).toContain("'stroke-dashoffset'")
    expect(content).not.toContain("'strokeDashoffset'")
    // SSR template literal uses the kebab spelling as well.
    expect(content).toContain('stroke-dashoffset=')
    expect(content).not.toContain('strokeDashoffset=')
  })

  test('non-SVG camelCase attributes are NOT converted', () => {
    // tabIndex, autoFocus, etc. are HTML attributes that stay camelCase
    // in the JSX → DOM property pipeline (or get specific handling
    // elsewhere). The SVG conversion map must not touch them.
    const source = `
      export function Btn() {
        return <button tabIndex={0} autoFocus={true}>x</button>
      }
    `
    const result = compileJSX(source, 'Btn.tsx', { adapter })
    expect(result.errors).toHaveLength(0)

    const clientJs = result.files.find(f => f.type === 'clientJs')
    const content = clientJs!.content

    // tabIndex / autoFocus should not be converted to tab-index / auto-focus
    expect(content).not.toContain('tab-index')
    expect(content).not.toContain('auto-focus')
  })
})
